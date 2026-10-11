/**
 * Client entry points for server-side Analyze runs. Clients never write run
 * state directly (rules deny it); every action is a callable.
 *
 *   analyzeStartTurn     the user's message → an operator run
 *   analyzeRunControl    one run: stop, team plan answers, lanes, auto-approve
 *   analyzeReviewControl the session's review queue: review, verify, send, select…
 *   analyzeUploads       the session's uploads: write (chunked), download, remove, list
 *   analyzeRunCell       a manual cell re-run, refused while a turn is running
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { MessageAttachment } from '../contract/types';
import { e2bApiKey } from '../../sandbox/callables';
import { UploadInputError, listUploads, readUploadChunk, removeUpload, writeUploadChunk } from './uploads';
import { isV2Supported } from '../../providers/registry';
import { getCatalogModel } from '../modelCatalog';
import { isTerminal, runRef, type AnalyzeRunDoc, type RosterAI, type RunConfig } from './runStore';
import { SessionBusyError, TurnAlreadyStartedError, startOperatorTurn, type UserMessageContext } from './turns';
import { NoSessionSandboxError, runCell } from './runCell';
import { normalizeAnalyzeOutputSelection } from '../contract/types/analyze';
import { MAX_PANEL_SIZE, TeamArgsError } from '../team/teamTools';
import {
  TeamControlError,
  approvePlan,
  cancelChildren,
  cancelLane,
  forceStopStranded,
  replaceLane,
  stopWaitingOperator,
  workSolo,
} from '../team/teamStore';
import { startRerun } from '../team/reruns';
import type { TeamAssignment } from '../team/types';
import {
  dismissReviewItems,
  reopenReviewItems,
  sendReviewItemsToOperator,
  setReviewItemsSelected,
  startReviewPass,
  startVerification,
} from '../review/reviewRuns';
import { SERVER_LOOP_ALLOWED_UIDS } from './allowlist';

function requireAllowedUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Analyze.');
  if (!SERVER_LOOP_ALLOWED_UIDS.has(uid)) {
    throw new HttpsError('permission-denied', 'Server-side Analyze is not available for this account yet.');
  }
  return uid;
}

function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return value;
}

function optionalString(value: unknown, max = 200_000): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

function stringList(value: unknown, max = 100): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, max) : [];
}

interface RosterAIInput { id?: unknown; name?: unknown; provider?: unknown; model?: unknown; displayName?: unknown }

/** A roster AI the run can call: a V2 provider and a known model. */
function rosterAI(value: RosterAIInput | undefined, field: string, needsTools: boolean): RosterAI {
  const provider = requireString(value?.provider, `${field}.provider`);
  const model = requireString(value?.model, `${field}.model`);
  if (!isV2Supported(provider)) throw new HttpsError('invalid-argument', `Provider ${provider} can't run Analyze.`);
  const catalogModel = getCatalogModel(provider, model);
  if (!catalogModel) throw new HttpsError('invalid-argument', `Unknown model ${provider}/${model}.`);
  if (needsTools && !catalogModel.supportsFunctions) throw new HttpsError('invalid-argument', `${model} can't call tools.`);
  const displayName = optionalString(value?.displayName, 200);
  return {
    id: requireString(value?.id, `${field}.id`),
    name: requireString(value?.name, `${field}.name`),
    provider,
    model,
    ...(displayName ? { modelConfig: { displayName } } : {}),
  };
}

/** Composer attachments: images and documents with their bytes (the canonical protocol carries only these). */
function parseAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    if (item.type !== 'image' && item.type !== 'document') {
      throw new HttpsError('invalid-argument', `message.attachments[${index}] must be an image or a document`);
    }
    const base64 = requireString(item.base64, `message.attachments[${index}].base64`, 10_000_000);
    const mimeType = requireString(item.mimeType, `message.attachments[${index}].mimeType`);
    const fileName = optionalString(item.fileName, 500);
    return {
      type: item.type,
      uri: `data:${mimeType};base64,${base64}`,
      mimeType,
      base64,
      ...(fileName ? { fileName } : {}),
    };
  });
}

