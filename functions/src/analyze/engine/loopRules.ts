/**
 * Retry and failure rules for one loop round. Helpers, prompts and user-facing
 * texts are ported verbatim from symposium-ai-web
 * src/services/analyze/orchestrator/loopHandlers.ts (Phase 3); round.ts
 * applies them the way handleLoopStreamError / handleNoToolResponse did.
 */
import type { Message } from '../contract/types';

export const TOOL_FOLLOW_UP_RECOVERY_PROMPT = 'Continue with a complete final response to the user using the tool results above. Include source citations for fetched external data. Do not return an empty response.';
export const TOOL_FOLLOW_UP_STREAM_RETRY_PROMPT = [
  'Continue with a complete final response to the user using the tool results above.',
  'Tool execution already completed; treat previous tool outputs, saved /data files, saved /output files, and provenance paths as durable run state.',
  'Do not refetch, regenerate, or report fetched data as unavailable merely because provider streaming was interrupted or because full file contents are not visible in conversation history.',
  'If the selected output mode requires a final artifact and it has not been written yet, create it from the retained data/tool results before final synthesis.',
  'Include concise citations for fetched external data. If a tool output failed, explain the impact and best next step.',
].join('\n');


export function hasRecentToolFollowUpContext(history: Message[]): boolean {
  if (history.length === 0) {
    return false;
  }

  const recentMessages = history.slice(-6);
  const lastMessage = recentMessages[recentMessages.length - 1];
  const hasRecentToolCall = recentMessages.some(
    (message) => message.senderType === 'ai' && (message.metadata?.toolCalls?.length || 0) > 0,
  );
  const hasRecentToolResult = recentMessages.some(
    (message) => message.senderType === 'tool' && !!message.metadata?.isToolResult,
  );

  return lastMessage?.senderType === 'tool'
    && !!lastMessage.metadata?.isToolResult
    && hasRecentToolCall
    && hasRecentToolResult;
}

export function summarizeRecentToolFailure(history: Message[]): string | undefined {
  const failedToolMessages = history
    .filter((message) => message.senderType === 'tool' && message.metadata?.isToolResult && message.metadata?.success === false)
    .reverse();

  if (failedToolMessages.length === 0) {
    return undefined;
  }

  const latestFailure = failedToolMessages[0];
  const toolName = typeof latestFailure.metadata?.toolName === 'string'
    ? latestFailure.metadata.toolName
    : 'tool';

  const rawContent = latestFailure.content || '';
  const explicitFailureMatch = rawContent.match(/Tool execution failed:\s*(.+?)(?:\n|$)/i);
  const failureDetail = (explicitFailureMatch?.[1] || rawContent)
    .replace(/\s+/g, ' ')
    .trim();

  if (!failureDetail) {
    return `${toolName} failed`;
  }

  const truncatedDetail = failureDetail.length > 220
    ? `${failureDetail.slice(0, 220)}...`
    : failureDetail;

  return `${toolName}: ${truncatedDetail}`;
}

export function formatProviderError(errorMessage: string): string {
  const normalized = errorMessage.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === 'Unknown error') {
    return '';
  }

  return normalized.length > 180
    ? `${normalized.slice(0, 180)}...`
    : normalized;
}

export function isProviderNetworkError(error: unknown, errorMessage: string): boolean {
  if (error instanceof TypeError && /failed to fetch/i.test(errorMessage)) {
    return true;
  }

  return /\bnetwork\s+error\b|network (?:request )?(?:failed|interrupted|lost)|connection (?:failed|reset|closed|lost|interrupted)|stream (?:closed|interrupted)|ECONNRESET|ETIMEDOUT|socket hang up/i.test(errorMessage);
}

