/**
 * analyzeRunStep: one Cloud Tasks delivery runs as many loop rounds as fit in
 * STEP_BUDGET_MS, then hands off to a continuation task (spike: dispatch lag
 * is ~1 s warm / ~3.7 s cold per enqueue, so one round per task would put
 * that on the user's clock every round). Rounds are idempotent: messages use
 * deterministic ids and tool calls run at most once (runStore).
 */
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import { encryptionKey } from '../../apiKeys';
import { SERVER_TOOL_SECRETS } from '../../tools';
import { getToolDefinitions } from './toolDefinitions';
import { createToolDispatcher } from './toolDispatch';
import { runRound, type RoundOutcome, type TurnState } from './round';
import { CaptureSession } from '../capture/captureRound';
import {
  RunEventWriter,
  acquireLease,
  finishRun,
  runRef,
  startHeartbeat,
  watchCancel,
} from './runStore';

export const STEP_FUNCTION = 'analyzeRunStep';
/** Rounds start only while under budget; the task deadline (30 min) leaves room to finish one. */
const STEP_BUDGET_MS = 20 * 60_000;
const MAX_ATTEMPTS = 10;

export interface StepPayload {
  uid: string;
  sessionId: string;
  runId: string;
}

export async function enqueueStep(payload: StepPayload): Promise<void> {
  await getFunctions()
    .taskQueue(`locations/us-central1/functions/${STEP_FUNCTION}`)
    .enqueue(payload, { dispatchDeadlineSeconds: 1800 });
}

export const analyzeRunStep = onTaskDispatched<StepPayload>(
  {
    region: 'us-central1',
    timeoutSeconds: 1800,
    memory: '1GiB',
    secrets: SERVER_TOOL_SECRETS,
    // A delivery that finds a live lease fails on purpose; retry around the
    // 30 s lease so a crashed step's run resumes within about a minute.
    retryConfig: { maxAttempts: MAX_ATTEMPTS, minBackoffSeconds: 30, maxBackoffSeconds: 60 },
    rateLimits: { maxConcurrentDispatches: 100 },
  },
  async (request) => {
    await runStep(request.data, `${request.id}:${request.retryCount}`, request.retryCount >= MAX_ATTEMPTS - 1);
  },
);

export async function runStep(payload: StepPayload, owner: string, finalAttempt = false): Promise<void> {
  const { uid, sessionId, runId } = payload;
  const ref = runRef(uid, sessionId, runId);
  const run = await acquireLease(ref, owner); // throws LeaseHeldError → task retries
  if (!run) return;

  const stopHeartbeat = startHeartbeat(ref, owner);
  const cancel = watchCancel(ref);
  const events = new RunEventWriter(ref, run.eventSeq ?? 0);
  const startedAt = Date.now();
  const state: TurnState = { round: run.round ?? 0, retryCount: run.retryCount ?? 0 };
  let outcome: RoundOutcome = 'continue';
  let retrying = false;

  try {
    const keyValue = encryptionKey.value();
    const now = () => Date.now();
    const captureSession = new CaptureSession({ uid, sessionId, run, runRef: ref, now });
    const context = {
      uid,
      sessionId,
      run,
      runRef: ref,
      events,
      signal: cancel.signal,
      keyValue,
      tools: getToolDefinitions(run.config.toolNames),
      executeTool: createToolDispatcher({ uid, sandboxSessionKey: run.config.sandboxSessionKey, keyValue, signal: cancel.signal }),
      toolResults: new Map(),
      capture: (input: Parameters<CaptureSession['capture']>[0]) => captureSession.capture(input),
      sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      now,
    };

    while (outcome === 'continue' && Date.now() - startedAt < STEP_BUDGET_MS) {
      outcome = await runRound(context, state);
      if (outcome === 'continue') state.round += 1;
      await ref.update({ round: state.round, retryCount: state.retryCount, updatedAt: Date.now() });
    }
  } catch (error) {
    console.error('[analyzeRun] step failed', { runId, finalAttempt, error });
    if (!finalAttempt) {
      // Rounds resume cleanly, so let Cloud Tasks retry: free the lease first.
      retrying = true;
      stopHeartbeat();
      cancel.stop();
      await events.close().catch(() => undefined);
      await ref.update({ lease: null, updatedAt: Date.now() });
      throw error;
    }
    outcome = 'error';
    await finishRun(ref, 'error', { message: (error as Error)?.message || 'Step failed', code: 'internal' });
  } finally {
    if (!retrying) {
      stopHeartbeat();
      cancel.stop();
      events.push({ type: 'status', status: outcome === 'continue' ? 'running' : outcome === 'completed' ? 'completed' : outcome === 'stopped' ? 'stopped' : 'error' });
      await events.close();
    }
  }

  if (outcome === 'continue') {
    // Budget spent mid-turn: release the lease, then hand off.
    await ref.update({ lease: null, status: 'queued', updatedAt: Date.now() });
    await enqueueStep(payload);
  } else if (outcome === 'completed' || outcome === 'stopped') {
    await finishRun(ref, outcome);
  } else {
    const current = (await ref.get()).data();
    if (current?.status !== 'error') await finishRun(ref, 'error', { message: 'The model call failed', code: 'internal' });
  }
}
