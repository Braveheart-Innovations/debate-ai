/**
 * Google/Gemini Provider Runtime
 *
 * Handles all Gemini-specific transformations:
 * - Canonical messages -> Gemini format (role: 'model', parts-based content)
 * - System prompt -> systemInstruction field
 * - Tool results -> user message with functionResponse parts
 * - Tool calls -> model message with functionCall parts
 * - Gemini SSE events -> Canonical events
 */

import type {
  CanonicalMessage,
  CanonicalToolCall,
  CanonicalSSEEvent,
  CanonicalToolDefinition,
  CanonicalToolChoice,
} from '../../types/canonical';
import type { ProviderRuntime, ProviderRequest, BuiltRequest } from '../types';
import {
  parseSSEStream,
  getBase64Data,
  mapGeminiFinishReason,
} from '../base-runtime';
import { buildGeminiGenerationConfig } from './thinking';

// ============================================================================
// Gemini Message Types
// ============================================================================

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: string } };
  /**
   * Thinking models can emit signatures that must be preserved across tool turns.
   * REST payloads may use either camelCase or snake_case.
   */
  thoughtSignature?: string;
  thought_signature?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// ============================================================================
// Tool Transformers
// ============================================================================

/**
 * Strip fields that Gemini doesn't support from JSON Schema objects.
 * Gemini rejects unknown fields like `additionalProperties`.
 */
function sanitizeParametersForGemini(
  params: CanonicalToolDefinition['parameters']
): Record<string, unknown> {
  const { type, properties, required } = params;
  const sanitized: Record<string, unknown> = { type, properties };
  if (required && required.length > 0) {
    sanitized.required = required;
  }
  return sanitized;
}

function transformToolsForGemini(tools: CanonicalToolDefinition[]): {
  functionDeclarations: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
}[] {
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: sanitizeParametersForGemini(tool.parameters),
    })),
  }];
}

function transformToolChoiceForGemini(
  choice: CanonicalToolChoice
): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } | undefined {
  if (choice === 'auto') return { functionCallingConfig: { mode: 'AUTO' } };
  if (choice === 'none') return { functionCallingConfig: { mode: 'NONE' } };
  if (choice === 'required') return { functionCallingConfig: { mode: 'ANY' } };
  if (typeof choice === 'object' && choice.name) {
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [choice.name],
      },
    };
  }
  return undefined;
}

// ============================================================================
// Google Runtime Implementation
// ============================================================================

export class GoogleRuntime implements ProviderRuntime {
  readonly providerId = 'google';
  readonly supportsTools = true;

