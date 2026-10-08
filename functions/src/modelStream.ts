/**
 * One model call, streamed as canonical events.
 *
 * Shared by the V2 SSE proxy (Chat, and Analyze until Phase 3 lands) and the
 * server-side Analyze loop. Owns everything between "here is a canonical
 * request for this user" and "here are the provider's events": model and
 * temperature resolution, key decryption, the unforced-resend fallback,
 * provider error mapping, stream parsing, an abort/timeout signal, and usage
 * recording. The caller owns transport (SSE, Firestore events) and gating.
 */

import { isForcedToolChoice, shouldRetryUnforced } from './toolChoiceFallback';
import { getDecryptedApiKey } from './apiKeys';
import { recordUsageInternal, type SessionType } from './usageTracking';
import { ProviderRegistry, isV2Supported } from './providers/registry';
import { generateTraceId, createErrorEvent } from './providers/base-runtime';
import { normalizeProviderTemperature, resolveProviderModelId } from './modelRegistry';
import type {
  CanonicalAttachment,
  CanonicalMessage,
  CanonicalSSEEvent,
  CanonicalToolDefinition,
  CanonicalToolCall,
  CanonicalToolChoice,
} from './types/canonical';

export const PROVIDER_NAMES: Record<string, string> = {
  claude: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  grok: 'Grok',
  cohere: 'Cohere',
  moonshot: 'Kimi',
  zai: 'GLM',
};

export interface ModelStreamRequest {
  uid: string;
  providerId: string;
  /** Model id or alias; resolved against the provider's registry. */
  model?: string;
  messages: CanonicalMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  /** Requested temperature; normalized per model (some models require 1). */
  temperature?: number;
  tools?: CanonicalToolDefinition[];
  toolChoice?: CanonicalToolChoice;
  attachments?: CanonicalAttachment[];
  /** `encryptionKey.value()` — the caller's function must declare the secret. */
  keyValue: string;
  sessionId?: string;
  sessionType?: SessionType;
  traceId?: string;
  /** Caller cancellation (e.g. the Analyze server loop's Stop). */
  signal?: AbortSignal;
  /** Ceiling for the whole call, including the stream. */
  timeoutMs?: number;
}

/** Injectable for tests; production uses the real implementations. */
export interface ModelStreamDeps {
  getApiKey: (uid: string, providerId: string, keyValue: string) => Promise<string | null>;
  fetch: typeof fetch;
  recordUsage: typeof recordUsageInternal;
}

const defaultDeps: ModelStreamDeps = {
  getApiKey: getDecryptedApiKey,
  fetch: (...args) => fetch(...args),
  recordUsage: recordUsageInternal,
};

/** Error codes for the two ways a call ends early on purpose. */
export const CANCELLED_CODE = 'cancelled';
export const DEADLINE_CODE = 'deadline-exceeded';

/** User-facing message + code for a provider HTTP failure. */
export function mapProviderError(
  providerId: string,
  status: number,
): { message: string; code: string } {
  const displayName = PROVIDER_NAMES[providerId] || 'AI';
  if (status === 401 || status === 403) {
    return { message: `Your ${displayName} API key is invalid. Please update it in Settings.`, code: 'permission-denied' };
  }
  if (status === 429) {
    return { message: `${displayName} is rate limiting requests. Please wait and try again.`, code: 'resource-exhausted' };
  }
  if (status === 400) {
    return { message: `${displayName} couldn't process this request.`, code: 'invalid-argument' };
  }
  return { message: `${displayName} encountered an error. Please try again.`, code: 'internal' };
}

/**
 * Request checks that need no key or network: provider support and model
 * resolution. Exported so a caller can reject before metering (the V2 proxy
 * runs it ahead of the free-tier gate).
 */
export function validateModelTarget(
  providerId: string,
  model: string | undefined,
): { ok: true; model: string } | { ok: false; error: CanonicalSSEEvent } {
  if (!providerId || !isV2Supported(providerId)) {
    return { ok: false, error: createErrorEvent(`Provider '${providerId}' is not supported by V2 endpoint. Use V1 endpoint instead.`, 'invalid-argument') };
  }
  const resolved = resolveProviderModelId(providerId, model);
  if (!resolved) {
    return { ok: false, error: createErrorEvent(`No model configured for provider '${providerId}'.`, 'invalid-argument') };
  }
  return { ok: true, model: resolved };
}

/**
 * Stream one model call. Never throws: every failure ends the stream with a
 * single canonical `error` event (cancellation → code `cancelled`, timeout →
 * `deadline-exceeded`). A successful stream ends with `message_complete`, and
 * usage is recorded (awaited) before the generator returns.
 */
export async function* streamModel(
  request: ModelStreamRequest,
  deps: ModelStreamDeps = defaultDeps,
): AsyncGenerator<CanonicalSSEEvent> {
  // A plain (ref'd) timer, cleared when the call ends. AbortSignal.timeout()
  // is unref'd and never fires once nothing else keeps the process busy.
  const deadline = new AbortController();
  const timer = request.timeoutMs ? setTimeout(() => deadline.abort(), request.timeoutMs) : undefined;
  try {
    yield* streamModelCall(request, deps, timer ? deadline.signal : undefined);
  } finally {
    clearTimeout(timer);
  }
}

