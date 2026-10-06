/**
 * AI Proxy Stream V2
 *
 * Versioned streaming endpoint using the canonical tool calling protocol.
 *
 * Key differences from V1:
 * 1. Tool results are in messages (role: 'tool'), not a separate field
 * 2. All provider transformations happen server-side via provider runtimes
 * 3. Emits only canonical SSE events
 * 4. Enhanced trace logging for debugging
 */

import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { isForcedToolChoice, shouldRetryUnforced } from './toolChoiceFallback';
import { getAuth } from 'firebase-admin/auth';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';
import { recordUsageInternal, enforceFreeTierForInteraction } from './usageTracking';
import { ProviderRegistry, isV2Supported } from './providers/registry';
import { generateTraceId, createErrorEvent } from './providers/base-runtime';
import { normalizeProviderTemperature, resolveProviderModelId } from './modelRegistry';
import type {
  CanonicalStreamRequest,
  CanonicalSSEEvent,
  CanonicalToolCall,
} from './types/canonical';

// ============================================================================
// Types
// ============================================================================

interface SSEWriter {
  write(event: CanonicalSSEEvent): void;
  end(): void;
}

// ============================================================================
// SSE Helpers
// ============================================================================

function createSSEWriter(res: any): SSEWriter {
  return {
    write(event: CanonicalSSEEvent) {
      // Map canonical events to the format expected by the client
      // The client expects the legacy format for backwards compatibility
      const clientEvent = mapToClientFormat(event);
      res.write(`data: ${JSON.stringify(clientEvent)}\n\n`);
    },
    end() {
      res.end();
    },
  };
}

/**
 * Map canonical events to client-expected format
 * This maintains backwards compatibility with the existing StreamingClient
 */
function mapToClientFormat(event: CanonicalSSEEvent): Record<string, unknown> {
  switch (event.type) {
    case 'text_delta':
      return { type: 'delta', text: event.delta };

    case 'tool_call_start':
      return {
        type: 'tool_call_start',
        toolCallId: event.id,
        toolName: event.name,
      };

    case 'tool_call_delta':
      // Client doesn't currently use delta events, but include for completeness
      return {
        type: 'tool_call_delta',
        toolCallId: event.id,
        argumentsDelta: event.arguments_delta,
      };

    case 'tool_call_complete':
      return {
        type: 'tool_call_done',
        toolCall: event.tool_call,
      };

    case 'message_complete':
      return {
        type: 'done',
        usage: event.usage ? {
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
        } : undefined,
        modelUsed: event.model,
        finishReason: event.finish_reason,
        toolCalls: event.tool_calls,
        requiresToolExecution: event.finish_reason === 'tool_calls' &&
          Array.isArray(event.tool_calls) &&
          event.tool_calls.length > 0,
      };

    case 'error':
      return {
        type: 'error',
        error: event.message,
        code: event.code,
      };

    default:
      return event as Record<string, unknown>;
  }
}

// ============================================================================
// Auth
// ============================================================================

async function verifyAuthToken(authHeader: string | undefined): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpsError('unauthenticated', 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    throw new HttpsError('unauthenticated', 'Invalid or expired auth token');
  }
}

// ============================================================================
// Message Normalization
// ============================================================================

/**
 * Normalize incoming messages from client format to canonical format.
 * Client sends camelCase (toolCallId, toolCalls), canonical uses snake_case.
 */
interface ClientMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  // Client format (camelCase)
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  // Canonical format (snake_case) - may already be present
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  // Per-message attachments for persisting file context across conversation history
  attachments?: import('./types/canonical').CanonicalAttachment[];
}

function normalizeMessages(messages: ClientMessage[]): import('./types/canonical').CanonicalMessage[] {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    // Accept both camelCase and snake_case
    tool_call_id: msg.tool_call_id || msg.toolCallId,
    tool_calls: msg.tool_calls || msg.toolCalls,
    // Pass through per-message attachments
    attachments: msg.attachments,
  }));
}

// ============================================================================
// Provider Display Names
// ============================================================================

const PROVIDER_NAMES: Record<string, string> = {
  claude: 'Claude',
  openai: 'ChatGPT',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  grok: 'Grok',
  cohere: 'Cohere',
  moonshot: 'Kimi',
  zai: 'GLM',
};

// ============================================================================
// V2 Streaming Endpoint
// ============================================================================

