/**
 * Analyze model history: tool-protocol repair and context pruning.
 * Ported from symposium-ai-web src/services/analyze/orchestrator/history.ts
 * (Phase 3), logic unchanged. Model limits come from the generated catalog
 * instead of AI_MODELS. buildAnalyzeContinuationHistory was not ported: it
 * had no caller outside tests.
 */
import type { Message, MessageMetadata } from '../contract/types';
import { DEFAULT_MAX_OUTPUT_TOKENS, getCatalogModel } from '../modelCatalog';
import type { AnalyzeSession } from './contracts';

function getToolCalls(message: Message): NonNullable<MessageMetadata['toolCalls']> {
  return message.senderType === 'ai' && message.metadata?.toolCalls?.length
    ? message.metadata.toolCalls
    : [];
}

function isToolResultMessage(message: Message): boolean {
  return message.senderType === 'tool'
    && message.metadata?.isToolResult === true
    && typeof message.metadata.toolCallId === 'string'
    && message.metadata.toolCallId.length > 0;
}

function stripToolProtocolMetadata(metadata: MessageMetadata | undefined): MessageMetadata | undefined {
  if (!metadata) return undefined;

  const rest: MessageMetadata = { ...metadata };
  delete rest.toolCalls;
  delete rest.toolExecutionResults;
  delete rest.toolCallId;
  delete rest.isToolResult;
  delete rest.success;
  delete rest.toolProvenance;

  return Object.keys(rest).length > 0 ? rest : undefined;
}

function toolNameForMessage(message: Message): string {
  return typeof message.metadata?.toolName === 'string' && message.metadata.toolName.trim()
    ? message.metadata.toolName
    : 'unknown';
}

function describeHistoricalToolCall(toolCall: NonNullable<MessageMetadata['toolCalls']>[number]): string {
  const name = toolCall.function.name;
  const rawArgs = toolCall.function.arguments || '';
  try {
    const args = JSON.parse(rawArgs) as Record<string, unknown>;
    if (name === 'execute_python' && typeof args.code === 'string') {
      return [`${name}:`, '```python', args.code, '```'].join('\n');
    }
    if (name === 'write_output_file' && typeof args.path === 'string') {
      return `${name} → ${args.path}`;
    }
  } catch {
    // Fall through to the raw arguments below.
  }
  return rawArgs ? `${name}: ${rawArgs}` : name;
}

/**
 * Tool protocol repair: an assistant tool-call message whose results don't all
 * follow it (e.g. the run stopped mid-execution) can't be sent natively —
 * providers reject unmatched calls — so it becomes a plain record of the calls.
 */
function toolCallsAsText(message: Message): Message {
  const descriptions = getToolCalls(message).map(describeHistoricalToolCall);
  const record = ['Tool calls made here (no complete result was recorded):', ...descriptions].join('\n');

  return {
    ...message,
    content: message.content?.trim() ? `${message.content}\n\n${record}` : record,
    metadata: stripToolProtocolMetadata(message.metadata),
  };
}

/** Tool protocol repair: a tool result with no matching call becomes plain context. */
function toolResultAsText(message: Message): Message {
  const toolName = toolNameForMessage(message);
  const content = message.content?.trim() || '(empty tool result)';

  return {
    ...message,
    sender: 'Analyze history',
    senderType: 'user',
    content: `Result of a ${toolName} call:\n${content}`,
    metadata: stripToolProtocolMetadata(message.metadata),
  };
}

function hasExactToolResultMatches(toolCalls: NonNullable<MessageMetadata['toolCalls']>, toolResults: Message[]): boolean {
  if (toolResults.length !== toolCalls.length) return false;

  const expectedToolCallIds = new Set(toolCalls.map((toolCall) => toolCall.id));
  const matchedToolCallIds = new Set<string>();

  for (const toolResult of toolResults) {
    const toolCallId = toolResult.metadata?.toolCallId;
    if (!toolCallId || !expectedToolCallIds.has(toolCallId) || matchedToolCallIds.has(toolCallId)) {
      return false;
    }
    matchedToolCallIds.add(toolCallId);
  }

  return matchedToolCallIds.size === expectedToolCallIds.size;
}

