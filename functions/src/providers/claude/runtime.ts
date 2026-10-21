/**
 * Claude Provider Runtime
 *
 * Handles all Claude-specific transformations:
 * - Canonical messages → Claude format
 * - System prompt → top-level field
 * - Tool results → user message with tool_result blocks
 * - Tool calls → assistant message with tool_use blocks
 * - Claude SSE events → Canonical events
 */

import type {
  CanonicalMessage,
  CanonicalToolCall,
  CanonicalSSEEvent,
  CanonicalToolDefinition,
  CanonicalToolChoice,
} from '../../types/canonical';
import type { ProviderRuntime, ProviderRequest, BuiltRequest, ProviderConfig } from '../types';
import {
  parseSSEStream,
  getBase64Data,
  completeToolCall,
  mapClaudeStopReason,
  type ToolCallInProgress,
} from '../base-runtime';
import { claudeDeepThinkingEffort, normalizeProviderTemperature } from '../../modelRegistry';

// ============================================================================
// Claude Message Types
// ============================================================================

type CacheControl = { type: 'ephemeral' };

type ClaudeContentBlock = (
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
) & { cache_control?: CacheControl };

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

// ============================================================================
// Prompt Caching (ProviderRequest.promptCache)
// ============================================================================

const EPHEMERAL: CacheControl = { type: 'ephemeral' };

/** How many user messages, newest first, end in a cache breakpoint. */
const CACHED_USER_MESSAGES = 2;

/**
 * The cached prefix runs tools, system prompt, then messages, and a breakpoint
 * caches everything before it. The system prompt's breakpoint (buildRequest)
 * keeps the tools and the rules cached across rounds and turns. The newest user
 * message's caches the history for the next round, and the user message before
 * it is where the previous round wrote its cache, so this round reads it there.
 * Three breakpoints; Anthropic allows four.
 */
function markCacheBreakpoints(messages: ClaudeMessage[]): ClaudeMessage[] {
  const marked = messages.slice();
  let remaining = CACHED_USER_MESSAGES;
  for (let i = marked.length - 1; i >= 0 && remaining > 0; i--) {
    const message = marked[i];
    if (message.role !== 'user') continue;
    const blocks: ClaudeContentBlock[] = typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : message.content;
    const last = blocks[blocks.length - 1];
    // An empty text block can't carry a breakpoint.
    if (!last || (last.type === 'text' && !last.text.trim())) continue;
    marked[i] = { ...message, content: [...blocks.slice(0, -1), { ...last, cache_control: EPHEMERAL }] };
    remaining -= 1;
  }
  return marked;
}

// ============================================================================
// Tool Transformers
// ============================================================================

function transformToolsForClaude(tools: CanonicalToolDefinition[]): {
  name: string;
  description: string;
  input_schema: CanonicalToolDefinition['parameters'];
}[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

function transformToolChoiceForClaude(
  choice: CanonicalToolChoice
): { type: 'auto' | 'any' | 'tool'; name?: string } {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'auto' }; // Claude doesn't have 'none'
  if (choice === 'required') return { type: 'any' };
  if (typeof choice === 'object' && choice.name) {
    return { type: 'tool', name: choice.name };
  }
  return { type: 'auto' };
}

// ============================================================================
// Claude Runtime Implementation
// ============================================================================

export class ClaudeRuntime implements ProviderRuntime {
  readonly providerId = 'claude';
  readonly supportsTools = true;

  private config: ProviderConfig = {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    staticHeaders: {
      'anthropic-version': '2023-06-01',
    },
  };

