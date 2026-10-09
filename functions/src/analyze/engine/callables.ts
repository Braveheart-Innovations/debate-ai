/**
 * Client entry points for server-side Analyze runs. Clients never write run
 * state directly (rules deny it); every action is a callable.
 */
import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { isV2Supported } from '../../providers/registry';
import { getCatalogModel } from '../modelCatalog';
import { enqueueStep } from './step';
import { finishRun, isTerminal, runRef, type AnalyzeRunDoc, type RunConfig } from './runStore';
import { buildMessageRecord } from './sessionStore';
import { normalizeAnalyzeOutputSelection } from '../contract/types/analyze';
import type { Message } from '../contract/types';

/**
 * Phase 3 build-out: the engine is deployed dark. Only these accounts may use
 * it until the v2.6 cutover; DELETE this list (and its checks) at release.
 *  - mspencer@braveheartinnovations.com (Michael's web account)
 *  - the live-proxy test account (automated harness)
 */
export const SERVER_LOOP_ALLOWED_UIDS = new Set([
  'NIxWoHSaoZbleBOUfnJVpocHTY22',
  'm8zEMeTFGUaZ0xXyuZ6Fu57rWa72',
]);

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

interface StartTurnRequest {
  sessionId: string;
  message: { id?: string; content: string };
  ai: { provider: string; model: string; id: string; name: string };
  systemPrompt: string;
  toolNames: string[];
  sandboxSessionKey: string;
  /** The composer's output selection (AnalyzeOutputSelection); defaults like a new session. */
  outputSelection?: unknown;
  /** Save capture traces for the web parity harness (scripts/analyze-capture-parity). */
  captureTrace?: boolean;
}

const ACTIVE: AnalyzeRunDoc['status'][] = ['queued', 'running'];

export const analyzeStartTurn = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Partial<StartTurnRequest>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const content = requireString(data.message?.content, 'message.content', 200_000);
  const provider = requireString(data.ai?.provider, 'ai.provider');
  const model = requireString(data.ai?.model, 'ai.model');
  const sandboxSessionKey = requireString(data.sandboxSessionKey, 'sandboxSessionKey');
  const systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : '';
  const toolNames = Array.isArray(data.toolNames) ? data.toolNames.filter((n): n is string => typeof n === 'string') : [];

  if (!isV2Supported(provider)) throw new HttpsError('invalid-argument', `Provider ${provider} can't run Analyze.`);
  const catalogModel = getCatalogModel(provider, model);
  if (!catalogModel) throw new HttpsError('invalid-argument', `Unknown model ${provider}/${model}.`);
  if (toolNames.length > 0 && !catalogModel.supportsFunctions) {
    throw new HttpsError('invalid-argument', `${model} can't call tools.`);
  }

  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  // Same shape as the web's ChatService.createUserMessage.
  const userMessage: Message = {
    id: typeof data.message?.id === 'string' && data.message.id ? data.message.id : `msg_${now}`,
    sender: 'You',
    senderType: 'user',
    content: content.trim(),
    timestamp: now,
  };
  const config: RunConfig = {
    provider,
    model,
    aiId: requireString(data.ai?.id, 'ai.id'),
    aiName: requireString(data.ai?.name, 'ai.name'),
    systemPrompt,
    toolNames,
    sandboxSessionKey,
    outputSelection: normalizeAnalyzeOutputSelection(data.outputSelection),
    ...(data.captureTrace === true ? { captureTrace: true } : {}),
  };
  const run: AnalyzeRunDoc = {
    runId,
    uid,
    sessionId,
    kind: 'operator',
    status: 'queued',
    round: 0,
    retryCount: 0,
    config,
    userMessageId: userMessage.id,
    eventSeq: 0,
    createdAt: now,
    updatedAt: now,
    lease: null,
  };

  const db = getFirestore();
  const runs = db.collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`);
  await db.runTransaction(async (tx) => {
    const active = await tx.get(runs.where('status', 'in', ACTIVE).limit(1));
    if (!active.empty) {
      throw new HttpsError('failed-precondition', 'This session already has a run in progress.');
    }
    tx.set(db.doc(`users/${uid}/conversations/${sessionId}/messages/${userMessage.id}`), buildMessageRecord(sessionId, userMessage));
    tx.set(runRef(uid, sessionId, runId), run);
  });

  try {
    await enqueueStep({ uid, sessionId, runId });
  } catch (error) {
    // A run that never got a step would block the session forever: fail it.
    console.error('[analyzeRun] enqueue failed', { runId, error });
    await finishRun(runRef(uid, sessionId, runId), 'error', {
      message: 'The run could not be scheduled.',
      code: 'unavailable',
    });
    throw new HttpsError('unavailable', 'Analyze could not start this run. Please try again.');
  }
  return { runId, userMessageId: userMessage.id };
});

export const analyzeRunControl = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as { sessionId?: unknown; runId?: unknown; action?: unknown };
  const sessionId = requireString(data.sessionId, 'sessionId');
  const runId = requireString(data.runId, 'runId');
  if (data.action !== 'stop') throw new HttpsError('invalid-argument', `Unknown action ${String(data.action)}`);

  const ref = runRef(uid, sessionId, runId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Run not found.');
  const run = snapshot.data() as AnalyzeRunDoc;
  if (isTerminal(run.status)) return { status: run.status };
  await ref.update({ cancelRequested: true, cancelRequestedAt: Date.now(), updatedAt: Date.now() });
  return { status: 'stopping' };
});