/** The composer's context controls on the message: lists of ids, nothing else. */
function parseMessageContext(value: unknown): UserMessageContext | undefined {
  const metadata = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const selectedConnectorIds = stringList(metadata.selectedConnectorIds, 50).filter((id) => id.length <= 200);
  const selectedAnalysisLensIds = stringList(metadata.selectedAnalysisLensIds, 50).filter((id) => id.length <= 200);
  if (selectedConnectorIds.length === 0 && selectedAnalysisLensIds.length === 0) return undefined;
  return {
    ...(selectedConnectorIds.length > 0 ? { selectedConnectorIds } : {}),
    ...(selectedAnalysisLensIds.length > 0 ? { selectedAnalysisLensIds } : {}),
  };
}

interface StartTurnRequest {
  sessionId: string;
  message: { id?: string; content: string; attachments?: unknown; mentions?: unknown; metadata?: unknown };
  ai: RosterAIInput;
  systemPrompt: string;
  toolNames: string[];
  /** The composer's output selection (AnalyzeOutputSelection); defaults like a new session. */
  outputSelection?: unknown;
  /** Save capture traces for the web parity harness (scripts/analyze-capture-parity). */
  /** Roster teammates, in roster order (handles teammate1..). Never the reviewer. */
  teammates?: RosterAIInput[];
  /** Roster reviewers. */
  reviewers?: RosterAIInput[];
  /** Team mode for this message (needs teammates). */
  teamPlan?: boolean;
  teamAutoApprove?: boolean;
  autoReview?: boolean;
  salesforceWorkspace?: boolean;
  /** System prompts the caller builds like systemPrompt: teammates', and the operator's with Team mode off. */
  subagentSystemPrompt?: string;
  followUpSystemPrompt?: string;
  /** This message imports org findings or continues without them: the open org-evidence request is answered. */
  resolvesOrgEvidenceRequest?: boolean;
}

export const analyzeStartTurn = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Partial<StartTurnRequest>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const attachments = parseAttachments(data.message?.attachments);
  // An attachment alone is a message (the browser sent those too).
  const content = attachments.length > 0 && typeof data.message?.content === 'string' && data.message.content.length <= 200_000
    ? data.message.content
    : requireString(data.message?.content, 'message.content', 200_000);
  const systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : '';
  const toolNames = stringList(data.toolNames);
  const operator = rosterAI(data.ai, 'ai', toolNames.length > 0);
  const teammates = (Array.isArray(data.teammates) ? data.teammates : []).slice(0, 20)
    .map((ai, index) => rosterAI(ai, `teammates[${index}]`, toolNames.length > 0));
  const reviewers = (Array.isArray(data.reviewers) ? data.reviewers : []).slice(0, 10)
    .map((ai, index) => rosterAI(ai, `reviewers[${index}]`, false));

  const config: RunConfig = {
    provider: operator.provider,
    model: operator.model,
    aiId: operator.id,
    aiName: operator.name,
    systemPrompt,
    toolNames,
    // The session's own sandbox: clients never name one.
    sandboxSessionKey: sessionId,
    outputSelection: normalizeAnalyzeOutputSelection(data.outputSelection),
    ...(operator.modelConfig ? { modelDisplayName: operator.modelConfig.displayName } : {}),
    // buildTeam: handles are short and stable so models reliably emit them.
    ...(teammates.length > 0 ? { team: teammates.map((ai, index) => ({ handle: `teammate${index + 1}`, ai })) } : {}),
    ...(reviewers.length > 0 ? { reviewers } : {}),
    // Team mode needs someone to plan with (AnalyzeOrchestrator.processMessage).
    ...(data.teamPlan === true && teammates.length > 0 ? { teamPlanTurn: true } : {}),
    ...(data.teamAutoApprove === true ? { teamAutoApprove: true } : {}),
    ...(data.autoReview === true ? { autoReview: true } : {}),
    ...(data.salesforceWorkspace === true ? { salesforceWorkspace: true } : {}),
    ...(optionalString(data.subagentSystemPrompt) !== undefined ? { subagentSystemPrompt: data.subagentSystemPrompt } : {}),
    ...(optionalString(data.followUpSystemPrompt) !== undefined ? { followUpSystemPrompt: data.followUpSystemPrompt } : {}),
  };

  try {
    return await startOperatorTurn({
      uid,
      sessionId,
      content,
      messageId: typeof data.message?.id === 'string' && data.message.id ? data.message.id : undefined,
      config,
      resolvesOrgEvidenceRequest: data.resolvesOrgEvidenceRequest === true,
      attachments,
      mentions: stringList(data.message?.mentions, 20).filter((mention) => mention.length <= 200),
      context: parseMessageContext(data.message?.metadata),
    });
  } catch (error) {
    if (error instanceof SessionBusyError) throw new HttpsError('failed-precondition', error.message);
    if (error instanceof TurnAlreadyStartedError) throw new HttpsError('already-exists', 'This message was already sent.');
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Analyze could not start this run. Please try again.');
  }
});