  /**
   * Build Claude API request from canonical format
   */
  buildRequest(request: ProviderRequest, apiKey: string): BuiltRequest {
    const transformed = this.transformMessages(request);
    const claudeMessages = request.promptCache ? markCacheBreakpoints(transformed) : transformed;
    const systemPrompt = this.extractSystemPrompt(request);

    const body: Record<string, unknown> = {
      model: request.model || 'claude-sonnet-4-20250514',
      max_tokens: request.maxTokens ?? 8192,
      stream: true,
      messages: claudeMessages,
    };
    const temperature = normalizeProviderTemperature(
      'claude',
      request.model,
      request.temperature ?? 0.7
    );
    if (typeof temperature === 'number') {
      body.temperature = temperature;
    }

    // Adaptive thinking is on by default on the current models; effort is its depth.
    const effort = request.deepThinking ? claudeDeepThinkingEffort(request.model) : undefined;
    if (effort) {
      body.output_config = { effort };
    }

    // Add system prompt as top-level field (a block with a breakpoint when caching)
    if (systemPrompt) {
      body.system = request.promptCache
        ? [{ type: 'text', text: systemPrompt, cache_control: EPHEMERAL }]
        : systemPrompt;
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = transformToolsForClaude(request.tools);
      if (request.toolChoice) {
        body.tool_choice = transformToolChoiceForClaude(request.toolChoice);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [this.config.authHeader]: apiKey,
      ...this.config.staticHeaders,
    };

    return {
      url: this.config.baseUrl,
      headers,
      body,
    };
  }

  /**
   * Parse Claude SSE stream into canonical events
   */
  async *streamParse(
    responseStream: ReadableStream<Uint8Array>,
    traceId: string
  ): AsyncGenerator<CanonicalSSEEvent, void, unknown> {
    const toolCallsInProgress = new Map<number, ToolCallInProgress>();
    const completedToolCalls: CanonicalToolCall[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let finishReason = 'stop';

    for await (const data of parseSSEStream(responseStream)) {
      try {
        const event = JSON.parse(data);

        // Text delta
        if (event.type === 'content_block_delta' && event.delta?.text) {
          yield {
            type: 'text_delta',
            delta: event.delta.text,
          };
        }

        // Tool call start
        else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          const block = event.content_block;
          const index = event.index;

          toolCallsInProgress.set(index, {
            id: block.id,
            name: block.name,
            arguments: '',
          });

          yield {
            type: 'tool_call_start',
            index,
            id: block.id,
            name: block.name,
          };
        }

        // Tool call argument delta
        else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
          const index = event.index;
          const toolCall = toolCallsInProgress.get(index);
          if (toolCall) {
            toolCall.arguments += event.delta.partial_json || '';

            yield {
              type: 'tool_call_delta',
              index,
              id: toolCall.id,
              arguments_delta: event.delta.partial_json || '',
            };
          }
        }

        // Content block stop (may complete a tool call)
        else if (event.type === 'content_block_stop') {
          const index = event.index;
          const toolCall = toolCallsInProgress.get(index);
          if (toolCall) {
            const completed = completeToolCall(toolCall);
            completedToolCalls.push(completed);

            yield {
              type: 'tool_call_complete',
              index,
              tool_call: completed,
            };

            toolCallsInProgress.delete(index);
          }
        }

        // Message start (contains input token count)
        else if (event.type === 'message_start' && event.message?.usage) {
          const usage = event.message.usage;
          cacheReadTokens = usage.cache_read_input_tokens || 0;
          cacheWriteTokens = usage.cache_creation_input_tokens || 0;
          // input_tokens counts only the input after the last cache breakpoint.
          inputTokens = (usage.input_tokens || 0) + cacheReadTokens + cacheWriteTokens;
        }

        // Message delta (contains output tokens and stop reason)
        else if (event.type === 'message_delta') {
          if (event.usage) {
            outputTokens = event.usage.output_tokens || 0;
          }
          if (event.delta?.stop_reason) {
            finishReason = event.delta.stop_reason;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Emit message complete event
    yield {
      type: 'message_complete',
      finish_reason: mapClaudeStopReason(finishReason),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        ...(cacheReadTokens || cacheWriteTokens ? { cacheReadTokens, cacheWriteTokens } : {}),
      },
      tool_calls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Transform canonical messages to Claude format
   */
  private transformMessages(request: ProviderRequest): ClaudeMessage[] {
    const claudeMessages: ClaudeMessage[] = [];
    const messages = request.messages.filter(m => m.role !== 'system');
    const attachments = request.attachments;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isLastUserMessage = msg.role === 'user' && i === messages.length - 1;

      // Handle tool result messages → user message with tool_result block(s)
      // IMPORTANT: Group consecutive tool results into a single user message
      // Claude requires user/assistant alternation, so multiple tool results
      // must be combined into one user message with multiple tool_result blocks
      if (msg.role === 'tool' && msg.tool_call_id) {
        // Collect all consecutive tool results
        const toolResultBlocks: ClaudeContentBlock[] = [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content || '',
          is_error: msg.content?.startsWith('Error:'),
        }];

        // Look ahead for more consecutive tool results
        while (i + 1 < messages.length && messages[i + 1].role === 'tool' && messages[i + 1].tool_call_id) {
          i++;
          const nextMsg = messages[i];
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: nextMsg.tool_call_id!,
            content: nextMsg.content || '',
            is_error: nextMsg.content?.startsWith('Error:'),
          });
        }

        claudeMessages.push({
          role: 'user',
          content: toolResultBlocks,
        });
        continue;
      }

      // Handle assistant messages with tool calls → tool_use blocks
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const contentBlocks: ClaudeContentBlock[] = [];

        // Add text content first
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        // Add tool_use blocks
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        }

        claudeMessages.push({
          role: 'assistant',
          content: contentBlocks,
        });
        continue;
      }

      // Handle user message with attachments (per-message or global fallback)
      const msgAttachments = msg.attachments || (isLastUserMessage ? attachments : undefined);
      if (msg.role === 'user' && msgAttachments && msgAttachments.length > 0) {
        const contentParts: ClaudeContentBlock[] = [];

        for (const att of msgAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          if (att.type === 'image') {
            contentParts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType || 'image/jpeg',
                data: base64,
              },
            });
          } else if (att.type === 'document') {
            contentParts.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: att.mimeType || 'application/pdf',
                data: base64,
              },
            });
          }
        }

        contentParts.push({ type: 'text', text: msg.content || '' });

        claudeMessages.push({
          role: 'user',
          content: contentParts,
        });
        continue;
      }

      // Regular user or assistant message
      if (msg.role === 'user' || msg.role === 'assistant') {
        claudeMessages.push({
          role: msg.role,
          content: msg.content || '',
        });
      }
    }

    // Final pass: merge any consecutive same-role messages
    // This ensures user/assistant alternation even if the input had issues
    return this.mergeConsecutiveMessages(claudeMessages);
  }

  /**
   * Merge consecutive messages with the same role.
   * Claude requires strict user/assistant alternation.
   */
  private mergeConsecutiveMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
    if (messages.length === 0) return messages;

    const merged: ClaudeMessage[] = [messages[0]];

    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const last = merged[merged.length - 1];

      if (current.role === last.role) {
        // Merge content
        if (typeof last.content === 'string' && typeof current.content === 'string') {
          // Both are strings - concatenate
          last.content = last.content + '\n\n' + current.content;
        } else if (Array.isArray(last.content) && Array.isArray(current.content)) {
          // Both are arrays - concatenate blocks
          last.content = [...last.content, ...current.content];
        } else if (typeof last.content === 'string' && Array.isArray(current.content)) {
          // String + array - convert string to text block and merge
          last.content = [{ type: 'text', text: last.content }, ...current.content];
        } else if (Array.isArray(last.content) && typeof current.content === 'string') {
          // Array + string - add text block
          last.content = [...last.content, { type: 'text', text: current.content }];
        }
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Extract system prompt from request
   */
  private extractSystemPrompt(request: ProviderRequest): string | undefined {
    if (request.systemPrompt) {
      return request.systemPrompt;
    }

    const systemMessage = request.messages.find(m => m.role === 'system');
    return systemMessage?.content || undefined;
  }
}

// Singleton instance
let claudeRuntimeInstance: ClaudeRuntime | null = null;

export function getClaudeRuntime(): ClaudeRuntime {
  if (!claudeRuntimeInstance) {
    claudeRuntimeInstance = new ClaudeRuntime();
  }
  return claudeRuntimeInstance;
}
