/**
 * Firestore state for server-side Analyze runs (Phase 3).
 *
 *   users/{uid}/conversations/{sessionId}/analyzeRuns/{runId}        run doc
 *   …/analyzeRuns/{runId}/runEvents/{seq}                            live events (TTL)
 *   …/analyzeRuns/{runId}/toolCalls/{toolCallId}                     idempotency
 *   …/analyzeRuns/{runId}/messages/{id}                              a subagent's transcript
 *   users/{uid}/conversations/{sessionId}/reviewItems/{id}           the review queue
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
import type { AnalyzeTeamRunSummary, MessageAttachment } from '../contract/types';
import type { AgentPurpose, AgentRunResult, TeamPlan } from '../team/types';
import type { TeamTurnState } from '../team/teamState';

export const LEASE_MS = 30_000;
export const HEARTBEAT_MS = 10_000;
/** Stream events are for live rendering only; messages are the durable record. */
export const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
export const EVENT_BATCH_MS = 250;

export type RunStatus =
  | 'queued'
  | 'running'
  /** The operator proposed a team; the plan waits for the user (team.plans). */
  | 'awaiting_approval'
  /** The operator's team is working; the last child to finish wakes it. */
  | 'waiting_children'
  | 'completed'
  | 'stopped'
  | 'error';
const TERMINAL: RunStatus[] = ['completed', 'stopped', 'error'];
/** Not runnable until a user decision or the children wake it; a stray delivery does nothing. */
const WAITING: RunStatus[] = ['awaiting_approval', 'waiting_children'];
/** An operator run in these states owns the session: no second turn may start. */
export const OPERATOR_ACTIVE: RunStatus[] = ['queued', 'running', 'awaiting_approval', 'waiting_children'];

/**
 * operator: the user's turn. teammate: a delegated task (child of the
 * operator's team call) or a "Run again" rerun. verify: Check independently
 * on a review item. reviewer: a reviewer pass (one model call per reviewer).
 */
export type RunKind = 'operator' | 'teammate' | 'verify' | 'reviewer';

/** A roster AI as the run needs it (the contract's AI type, minimal). */
export interface RosterAI {
  id: string;
  name: string;
  provider: string;
  model: string;
  modelConfig?: { displayName: string };
}

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
  /** Python kernel for this run (subagents get their own; the operator uses the default). */
  kernel?: string;
  /** The model's display name (roster modelConfig), shown for subagents as the browser did. */
  modelDisplayName?: string;
  /** Roster teammates the operator may delegate to (handles teammate1..), never the reviewer. */
  team?: Array<{ handle: string; ai: RosterAI }>;
  /** Roster reviewers (auto-review, Check independently). */
  reviewers?: RosterAI[];
  /** Team mode: this turn starts with a team plan (the planning gate). */
  teamPlanTurn?: boolean;
  /** Approve team plans without waiting (the card still shows). */
  teamAutoApprove?: boolean;
  /** Review the turn's report when it completes. */
  autoReview?: boolean;
  /** The session has a Salesforce workspace upload (the planning gate offers the audit first). */
  salesforceWorkspace?: boolean;
  /** The teammates' system prompt (subagent role); the caller builds it like systemPrompt. */
  subagentSystemPrompt?: string;
  /** The operator prompt for turns the server starts (Run again, review hand-off): Team mode off. Defaults to systemPrompt. */
  followUpSystemPrompt?: string;
}

/** What a subagent run is doing for whom. */
export interface AgentRunInfo {
  purpose: AgentPurpose;
  /** The task as written by the operator (or the review check), shown in the lane. */
  task: string;
  /** The operator's team tool call (`rerun:<runId>` / `review:<itemId>` outside a turn). */
  parentToolCallId: string;
  /** Runs of the same approved task share this key (two or more = a panel). */
  assignmentKey?: string;
  /** Roster handle the run was started for. */
  handle: string;
  /** Run again: the run this one reruns; its result goes back to the operator as a new turn. */
  rerunOf?: string;
  /** Check independently: the review item being checked. */
  reviewItemId?: string;
}

/** A reviewer pass: who reviews which operator reply. */
export interface ReviewPassInfo {
  reviewerIds: string[];
  /** The operator reply under review (null: the latest one, as the browser picked it). */
  targetMessageId: string | null;
  requestText?: string;
  trigger: 'auto' | 'manual';
}

export interface AnalyzeRunDoc {
  runId: string;
  uid: string;
  sessionId: string;
  kind: RunKind;
  status: RunStatus;
  /** Subagent runs: the operator run whose team call started them (absent for reruns and verify). */
  parentRunId?: string;
  agent?: AgentRunInfo;
  /** A finished subagent's result (set before it finishes, so a redelivery reuses it). */
  result?: AgentRunResult;
  /** A finished child whose parent wake (or rerun delivery) still has to be enqueued. */
  handoffPending?: boolean;
  /** Times the sweeper re-enqueued this run without progress (engine/sweeper.ts). */
  sweepCount?: number;
  /** Operator: the post-turn work (review queue, auto-review, rerun delivery) hasn't finished yet. */
  postTurnPending?: boolean;
  /** A rerun whose result went back to the operator. */
  deliveredToOperator?: boolean;
  review?: ReviewPassInfo;
  /** Operator: turn-scoped team state (plans, waiting calls, solo, ask/evidence end-of-turn). */
  team?: TeamTurnState;
  /** Operator: the plan card(s) the user must answer (mirrors team.plans pending, for the client). */
  pendingTeamPlans?: TeamPlan[];
  /** User message metadata for a turn the server started (rerun deliveries). */
  teamRuns?: AnalyzeTeamRunSummary[];
  /** Review items handed to this turn (queued → completed when it completes). */
  reviewItemIds?: string[];
  /** The user's message came with attachments (saveMessageAttachments). */
  attachmentCount?: number;
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
 * Take the run's lease. Returns the run, or null when it already finished or
 * is waiting (on a plan decision or its children: whoever ends the wait
 * enqueues a fresh step).
 * Throws LeaseHeldError when another live step holds it: the caller must let
 * that error fail the task so Cloud Tasks retries (never return success).
 */
export async function acquireLease(ref: DocumentReference, owner: string): Promise<AnalyzeRunDoc | null> {
  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error(`Run not found: ${ref.path}`);
    const run = snapshot.data() as AnalyzeRunDoc;
    if (isTerminal(run.status) || WAITING.includes(run.status)) return null;
    if (run.lease && run.lease.owner !== owner && run.lease.expiresAt > Date.now()) {
      throw new LeaseHeldError(run.runId);
    }
    const lease = { owner, expiresAt: Date.now() + LEASE_MS };
    tx.update(ref, { lease, status: 'running', updatedAt: Date.now() });
    return { ...run, lease, status: 'running' };
  });
}

