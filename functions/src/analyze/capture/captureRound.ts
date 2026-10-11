/**
 * Stage 7 of a server round: run the ported capture pipeline
 * (streamCompletedHandler) over a finished tool round and write what it
 * produces, the way the browser's stream_completed handling did.
 *
 * The handler dispatches into a collector instead of React state; this module
 * then commits the result:
 *  1. artifact upserts (offloaded like the web's saveArtifact), deterministic
 *     ids so a redelivered step rewrites the same docs;
 *  2. the session workbook state, to the sandbox;
 *  3. one batch: artifact deletes, the AI message with its
 *     toolExecutionResults, and the run's turn-scoped capture state.
 *
 * The AI message gaining `metadata.toolExecutionResults` is the commit marker:
 * a round whose message lacks it is captured again by the next delivery. A
 * re-run sees the session as it was before this round (its own partial upserts
 * are excluded by cellId; deletes only ever land in the final batch).
 */
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import type { Message, ToolResultProvenance } from '../contract/types';
import type { ToolCall, ToolResult } from '../contract/lib/ai/tools/types';
import type { Artifact } from '../contract/types/notebook';
import { normalizeAnalyzeOutputSelection } from '../contract/types/analyze';
import { SessionWorkbookManager, type SessionWorkbookState } from '../contract/services/analyze/dataset/SessionWorkbookManager';
import { getSandboxService } from '../../sandbox/callables';
import { readWholeFile } from '../engine/sandboxBridge';
import type { AnalyzeRunDoc } from '../engine/runStore';
import {
  artifactRef,
  deleteArtifactPayloads,
  loadSessionArtifacts,
  loadSessionMessages,
  messageRef,
  prepareArtifactRecord,
  prepareMessageRecord,
  removeUndefined,
} from '../engine/sessionStore';
import type { StoredPayloadRefs } from '../../cloudPayloadStorage';
import { handleStreamCompleted, type StreamCompletedEventData } from './streamCompletedHandler';
import type { AnalyzeOrgEvidenceRequest } from './types';
import type { TeamPanelRecord } from './teamPanelNote';

/** Outside /output, so the sandbox never reports it as a model output. */
export const WORKBOOK_STATE_PATH = '/home/user/.symposium/session-workbook.json';
const UPSERT_CONCURRENCY = 4;

type StoredArtifact = Artifact & { payloadRefs?: StoredPayloadRefs };

export interface CaptureInput {
  /** The assistant message that made the calls. */
  message: Message;
  toolCalls: ToolCall[];
  /** Results for the calls that ran, in toolCalls order (a stopped round may have fewer). */
  results: ToolResult[];
}

export interface CaptureContext {
  uid: string;
  sessionId: string;
  run: AnalyzeRunDoc;
  runRef: DocumentReference;
  now: () => number;
  /** This turn's independent panel (the operator's child runs), read once per capture. */
  loadTeamPanel?: () => Promise<TeamPanelRecord | null>;
}

/** loop.ts: the stream_completed toolExecutionResults entry for one executed call. */
export function toToolExecutionResult(call: ToolCall, result: ToolResult): NonNullable<StreamCompletedEventData['toolExecutionResults']>[number] {
  return {
    toolName: call.function.name || 'unknown',
    content: (result.metadata?.fullStdout as string | undefined) || result.content,
    error: result.error,
    success: result.success,
    images: result.images,
    htmlOutputs: result.htmlOutputs,
    dataOutputs: result.dataOutputs,
    bundleOutputs: result.bundleOutputs,
    provenance: result.provenance,
  };
}

async function runInBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(work));
  }
}

/**
 * Capture state for one step. Artifacts, the workbook and the fetch
 * provenance load on first use and then track every commit, so later rounds
 * in the same step don't reload them.
 */
export class CaptureSession {
  private artifacts: StoredArtifact[] | null = null;
  private workbook: SessionWorkbookManager | null = null;
  private fetchProvenance: Map<string, ToolResultProvenance>;

  constructor(private readonly context: CaptureContext) {
    this.fetchProvenance = new Map(
      context.run.fetchProvenanceJson
        ? Object.entries(JSON.parse(context.run.fetchProvenanceJson) as Record<string, ToolResultProvenance>)
        : [],
    );
  }

  private async loadArtifacts(): Promise<StoredArtifact[]> {
    if (!this.artifacts) this.artifacts = await loadSessionArtifacts(this.context.uid, this.context.sessionId);
    return this.artifacts;
  }

  private async loadWorkbook(): Promise<SessionWorkbookManager> {
    if (this.workbook) return this.workbook;
    const workbook = new SessionWorkbookManager();
    try {
      const bytes = await readWholeFile(this.context.uid, this.context.run.config.sandboxSessionKey, WORKBOOK_STATE_PATH);
      workbook.restoreState(JSON.parse(bytes.toString('utf8')) as SessionWorkbookState);
    } catch {
      // No saved state (first workbook of the session, or a fresh sandbox): start
      // empty, as the browser did on every session load.
    }
    this.workbook = workbook;
    return workbook;
  }

  private async saveWorkbook(workbook: SessionWorkbookManager): Promise<void> {
    await getSandboxService().writeFile(this.context.uid, this.context.run.config.sandboxSessionKey, {
      path: WORKBOOK_STATE_PATH,
      base64: Buffer.from(JSON.stringify(workbook.exportState())).toString('base64'),
    });
  }