async function* streamModelCall(
  request: ModelStreamRequest,
  deps: ModelStreamDeps,
  timeoutSignal: AbortSignal | undefined,
): AsyncGenerator<CanonicalSSEEvent> {
  const traceId = request.traceId ?? generateTraceId();
  const startTime = Date.now();
  const { providerId } = request;
  const displayName = PROVIDER_NAMES[providerId] || 'AI';

  const target = validateModelTarget(providerId, request.model);
  if (!target.ok) {
    yield target.error;
    return;
  }
  const resolvedModel = target.model;
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    yield createErrorEvent('Messages are required', 'invalid-argument');
    return;
  }
  const temperature = normalizeProviderTemperature(
    providerId,
    resolvedModel,
    typeof request.temperature === 'number' ? request.temperature : 0.7,
  );

  const apiKey = await deps.getApiKey(request.uid, providerId, request.keyValue);
  if (!apiKey) {
    yield createErrorEvent(`No API key configured for ${displayName}. Please add your API key in Settings.`, 'failed-precondition');
    return;
  }

  const signals = [request.signal, timeoutSignal].filter((s): s is AbortSignal => Boolean(s));
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const abortedEvent = (): CanonicalSSEEvent => (timeoutSignal?.aborted
    ? createErrorEvent(`${displayName} took too long to respond.`, DEADLINE_CODE)
    : createErrorEvent('Request was cancelled.', CANCELLED_CODE));

  const runtime = ProviderRegistry.get(providerId);
  const send = (toolChoice: CanonicalToolChoice | undefined) => {
    const built = runtime.buildRequest({
      model: resolvedModel,
      messages: request.messages,
      systemPrompt: request.systemPrompt,
      maxTokens: request.maxTokens,
      temperature,
      tools: request.tools,
      toolChoice,
      attachments: request.attachments,
    }, apiKey);
    console.log(JSON.stringify({
      traceId,
      event: 'provider_request',
      providerId,
      url: built.url,
      hasBody: !!built.body,
      messageCount: (built.body as { messages?: unknown[] } | undefined)?.messages?.length || 0,
    }));
    return deps.fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal,
    });
  };

  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = 'stop';
  let toolCallsDetected: CanonicalToolCall[] = [];

  try {
    let response = await send(request.toolChoice);
    let preReadErrorText: string | undefined;

    // Analyze Team mode forces its first round; models that can't be forced
    // get the same request once more, unforced (see toolChoiceFallback).
    if (!response.ok && response.status === 400 && isForcedToolChoice(request.toolChoice)) {
      const text = await response.text();
      if (shouldRetryUnforced(response.status, text, request.toolChoice)) {
        console.warn(JSON.stringify({ traceId, event: 'tool_choice_unsupported_retry', providerId, model: resolvedModel }));
        response = await send(undefined);
      } else {
        preReadErrorText = text;
      }
    }

    if (!response.ok) {
      const errorText = preReadErrorText ?? await response.text();
      const messages = request.messages;
      console.error(JSON.stringify({
        traceId,
        event: 'provider_error',
        status: response.status,
        error: errorText.slice(0, 1000),
        requestShape: {
          messageCount: messages.length,
          messageRoles: messages.map((m) => m.role),
          hasToolMessages: messages.some((m) => m.role === 'tool'),
          toolMessageCount: messages.filter((m) => m.role === 'tool').length,
          assistantWithToolCalls: messages.filter((m) => m.role === 'assistant' && m.tool_calls?.length).length,
        },
      }));
      const mapped = mapProviderError(providerId, response.status);
      yield createErrorEvent(mapped.message, mapped.code);
      return;
    }

    if (!response.body) {
      yield createErrorEvent('No response body from provider', 'internal');
      return;
    }

    for await (const event of runtime.streamParse(response.body, traceId)) {
      if (event.type === 'message_complete') {
        if (event.usage) {
          inputTokens = event.usage.inputTokens;
          outputTokens = event.usage.outputTokens;
        }
        finishReason = event.finish_reason;
        if (event.tool_calls) toolCallsDetected = event.tool_calls;
      }
      yield event;
    }
  } catch (error) {
    if (signal?.aborted) {
      console.log(JSON.stringify({ traceId, event: 'stream_aborted', providerId, timedOut: Boolean(timeoutSignal?.aborted) }));
      yield abortedEvent();
      return;
    }
    console.error(JSON.stringify({
      traceId,
      event: 'request_error',
      duration: Date.now() - startTime,
      error: (error as Error)?.message || 'Unknown error',
      stack: (error as Error)?.stack?.slice(0, 500),
    }));
    yield createErrorEvent(`${displayName} encountered an error. Please try again.`, 'internal');
    return;
  }

  // A stream that ends because the signal fired (the runtime stops reading
  // without throwing) is still an abort, not a completion.
  if (signal?.aborted) {
    yield abortedEvent();
    return;
  }

  console.log(JSON.stringify({
    traceId,
    event: 'stream_complete',
    providerId,
    model: resolvedModel,
    duration: Date.now() - startTime,
    inputTokens,
    outputTokens,
    finishReason,
    toolCallsDetected: toolCallsDetected.length,
    toolNames: toolCallsDetected.map((tc) => tc.function.name),
  }));

  // Awaited: gen2 may stop the CPU once the response ends, losing a
  // fire-and-forget write.
  if (inputTokens > 0 || outputTokens > 0) {
    try {
      await deps.recordUsage(request.uid, {
        messageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sessionId: request.sessionId || 'unknown',
        providerId,
        modelId: resolvedModel,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        sessionType: request.sessionType || 'analyze',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to record usage:', error);
    }
  }
}
