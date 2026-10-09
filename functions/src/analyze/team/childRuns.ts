/**
 * Finishing a subagent run (AgentRunner.run after its loop): list the files
 * it saved, pick its final reply, save that reply as a file, release its
 * kernel, then hand the result to its slot (teamStore.finishChild), to the
 * review queue (Check independently), or back to the operator (Run again).
 */
import type { Message } from '../contract/types';
import { getSandboxService } from '../../sandbox/callables';
import { type AnalyzeRunDoc, runRef } from '../engine/runStore';
import { runMessageStore } from '../engine/sessionStore';
import {
  answerFilePath,
  answerFileText,
  finalAnswer,
  hasReplyText,
  toolSummaryFromMessages,
} from './agentResults';
import { clearHandoff, displayModel, finishChild } from './teamStore';
import { deliverRerun } from './reruns';
import { applyVerification } from '../review/reviewRuns';
import type { AgentRunResult } from './types';

export type ChildOutcome = 'completed' | 'stopped' | 'error';

async function listRunFiles(child: AnalyzeRunDoc, kernel: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [`/output/agents/${kernel}`];
  try {
    while (pending.length > 0) {
      const dir = pending.pop()!;
      for (const entry of await getSandboxService().listFiles(child.uid, child.config.sandboxSessionKey, dir)) {
        if (entry.isDirectory) pending.push(entry.path);
        else files.push(entry.path);
      }
    }
  } catch (error) {
    console.warn('[analyzeTeam] could not list subagent files', { kernel, error });
  }
  return files.sort();
}

/**
 * Save the final reply next to the run's own files. Models sometimes claim
 * files they never wrote (2026-10-04: Mistral listed five, saved none), so
 * the reply itself is always on disk for the operator and reviewer.
 */
async function saveAnswer(child: AnalyzeRunDoc, kernel: string, files: string[], answer: string, status: AgentRunResult['status']): Promise<string | undefined> {
  const path = answerFilePath(kernel, files, child.runId);
  const text = answerFileText({
    agentName: child.config.aiName,
    model: displayModel(child.config),
    status,
    task: child.agent?.task ?? '',
    answer,
  });
  try {
    await getSandboxService().writeFile(child.uid, child.config.sandboxSessionKey, {
      path,
      base64: Buffer.from(text, 'utf8').toString('base64'),
    });
    return path;
  } catch (error) {
    console.warn('[analyzeTeam] could not save subagent reply', { kernel, error });
    return undefined;
  }
}

/**
 * The transcript and the stopped run's partial text. A stopped round keeps
 * what it had streamed as its own message (round.ts); the browser held that
 * as partialText, handed back as "Stopped before finishing", not as a reply.
 */
function splitPartial(messages: Message[], child: AnalyzeRunDoc, finalRound: number, outcome: ChildOutcome): { messages: Message[]; partialText: string } {
  if (outcome !== 'stopped') return { messages, partialText: '' };
  const partialId = `${child.runId}_r${finalRound}`;
  const last = messages[messages.length - 1];
  if (last?.id === partialId && last.senderType === 'ai' && !last.metadata?.toolCalls?.length) {
    return { messages: messages.slice(0, -1), partialText: last.content };
  }
  return { messages, partialText: '' };
}

export async function buildChildResult(child: AnalyzeRunDoc, outcome: ChildOutcome, finalRound: number, crashed?: Error): Promise<AgentRunResult> {
  const kernel = child.config.kernel ?? `agent-${child.runId}`;
  const status: AgentRunResult['status'] = outcome === 'stopped' ? 'stopped' : outcome === 'error' ? 'failed' : 'completed';
  const transcript = await runMessageStore(child.uid, child.sessionId, child.runId).load();
  const { messages, partialText } = splitPartial(transcript, child, finalRound, outcome);
  const files = await listRunFiles(child, kernel);
  const answer = finalAnswer(messages, crashed ?? null, partialText);
  const answerFile = hasReplyText(answer) ? await saveAnswer(child, kernel, files, answer, status) : undefined;
  void getSandboxService().releaseKernel(child.uid, child.config.sandboxSessionKey, kernel).catch((error) => {
    console.warn('[analyzeTeam] failed to release subagent kernel', { kernel, error });
  });
  return {
    runId: child.runId,
    kernel,
    agentName: child.config.aiName,
    provider: child.config.provider,
    model: displayModel(child.config),
    purpose: child.agent?.purpose ?? 'delegated',
    status,
    answer,
    files,
    ...(answerFile ? { answerFile } : {}),
    toolSummary: toolSummaryFromMessages(transcript),
    startedAt: child.createdAt,
    endedAt: Date.now(),
  };
}

/**
 * A subagent's step ended. The result is computed once and stored before the
 * finishing transaction, so a redelivery reuses it instead of saving a second
 * answer file.
 */
export async function finalizeChild(child: AnalyzeRunDoc, outcome: ChildOutcome, finalRound: number, crashed?: Error): Promise<void> {
  const ref = runRef(child.uid, child.sessionId, child.runId);
  let result = child.result;
  if (!result) {
    result = await buildChildResult(child, outcome, finalRound, crashed);
    await ref.update({ result, updatedAt: Date.now() });
  }
  if (child.kind === 'verify') await applyVerification(child, result);
  await finishChild(child, result);
  await completeHandoff({ ...child, result });
}

/** The part of finishing that happens after commit: a rerun's delivery; then clear the flag. */
export async function completeHandoff(child: AnalyzeRunDoc): Promise<void> {
  if (child.agent?.rerunOf && child.result) await deliverRerun(child);
  await clearHandoff(child);
}