  async capture(input: CaptureInput): Promise<void> {
    const { uid, sessionId, run, runRef, now } = this.context;
    const messageId = input.message.id;
    const stored = await this.loadArtifacts();
    const workbook = await this.loadWorkbook();
    const workbookBefore = JSON.stringify(workbook.exportState());
    const teamPanel = this.context.loadTeamPanel ? await this.context.loadTeamPanel() : null;

    // One clock reading per capture.
    const capturedAt = now();
    const loadedMessages = await loadSessionMessages(uid, sessionId);
    const messages = loadedMessages.some((m) => m.id === messageId)
      ? loadedMessages
      : [...loadedMessages, input.message];

    // The session as it was before this round: a re-run after a crash must not
    // see its own partial upserts (artifact ids and cellIds are per round).
    const storedIds = new Set(stored.map((artifact) => artifact.id));
    let artifacts: Artifact[] = stored.filter((artifact) => artifact.cellId !== messageId);
    const upserts = new Map<string, Artifact>();
    const removals = new Set<string>();
    let messageToPersist: Message | null = null;
    let pendingOrgEvidenceRequest: AnalyzeOrgEvidenceRequest | undefined;
    let reportProduced = false;
    let fetchProvenance = this.fetchProvenance;
    // Runs started before outputSelection joined the config get a new session's default.
    const outputSelection = normalizeAnalyzeOutputSelection(run.config.outputSelection);
    const event: StreamCompletedEventData = {
      messageId,
      finalContent: input.message.content,
      toolCalls: input.toolCalls,
      toolExecutionResults: input.results.map((result, index) => toToolExecutionResult(input.toolCalls[index], result)),
    };

    handleStreamCompleted(
      event as unknown as Record<string, unknown>,
      {
        dispatch: (action) => {
          switch (action.type) {
            case 'ADD_ARTIFACT': {
              // ADD_ARTIFACT upserts by id, as the web reducer does.
              const index = artifacts.findIndex((artifact) => artifact.id === action.payload.id);
              artifacts = index >= 0
                ? artifacts.map((artifact, i) => (i === index ? action.payload : artifact))
                : [...artifacts, action.payload];
              upserts.set(action.payload.id, action.payload);
              break;
            }
            case 'REMOVE_ARTIFACT':
              artifacts = artifacts.filter((artifact) => artifact.id !== action.payload);
              upserts.delete(action.payload);
              if (storedIds.has(action.payload)) removals.add(action.payload);
              break;
            case 'UPDATE_MESSAGE': {
              const { id, content, metadata } = action.payload;
              const index = messages.findIndex((message) => message.id === id);
              if (index >= 0) {
                messages[index] = {
                  ...messages[index],
                  content,
                  ...(metadata ? { metadata: { ...messages[index].metadata, ...metadata } } : {}),
                };
              }
              break;
            }
            case 'SET_PENDING_ORG_EVIDENCE_REQUEST':
              pendingOrgEvidenceRequest = action.payload;
              break;
          }
        },
        getState: () => ({
          artifacts,
          outputSelection,
          currentSession: { id: sessionId },
          messages,
        }),
        now: () => capturedAt,
        persistMessage: (message) => { messageToPersist = message; },
        getFetchProvenanceMap: () => fetchProvenance,
        setFetchProvenanceMap: (map) => { fetchProvenance = map; },
        getTeamPanel: () => teamPanel,
        // Only no-tool replies set this (finishWithoutTools); capture always has tool calls.
        setLatestCompletedOperatorMessageId: () => undefined,
        markReportProduced: () => { reportProduced = true; },
        getSessionWorkbookManager: () => workbook,
      },
    );

    const upserted = [...upserts.values()];
    // 1. Artifacts.
    await runInBatches(upserted, UPSERT_CONCURRENCY, async (artifact) => {
      await artifactRef(uid, sessionId, artifact.id).set(await prepareArtifactRecord(uid, sessionId, artifact), { merge: true });
    });

    // 2. Workbook state (only when this round consolidated data).
    if (JSON.stringify(workbook.exportState()) !== workbookBefore) await this.saveWorkbook(workbook);

    // 3. Deletes + message + run state, atomically: the message is the commit marker.
    const persisted = messageToPersist ?? messages.find((message) => message.id === messageId) ?? input.message;
    const messageRecord = await prepareMessageRecord(uid, sessionId, persisted);
    // Also drop what a crashed earlier attempt of this round wrote and this one didn't.
    const removed = stored.filter((artifact) => removals.has(artifact.id)
      || (artifact.cellId === messageId && !upserts.has(artifact.id)));
    const batch = getFirestore().batch();
    for (const artifact of removed) batch.delete(artifactRef(uid, sessionId, artifact.id));
    batch.set(messageRef(uid, sessionId, messageId), messageRecord, { merge: true });
    batch.update(runRef, removeUndefined({
      fetchProvenanceJson: JSON.stringify(Object.fromEntries(fetchProvenance)),
      ...(reportProduced ? { reportProduced: true } : {}),
      ...(pendingOrgEvidenceRequest ? { pendingOrgEvidenceRequest } : {}),
      updatedAt: Date.now(),
    }));
    await batch.commit();

    await Promise.all(removed.map((artifact) => deleteArtifactPayloads(uid, artifact.payloadRefs).catch((error) => {
      console.warn('[analyzeRun] could not delete a removed artifact\'s payload', { id: artifact.id, error });
    })));

    // Track the committed state for the rest of the step.
    this.fetchProvenance = fetchProvenance;
    const removedIds = new Set(removed.map((artifact) => artifact.id));
    this.artifacts = [
      ...stored.filter((artifact) => !removedIds.has(artifact.id) && !upserts.has(artifact.id)),
      ...upserted,
    ];
    if (reportProduced) run.reportProduced = true;
    if (pendingOrgEvidenceRequest) run.pendingOrgEvidenceRequest = pendingOrgEvidenceRequest;
  }
}
