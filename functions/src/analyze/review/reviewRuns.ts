/**
 * Review on the server (Phase 3 Step 4): reviewer passes, auto-review,
 * Check independently, and the review queue in Firestore
 * (users/{uid}/conversations/{sessionId}/reviewItems). Behavior follows the
 * browser's AnalyzeSessionContext (runReviewerMentions, the COMPLETED
 * auto-review check, verifyReviewItems, sendReviewItems); the reviewer itself
 * is unchanged (critique-only, no tools, temperature 0.2).
 */
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import type { AIConfig, Message } from '../contract/types';
import type { AnalyzeReviewItem, AnalyzeReviewVerification } from '../contract/types/analyze';
import type { Artifact } from '../contract/types/notebook';
import type { ToolCall } from '../contract/lib/ai/tools/types';
import { streamModel } from '../../modelStream';
import { buildModelRequest } from '../model/requestShaping';
import { enqueueStep } from '../engine/queue';
import {
  type AnalyzeRunDoc,
  type ReviewPassInfo,
  type RosterAI,
  finishRun,
  isTerminal,
  runRef,
} from '../engine/runStore';
import {
  loadSessionArtifacts,
  loadSessionMessages,
  messageRef,
  prepareMessageRecord,
  removeUndefined,
  runMessagesPath,
  buildMessageRecord,
} from '../engine/sessionStore';
import { findActiveOperatorRun, findLatestOperatorRun, followUpConfig, startOperatorTurn } from '../engine/turns';
import { TeamControlError, buildChildRun, newRunId } from '../team/teamStore';
import type { AgentRunResult } from '../team/types';
import {
  buildAnalyzeReviewerPrompt,
  buildConversationTurns,
  buildOperatorReviewHandoffPrompt,
  buildVerificationTask,
  getAnalyzeReviewerSystemPrompt,
  isVerifiableReviewItem,
  parseAnalyzeReviewItemsFromResponse,
  parseHandoffStatuses,
  parseVerificationVerdict,
  sortAnalyzeReviewItems,
} from './reviewService';

const REVIEWER_TEMPERATURE = 0.2;
const REVIEWER_MAX_TOKENS = 4096;
const REVIEWER_CALL_TIMEOUT_MS = 10 * 60_000;

function reviewItemsPath(uid: string, sessionId: string): string {
  return `users/${uid}/conversations/${sessionId}/reviewItems`;
}

function reviewItemRef(uid: string, sessionId: string, itemId: string): DocumentReference {
  return getFirestore().doc(`${reviewItemsPath(uid, sessionId)}/${itemId}`);
}

export async function loadReviewItems(uid: string, sessionId: string): Promise<AnalyzeReviewItem[]> {
  const snapshot = await getFirestore().collection(reviewItemsPath(uid, sessionId)).get();
  return sortAnalyzeReviewItems(snapshot.docs.map((doc) => doc.data() as AnalyzeReviewItem));
}

