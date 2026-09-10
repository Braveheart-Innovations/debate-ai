/**
 * OpenAI Responses API support
 *
 * Some OpenAI models are only fully usable through /v1/responses:
 * - gpt-6-astra rejects function tools on /v1/chat/completions with every
 *   reasoning_effort and does not accept reasoning_effort 'none'
 *   (live-verified 2026-09-10), so tool calling is impossible there.
 * - gpt-5.5-pro is not served on /v1/chat/completions at all.
 *
 * This module translates the canonical request/message format to Responses
 * input items and the Responses SSE event stream back to canonical events.
 * It is shared by the V2 streaming runtime and the callable (non-streaming)
 * proxy so both paths speak the same dialect.
 */

import type {
  CanonicalAttachment,
  CanonicalMessage,
  CanonicalSSEEvent,
  CanonicalToolCall,
  CanonicalToolChoice,
  CanonicalToolDefinition,
} from '../../types/canonical';
import {
  completeToolCall,
  getBase64Data,
  parseSSEStream,
  type CanonicalFinishReason,
  type ToolCallInProgress,
} from '../base-runtime';

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// ============================================================================
// Responses API shapes (subset we use)
// ============================================================================

type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }
  | { type: 'input_file'; filename: string; file_data: string };

export type ResponsesInputItem =
  | { role: 'user'; content: string | ResponsesContentPart[] }
  | { role: 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

export interface ResponsesFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: CanonicalToolDefinition['parameters'];
}

export interface ResponsesBodyInput {
  model: string;
  messages: CanonicalMessage[];
  systemPrompt?: string;
  attachments?: CanonicalAttachment[];
  maxTokens?: number;
  tools?: CanonicalToolDefinition[];
  toolChoice?: CanonicalToolChoice;
  stream: boolean;
}

// ============================================================================
// Request transformers
// ============================================================================

export function transformToolsForResponses(tools: CanonicalToolDefinition[]): ResponsesFunctionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export function transformToolChoiceForResponses(
  choice: CanonicalToolChoice
): 'auto' | 'none' | 'required' | { type: 'function'; name: string } {
  if (choice === 'auto') return 'auto';
  if (choice === 'none') return 'none';
  if (choice === 'required') return 'required';
  if (typeof choice === 'object' && choice.name) {
    return { type: 'function', name: choice.name };
  }
  return 'auto';
}