export function normalizeAnalyzeHistoryToolProtocol(history: Message[]): Message[] {
  const normalized: Message[] = [];

  for (let index = 0; index < history.length; index += 1) {
    const message = history[index];
    const toolCalls = getToolCalls(message);

    if (toolCalls.length === 0) {
      normalized.push(isToolResultMessage(message) ? toolResultAsText(message) : message);
      continue;
    }

    const followingToolResults: Message[] = [];
    let lookahead = index + 1;

    while (lookahead < history.length && isToolResultMessage(history[lookahead])) {
      followingToolResults.push(history[lookahead]);
      lookahead += 1;
    }

    if (!hasExactToolResultMatches(toolCalls, followingToolResults)) {
      normalized.push(toolCallsAsText(message));
      normalized.push(...followingToolResults.map(toolResultAsText));
      index = lookahead - 1;
      continue;
    }

    normalized.push(message);
    normalized.push(...followingToolResults);
    index = lookahead - 1;
  }

  return normalized;
}

export function buildAnalyzeHistory(session: AnalyzeSession | null): Message[] {
  if (!session) return [];

  let history = session.messages
    .filter((msg) => {
      if (msg.senderType === 'tool') return true;
      if (msg.content && msg.content.trim()) return true;
      if (msg.senderType === 'ai' && msg.metadata?.toolCalls) return true;
      return false;
    });

  // Every complete tool exchange stays native, in this run and earlier turns;
  // only unmatched calls/results are repaired into plain text.
  history = normalizeAnalyzeHistoryToolProtocol(history);
  return pruneHistoryIfNeeded(session, history);
}

export function pruneHistoryIfNeeded(session: AnalyzeSession | null, history: Message[]): Message[] {
  if (!session) return history;

  const provider = session.ai.provider;
  const modelId = session.ai.model;
  const modelConfig = modelId ? getCatalogModel(provider, modelId) : undefined;
  const contextLength = modelConfig?.contextLength || 128000;

  const maxOutput = modelConfig?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const systemPromptBuffer = 6000;
  const inputBudget = contextLength - maxOutput - systemPromptBuffer;
  const threshold = Math.max(inputBudget, contextLength * 0.3);

  const totalChars = history.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  const estimatedTokens = totalChars / 4;

  if (estimatedTokens <= threshold) {
    return history;
  }

  console.warn('[AnalyzeOrchestrator] History approaching context limit, pruning:', {
    estimatedTokens: Math.round(estimatedTokens),
    contextLength,
    threshold: Math.round(threshold),
    messageCount: history.length,
  });

  const groups: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.senderType === 'ai' && msg.metadata?.toolCalls?.length) {
      const groupStart = i;
      let groupEnd = i;
      for (let j = i + 1; j < history.length; j++) {
        if (history[j].senderType === 'tool' && history[j].metadata?.isToolResult) {
          groupEnd = j;
        } else {
          break;
        }
      }
      groups.push({ start: groupStart, end: groupEnd });
    }
  }

  if (groups.length <= 4) {
    return history;
  }

  const groupsToKeep = 4;
  const groupsToPrune = groups.slice(0, groups.length - groupsToKeep);
  const prunedCount = groupsToPrune.length;

  const indicesToRemove = new Set<number>();
  for (const group of groupsToPrune) {
    for (let i = group.start; i <= group.end; i++) {
      indicesToRemove.add(i);
    }
  }

  const firstUserIdx = history.findIndex(m => m.senderType === 'user');
  const pruned: Message[] = [];
  let insertedNote = false;

  for (let i = 0; i < history.length; i++) {
    if (i === firstUserIdx || !indicesToRemove.has(i)) {
      if (!insertedNote && indicesToRemove.has(i - 1) && !indicesToRemove.has(i)) {
        pruned.push({
          id: `prune_note_${Date.now()}`,
          sender: 'system',
          senderType: 'user',
          content: `[${prunedCount} earlier tool exchanges omitted to fit context window]`,
          timestamp: Date.now(),
        });
        insertedNote = true;
      }
      pruned.push(history[i]);
    }
  }

  if (!insertedNote && indicesToRemove.size > 0) {
    const insertIdx = firstUserIdx >= 0 ? 1 : 0;
    pruned.splice(insertIdx, 0, {
      id: `prune_note_${Date.now()}`,
      sender: 'system',
      senderType: 'user',
      content: `[${prunedCount} earlier tool exchanges omitted to fit context window]`,
      timestamp: Date.now(),
    });
  }

  const prunedChars = pruned.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  console.log('[AnalyzeOrchestrator] History pruned:', {
    originalMessages: history.length,
    prunedMessages: pruned.length,
    removedGroups: prunedCount,
    estimatedTokensBefore: Math.round(estimatedTokens),
    estimatedTokensAfter: Math.round(prunedChars / 4),
  });

  return pruned;
}