export const proxyAIRequestStreamV2 = onRequest(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    cors: ['https://symposiumai.app', 'https://www.symposiumai.app', 'http://localhost:3000'],
    secrets: [encryptionKey],
  },
  async (req, res) => {
    const traceId = generateTraceId();
    const startTime = Date.now();

    // Log request start
    console.log(JSON.stringify({
      traceId,
      event: 'request_start',
      timestamp: startTime,
      method: req.method,
    }));

    // Only allow POST
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Trace-Id', traceId);

    const writer = createSSEWriter(res);

    try {
      // Verify authentication
      const uid = await verifyAuthToken(req.headers.authorization);

      // Check encryption key
      const keyValue = encryptionKey.value();
      if (!keyValue) {
        writer.write(createErrorEvent('Encryption not configured', 'internal'));
        writer.end();
        return;
      }

      // Parse request
      const data = req.body;
      const {
        providerId,
        model,
        messages: rawMessages,
        systemPrompt,
        maxTokens,
        temperature = 0.7,
        tools,
        toolChoice,
        sessionId,
        sessionType,
        interactionId,
        attachments,
      } = data;

      // Validate provider is supported by V2
      if (!providerId || !isV2Supported(providerId)) {
        writer.write(createErrorEvent(
          `Provider '${providerId}' is not supported by V2 endpoint. Use V1 endpoint instead.`,
          'invalid-argument'
        ));
        writer.end();
        return;
      }
      const resolvedModel = resolveProviderModelId(providerId, model);
      if (!resolvedModel) {
        writer.write(createErrorEvent(
          `No model configured for provider '${providerId}'.`,
          'invalid-argument'
        ));
        writer.end();
        return;
      }
      const resolvedTemperature = normalizeProviderTemperature(
        providerId,
        resolvedModel,
        typeof temperature === 'number' ? temperature : 0.7
      );

      // Validate messages
      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        writer.write(createErrorEvent('Messages are required', 'invalid-argument'));
        writer.end();
        return;
      }

      // Normalize messages from client format to canonical format
      const messages = normalizeMessages(rawMessages as ClientMessage[]);

      // Log request details
      console.log(JSON.stringify({
        traceId,
        event: 'request_parsed',
        providerId,
        model: resolvedModel,
        messageCount: messages.length,
        hasTools: !!(tools && tools.length > 0),
        toolCount: tools?.length || 0,
        toolNames: tools?.map((t: { name: string }) => t.name) || [],
        hasToolResultsInHistory: messages.some(m => m.role === 'tool'),
        messageRoles: messages.map(m => ({ role: m.role, hasToolCallId: !!m.tool_call_id, hasToolCalls: !!(m.tool_calls && m.tool_calls.length > 0) })),
      }));

      // Server-authoritative free-tier gate. No-op unless the client sends an
      // interactionId (premium/trial users always pass); rejects non-premium
      // callers who have exhausted the free tier, so the limit can't be bypassed
      // by calling the proxy directly.
      const freeTierGate = await enforceFreeTierForInteraction(uid, sessionType, interactionId);
      if (!freeTierGate.allowed) {
        writer.write(createErrorEvent(
          'You have used all of your free interactions. Subscribe to keep going.',
          'resource-exhausted'
        ));
        writer.end();
        return;
      }

      // Get API key
      const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
      if (!apiKey) {
        const displayName = PROVIDER_NAMES[providerId] || 'AI';
        writer.write(createErrorEvent(
          `No API key configured for ${displayName}. Please add your API key in Settings.`,
          'failed-precondition'
        ));
        writer.end();
        return;
      }

      // Get provider runtime
      const runtime = ProviderRegistry.get(providerId);

      // Build provider-specific request
      const sendToProvider = async (choice: typeof toolChoice) => {
        const builtRequest = runtime.buildRequest(
          {
            model: resolvedModel,
            messages,
            systemPrompt,
            maxTokens,
            temperature: resolvedTemperature,
            tools,
            toolChoice: choice,
            attachments,
          },
          apiKey
        );

        // Log outgoing request (redacted)
        console.log(JSON.stringify({
          traceId,
          event: 'provider_request',
          providerId,
          url: builtRequest.url,
          hasBody: !!builtRequest.body,
          messageCount: (builtRequest.body as any)?.messages?.length || 0,
        }));

        return fetch(builtRequest.url, {
          method: 'POST',
          headers: builtRequest.headers,
          body: JSON.stringify(builtRequest.body),
        });
      };

      // Make request to provider
      let response = await sendToProvider(toolChoice);
      let preReadErrorText: string | undefined;

      // Analyze Team mode forces its first round; models that can't be forced
      // get the same request once more, unforced (see toolChoiceFallback).
      if (!response.ok && response.status === 400 && isForcedToolChoice(toolChoice)) {
        const text = await response.text();
        if (shouldRetryUnforced(response.status, text, toolChoice)) {
          console.warn(JSON.stringify({ traceId, event: 'tool_choice_unsupported_retry', providerId, model: resolvedModel }));
          response = await sendToProvider(undefined);
        } else {
          preReadErrorText = text;
        }
      }

      if (!response.ok) {
        const errorText = preReadErrorText ?? await response.text();

        // Log detailed error info including request shape
        console.error(JSON.stringify({
          traceId,
          event: 'provider_error',
          status: response.status,
          error: errorText.slice(0, 1000),
          requestShape: {
            messageCount: messages.length,
            messageRoles: messages.map(m => m.role),
            hasToolMessages: messages.some(m => m.role === 'tool'),
            toolMessageCount: messages.filter(m => m.role === 'tool').length,
            assistantWithToolCalls: messages.filter(m => m.role === 'assistant' && m.tool_calls?.length).length,
          },
        }));

        const displayName = PROVIDER_NAMES[providerId] || 'AI';
        let userMessage = `${displayName} encountered an error. Please try again.`;
        let code = 'internal';

        // Try to parse error for more details
        let errorDetails = '';
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) {
            errorDetails = parsed.error.message;
          }
        } catch {
          // Not JSON, use raw text
          errorDetails = errorText.slice(0, 200);
        }

        if (response.status === 401 || response.status === 403) {
          userMessage = `Your ${displayName} API key is invalid. Please update it in Settings.`;
          code = 'permission-denied';
        } else if (response.status === 429) {
          userMessage = `${displayName} is rate limiting requests. Please wait and try again.`;
          code = 'resource-exhausted';
        } else if (response.status === 400) {
          userMessage = `${displayName} couldn't process this request.`;
          // Include error details for 400 errors to help debugging
          if (errorDetails) {
            console.error(`[${traceId}] 400 error details: ${errorDetails}`);
          }
          code = 'invalid-argument';
        }

        writer.write(createErrorEvent(userMessage, code));
        writer.end();
        return;
      }

      // Stream and parse response
      const responseBody = response.body;
      if (!responseBody) {
        writer.write(createErrorEvent('No response body from provider', 'internal'));
        writer.end();
        return;
      }

      // Track metrics for logging
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason = 'stop';
      let toolCallsDetected: CanonicalToolCall[] = [];

      // Parse and forward events
      for await (const event of runtime.streamParse(responseBody, traceId)) {
        // Track metrics from message_complete
        if (event.type === 'message_complete') {
          if (event.usage) {
            inputTokens = event.usage.inputTokens;
            outputTokens = event.usage.outputTokens;
          }
          finishReason = event.finish_reason;
          if (event.tool_calls) {
            toolCallsDetected = event.tool_calls;
          }
        }

        // Forward event to client
        writer.write(event);
      }

      // Log completion
      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        traceId,
        event: 'stream_complete',
        providerId,
        model: resolvedModel,
        duration,
        inputTokens,
        outputTokens,
        finishReason,
        toolCallsDetected: toolCallsDetected.length,
        toolNames: toolCallsDetected.map(tc => tc.function.name),
      }));

      // Record usage (non-blocking)
      if (inputTokens > 0 || outputTokens > 0) {
        recordUsageInternal(uid, {
          messageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sessionId: sessionId || 'unknown',
          providerId,
          modelId: resolvedModel,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          sessionType: sessionType || 'analyze',
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Failed to record usage:', err);
        });
      }

      writer.end();

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(JSON.stringify({
        traceId,
        event: 'request_error',
        duration,
        error: error.message || 'Unknown error',
        stack: error.stack?.slice(0, 500),
      }));

      const displayName = PROVIDER_NAMES[req.body?.providerId] || 'AI';
      writer.write(createErrorEvent(
        `${displayName} encountered an error. Please try again.`,
        'internal'
      ));
      writer.end();
    }
  }
);
