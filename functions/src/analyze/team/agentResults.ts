/**
 * A subagent run's brief and result. Ported from symposium-ai-web
 * src/services/analyze/orchestrator/agents/AgentRunner.ts (Phase 3 Step 4):
 * the helpers are unchanged; the runner itself became child analyzeRuns
 * (team/childRuns.ts), so its result assembly lives in buildAgentRunResult.
 */
import type { Message } from '../contract/types';
import type { AgentRunResult } from './types';

export const ANSWER_FILENAME = 'final-reply.md';
const NO_ANSWER_TEXT = 'The subagent ended without a final answer.';
/** Leads a teammate's answer that stopped at its output limit, so the operator doesn't take it as complete. */
export const OUTPUT_LIMIT_NOTE = '[App note: this reply reached the model\'s output limit and may be cut off. Treat missing parts as not done.]';

/**
 * A delegated task is the operator's own text, plus the two facts the teammate
 * can't infer: where to save files, and that its final reply goes back.
 */
export function buildDelegatedBrief(task: string, kernel: string): string {
  return `${task}

---
Save any files you create in /output/agents/${kernel}/. Uploaded files are in /uploads and tool-fetched data in /data. When you're done, reply without tool calls; your reply goes back to the operator.`;
}

/**
 * Check independently: the reviewer re-derives one of its findings. The verdict
 * line is required so the review queue can record a parseable result.
 */
export function buildReviewCheckBrief(task: string, kernel: string): string {
  return `${task}

---
Re-derive the result yourself — re-fetch sources and recompute with your own code; run someone else's code only to diagnose a discrepancy. Save any files you create in /output/agents/${kernel}/.
Begin your final answer with exactly one of VERDICT: CONFIRMED, VERDICT: DISPUTED, or VERDICT: UNVERIFIABLE, then give the evidence (sources, computations, files) and, if disputed, the corrected value. Disputed and unverifiable are respectable outcomes — don't confirm what you couldn't check.`;
}

export function briefTitle(task: string): string {
  const firstLine = task.split('\n').find((line) => line.trim())?.trim() || 'Delegated task';
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

/**
 * The run's final reply. A stopped run has none, so it hands back what it had:
 * the text it was streaming, else its latest prose between tool calls.
 */
export function finalAnswer(messages: Message[], crashed: unknown, partialText: string): string {
  const aiMessages = [...messages].reverse().filter((message) => message.senderType === 'ai' && message.content.trim());
  const answer = aiMessages.find((message) => !message.metadata?.toolCalls?.length);
  if (answer) {
    return answer.metadata?.outputLimitReached
      ? `${OUTPUT_LIMIT_NOTE}\n\n${answer.content.trim()}`
      : answer.content.trim();
  }
  if (crashed instanceof Error) return `The subagent failed: ${crashed.message}`;
  const partial = partialText.trim() || aiMessages[0]?.content.trim();
  if (partial) return `Stopped before finishing. Its work so far:\n${partial}`;
  return NO_ANSWER_TEXT;
}

export function hasReplyText(answer: string): boolean {
  return answer !== NO_ANSWER_TEXT && !answer.startsWith('The subagent failed:');
}

/** AgentRunner.saveAnswer's path: next to the run's own files, never over one of them. */
export function answerFilePath(kernel: string, files: string[], runId: string): string {
  const dir = `/output/agents/${kernel}`;
  return files.includes(`${dir}/${ANSWER_FILENAME}`) ? `${dir}/final-reply-${runId}.md` : `${dir}/${ANSWER_FILENAME}`;
}

/** AgentRunner.saveAnswer's file text. */
export function answerFileText(input: { agentName: string; model: string; status: AgentRunResult['status']; task: string; answer: string }): string {
  return `# ${input.agentName} (${input.model}) — ${input.status}\n\n## Task\n\n${input.task}\n\n## Final reply\n\n${input.answer}\n`;
}

/** "fetch_url ×6, execute_python ×3 (1 failed)" — what the run actually did. */
function describeTools(toolSummary: AgentRunResult['toolSummary']): string {
  if (toolSummary.length === 0) return 'none';
  const counts = new Map<string, { total: number; failed: number }>();
  for (const tool of toolSummary) {
    const entry = counts.get(tool.name) ?? { total: 0, failed: 0 };
    entry.total += 1;
    if (!tool.ok) entry.failed += 1;
    counts.set(tool.name, entry);
  }
  return Array.from(counts.entries())
    .map(([name, { total, failed }]) => `${name} ×${total}${failed > 0 ? ` (${failed} failed)` : ''}`)
    .join(', ');
}

/** Tool-result text the operator sees for a finished delegate call. */
export function formatDelegateResult(result: AgentRunResult): string {
  const lines = [
    `Delegated run ${result.runId} — ${result.agentName} (${result.model}) — ${result.status}`,
  ];
  lines.push(`Files it saved: ${result.files.length > 0 ? result.files.join(', ') : 'none'}`);
  if (result.answerFile) lines.push(`Its final reply is saved at: ${result.answerFile}`);
  lines.push(`Tools run: ${describeTools(result.toolSummary)}`);
  lines.push('', result.answer);
  return lines.join('\n');
}

/**
 * What a run did, from its transcript: one entry per tool result, in order
 * (the browser read the same from its tool tracker).
 */
export function toolSummaryFromMessages(messages: Message[]): AgentRunResult['toolSummary'] {
  return messages
    .filter((message) => message.senderType === 'tool' && message.metadata?.isToolResult)
    .map((message) => ({
      name: typeof message.metadata?.toolName === 'string' ? message.metadata.toolName : 'unknown',
      ok: message.metadata?.success === true,
    }));
}
