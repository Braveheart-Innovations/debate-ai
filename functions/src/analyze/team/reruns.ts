/**
 * "Run again on…": rerun a stopped or failed teammate's task on a pool model,
 * outside the operator's turn. Its result always goes back to the operator (a
 * rerun replaces work the plan counted on), as a new turn now, or as soon as
 * the operator's current turn ends. Texts ported from symposium-ai-web
 * src/context/analyze/teamRuns.ts (rerunDeliveryText, summaryFromRun).
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { AnalyzeTeamRunSummary } from '../contract/types';
import { type AnalyzeRunDoc, type RosterAI, isTerminal, runRef } from '../engine/runStore';
import { SessionBusyError, TurnAlreadyStartedError, findLatestOperatorRun, followUpConfig, startOperatorTurn } from '../engine/turns';
import { enqueueStep } from '../engine/queue';
import { briefTitle } from './agentResults';
import { TeamControlError, buildChildRun, teamMembers } from './teamStore';
import { runMessagesPath, buildMessageRecord } from '../engine/sessionStore';
import type { AgentRunResult } from './types';

/** The message that brings a "Run again" result back to the operator (facts, sent as the user's turn). */
export function rerunDeliveryText(
  original: { title: string; agentName: string; model: string; status: string },
  rerun: AgentRunResult,
): string {
  return [
    `Team task rerun: "${original.title}".`,
    `${original.agentName} (${original.model}) ${original.status === 'failed' ? 'failed' : 'was stopped'}, so I had ${rerun.agentName} (${rerun.model}) run it again; that run ${rerun.status}.`,
    '',
    `Its reply:`,
    rerun.answer,
  ].join('\n');
}

/** A finished run as a saved summary (for "Run again" deliveries; team tool results build their own). */
export function summaryFromRun(
  run: { parentToolCallId: string; assignmentKey?: string; task: string },
  result: AgentRunResult,
): AnalyzeTeamRunSummary {
  return {
    runId: result.runId,
    parentToolCallId: run.parentToolCallId,
    assignmentKey: run.assignmentKey,
    agentName: result.agentName,
    provider: result.provider,
    model: result.model,
    task: run.task,
    status: result.status,
    files: result.files,
    ...(result.answerFile ? { answerFile: result.answerFile } : {}),
    toolCount: result.toolSummary.length,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  };
}

/** Start a rerun of a finished teammate run on `handle`. */
export async function startRerun(uid: string, sessionId: string, previousRunId: string, handle: string): Promise<string> {
  const previous = (await runRef(uid, sessionId, previousRunId).get()).data() as AnalyzeRunDoc | undefined;
  if (!previous?.agent || previous.kind !== 'teammate' || !isTerminal(previous.status)) {
    throw new TeamControlError('Only a finished teammate run can be run again.');
  }
  const operator = await findLatestOperatorRun(uid, sessionId);
  const member = operator ? teamMembers(operator.config).find((candidate) => candidate.handle === handle) : undefined;
  if (!operator || !member) throw new TeamControlError(`Unknown teammate ${handle}.`);
  const { run, brief } = buildChildRun({
    uid,
    sessionId,
    baseConfig: operator.config,
    ai: member.ai as unknown as RosterAI,
    handle,
    purpose: 'delegated',
    task: previous.agent.task,
    parentToolCallId: `rerun:${previousRunId}`,
    assignmentKey: `rerun:${previousRunId}`,
    rerunOf: previousRunId,
    now: Date.now(),
  });
  const db = getFirestore();
  const batch = db.batch();
  batch.set(runRef(uid, sessionId, run.runId), run);
  batch.set(db.doc(`${runMessagesPath(uid, sessionId, run.runId)}/${brief.id}`), buildMessageRecord(sessionId, brief));
  await batch.commit();
  try {
    await enqueueStep({ uid, sessionId, runId: run.runId });
  } catch (error) {
    await runRef(uid, sessionId, run.runId).update({ status: 'error', error: { message: 'The rerun could not be scheduled.', code: 'unavailable' }, finishedAt: Date.now(), updatedAt: Date.now() });
    throw error;
  }
  return run.runId;
}

/**
 * Deliver a finished rerun to the operator as a new turn. When the operator
 * is busy it stays undelivered; the operator's turn delivers it on finishing
 * (deliverPendingReruns).
 */
export async function deliverRerun(rerun: AnalyzeRunDoc): Promise<boolean> {
  if (rerun.deliveredToOperator || !rerun.result || !rerun.agent?.rerunOf) return false;
  const { uid, sessionId } = rerun;
  const original = (await runRef(uid, sessionId, rerun.agent.rerunOf).get()).data() as AnalyzeRunDoc | undefined;
  const operator = await findLatestOperatorRun(uid, sessionId);
  if (!operator) return false;
  const originalResult = original?.result;
  const text = rerunDeliveryText({
    title: briefTitle(rerun.agent.task),
    agentName: originalResult?.agentName ?? original?.config.aiName ?? 'The teammate',
    model: originalResult?.model ?? original?.config.model ?? '',
    status: originalResult?.status ?? 'failed',
  }, rerun.result);
  try {
    await startOperatorTurn({
      uid,
      sessionId,
      content: text,
      messageId: `msg_rerun_${rerun.runId}`,
      config: followUpConfig(operator.config),
      teamRuns: [summaryFromRun({ parentToolCallId: rerun.agent.parentToolCallId, assignmentKey: rerun.agent.assignmentKey, task: rerun.agent.task }, rerun.result)],
    });
  } catch (error) {
    if (error instanceof SessionBusyError) return false;
    if (!(error instanceof TurnAlreadyStartedError)) throw error;
  }
  await runRef(uid, sessionId, rerun.runId).update({ deliveredToOperator: true, updatedAt: Date.now() });
  return true;
}

/** The operator's turn ended: deliver the oldest finished, undelivered rerun (one turn each, in order). */
export async function deliverPendingReruns(uid: string, sessionId: string): Promise<void> {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`)
    .where('kind', '==', 'teammate')
    .get();
  const pending = snapshot.docs
    .map((doc) => doc.data() as AnalyzeRunDoc)
    .filter((run) => run.agent?.rerunOf && run.result && isTerminal(run.status) && !run.deliveredToOperator)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  if (pending[0]) await deliverRerun(pending[0]);
}
