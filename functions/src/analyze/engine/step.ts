/**
 * analyzeRunStep: one Cloud Tasks delivery runs as many loop rounds as fit in
 * STEP_BUDGET_MS, then hands off to a continuation task (spike: dispatch lag
 * is ~1 s warm / ~3.7 s cold per enqueue, so one round per task would put
 * that on the user's clock every round). Rounds are idempotent: messages use
 * deterministic ids and tool calls run at most once (runStore).
 *
 * Every run kind steps here. Operator and subagent runs (teammate, verify)
 * run rounds; a round held for the team ends the step ('waiting') and
 * whoever ends the wait enqueues a fresh step. A reviewer pass is one
 * delivery of model calls.
 */
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { encryptionKey } from '../../apiKeys';
import { SERVER_TOOL_SECRETS } from '../../tools';
import { getToolDefinitions } from './toolDefinitions';
import { createToolDispatcher } from './toolDispatch';
import { runRound, type RoundContext, type RoundOutcome, type TurnState } from './round';
import { CaptureSession } from '../capture/captureRound';
import { enqueueStep, STEP_FUNCTION, type StepPayload } from './queue';
import { runMessageStore, sessionMessageStore } from './sessionStore';
import {
  type AnalyzeRunDoc,
  RunEventWriter,
  acquireLease,
  finishRun,
  isTerminal,
  runRef,
  startHeartbeat,
  watchCancel,
} from './runStore';
import { createTeamHooks, enterWait, resumeParentWake } from '../team/teamStore';
import { completeHandoff, finalizeChild, type ChildOutcome } from '../team/childRuns';
import { findTeamPanel, type TeamPanelRecord } from '../capture/teamPanelNote';
import { briefTitle } from '../team/agentResults';
import type { AgentRunView } from '../team/types';
import { ReviewModelError, afterOperatorCompleted, runReviewerPass } from '../review/reviewRuns';
import { deliverPendingReruns } from '../team/reruns';
import { restoreSessionFiles } from './uploads';

export { STEP_FUNCTION, enqueueStep, type StepPayload };

/** Rounds start only while under budget; the task deadline (30 min) leaves room to finish one. */
const STEP_BUDGET_MS = 20 * 60_000;
const MAX_ATTEMPTS = 10;

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

/**
 * The independent panel behind this turn's report: findTeamPanel over the
 * operator's child runs, replaced runs included (the browser's lanes held
 * every run since the turn started).
 */
export async function loadTeamPanel(run: AnalyzeRunDoc): Promise<TeamPanelRecord | null> {
  const snapshot = await getFirestore()
    .collection(`users/${run.uid}/conversations/${run.sessionId}/analyzeRuns`)
    .where('parentRunId', '==', run.runId)
    .get();
  const views: AgentRunView[] = snapshot.docs.map((doc) => {
    const child = doc.data() as AnalyzeRunDoc;
    return {
      runId: child.runId,
      parentToolCallId: child.agent?.parentToolCallId ?? '',
      agentName: child.config.aiName,
      provider: child.config.provider,
      model: child.config.modelDisplayName || child.config.model,
      purpose: child.agent?.purpose ?? 'delegated',
      title: briefTitle(child.agent?.task ?? ''),
      task: child.agent?.task ?? '',
      assignmentKey: child.agent?.assignmentKey,
      status: child.result?.status ?? 'running',
      toolExecutions: [],
      startedAt: child.createdAt,
    };
  });
  return findTeamPanel(views, run.config.aiName);
}

/** A delivery for a run that's finished or waiting: finish a handoff a crash cut short. */
async function resumeHandoffs(ref: DocumentReference): Promise<void> {
  const run = (await ref.get()).data() as AnalyzeRunDoc | undefined;
  if (!run || !isTerminal(run.status)) return;
  if (run.kind === 'operator' && run.postTurnPending) {
    await afterOperatorTurn(run, run.status as RoundOutcome);
    await ref.update({ postTurnPending: false });
    return;
  }
  if (!run.handoffPending) return;
  await resumeParentWake(run);
  await completeHandoff(run);
}