function parseAssignments(value: unknown): TeamAssignment[] {
  if (!Array.isArray(value)) throw new HttpsError('invalid-argument', 'assignments are required');
  return value.slice(0, 50).map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      id: requireString(item.id, `assignments[${index}].id`, 500),
      task: requireString(item.task, `assignments[${index}].task`, 200_000),
      agents: stringList(item.agents, MAX_PANEL_SIZE + 1),
    };
  });
}

function controlFailure(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof TeamControlError || error instanceof TeamArgsError) throw new HttpsError('failed-precondition', error.message);
  if (error instanceof SessionBusyError) throw new HttpsError('failed-precondition', error.message);
  console.error('[analyzeRun] control failed', error);
  throw new HttpsError('internal', 'That action failed. Please try again.');
}

export const analyzeRunControl = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const runId = requireString(data.runId, 'runId');
  const action = data.action;

  const ref = runRef(uid, sessionId, runId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Run not found.');
  const run = snapshot.data() as AnalyzeRunDoc;

  try {
    switch (action) {
      case 'stop': {
        if (isTerminal(run.status)) return { status: run.status };
        await ref.update({ cancelRequested: true, cancelRequestedAt: Date.now() });
        if (run.kind === 'operator') {
          // Stop cascades: pending plans answer as stopped, running teammates stop; the last one wakes the operator to stop.
          await stopWaitingOperator(ref);
          await cancelChildren(uid, sessionId, runId);
        }
        await forceStopStranded(uid, sessionId, runId);
        return { status: 'stopping' };
      }
      case 'approve_plan': {
        const planId = requireString(data.planId, 'planId', 500);
        const accepted = await approvePlan(ref, planId, { type: 'approve', assignments: parseAssignments(data.assignments) });
        return { accepted };
      }
      case 'work_solo':
        await workSolo(ref);
        return { ok: true };
      case 'cancel_lane':
        await cancelLane(uid, sessionId, requireString(data.childRunId, 'childRunId'));
        return { ok: true };
      case 'replace_lane': {
        const replaced = await replaceLane(uid, sessionId, requireString(data.childRunId, 'childRunId'), requireString(data.handle, 'handle'));
        return { accepted: replaced };
      }
      case 'rerun_task': {
        const rerunId = await startRerun(uid, sessionId, requireString(data.previousRunId, 'previousRunId'), requireString(data.handle, 'handle'));
        return { runId: rerunId };
      }
      case 'set_auto_approve':
        // Applies to the plans this run proposes from now on (TeamApprovalGate.setAutoApprove).
        await ref.update({ 'config.teamAutoApprove': data.enabled === true, updatedAt: Date.now() });
        return { ok: true };
      default:
        throw new HttpsError('invalid-argument', `Unknown action ${String(action)}`);
    }
  } catch (error) {
    controlFailure(error);
  }
});

/** The user's answers to handed-back review items: text by item id, only for the items being sent. */
function parseAnswers(value: unknown, itemIds: string[]): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const answers: Record<string, string> = {};
  for (const id of itemIds) {
    const answer = (value as Record<string, unknown>)[id];
    if (typeof answer === 'string' && answer.trim()) answers[id] = answer;
  }
  return answers;
}

