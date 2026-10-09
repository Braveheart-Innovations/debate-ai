/**
 * Firestore state for server-side Analyze runs (Phase 3).
 *
 *   users/{uid}/conversations/{sessionId}/analyzeRuns/{runId}        run doc
 *   …/analyzeRuns/{runId}/runEvents/{seq}                            live events (TTL)
 *   …/analyzeRuns/{runId}/toolCalls/{toolCallId}                     idempotency
 *   users/{uid}/conversations/{sessionId}/{messages,artifacts}/…     durable record (sessionStore)
 *   Storage analyzeScratch/{run path}/toolCalls/{toolCallId}.json    a finished call's full outputs, until captured
 *
 * Rules: owners read runs and events; nothing is client-writable (actions
 * go through callables). Lease timings come from the Step 0 spike: recovery
 * time ≈ lease length, and a delivery that finds a live lease must fail so
 * Cloud Tasks redelivers it.
 */
import { getFirestore, FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { AnalyzeOutputSelection } from '../contract/types/analyze';
import type { AnalyzeOrgEvidenceRequest } from '../capture/types';
import { removeUndefined } from './sessionStore';
import type { ToolResult } from '../contract/lib/ai/tools/types';

export const LEASE_MS = 30_000;
export const HEARTBEAT_MS = 10_000;
/** Stream events are for live rendering only; messages are the durable record. */
export const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
export const EVENT_BATCH_MS = 250;

export type RunStatus = 'queued' | 'running' | 'completed' | 'stopped' | 'error';
const TERMINAL: RunStatus[] = ['completed', 'stopped', 'error'];

export interface RunConfig {
  provider: string;
  model: string;
  aiId: string;
  aiName: string;
  systemPrompt: string;
  toolNames: string[];
  temperature?: number;
  maxTokens?: number;
  sandboxSessionKey: string;
  /** The output the user chose (Analyze composer); capture classifies and gates artifacts by it. */
  outputSelection: AnalyzeOutputSelection;
  /** Save each round's capture inputs and output (capture parity checks; Phase 3 build-out only). */
  captureTrace?: boolean;
}

export interface AnalyzeRunDoc {
  runId: string;
  uid: string;
  sessionId: string;
  kind: 'operator';
  status: RunStatus;
  round: number;
  /** Model-call retries used this turn (loopHandlers: one per turn). */
  retryCount?: number;
  config: RunConfig;
  userMessageId: string;
  eventSeq: number;
  createdAt: number;
  updatedAt: number;
  lease?: { owner: string; expiresAt: number } | null;
  cancelRequested?: boolean;
  cancelRequestedAt?: number;
  error?: { message: string; code: string } | null;
  finishedAt?: number;
  /**
   * Turn-scoped capture state (the browser kept these in refs reset per turn):
   * fetch provenance keyed by sanitized tool-call id (JSON, since provenance
   * parameters can hold nested arrays Firestore rejects), whether a valid
   * report spec was captured (gates auto-review), the last finished operator
   * reply, and an open org-evidence request.
   */
  fetchProvenanceJson?: string;
  reportProduced?: boolean;
  latestCompletedOperatorMessageId?: string;
  pendingOrgEvidenceRequest?: AnalyzeOrgEvidenceRequest;
}

export function runRef(uid: string, sessionId: string, runId: string): DocumentReference {
  return getFirestore().doc(`users/${uid}/conversations/${sessionId}/analyzeRuns/${runId}`);
}

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.includes(status);
}

// ============================================================================
// Lease
// ============================================================================