function runsCollection(uid: string, sessionId: string) {
  return getFirestore().collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`);
}

// ============================================================================
// Which reply is reviewed (AnalyzeSessionContext.getOperatorMessageContext)
// ============================================================================

export interface OperatorMessageContext {
  operatorMessage: Message;
  userPrompt: string;
  conversation: ReturnType<typeof buildConversationTurns>;
  /** Index of the reviewed reply in the session's messages. */
  index: number;
}

export function getOperatorMessageContext(messages: Message[], operatorProvider: string, targetMessageId?: string | null): OperatorMessageContext | null {
  if (messages.length === 0) return null;
  let operatorMessageIndex = -1;
  if (targetMessageId) {
    operatorMessageIndex = messages.findIndex((message) => message.id === targetMessageId && message.senderType === 'ai');
  }
  if (operatorMessageIndex === -1) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.senderType !== 'ai') continue;
      // The reviewer may share the operator's provider; its messages are never the operator's.
      const meta = message.metadata?.providerMetadata as Record<string, unknown> | undefined;
      if (meta?.analyzeReviewer === true || meta?.analyzeVerification === true) continue;
      const providerId = message.metadata?.providerId?.toLowerCase();
      if (providerId && providerId === operatorProvider.toLowerCase()) {
        operatorMessageIndex = i;
        break;
      }
    }
  }
  if (operatorMessageIndex === -1) return null;

  const operatorMessage = messages[operatorMessageIndex];
  let userPrompt = '';
  for (let i = operatorMessageIndex - 1; i >= 0; i -= 1) {
    if (messages[i].senderType === 'user') {
      userPrompt = messages[i].content || '';
      break;
    }
  }
  return { operatorMessage, userPrompt, conversation: buildConversationTurns(messages, operatorMessageIndex), index: operatorMessageIndex };
}

/** The provider refused or failed: the browser made one attempt and reported it, so no retry. */
export class ReviewModelError extends Error {}

/** One non-tool model call, through the same request shaping and metering as the loop. */
async function completeOnce(input: {
  uid: string;
  sessionId: string;
  ai: RosterAI;
  systemPrompt: string;
  prompt: string;
  keyValue: string;
  signal?: AbortSignal;
}): Promise<string> {
  const shaped = buildModelRequest({
    providerId: input.ai.provider,
    modelId: input.ai.model,
    prompt: input.prompt,
    history: [],
    systemPrompt: input.systemPrompt,
    temperature: REVIEWER_TEMPERATURE,
    maxTokens: REVIEWER_MAX_TOKENS,
    identityId: input.ai.id,
  });
  let text = '';
  for await (const event of streamModel({
    uid: input.uid,
    providerId: input.ai.provider,
    model: input.ai.model,
    messages: shaped.messages,
    systemPrompt: shaped.systemPrompt,
    maxTokens: shaped.maxTokens,
    temperature: shaped.temperature,
    keyValue: input.keyValue,
    sessionId: input.sessionId,
    sessionType: 'analyze',
    signal: input.signal,
    timeoutMs: REVIEWER_CALL_TIMEOUT_MS,
  })) {
    if (event.type === 'text_delta') text += event.delta;
    else if (event.type === 'error') throw new ReviewModelError(event.message);
  }
  return text;
}

// ============================================================================
// Reviewer passes
// ============================================================================

/** The reply was already reviewed (lastReviewedMessageId): a pass for it is under way or done. */
async function wasReviewed(uid: string, sessionId: string, targetMessageId: string): Promise<boolean> {
  const snapshot = await runsCollection(uid, sessionId).where('review.targetMessageId', '==', targetMessageId).get();
  return snapshot.docs.some((doc) => (doc.data() as AnalyzeRunDoc).status !== 'error' && (doc.data() as AnalyzeRunDoc).status !== 'stopped');
}

/** The last reply a pass reviewed (the browser's lastReviewedMessageId). */
export async function lastReviewedMessageId(uid: string, sessionId: string): Promise<string | null> {
  const snapshot = await runsCollection(uid, sessionId).where('kind', '==', 'reviewer').get();
  const done = snapshot.docs
    .map((doc) => doc.data() as AnalyzeRunDoc)
    .filter((run) => run.status === 'completed' && run.review?.targetMessageId)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return done[0]?.review?.targetMessageId ?? null;
}

/**
 * Queue a reviewer pass. Manual requests report why nothing ran; automatic
 * ones skip quietly, as in the browser.
 */
export async function startReviewPass(uid: string, sessionId: string, review: ReviewPassInfo): Promise<string | null> {
  const operator = await findLatestOperatorRun(uid, sessionId);
  const manual = review.trigger === 'manual';
  if (!operator) {
    if (manual) throw new TeamControlError('Select an operator before requesting review.');
    return null;
  }
  const reviewers = (operator.config.reviewers ?? []).filter((reviewer) => review.reviewerIds.includes(reviewer.id));
  if (reviewers.length === 0) {
    if (manual) throw new TeamControlError('No matching reviewers were found in this Analyze session.');
    return null;
  }
  const now = Date.now();
  const runId = newRunId(now);
  const run: AnalyzeRunDoc = removeUndefined({
    runId,
    uid,
    sessionId,
    kind: 'reviewer',
    status: 'queued',
    round: 0,
    retryCount: 0,
    config: { ...followUpConfig(operator.config), reviewers },
    userMessageId: '',
    eventSeq: 0,
    createdAt: now,
    updatedAt: now,
    lease: null,
    review: { ...review, targetMessageId: review.targetMessageId ?? operator.latestCompletedOperatorMessageId ?? null },
  }) as AnalyzeRunDoc;
  // One pass at a time (the browser's reviewInFlight guard), checked in the same transaction as the create.
  const created = await getFirestore().runTransaction(async (tx) => {
    const reviewerRuns = await tx.get(runsCollection(uid, sessionId).where('kind', '==', 'reviewer'));
    if (reviewerRuns.docs.some((doc) => !isTerminal((doc.data() as AnalyzeRunDoc).status))) return false;
    tx.set(runRef(uid, sessionId, runId), run);
    return true;
  });
  if (!created) {
    if (manual) throw new TeamControlError('A reviewer pass is already running.');
    return null;
  }
  try {
    await enqueueStep({ uid, sessionId, runId });
  } catch (error) {
    await finishRun(runRef(uid, sessionId, runId), 'error', { message: 'The review could not be scheduled.', code: 'unavailable' });
    throw error;
  }
  return runId;
}

/** The step for a reviewer pass: one call per reviewer, items into the queue, one message each. */
export async function runReviewerPass(ref: DocumentReference, run: AnalyzeRunDoc, keyValue: string, signal?: AbortSignal): Promise<void> {
  const { uid, sessionId } = run;
  const review = run.review as ReviewPassInfo;
  const messages = await loadSessionMessages(uid, sessionId);
  const context = getOperatorMessageContext(messages, run.config.provider, review.targetMessageId);
  if (!context) {
    await finishRun(ref, 'error', { message: 'No completed operator response is available to review yet.', code: 'failed-precondition' });
    return;
  }
  const artifacts = (await loadSessionArtifacts(uid, sessionId)) as Artifact[];
  const reviewers = run.config.reviewers ?? [];
  const db = getFirestore();

  for (const [index, reviewer] of reviewers.entries()) {
    if (signal?.aborted) {
      await finishRun(ref, 'stopped');
      return;
    }
    // A redelivered pass keeps what an earlier attempt finished (and the user's changes to its items).
    if ((await messageRef(uid, sessionId, `review-${run.runId}-${index}`).get()).exists) continue;
    const prompt = buildAnalyzeReviewerPrompt({
      reviewerName: reviewer.name,
      userPrompt: context.userPrompt,
      conversation: context.conversation,
      operatorName: run.config.aiName,
      operatorResponse: context.operatorMessage.content,
      artifacts,
      manualRequest: review.requestText,
    });
    let responseText: string;
    try {
      responseText = await completeOnce({ uid, sessionId, ai: reviewer, systemPrompt: getAnalyzeReviewerSystemPrompt(), prompt, keyValue, signal });
    } catch (error) {
      if (signal?.aborted) {
        await finishRun(ref, 'stopped');
        return;
      }
      throw error;
    }
    // Deterministic ids: a redelivered pass rewrites the same items and message.
    const parsedItems = parseAnalyzeReviewItemsFromResponse(reviewer as unknown as AIConfig, responseText, artifacts, {
      makeId: (itemIndex) => `review-${run.runId}-${index}-${itemIndex}`,
      now: run.createdAt,
    });
    const reviewerMessage: Message = {
      id: `review-${run.runId}-${index}`,
      sender: reviewer.name,
      senderType: 'ai',
      content: parsedItems.length > 0
        ? `Review complete. Added ${parsedItems.length} actionable item${parsedItems.length === 1 ? '' : 's'} to the review queue.`
        : 'Review complete. No actionable items were added to the queue.',
      timestamp: Date.now(),
      metadata: {
        providerId: reviewer.provider,
        modelUsed: reviewer.model,
        providerMetadata: {
          analyzeReviewer: true,
          reviewItemCount: parsedItems.length,
          targetMessageId: context.operatorMessage.id,
          reviewItems: parsedItems,
        },
      },
    };
    const batch = db.batch();
    for (const item of parsedItems) batch.set(reviewItemRef(uid, sessionId, item.id), removeUndefined(item));
    batch.set(messageRef(uid, sessionId, reviewerMessage.id), await prepareMessageRecord(uid, sessionId, reviewerMessage), { merge: true });
    await batch.commit();
  }
  await ref.update({ 'review.targetMessageId': context.operatorMessage.id, updatedAt: Date.now() });
  await finishRun(ref, 'completed');
}

// ============================================================================
// After an operator turn
// ============================================================================

/**
 * The browser's COMPLETED handling: queued review items are done, and the
 * turn's report is reviewed when auto-review is on. Order of operations: the
 * reviewer validates a finished report, so a turn that only asked a question
 * (or chatted) isn't reviewed, and a turn paused for org evidence waits until
 * the user imports findings or declines.
 */
export async function afterOperatorCompleted(run: AnalyzeRunDoc): Promise<void> {
  const { uid, sessionId } = run;
  const current = (await runRef(uid, sessionId, run.runId).get()).data() as AnalyzeRunDoc;
  const target = current.latestCompletedOperatorMessageId;
  await settleHandedOffItems(uid, sessionId, current);

  const reviewers = current.config.reviewers ?? [];
  if (
    !current.config.autoReview
    || reviewers.length === 0
    || !current.reportProduced
    || !target
    || current.pendingOrgEvidenceRequest
    || await wasReviewed(uid, sessionId, target)
  ) return;
  await startReviewPass(uid, sessionId, {
    reviewerIds: reviewers.map((reviewer) => reviewer.id),
    targetMessageId: target,
    trigger: 'auto',
  });
}

/**
 * Queued items close when the operator's turn ends, except the ones its reply
 * handed back: a skipped item or one that needs the user returns to the queue
 * with the operator's reason or question, so the user can answer, re-send or
 * dismiss it. An item the reply doesn't mention closes, as before.
 */
async function settleHandedOffItems(uid: string, sessionId: string, run: AnalyzeRunDoc): Promise<void> {
  const db = getFirestore();
  const queued = await db.collection(reviewItemsPath(uid, sessionId)).where('status', '==', 'queued').get();
  if (queued.empty) return;
  const handedOff = run.reviewItemIds ?? [];
  let reply = '';
  if (handedOff.length > 0 && run.latestCompletedOperatorMessageId) {
    const message = (await messageRef(uid, sessionId, run.latestCompletedOperatorMessageId).get()).data() as Message | undefined;
    reply = typeof message?.content === 'string' ? message.content : '';
  }
  const statuses = parseHandoffStatuses(reply, handedOff);
  const now = Date.now();
  const batch = db.batch();
  for (const doc of queued.docs) {
    const handedBack = statuses.get(doc.id);
    if (handedBack && handedBack.status !== 'completed') {
      batch.update(doc.ref, {
        status: 'pending',
        selected: false,
        operatorResponse: {
          status: handedBack.status,
          note: handedBack.note || (handedBack.status === 'skipped' ? 'No reason given.' : 'No question given.'),
          respondedAt: now,
        },
      });
    } else {
      batch.update(doc.ref, { status: 'completed', operatorResponse: FieldValue.delete() });
    }
  }
  await batch.commit();
}

// ============================================================================
// Check independently
// ============================================================================

/** The operator's code and sources in the reviewed turn (the browser's completedToolExecutions). */
export function turnEvidence(messages: Message[], context: OperatorMessageContext | null): { code: string[]; sources: string[] } {
  if (!context) return { code: [], sources: [] };
  let start = context.index;
  while (start > 0 && messages[start - 1].senderType !== 'user') start -= 1;
  const calls = messages.slice(start, context.index + 1)
    .filter((message) => message.senderType === 'ai')
    .flatMap((message) => (message.metadata?.toolCalls ?? []) as ToolCall[]);
  const code: string[] = [];
  const sources: string[] = [];
  for (const call of calls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {
      continue;
    }
    if (call.function.name === 'execute_python' && typeof args.code === 'string' && args.code) code.push(args.code);
    if ((call.function.name === 'fetch_url' || call.function.name === 'fetch_api') && typeof args.url === 'string' && args.url) sources.push(args.url);
  }
  return { code, sources: Array.from(new Set(sources)) };
}

/**
 * "Check independently": the reviewer who raised each point re-derives it in
 * a verify run (its own kernel and tools), outside the operator's turn.
 */
export async function startVerification(uid: string, sessionId: string, itemIds: string[]): Promise<string[]> {
  const operator = await findLatestOperatorRun(uid, sessionId);
  if (!operator) throw new TeamControlError('Select an operator before checking review items.');
  const items = (await loadReviewItems(uid, sessionId)).filter((item) => (
    itemIds.includes(item.id) && isVerifiableReviewItem(item) && item.verification?.status !== 'running'
  ));
  if (items.length === 0) return [];
  const messages = await loadSessionMessages(uid, sessionId);
  const context = getOperatorMessageContext(messages, operator.config.provider, await lastReviewedMessageId(uid, sessionId));
  const evidence = turnEvidence(messages, context);
  const reviewers = operator.config.reviewers ?? [];

  const started: string[] = [];
  for (const item of items) {
    // Validation is the reviewer's job: the reviewer who raised the point checks it.
    const verifier = reviewers.find((ai) => ai.id === item.reviewerId) ?? reviewers[0];
    if (!verifier) throw new TeamControlError('Add a reviewer to check review items independently.');
    const { task } = buildVerificationTask({
      item,
      userPrompt: context?.userPrompt ?? '',
      conversation: context?.conversation,
      operatorName: operator.config.aiName,
      operatorResponse: context?.operatorMessage.content ?? '',
      evidence,
    });
    const { run, brief } = buildChildRun({
      uid,
      sessionId,
      baseConfig: operator.config,
      ai: verifier,
      handle: 'reviewer',
      purpose: 'review_check',
      task,
      parentToolCallId: `review:${item.id}`,
      reviewItemId: item.id,
      now: Date.now(),
    });
    const verification: AnalyzeReviewVerification = { verifierName: verifier.name, verifierModel: verifier.model, status: 'running', runId: run.runId };
    const batch = getFirestore().batch();
    batch.set(runRef(uid, sessionId, run.runId), run);
    batch.set(getFirestore().doc(`${runMessagesPath(uid, sessionId, run.runId)}/${brief.id}`), buildMessageRecord(sessionId, brief));
    batch.update(reviewItemRef(uid, sessionId, item.id), { verification });
    await batch.commit();
    try {
      await enqueueStep({ uid, sessionId, runId: run.runId });
    } catch (error) {
      console.error('[analyzeReview] verify enqueue failed', { runId: run.runId, error });
      await runRef(uid, sessionId, run.runId).update({ status: 'error', finishedAt: Date.now(), updatedAt: Date.now() });
      await reviewItemRef(uid, sessionId, item.id).update({ verification: { ...verification, status: 'failed', summary: 'The check could not be scheduled.' } });
      continue;
    }
    started.push(run.runId);
  }
  return started;
}

/**
 * A verify run finished: record the verdict on its item. Confirmed points
 * need no action and close; disputed or unverifiable points are pre-selected
 * so they go to the operator next. The verdict is also saved as the
 * verifier's message (the transcript, and restore).
 */
export async function applyVerification(child: AnalyzeRunDoc, result: AgentRunResult): Promise<void> {
  const itemId = child.agent?.reviewItemId;
  if (!itemId) return;
  const { uid, sessionId } = child;
  const itemSnapshot = await reviewItemRef(uid, sessionId, itemId).get();
  if (!itemSnapshot.exists) return; // dismissed meanwhile
  const item = itemSnapshot.data() as AnalyzeReviewItem;
  const parsed = parseVerificationVerdict(result.answer);
  const verification: AnalyzeReviewVerification = removeUndefined({
    verifierName: child.config.aiName,
    verifierModel: child.config.model,
    status: result.status === 'completed' ? 'done' : 'failed',
    verdict: result.status === 'completed' ? parsed.verdict : undefined,
    summary: parsed.summary,
    runId: result.runId,
    verifiedAt: result.endedAt,
  });
  const verdictLabel = verification.verdict ? verification.verdict.toUpperCase() : `verification ${result.status}`;
  const message: Message = {
    id: `verify-${itemId}-${child.runId}`,
    sender: child.config.aiName,
    senderType: 'ai',
    content: `Verified "${item.title}": ${verdictLabel}\n\n${parsed.summary}`.trimEnd(),
    timestamp: result.endedAt,
    metadata: {
      providerId: child.config.provider,
      modelUsed: child.config.model,
      providerMetadata: { analyzeVerification: true, reviewItemId: itemId, verification },
    },
  };
  const batch = getFirestore().batch();
  batch.update(reviewItemRef(uid, sessionId, itemId), removeUndefined({
    verification,
    ...(verification.verdict === 'confirmed' ? { status: 'completed' } : {}),
    ...(verification.verdict && verification.verdict !== 'confirmed' ? { selected: true } : {}),
  }));
  batch.set(messageRef(uid, sessionId, message.id), await prepareMessageRecord(uid, sessionId, message), { merge: true });
  await batch.commit();
}

// ============================================================================
// The queue's other actions
// ============================================================================

export async function setReviewItemsSelected(uid: string, sessionId: string, itemIds: string[], selected: boolean): Promise<void> {
  const batch = getFirestore().batch();
  for (const id of itemIds) batch.update(reviewItemRef(uid, sessionId, id), { selected });
  await batch.commit();
}

/** Undo a close (e.g. a confirmed item): back to pending. */
export async function reopenReviewItems(uid: string, sessionId: string, itemIds: string[]): Promise<void> {
  const batch = getFirestore().batch();
  for (const id of itemIds) batch.update(reviewItemRef(uid, sessionId, id), { status: 'pending' });
  await batch.commit();
}

export async function dismissReviewItems(uid: string, sessionId: string, itemIds: string[]): Promise<void> {
  const batch = getFirestore().batch();
  for (const id of itemIds) batch.delete(reviewItemRef(uid, sessionId, id));
  await batch.commit();
}

/** Hand review items to the operator: one operator turn (a follow-up, not new team work). */
export async function sendReviewItemsToOperator(
  uid: string,
  sessionId: string,
  itemIds: string[],
  /** The user's answers to items the operator handed back needing input, by item id. */
  answers: Record<string, string> = {},
): Promise<{ runId: string }> {
  const operator = await findLatestOperatorRun(uid, sessionId);
  if (!operator) throw new TeamControlError('Select an operator before sending review items.');
  if (await findActiveOperatorRun(uid, sessionId)) throw new TeamControlError('Please wait for the current operation to complete');
  const items = (await loadReviewItems(uid, sessionId)).filter((item) => itemIds.includes(item.id) && item.status === 'pending');
  if (items.length === 0) throw new TeamControlError('Select at least one review item to send.');
  const prompt = buildOperatorReviewHandoffPrompt(operator.config.aiName, items, answers);
  return startOperatorTurn({
    uid,
    sessionId,
    content: prompt,
    config: followUpConfig(operator.config),
    reviewItemIds: items.map((item) => item.id),
  });
}