  /**
   * Build Gemini API request from canonical format
   */
  buildRequest(request: ProviderRequest, apiKey: string): BuiltRequest {
    const contents = this.transformMessages(request);
    const systemPrompt = this.extractSystemPrompt(request);
    const model = request.model || 'gemini-2.0-flash';

    const body: Record<string, unknown> = {
      contents,
      generationConfig: buildGeminiGenerationConfig({
        model,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens,
        deepThinking: request.deepThinking,
        includeThoughts: request.streamReasoning,
      }),
    };

    // Add system instruction as top-level field
    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = transformToolsForGemini(request.tools);
      if (request.toolChoice) {
        const toolConfig = transformToolChoiceForGemini(request.toolChoice);
        if (toolConfig) {
          body.toolConfig = toolConfig;
        }
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    return {
      url,
      // The key rides in a header, never the URL: URLs end up in logs.
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    };
  }

  /**
   * Parse Gemini SSE stream into canonical events
   */
  async *streamParse(
    responseStream: ReadableStream<Uint8Array>,
    traceId: string
  ): AsyncGenerator<CanonicalSSEEvent, void, unknown> {
    const completedToolCalls: CanonicalToolCall[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let finishReason = 'STOP';
    let toolCallIndex = 0;

    for await (const data of parseSSEStream(responseStream)) {
      try {
        const event = JSON.parse(data);
        const candidate = event.candidates?.[0];

        if (candidate) {
          const parts = candidate.content?.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              // A thought summary (thinkingConfig.includeThoughts), never the answer
              if (part.thought && part.text) {
                yield { type: 'reasoning_delta', delta: part.text };
              }

              // Text content
              else if (part.text) {
                yield {
                  type: 'text_delta',
                  delta: part.text,
                };
              }

              // Function call (tool call)
              if (part.functionCall) {
                const callId = `call_${traceId}_${toolCallIndex}`;
                const name = part.functionCall.name;
                const args = JSON.stringify(part.functionCall.args || {});
                const thoughtSignature =
                  typeof part.thoughtSignature === 'string'
                    ? part.thoughtSignature
                    : (typeof part.thought_signature === 'string' ? part.thought_signature : undefined);

                yield {
                  type: 'tool_call_start',
                  index: toolCallIndex,
                  id: callId,
                  name,
                };

                yield {
                  type: 'tool_call_delta',
                  index: toolCallIndex,
                  id: callId,
                  arguments_delta: args,
                };

                const completed: CanonicalToolCall = {
                  id: callId,
                  type: 'function',
                  function: {
                    name,
                    arguments: args,
                  },
                  extra_content: thoughtSignature
                    ? { google: { thought_signature: thoughtSignature } }
                    : undefined,
                };
                completedToolCalls.push(completed);

                yield {
                  type: 'tool_call_complete',
                  index: toolCallIndex,
                  tool_call: completed,
                };

                toolCallIndex++;
              }
            }
          }

          // Check finish reason
          if (candidate.finishReason) {
            finishReason = candidate.finishReason;
          }

        }

        // Extract usage metadata: thinking is billed as output but counted apart
        // (thoughtsTokenCount), and implicit caching reports cachedContentTokenCount
        if (event.usageMetadata) {
          inputTokens = event.usageMetadata.promptTokenCount || inputTokens;
          outputTokens = (event.usageMetadata.candidatesTokenCount || 0) + (event.usageMetadata.thoughtsTokenCount || 0) || outputTokens;
          cacheReadTokens = event.usageMetadata.cachedContentTokenCount || cacheReadTokens;
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Emit message complete event
    yield {
      type: 'message_complete',
      finish_reason: mapGeminiFinishReason(finishReason),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        ...(cacheReadTokens ? { cacheReadTokens } : {}),
      },
      tool_calls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Transform canonical messages to Gemini format
   */
  private transformMessages(request: ProviderRequest): GeminiContent[] {
    const geminiContents: GeminiContent[] = [];
    const messages = request.messages.filter(m => m.role !== 'system');
    const attachments = request.attachments;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isLastUserMessage = msg.role === 'user' && i === messages.length - 1;

      // Handle tool result messages -> user message with functionResponse parts
      // Gemini doesn't have a 'tool' role; function responses go in user messages
      if (msg.role === 'tool' && msg.tool_call_id) {
        // Collect all consecutive tool results into one user message
        const functionResponseParts: GeminiPart[] = [{
          functionResponse: {
            name: this.extractToolName(msg, messages, i),
            response: { content: msg.content || '' },
          },
        }];

        // Look ahead for more consecutive tool results
        while (i + 1 < messages.length && messages[i + 1].role === 'tool' && messages[i + 1].tool_call_id) {
          i++;
          const nextMsg = messages[i];
          functionResponseParts.push({
            functionResponse: {
              name: this.extractToolName(nextMsg, messages, i),
              response: { content: nextMsg.content || '' },
            },
          });
        }

        geminiContents.push({
          role: 'user',
          parts: functionResponseParts,
        });
        continue;
      }

      // Handle assistant messages with tool calls -> model message with functionCall parts
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const parts: GeminiPart[] = [];

        // Add text content first
        if (msg.content) {
          parts.push({ text: msg.content });
        }

        // Add functionCall parts
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            // Keep empty args
          }
          const functionCallPart: GeminiPart = {
            functionCall: {
              name: tc.function.name,
              args,
            },
          };

          const thoughtSignature = tc.extra_content?.google?.thought_signature;
          if (thoughtSignature) {
            functionCallPart.thoughtSignature = thoughtSignature;
          }

          parts.push(functionCallPart);
        }

        geminiContents.push({
          role: 'model',
          parts,
        });
        continue;
      }

      // Handle user message with attachments (per-message or global fallback)
      const msgAttachments = msg.attachments || (isLastUserMessage ? attachments : undefined);
      if (msg.role === 'user' && msgAttachments && msgAttachments.length > 0) {
        const parts: GeminiPart[] = [];

        for (const att of msgAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          parts.push({
            inlineData: {
              mimeType: att.mimeType || (att.type === 'image' ? 'image/jpeg' : 'application/pdf'),
              data: base64,
            },
          });
        }

        parts.push({ text: msg.content || '' });

        geminiContents.push({
          role: 'user',
          parts,
        });
        continue;
      }

      // Regular user or assistant message
      if (msg.role === 'user') {
        geminiContents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }],
        });
      } else if (msg.role === 'assistant') {
        geminiContents.push({
          role: 'model',
          parts: [{ text: msg.content || '' }],
        });
      }
    }

    // Gemini requires alternating user/model turns - merge consecutive same-role messages
    return this.mergeConsecutiveMessages(geminiContents);
  }

  /**
   * Merge consecutive messages with the same role.
   * Gemini requires strict user/model alternation.
   */
  private mergeConsecutiveMessages(contents: GeminiContent[]): GeminiContent[] {
    if (contents.length === 0) return contents;

    const merged: GeminiContent[] = [contents[0]];

    for (let i = 1; i < contents.length; i++) {
      const current = contents[i];
      const last = merged[merged.length - 1];

      // Preserve tool/thinking parts exactly; only merge plain text-like messages.
      const hasSensitiveParts = this.hasToolOrThinkingParts(current) || this.hasToolOrThinkingParts(last);
      if (current.role === last.role && !hasSensitiveParts) {
        last.parts = [...last.parts, ...current.parts];
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  private hasToolOrThinkingParts(content: GeminiContent): boolean {
    return content.parts.some((part) =>
      !!part.functionCall ||
      !!part.functionResponse ||
      typeof part.thoughtSignature === 'string' ||
      typeof part.thought_signature === 'string'
    );
  }

  /**
   * Extract tool name from a tool result message by finding the matching tool call
   * in the preceding assistant message.
   */
  private extractToolName(
    toolMsg: CanonicalMessage,
    allMessages: CanonicalMessage[],
    currentIndex: number
  ): string {
    // Look backwards for an assistant message with matching tool_call_id
    for (let j = currentIndex - 1; j >= 0; j--) {
      const prev = allMessages[j];
      if (prev.role === 'assistant' && prev.tool_calls) {
        const match = prev.tool_calls.find(tc => tc.id === toolMsg.tool_call_id);
        if (match) return match.function.name;
      }
    }
    // Fallback: use tool_call_id as name (shouldn't happen in practice)
    return toolMsg.tool_call_id || 'unknown_tool';
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
let googleRuntimeInstance: GoogleRuntime | null = null;

export function getGoogleRuntime(): GoogleRuntime {
  if (!googleRuntimeInstance) {
    googleRuntimeInstance = new GoogleRuntime();
  }
  return googleRuntimeInstance;
}
