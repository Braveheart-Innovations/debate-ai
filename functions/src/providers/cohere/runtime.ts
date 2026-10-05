/**
 * Cohere Provider Runtime
 *
 * Handles Cohere V2 Chat API.
 *
 * Cohere uses OpenAI-compatible request format (JSON schema tools, role-based messages)
 * but has its own SSE streaming event format:
 * - content-delta: { delta.message.content.text }
 * - tool-call-start: { delta.message.tool_calls: { id, type, function: { name } } }
 * - tool-call-delta: { delta.message.tool_calls: { function: { arguments } } }
 * - tool-call-end: { index }
 * - message-end: { delta: { finish_reason, usage } }
 */

import type {
  CanonicalToolCall,
  CanonicalSSEEvent,
  CanonicalToolDefinition,
  CanonicalToolChoice,
} from '../../types/canonical';
import type { ProviderRuntime, ProviderRequest, BuiltRequest } from '../types';
import {
  parseSSEStream,
  getBase64Data,
  completeToolCall,
  type ToolCallInProgress,
} from '../base-runtime';

// ============================================================================
// Cohere Message Types
// ============================================================================

type CohereContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface CohereMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Omitted on assistant tool-call messages (Cohere rejects text content there). */
  content?: string | CohereContentPart[] | null;
  /** An assistant tool-call message's accompanying text. */
  tool_plan?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

// ============================================================================
// Tool Transformers
// ============================================================================

function transformToolsForCohere(tools: CanonicalToolDefinition[]): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: CanonicalToolDefinition['parameters'];
  };
}[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function transformToolChoiceForCohere(
  choice: CanonicalToolChoice
): 'REQUIRED' | 'NONE' | undefined {
  if (choice === 'required') return 'REQUIRED';
  if (choice === 'none') return 'NONE';
  // Cohere doesn't have 'auto' — omitting tool_choice means auto
  return undefined;
}

// ============================================================================
// Finish Reason Mapping
// ============================================================================

function mapCohereFinishReason(
  finishReason: string
): 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error' {
  switch (finishReason) {
    case 'COMPLETE':
    case 'STOP_SEQUENCE':
      return 'stop';
    case 'TOOL_CALL':
      return 'tool_calls';
    case 'MAX_TOKENS':
      return 'length';
    case 'ERROR':
    case 'TIMEOUT':
      return 'error';
    default:
      return 'stop';
  }
}

function getCohereMaxOutputTokens(model: string | undefined): number {
  if (model === 'command-a-plus-05-2026') return 64000;
  if (model === 'command-a-reasoning-08-2025') return 32000;
  if (model === 'command-a-vision-07-2025') return 8000;
  return 4096;
}

// ============================================================================
// Cohere Runtime Implementation
// ============================================================================

export class CohereRuntime implements ProviderRuntime {
  readonly providerId = 'cohere';
  readonly supportsTools = true;

  /**
   * Build Cohere API request from canonical format
   */
  buildRequest(request: ProviderRequest, apiKey: string): BuiltRequest {
    const cohereMessages = this.transformMessages(request);

    const body: Record<string, unknown> = {
      model: request.model || 'command-a-plus-05-2026',
      messages: cohereMessages,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.maxTokens !== undefined) {
      body.max_tokens = Math.min(request.maxTokens, getCohereMaxOutputTokens(request.model));
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = transformToolsForCohere(request.tools);
      if (request.toolChoice) {
        const choice = transformToolChoiceForCohere(request.toolChoice);
        if (choice) {
          body.tool_choice = choice;
        }
      }
    }

    return {
      url: 'https://api.cohere.ai/v2/chat',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body,
    };
  }