/**
 * Renew the lease every HEARTBEAT_MS until stopped. A renewal only lands while
 * this step still owns the lease: one in flight when the step releases it
 * (a hand-off, or a wait for the team) must not lease the run again.
 */
export function startHeartbeat(ref: DocumentReference, owner: string): () => void {
  const timer = setInterval(() => {
    void getFirestore().runTransaction(async (tx) => {
      const lease = (await tx.get(ref)).data()?.lease as AnalyzeRunDoc['lease'];
      if (lease?.owner === owner) tx.update(ref, { lease: { owner, expiresAt: Date.now() + LEASE_MS } });
    }).catch((error) => {
      console.error('[analyzeRun] heartbeat failed', error);
    });
  }, HEARTBEAT_MS);
  return () => clearInterval(timer);
}

/**
 * Watch for a Stop request; the signal aborts in-flight model calls and
 * Python. `onChange` sees every update (user choices made mid-run, such as
 * "do it yourself", reach the running step this way).
 */
export function watchCancel(ref: DocumentReference, onChange?: (run: AnalyzeRunDoc) => void): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  const unsubscribe = ref.onSnapshot((snapshot) => {
    const data = snapshot.data() as AnalyzeRunDoc | undefined;
    if (data && onChange) onChange(data);
    if (data?.cancelRequested && !controller.signal.aborted) controller.abort();
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
  error?: { message: string; code: string } | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await ref.update({
    status,
    lease: null,
    finishedAt: Date.now(),
    updatedAt: Date.now(),
    ...(error ? { error } : {}),
    ...extra,
  });
}

// ============================================================================
// Live events
// ============================================================================

export type RunEvent =
  | { type: 'text'; messageId: string; text: string }
  | { type: 'tool_call_start'; messageId: string; toolCallId: string; toolName: string }
  /** execute_python's argument JSON as the model writes it (the cell's live code). */
  | { type: 'tool_call_delta'; messageId: string; toolCallId: string; delta: string }
  | { type: 'tool_executing'; toolCallId: string; toolName: string }
  | { type: 'tool_completed'; toolCallId: string; toolName: string; success: boolean }
  | { type: 'status'; status: RunStatus | 'streaming' | 'tool_executing' };

/**
 * Batches live events into runEvents docs, one doc per ~250 ms of activity
 * (spike: ~65 ms write→listener). Text deltas for the same message merge, as
 * do argument deltas for the same tool call.
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
    } else if (event.type === 'tool_call_delta' && last?.type === 'tool_call_delta' && last.toolCallId === event.toolCallId) {
      last.delta += event.delta;
    } else {
      this.pending.push(event.type === 'text' || event.type === 'tool_call_delta' ? { ...event } : event);
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
  /** Team tool results: the runs behind them (the Team panel after a reload). */
  teamRuns?: AnalyzeTeamRunSummary[];
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
    teamRuns: result.metadata?.teamRuns as AnalyzeTeamRunSummary[] | undefined,
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

// ============================================================================
// Composer attachments
// ============================================================================

/**
 * The images and documents a user message came with. Message records never
 * hold attachments (the client's shape), so they live here, private to the
 * server, and go back on their message in every model call's history: the
 * browser kept them on the in-memory message the same way (until a reload).
 * Deleted with the session.
 */
function messageAttachmentsPath(uid: string, sessionId: string, messageId: string): string {
  return `analyzeScratch/users/${uid}/conversations/${sessionId}/messageAttachments/${messageId}.json`;
}

export async function saveMessageAttachments(uid: string, sessionId: string, messageId: string, attachments: MessageAttachment[]): Promise<void> {
  await scratchFile(messageAttachmentsPath(uid, sessionId, messageId))
    .save(JSON.stringify(attachments), { contentType: 'application/json', resumable: false });
}

/** Every user message of the session that came with attachments (operator runs record the count). */
export async function loadSessionAttachments(uid: string, sessionId: string): Promise<Map<string, MessageAttachment[]>> {
  const runs = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`)
    .where('attachmentCount', '>', 0)
    .get();
  const byMessage = new Map<string, MessageAttachment[]>();
  await Promise.all(runs.docs.map(async (doc) => {
    const { userMessageId } = doc.data() as AnalyzeRunDoc;
    try {
      const [bytes] = await scratchFile(messageAttachmentsPath(uid, sessionId, userMessageId)).download();
      byMessage.set(userMessageId, JSON.parse(bytes.toString('utf8')) as MessageAttachment[]);
    } catch (error) {
      console.warn('[analyzeRun] message attachments unavailable', { userMessageId, error });
    }
  }));
  return byMessage;
}

export { FieldValue };
