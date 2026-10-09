/**
 * Firestore state for server-side Analyze runs (Phase 3).
 *
 *   users/{uid}/conversations/{sessionId}/analyzeRuns/{runId}        run doc
 *   …/analyzeRuns/{runId}/runEvents/{seq}                            live events (TTL)
 *   …/analyzeRuns/{runId}/toolCalls/{toolCallId}                     idempotency
 *   users/{uid}/conversations/{sessionId}/messages/{messageId}       durable record
 *
 * Rules: owners read runs and events; nothing is client-writable (actions
 * go through callables). Lease timings come from the Step 0 spike: recovery
 * time ≈ lease length, and a delivery that finds a live lease must fail so
 * Cloud Tasks redelivers it.
 */
import { getFirestore, FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import type { Message, MessageMetadata } from '../contract/types';
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
}

export interface AnalyzeRunDoc {
  runId: string;
  uid: string;
  sessionId: string;
  kind: 'operator';
  status: RunStatus;
  round: number;
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
// Messages (the durable record the web app reads)
// ============================================================================

// Firestore doesn't accept undefined values - remove them from objects.
// Ported from symposium-ai-web ChatHistoryService removeUndefined.
export const removeUndefined = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefined(entry))
      .filter((entry) => entry !== undefined) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry === undefined) return;
      const cleaned = removeUndefined(entry);
      if (cleaned === undefined) return;
      result[key] = cleaned;
    });
    return result as T;
  }
  return value;
};

/**
 * Same record shape the web app writes (ChatHistoryService buildMessageRecord),
 * so History, restore, and the transcript read server-written messages as-is.
 * Attachments are not persisted, matching the client.
 */
export function buildMessageRecord(sessionId: string, message: Message, conversationTurn?: number): Record<string, unknown> {
  const wordCount = message.content ? message.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const metadata: MessageMetadata | undefined = message.metadata
    ? removeUndefined({
        ...message.metadata,
        sessionId: message.metadata.sessionId || sessionId,
        wordCount: message.metadata.wordCount ?? wordCount,
        ...(conversationTurn ? { conversationTurn } : {}),
      })
    : wordCount > 0 || conversationTurn
      ? removeUndefined({
          sessionId,
          wordCount,
          ...(conversationTurn ? { conversationTurn } : {}),
        })
      : undefined;
  const metadataValue = metadata && Object.keys(metadata).length > 0 ? metadata : undefined;

  return removeUndefined({
    id: message.id,
    sender: message.sender,
    senderType: message.senderType,
    content: message.content,
    timestamp: message.timestamp,
    mentions: message.mentions,
    metadata: metadataValue,
  });
}

/** Firestore's document limit; large-message offload to Storage lands in Step 3. */
const MAX_INLINE_MESSAGE_BYTES = 1_000_000;

export async function writeMessage(uid: string, sessionId: string, message: Message): Promise<void> {
  const record = buildMessageRecord(sessionId, message);
  const bytes = Buffer.byteLength(JSON.stringify(record));
  if (bytes > MAX_INLINE_MESSAGE_BYTES) {
    throw new Error(`Message ${message.id} is ${bytes} bytes; Storage offload is not implemented on the server yet (Phase 3 Step 3)`);
  }
  await getFirestore()
    .doc(`users/${uid}/conversations/${sessionId}/messages/${message.id}`)
    .set(record, { merge: true });
}

export async function loadSessionMessages(uid: string, sessionId: string): Promise<Message[]> {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/messages`)
    .orderBy('timestamp', 'asc')
    .get();
  return snapshot.docs.map((doc) => doc.data() as Message);
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
  | { state: 'done'; result: StoredToolResult; finishedAt: number };

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

export async function markToolCallDone(ref: DocumentReference, result: StoredToolResult): Promise<void> {
  await ref.set({ state: 'done', result, finishedAt: Date.now() });
}

export { FieldValue };