  /**
   * Parse Cohere SSE stream into canonical events
   *
   * Cohere event types:
   * - content-delta: text content
   * - tool-call-start: new tool call with id and name
   * - tool-call-delta: streaming tool arguments
   * - tool-call-end: tool call finished
   * - message-end: finish reason and usage
   */
  async *streamParse(
    responseStream: ReadableStream<Uint8Array>,
    _traceId: string
  ): AsyncGenerator<CanonicalSSEEvent, void, unknown> {
    const toolCallsInProgress = new Map<number, ToolCallInProgress>();
    const completedToolCalls: CanonicalToolCall[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = 'COMPLETE';

    for await (const data of parseSSEStream(responseStream)) {
      try {
        const event = JSON.parse(data);

        switch (event.type) {
          case 'content-delta': {
            const text = event.delta?.message?.content?.text;
            if (text) {
              yield { type: 'text_delta', delta: text };
            }
            break;
          }

          case 'tool-call-start': {
            const index = event.index ?? 0;
            const tc = event.delta?.message?.tool_calls;
            if (tc) {
              toolCallsInProgress.set(index, {
                id: tc.id || `cohere_tc_${index}_${Date.now()}`,
                name: tc.function?.name || '',
                arguments: '',
              });

              if (tc.function?.name) {
                yield {
                  type: 'tool_call_start',
                  index,
                  id: tc.id,
                  name: tc.function.name,
                };
              }
            }
            break;
          }

          case 'tool-call-delta': {
            const index = event.index ?? 0;
            const argsDelta = event.delta?.message?.tool_calls?.function?.arguments;
            if (argsDelta) {
              const existing = toolCallsInProgress.get(index);
              if (existing) {
                existing.arguments += argsDelta;

                yield {
                  type: 'tool_call_delta',
                  index,
                  id: existing.id,
                  arguments_delta: argsDelta,
                };
              }
            }
            break;
          }

          case 'tool-call-end': {
            const index = event.index ?? 0;
            const tc = toolCallsInProgress.get(index);
            if (tc) {
              const completed = completeToolCall(tc);
              completedToolCalls.push(completed);

              yield {
                type: 'tool_call_complete',
                index,
                tool_call: completed,
              };

              toolCallsInProgress.delete(index);
            }
            break;
          }

          case 'message-end': {
            if (event.delta?.finish_reason) {
              finishReason = event.delta.finish_reason;
            }
            if (event.delta?.usage) {
              const usage = event.delta.usage;
              inputTokens = usage.billed_units?.input_tokens || usage.tokens?.input_tokens || 0;
              outputTokens = usage.billed_units?.output_tokens || usage.tokens?.output_tokens || 0;
            }
            break;
          }

          // tool-plan-delta and other events are ignored
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Complete any tool calls that didn't get a tool-call-end event
    for (const [index, tc] of toolCallsInProgress) {
      const completed = completeToolCall(tc);
      completedToolCalls.push(completed);

      yield {
        type: 'tool_call_complete',
        index,
        tool_call: completed,
      };
    }
    toolCallsInProgress.clear();

    // Emit message complete event
    yield {
      type: 'message_complete',
      finish_reason: mapCohereFinishReason(finishReason),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      tool_calls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Transform canonical messages to Cohere format
   */
  private transformMessages(request: ProviderRequest): CohereMessage[] {
    const cohereMessages: CohereMessage[] = [];
    const attachments = request.attachments;

    // Add system prompt as first message
    const systemPrompt = request.systemPrompt ||
      request.messages.find(m => m.role === 'system')?.content;

    if (systemPrompt) {
      cohereMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Process messages
    const messages = request.messages.filter(m => m.role !== 'system');

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isLastUserMessage = msg.role === 'user' && i === messages.length - 1;

      // Handle tool result messages
      if (msg.role === 'tool' && msg.tool_call_id) {
        cohereMessages.push({
          role: 'tool',
          content: msg.content || '',
          tool_call_id: msg.tool_call_id,
        });
        continue;
      }

      // Assistant messages with tool calls: Cohere v2 rejects text content here
      // ("messages with non-empty 'tool_calls' cannot contain content items of
      // type 'text'"), and an empty-string content makes the NEXT reply end with
      // finish_reason ERROR and no text (2026-10-05: every Analyze follow-up after
      // a tool call came back empty). Text alongside a call goes in tool_plan.
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const plan = typeof msg.content === 'string' ? msg.content.trim() : '';
        cohereMessages.push({
          role: 'assistant',
          ...(plan ? { tool_plan: plan } : {}),
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });
        continue;
      }

      // Handle user message with attachments (vision)
      const msgAttachments = msg.attachments || (isLastUserMessage ? attachments : undefined);
      if (msg.role === 'user' && msgAttachments && msgAttachments.length > 0) {
        const contentParts: CohereContentPart[] = [];
        const imageAttachments = msgAttachments.filter(att => att.type === 'image');

        for (const att of imageAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}`,
            },
          });
        }

        contentParts.push({ type: 'text', text: msg.content || '' });

        if (contentParts.length > 1) {
          cohereMessages.push({
            role: 'user',
            content: contentParts,
          });
          continue;
        }
      }

      // Regular user or assistant message
      if (msg.role === 'user' || msg.role === 'assistant') {
        cohereMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return cohereMessages;
  }
}

// Singleton instance
let cohereRuntimeInstance: CohereRuntime | null = null;

export function getCohereRuntime(): CohereRuntime {
  if (!cohereRuntimeInstance) {
    cohereRuntimeInstance = new CohereRuntime();
  }
  return cohereRuntimeInstance;
}
