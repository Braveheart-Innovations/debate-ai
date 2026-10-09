/**
 * Starting an operator turn: the user's message and a queued operator run,
 * written together only when no other operator run owns the session. Used by
 * analyzeStartTurn and by the turns the server starts itself ("Run again"
 * deliveries, review hand-offs).
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { AnalyzeTeamRunSummary, Message, MessageAttachment } from '../contract/types';
import { enqueueStep } from './queue';
import { OPERATOR_ACTIVE, finishRun, runRef, saveMessageAttachments, type AnalyzeRunDoc, type RunConfig } from './runStore';
import { buildMessageRecord, removeUndefined } from './sessionStore';
import { newRunId } from '../team/teamStore';

export class SessionBusyError extends Error {
  constructor() {
    super('This session already has a run in progress.');
  }
}

/** A server-started turn whose message already exists (a redelivered hand-off): it was started before. */
export class TurnAlreadyStartedError extends Error {}

export interface OperatorTurnInput {
  uid: string;
  sessionId: string;
  content: string;
  messageId?: string;
  config: RunConfig;
  /** Team runs whose results this message delivers (a "Run again" rerun). */
  teamRuns?: AnalyzeTeamRunSummary[];
  /** Review items this turn works through (queued until it completes). */
  reviewItemIds?: string[];
  /** The user imported org findings or chose to continue without them: the open request is answered. */
  resolvesOrgEvidenceRequest?: boolean;
  /** Images and documents attached to the message (they go with it in every model call). */
  attachments?: MessageAttachment[];
}

function runsPath(uid: string, sessionId: string): string {
  return `users/${uid}/conversations/${sessionId}/analyzeRuns`;
}

/** The session's operator run in progress, if any (filtered here: status `in` needs no composite index). */
export async function findActiveOperatorRun(uid: string, sessionId: string): Promise<AnalyzeRunDoc | null> {
  const snapshot = await getFirestore().collection(runsPath(uid, sessionId)).where('status', 'in', OPERATOR_ACTIVE).get();
  const run = snapshot.docs.map((doc) => doc.data() as AnalyzeRunDoc).find((candidate) => candidate.kind === 'operator');
  return run ?? null;
}

/** The session's most recent operator run (its config seeds the turns the server starts). */
export async function findLatestOperatorRun(uid: string, sessionId: string): Promise<AnalyzeRunDoc | null> {
  const snapshot = await getFirestore()
    .collection(runsPath(uid, sessionId))
    .where('kind', '==', 'operator')
    .get();
  const runs = snapshot.docs.map((doc) => doc.data() as AnalyzeRunDoc).sort((a, b) => b.createdAt - a.createdAt);
  return runs[0] ?? null;
}

/** A server-started turn's config: the last operator turn's, with Team mode off (no forced plan). */
export function followUpConfig(config: RunConfig): RunConfig {
  const { captureTrace: _trace, followUpSystemPrompt, ...rest } = config;
  return { ...rest, systemPrompt: followUpSystemPrompt ?? config.systemPrompt, teamPlanTurn: false };
}

/**
 * Write the user message and the operator run, then enqueue round 0.
 * Throws SessionBusyError when an operator run already owns the session.
 */
export async function startOperatorTurn(input: OperatorTurnInput): Promise<{ runId: string; userMessageId: string }> {
  const { uid, sessionId } = input;
  // An org-evidence request stays open across turns until the user imports
  // findings or continues without them (the browser kept it as session state).
  const openOrgEvidenceRequest = input.resolvesOrgEvidenceRequest
    ? undefined
    : (await findLatestOperatorRun(uid, sessionId))?.pendingOrgEvidenceRequest;
  const now = Date.now();
  const runId = newRunId(now);
  // Same shape as the web's ChatService.createUserMessage.
  const userMessage: Message = {
    id: input.messageId || `msg_${now}`,
    sender: 'You',
    senderType: 'user',
    content: input.content.trim(),
    timestamp: now,
    ...(input.teamRuns?.length ? { metadata: { teamRuns: input.teamRuns } } : {}),
  };
  const run: AnalyzeRunDoc = removeUndefined({
    runId,
    uid,
    sessionId,
    kind: 'operator',
    status: 'queued',
    round: 0,
    retryCount: 0,
    config: input.config,
    userMessageId: userMessage.id,
    eventSeq: 0,
    createdAt: now,
    updatedAt: now,
    lease: null,
    ...(input.reviewItemIds?.length ? { reviewItemIds: input.reviewItemIds } : {}),
    ...(openOrgEvidenceRequest ? { pendingOrgEvidenceRequest: openOrgEvidenceRequest } : {}),
    ...(input.attachments?.length ? { attachmentCount: input.attachments.length } : {}),
  }) as AnalyzeRunDoc;

  const db = getFirestore();
  const runs = db.collection(runsPath(uid, sessionId));
  const messageDoc = db.doc(`users/${uid}/conversations/${sessionId}/messages/${userMessage.id}`);
  await db.runTransaction(async (tx) => {
    if (input.messageId && (await tx.get(messageDoc)).exists) throw new TurnAlreadyStartedError(userMessage.id);
    const active = await tx.get(runs.where('status', 'in', OPERATOR_ACTIVE));
    // Items dismissed since the user picked them are simply not queued.
    const items = await Promise.all((input.reviewItemIds ?? []).map((itemId) => tx.get(db.doc(`users/${uid}/conversations/${sessionId}/reviewItems/${itemId}`))));
    if (active.docs.some((doc) => (doc.data() as AnalyzeRunDoc).kind === 'operator')) throw new SessionBusyError();
    tx.set(messageDoc, buildMessageRecord(sessionId, userMessage));
    tx.set(runRef(uid, sessionId, runId), run);
    for (const item of items) if (item.exists) tx.update(item.ref, { status: 'queued' });
  });

  try {
    if (input.attachments?.length) await saveMessageAttachments(uid, sessionId, userMessage.id, input.attachments);
    await enqueueStep({ uid, sessionId, runId });
  } catch (error) {
    // A run that never got a step would block the session forever: fail it.
    console.error('[analyzeRun] enqueue failed', { runId, error });
    await finishRun(runRef(uid, sessionId, runId), 'error', {
      message: 'The run could not be scheduled.',
      code: 'unavailable',
    });
    if (input.reviewItemIds?.length) {
      const batch = db.batch();
      for (const itemId of input.reviewItemIds) batch.update(db.doc(`users/${uid}/conversations/${sessionId}/reviewItems/${itemId}`), { status: 'pending' });
      await batch.commit().catch(() => undefined);
    }
    throw error;
  }
  return { runId, userMessageId: userMessage.id };
}