export const analyzeReviewControl = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const itemIds = stringList(data.itemIds);

  try {
    switch (data.action) {
      case 'review': {
        const runId = await startReviewPass(uid, sessionId, {
          reviewerIds: stringList(data.reviewerIds, 10),
          targetMessageId: optionalString(data.targetMessageId, 500) ?? null,
          requestText: optionalString(data.requestText, 20_000)?.trim() || undefined,
          trigger: 'manual',
        });
        return { runId };
      }
      case 'verify':
        return { runIds: await startVerification(uid, sessionId, itemIds) };
      case 'send_to_operator':
        return await sendReviewItemsToOperator(uid, sessionId, itemIds, parseAnswers(data.answers, itemIds));
      case 'select':
        await setReviewItemsSelected(uid, sessionId, itemIds, true);
        return { ok: true };
      case 'deselect':
        await setReviewItemsSelected(uid, sessionId, itemIds, false);
        return { ok: true };
      case 'reopen':
        await reopenReviewItems(uid, sessionId, itemIds);
        return { ok: true };
      case 'dismiss':
        await dismissReviewItems(uid, sessionId, itemIds);
        return { ok: true };
      default:
        throw new HttpsError('invalid-argument', `Unknown action ${String(data.action)}`);
    }
  } catch (error) {
    controlFailure(error);
  }
});

/**
 * The session's uploads. The client sends a file's bytes in chunks (write);
 * the server keeps it in Storage and puts it in the sandbox before the next
 * round. Download reads it back from Storage. Clients never touch the sandbox.
 */
export const analyzeUploads = onCall(
  { region: 'us-central1', secrets: [e2bApiKey], memory: '1GiB', timeoutSeconds: 300 },
  async (request) => {
    const uid = requireAllowedUid(request.auth?.uid);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const sessionId = requireString(data.sessionId, 'sessionId');
    try {
      switch (data.op) {
        case 'write': {
          const source = (data.source && typeof data.source === 'object' ? data.source : {}) as Record<string, unknown>;
          return await writeUploadChunk(uid, sessionId, {
            pythonPath: requireString(data.path, 'path', 1024),
            chunkIndex: data.chunkIndex as number,
            totalChunks: data.totalChunks as number,
            base64: typeof data.base64 === 'string' ? data.base64 : '',
            size: data.size as number,
            sha256: requireString(data.sha256, 'sha256', 64),
            mimeType: optionalString(data.mimeType, 200) ?? 'application/octet-stream',
            source: {
              sourceKind: source.sourceKind === 'artifact' ? 'artifact' : source.sourceKind === 'upload' ? 'upload' : undefined,
              sourceArtifactId: optionalString(source.sourceArtifactId, 500),
              sourceArtifactType: optionalString(source.sourceArtifactType, 100) as never,
              sourceArtifactSessionId: optionalString(source.sourceArtifactSessionId, 500),
              sourceArtifactName: optionalString(source.sourceArtifactName, 1000),
            },
          });
        }
        case 'download':
          return await readUploadChunk(uid, sessionId, data.path, typeof data.offset === 'number' ? data.offset : 0);
        case 'remove':
          await removeUpload(uid, sessionId, data.path);
          return { ok: true };
        case 'list':
          return { files: await listUploads(uid, sessionId) };
        default:
          throw new HttpsError('invalid-argument', `Unknown op ${String(data.op)}`);
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof UploadInputError) throw new HttpsError('invalid-argument', error.message);
      console.error('[analyzeUploads] failed', { op: data.op, error });
      throw new HttpsError('internal', 'The upload could not be saved. Please try again.');
    }
  },
);

export const analyzeRunCell = onCall(
  { region: 'us-central1', secrets: [e2bApiKey], timeoutSeconds: 120 },
  async (request) => {
    const uid = requireAllowedUid(request.auth?.uid);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const sessionId = requireString(data.sessionId, 'sessionId');
    if (typeof data.code !== 'string' || data.code.length > 1_000_000) throw new HttpsError('invalid-argument', 'code is required');
    try {
      return await runCell(uid, sessionId, data.code);
    } catch (error) {
      if (error instanceof SessionBusyError) throw new HttpsError('failed-precondition', 'Wait for the current run to finish before running a cell.');
      if (error instanceof NoSessionSandboxError) throw new HttpsError('failed-precondition', error.message);
      console.error('[analyzeRunCell] failed', error);
      throw new HttpsError('internal', 'The cell could not run. Please try again.');
    }
  },
);