export async function runStep(payload: StepPayload, owner: string, finalAttempt = false): Promise<void> {
  const { uid, sessionId, runId } = payload;
  const ref = runRef(uid, sessionId, runId);
  const run = await acquireLease(ref, owner); // throws LeaseHeldError → task retries
  if (!run) {
    await resumeHandoffs(ref);
    return;
  }
  if (run.kind === 'reviewer') {
    await runReviewerStep(ref, run, owner, finalAttempt);
    return;
  }
  if (run.kind !== 'operator' && run.result) {
    // The child's result was stored before a crash cut its finishing short.
    await finalizeChild(run, run.result.status === 'failed' ? 'error' : run.result.status as ChildOutcome, run.round ?? 0);
    return;
  }

  const stopHeartbeat = startHeartbeat(ref, owner);
  // Mid-run choices: "do it yourself" withholds the team tools from the next round; auto-approve applies to the next plan.
  const cancel = watchCancel(ref, (latest) => {
    if (latest.team?.solo && !run.team?.solo) run.team = { ...run.team, solo: true };
    run.config.teamAutoApprove = latest.config?.teamAutoApprove;
  });
  const events = new RunEventWriter(ref, run.eventSeq ?? 0);
  const startedAt = Date.now();
  const state: TurnState = { round: run.round ?? 0, retryCount: run.retryCount ?? 0 };
  const isOperator = run.kind === 'operator';
  let outcome: RoundOutcome = 'continue';
  let retrying = false;
  let crashed: Error | undefined;

  try {
    const keyValue = encryptionKey.value();
    const now = () => Date.now();
    const captureSession = isOperator
      ? new CaptureSession({ uid, sessionId, run, runRef: ref, now, loadTeamPanel: () => loadTeamPanel(run) })
      : null;
    const context: RoundContext = {
      uid,
      sessionId,
      run,
      runRef: ref,
      events,
      signal: cancel.signal,
      keyValue,
      tools: getToolDefinitions(run.config.toolNames),
      executeTool: createToolDispatcher({
        uid,
        sandboxSessionKey: run.config.sandboxSessionKey,
        kernelKey: run.config.kernel,
        keyValue,
        signal: cancel.signal,
      }),
      toolResults: new Map(),
      messages: isOperator ? sessionMessageStore(uid, sessionId) : runMessageStore(uid, sessionId, runId),
      capture: captureSession ? (input) => captureSession.capture(input) : undefined,
      team: isOperator ? createTeamHooks(ref, run) : null,
      sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      now,
    };

    // A new sandbox (first use, or the old one expired) gets the session's uploads and artifacts back.
    if (context.tools.length > 0) await restoreSessionFiles(uid, sessionId, run.config.sandboxSessionKey);

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
    crashed = error instanceof Error ? error : new Error('Step failed');
  } finally {
    if (!retrying) {
      stopHeartbeat();
      cancel.stop();
      if (outcome !== 'waiting') {
        events.push({ type: 'status', status: outcome === 'continue' ? 'running' : outcome === 'completed' ? 'completed' : outcome === 'stopped' ? 'stopped' : 'error' });
      }
      await events.close();
    }
  }

  if (outcome === 'continue') {
    // Budget spent mid-turn: release the lease, then hand off.
    await ref.update({ lease: null, status: 'queued', updatedAt: Date.now() });
    await enqueueStep(payload);
    return;
  }
  if (outcome === 'waiting') {
    await enterWait(ref, owner);
    return;
  }
  if (!isOperator) {
    // A failure here throws: the task retries and resumes from the stored result.
    await finalizeChild(run, outcome, state.round, crashed);
    return;
  }
  // postTurnPending: a crash before the post-turn work finishes is resumed by the next delivery.
  if (outcome === 'completed' || outcome === 'stopped') {
    await finishRun(ref, outcome, undefined, { postTurnPending: true });
  } else {
    const current = (await ref.get()).data();
    await finishRun(ref, 'error', current?.status === 'error' ? current.error : { message: crashed?.message || 'The model call failed', code: 'internal' }, { postTurnPending: true });
  }
  await afterOperatorTurn(run, outcome);
  await ref.update({ postTurnPending: false });
}

/** The browser's end-of-turn reactions: queued review items, auto-review, waiting reruns. Best effort. */
async function afterOperatorTurn(run: AnalyzeRunDoc, outcome: RoundOutcome): Promise<void> {
  try {
    if (outcome === 'completed') await afterOperatorCompleted(run);
  } catch (error) {
    console.error('[analyzeRun] post-turn review failed', { runId: run.runId, error });
  }
  try {
    await deliverPendingReruns(run.uid, run.sessionId);
  } catch (error) {
    console.error('[analyzeRun] rerun delivery failed', { runId: run.runId, error });
  }
}

async function runReviewerStep(ref: DocumentReference, run: AnalyzeRunDoc, owner: string, finalAttempt: boolean): Promise<void> {
  const stopHeartbeat = startHeartbeat(ref, owner);
  const cancel = watchCancel(ref);
  try {
    await runReviewerPass(ref, run, encryptionKey.value(), cancel.signal);
  } catch (error) {
    console.error('[analyzeRun] reviewer pass failed', { runId: run.runId, finalAttempt, error });
    // A provider error is the pass's answer (the browser tried once); only infrastructure failures retry.
    if (!finalAttempt && !(error instanceof ReviewModelError)) {
      stopHeartbeat();
      cancel.stop();
      await ref.update({ lease: null, updatedAt: Date.now() });
      throw error;
    }
    await finishRun(ref, 'error', { message: (error as Error)?.message || 'Reviewer pass failed', code: 'internal' });
  } finally {
    stopHeartbeat();
    cancel.stop();
  }
}