function buildUserContent(
  text: string,
  attachments: CanonicalAttachment[] | undefined
): string | ResponsesContentPart[] {
  if (!attachments || attachments.length === 0) return text;

  const parts: ResponsesContentPart[] = [];
  for (const att of attachments) {
    const base64 = getBase64Data(att);
    if (!base64) continue;
    if (att.type === 'image') {
      parts.push({
        type: 'input_image',
        image_url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}`,
      });
    } else if (att.type === 'document') {
      parts.push({
        type: 'input_file',
        filename: att.fileName || 'document.pdf',
        file_data: `data:${att.mimeType || 'application/pdf'};base64,${base64}`,
      });
    }
  }
  parts.push({ type: 'input_text', text });
  return parts.length > 1 ? parts : text;
}

/**
 * Convert canonical messages into Responses `instructions` + `input` items.
 *
 * - The system prompt (explicit or the first system message) becomes
 *   `instructions`.
 * - Assistant tool calls become `function_call` items, tool results become
 *   `function_call_output` items keyed by call_id. Reasoning items are not
 *   replayed; OpenAI accepts a function_call/function_call_output pair on its
 *   own (live-verified 2026-09-10 with gpt-6-astra).
 * - Attachments on a message (or the request-level attachments for the last
 *   user message) become input_image / input_file parts.
 */
export function buildResponsesInput(
  messages: CanonicalMessage[],
  systemPrompt?: string,
  requestAttachments?: CanonicalAttachment[]
): { instructions?: string; input: ResponsesInputItem[] } {
  const instructions = systemPrompt || messages.find(m => m.role === 'system')?.content || undefined;
  const conversation = messages.filter(m => m.role !== 'system');
  const input: ResponsesInputItem[] = [];

  for (let i = 0; i < conversation.length; i++) {
    const msg = conversation[i];
    const isLastUserMessage = msg.role === 'user' && i === conversation.length - 1;

    if (msg.role === 'tool' && msg.tool_call_id) {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        output: msg.content || '',
      });
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.content) {
        input.push({ role: 'assistant', content: msg.content });
      }
      for (const tc of msg.tool_calls || []) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments || '{}',
        });
      }
      continue;
    }

    if (msg.role === 'user') {
      const attachments = msg.attachments || (isLastUserMessage ? requestAttachments : undefined);
      input.push({ role: 'user', content: buildUserContent(msg.content || '', attachments) });
    }
  }

  return { instructions, input };
}

/**
 * Build a Responses API request body. Temperature is never sent: the models
 * routed here reject it outright ("'temperature' is not supported with this
 * model", live-verified 2026-09-10). `store: false` keeps the conversation
 * stateless on OpenAI's side, matching the chat-completions behaviour.
 */
export function buildResponsesBody(params: ResponsesBodyInput): Record<string, unknown> {
  const { instructions, input } = buildResponsesInput(
    params.messages,
    params.systemPrompt,
    params.attachments
  );

  const body: Record<string, unknown> = {
    model: params.model,
    input,
    store: false,
    stream: params.stream,
  };
  if (instructions) body.instructions = instructions;
  if (params.maxTokens !== undefined) body.max_output_tokens = params.maxTokens;
  if (params.tools && params.tools.length > 0) {
    body.tools = transformToolsForResponses(params.tools);
    if (params.toolChoice) {
      body.tool_choice = transformToolChoiceForResponses(params.toolChoice);
    }
  }
  return body;
}

// ============================================================================
// Response parsing
// ============================================================================

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface ResponsesOutputItem {
  type: string;
  id?: string;
  status?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type: string; text?: string }>;
}

interface ResponsesObject {
  status?: string;
  output?: ResponsesOutputItem[];
  usage?: ResponsesUsage;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string; code?: string } | null;
}

function mapResponsesStatus(
  response: ResponsesObject | undefined,
  hasToolCalls: boolean
): CanonicalFinishReason {
  if (response?.status === 'incomplete') {
    const reason = response.incomplete_details?.reason;
    if (reason === 'max_output_tokens') return 'length';
    if (reason === 'content_filter') return 'content_filter';
    return 'stop';
  }
  if (response?.status === 'failed') return 'error';
  return hasToolCalls ? 'tool_calls' : 'stop';
}

function toolCallFromItem(item: ResponsesOutputItem): CanonicalToolCall {
  return {
    id: item.call_id || item.id || '',
    type: 'function',
    function: {
      name: item.name || '',
      arguments: item.arguments || '{}',
    },
  };
}

/**
 * Parse a non-streaming Responses object.
 */
export function parseResponsesOutput(response: ResponsesObject): {
  content: string;
  toolCalls: CanonicalToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  finishReason: CanonicalFinishReason;
} {
  const textParts: string[] = [];
  const toolCalls: CanonicalToolCall[] = [];

  for (const item of response.output || []) {
    if (item.type === 'message') {
      for (const part of item.content || []) {
        if (part.type === 'output_text' && typeof part.text === 'string') {
          textParts.push(part.text);
        }
      }
    } else if (item.type === 'function_call') {
      toolCalls.push(toolCallFromItem(item));
    }
  }

  return {
    content: textParts.join(''),
    toolCalls,
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    },
    finishReason: mapResponsesStatus(response, toolCalls.length > 0),
  };
}

/**
 * Parse a Responses SSE stream into canonical events.
 *
 * Accepts either a raw byte stream or an already-split iterable of SSE data
 * payloads (so a caller that had to peek at the first event can hand the rest
 * over without re-buffering).
 */
export async function* parseResponsesStream(
  source: ReadableStream<Uint8Array> | AsyncIterable<string>,
  traceId: string
): AsyncGenerator<CanonicalSSEEvent, void, unknown> {
  const dataEvents = source instanceof ReadableStream ? parseSSEStream(source) : source;

  // Keyed by output item id; index = output_index for parallel calls.
  const inProgress = new Map<string, ToolCallInProgress & { index: number }>();
  const completedToolCalls: CanonicalToolCall[] = [];
  let finalResponse: ResponsesObject | undefined;
  let streamError: { message: string; code: string } | undefined;

  for await (const data of dataEvents) {
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }

    switch (event.type) {
      case 'response.output_text.delta':
        if (typeof event.delta === 'string' && event.delta.length > 0) {
          yield { type: 'text_delta', delta: event.delta };
        }
        break;

      case 'response.output_item.added': {
        const item = event.item as ResponsesOutputItem | undefined;
        if (item?.type === 'function_call' && item.id) {
          const index = typeof event.output_index === 'number' ? event.output_index : inProgress.size;
          inProgress.set(item.id, {
            index,
            id: item.call_id || item.id,
            name: item.name || '',
            arguments: item.arguments || '',
          });
          yield {
            type: 'tool_call_start',
            index,
            id: item.call_id || item.id,
            name: item.name || '',
          };
        }
        break;
      }

      case 'response.function_call_arguments.delta': {
        const tc = event.item_id ? inProgress.get(event.item_id) : undefined;
        if (tc && typeof event.delta === 'string') {
          tc.arguments += event.delta;
          yield {
            type: 'tool_call_delta',
            index: tc.index,
            id: tc.id,
            arguments_delta: event.delta,
          };
        }
        break;
      }

      case 'response.output_item.done': {
        const item = event.item as ResponsesOutputItem | undefined;
        if (item?.type === 'function_call' && item.id) {
          const tc = inProgress.get(item.id);
          const completed = tc
            ? completeToolCall({
              ...tc,
              // The done item carries the authoritative, fully assembled arguments.
              arguments: item.arguments ?? tc.arguments,
            })
            : toolCallFromItem(item);
          const index = tc?.index ?? (typeof event.output_index === 'number' ? event.output_index : completedToolCalls.length);
          inProgress.delete(item.id);
          completedToolCalls.push(completed);
          yield { type: 'tool_call_complete', index, tool_call: completed };
        }
        break;
      }

      case 'response.completed':
      case 'response.incomplete':
      case 'response.failed':
        finalResponse = event.response as ResponsesObject;
        if (event.type === 'response.failed') {
          streamError = {
            message: finalResponse?.error?.message || 'OpenAI response failed',
            code: finalResponse?.error?.code || 'internal',
          };
        }
        break;

      case 'error':
        streamError = {
          message: event.message || event.error?.message || 'OpenAI stream error',
          code: event.code || event.error?.code || 'internal',
        };
        break;

      default:
        break;
    }
  }

  // Flush tool calls whose done event never arrived (aborted stream).
  for (const [, tc] of inProgress) {
    const completed = completeToolCall(tc);
    completedToolCalls.push(completed);
    yield { type: 'tool_call_complete', index: tc.index, tool_call: completed };
  }
  inProgress.clear();

  if (streamError) {
    console.error(`[${traceId}] OpenAI Responses stream error: ${streamError.message}`);
    yield { type: 'error', message: streamError.message, code: streamError.code };
  }

  const inputTokens = finalResponse?.usage?.input_tokens || 0;
  const outputTokens = finalResponse?.usage?.output_tokens || 0;

  yield {
    type: 'message_complete',
    finish_reason: streamError ? 'error' : mapResponsesStatus(finalResponse, completedToolCalls.length > 0),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    tool_calls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
  };
}