export class LeaseHeldError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} is leased by another step; retry later`);
  }
}

/**
 * Take the run's lease. Returns the run, or null when it already finished.
 * Throws LeaseHeldError when another live step holds it: the caller must let
 * that error fail the task so Cloud Tasks retries (never return success).
 */
export async function acquireLease(ref: DocumentReference, owner: string): Promise<AnalyzeRunDoc | null> {
  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error(`Run not found: ${ref.path}`);
    const run = snapshot.data() as AnalyzeRunDoc;
    if (isTerminal(run.status)) return null;
    if (run.lease && run.lease.owner !== owner && run.lease.expiresAt > Date.now()) {
      throw new LeaseHeldError(run.runId);
    }
    const lease = { owner, expiresAt: Date.now() + LEASE_MS };
    tx.update(ref, { lease, status: 'running', updatedAt: Date.now() });
    return { ...run, lease, status: 'running' };
  });
}

/** Renew the lease every HEARTBEAT_MS until stopped. */
export function startHeartbeat(ref: DocumentReference, owner: string): () => void {
  const timer = setInterval(() => {
    void ref.update({ lease: { owner, expiresAt: Date.now() + LEASE_MS } }).catch((error) => {
      console.error('[analyzeRun] heartbeat failed', error);
    });
  }, HEARTBEAT_MS);
  return () => clearInterval(timer);
}

/** Watch for a Stop request; the signal aborts in-flight model calls and Python. */
export function watchCancel(ref: DocumentReference): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  const unsubscribe = ref.onSnapshot((snapshot) => {
    if (snapshot.data()?.cancelRequested && !controller.signal.aborted) controller.abort();
  }, (error) => console.error('[analyzeRun] cancel listener failed', error));
  return { signal: controller.signal, stop: unsubscribe };
}

/** The turn's last finished operator reply (the browser's latestCompletedOperatorMessageId; auto-review's target). */
export async function setLatestCompletedOperatorMessage(ref: DocumentReference, messageId: string): Promise<void> {
  await ref.update({ latestCompletedOperatorMessageId: messageId, updatedAt: Date.now() });
}

export async function finishRun(
  ref: DocumentReference,
  status: Extract<RunStatus, 'completed' | 'stopped' | 'error'>,
  error?: { message: string; code: string },
): Promise<void> {
  await ref.update({
    status,
    lease: null,
    finishedAt: Date.now(),
    updatedAt: Date.now(),
    ...(error ? { error } : {}),
  });
}

// ============================================================================
// Live events
// ============================================================================

export type RunEvent =
  | { type: 'text'; messageId: string; text: string }
  | { type: 'tool_call_start'; messageId: string; toolCallId: string; toolName: string }
  | { type: 'tool_executing'; toolCallId: string; toolName: string }
  | { type: 'tool_completed'; toolCallId: string; toolName: string; success: boolean }
  | { type: 'status'; status: RunStatus | 'streaming' | 'tool_executing' };

/**
 * Batches live events into runEvents docs, one doc per ~250 ms of activity
 * (spike: ~65 ms write→listener). Text deltas for the same message merge.
 */
export class RunEventWriter {
  private pending: RunEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private writes: Promise<unknown>[] = [];

  constructor(private readonly ref: DocumentReference, private seq: number) {}

  push(event: RunEvent): void {
    const last = this.pending[this.pending.length - 1];
    if (event.type === 'text' && last?.type === 'text' && last.messageId === event.messageId) {
      last.text += event.text;
    } else {
      this.pending.push(event.type === 'text' ? { ...event } : event);
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), EVENT_BATCH_MS);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;
    const events = this.pending;
    this.pending = [];
    this.seq += 1;
    const now = Date.now();
    this.writes.push(this.ref.collection('runEvents').doc(String(this.seq).padStart(8, '0')).set({
      seq: this.seq,
      events,
      at: now,
      expireAt: Timestamp.fromMillis(now + EVENT_TTL_MS),
    }));
  }

  /** Flush, wait for every write, and persist the sequence on the run doc. */
  async close(): Promise<void> {
    this.flush();
    await Promise.all(this.writes);
    this.writes = [];
    await this.ref.update({ eventSeq: this.seq, updatedAt: Date.now() });
  }
}

// ============================================================================
// Tool-call idempotency
// ============================================================================

/** What a redelivered step needs to rebuild a tool's message without rerunning it. */
export interface StoredToolResult {
  success: boolean;
  content?: string;
  error?: string;
  dataOutputs?: Array<{ filename: string; size: number }>;
}

export type ToolCallRecord =
  | { state: 'started'; startedAt: number }
  | { state: 'done'; result: StoredToolResult; finishedAt: number; outputsPath?: string };

export function toolCallRef(run: DocumentReference, toolCallId: string): DocumentReference {
  return run.collection('toolCalls').doc(toolCallId);
}

export function toStoredToolResult(result: ToolResult): StoredToolResult {
  return removeUndefined({
    success: result.success,
    content: result.content,
    error: result.error,
    dataOutputs: result.dataOutputs?.map((output) => ({ filename: output.filename, size: output.size })),
  });
}

export async function getToolCallRecord(ref: DocumentReference): Promise<ToolCallRecord | null> {
  const snapshot = await ref.get();
  return snapshot.exists ? (snapshot.data() as ToolCallRecord) : null;
}

export async function markToolCallStarted(ref: DocumentReference): Promise<void> {
  await ref.set({ state: 'started', startedAt: Date.now() });
}

export async function markToolCallDone(ref: DocumentReference, result: StoredToolResult, outputsPath?: string): Promise<void> {
  await ref.set(removeUndefined({ state: 'done', result, finishedAt: Date.now(), outputsPath }));
}

// ============================================================================
// Tool outputs awaiting capture
// ============================================================================

const SCRATCH_BUCKET = 'symposium-ai.firebasestorage.app';

function scratchFile(path: string) {
  return getStorage().bucket(SCRATCH_BUCKET).file(path);
}

/** True when the full result carries more than the stored record keeps (what capture reads). */
function hasCaptureOutputs(result: ToolResult): boolean {
  return Boolean(
    result.images?.length
    || result.htmlOutputs?.length
    || result.dataOutputs?.length
    || result.bundleOutputs?.length
    || result.provenance
    || result.metadata?.fullStdout,
  );
}

/**
 * Keep a finished call's full outputs until its round is captured, so a step
 * that dies between the tools and capture can still capture the round on
 * redelivery. Private to the server (Storage rules deny analyzeScratch/).
 */
export async function saveToolOutputs(ref: DocumentReference, result: ToolResult): Promise<string | undefined> {
  if (!hasCaptureOutputs(result)) return undefined;
  const path = `analyzeScratch/${ref.path}.json`;
  await scratchFile(path).save(JSON.stringify(result), { contentType: 'application/json', resumable: false });
  return path;
}

/** The full result of a finished call: its saved outputs, else the stored record. */
export async function loadToolResult(ref: DocumentReference): Promise<ToolResult | null> {
  const record = await getToolCallRecord(ref);
  if (record?.state !== 'done') return null;
  if (record.outputsPath) {
    try {
      const [bytes] = await scratchFile(record.outputsPath).download();
      return JSON.parse(bytes.toString('utf8')) as ToolResult;
    } catch (error) {
      console.warn('[analyzeRun] saved tool outputs unavailable; capturing from the stored result', { path: record.outputsPath, error });
    }
  }
  return { toolCallId: ref.id, ...record.result } as ToolResult;
}

/** Drop the saved outputs of captured calls (best effort; they are only a crash net). */
export async function deleteToolOutputs(refs: DocumentReference[]): Promise<void> {
  await Promise.all(refs.map((ref) => scratchFile(`analyzeScratch/${ref.path}.json`)
    .delete({ ignoreNotFound: true })
    .catch((error) => console.warn('[analyzeRun] could not delete saved tool outputs', { path: ref.path, error }))));
}

export { FieldValue };
