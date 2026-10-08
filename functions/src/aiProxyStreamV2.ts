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
import { getAuth } from 'firebase-admin/auth';
import { encryptionKey } from './apiKeys';
import { enforceFreeTierForInteraction } from './usageTracking';
import { generateTraceId, createErrorEvent } from './providers/base-runtime';
import { PROVIDER_NAMES, streamModel, validateModelTarget } from './modelStream';
import type { CanonicalSSEEvent } from './types/canonical';

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

      const target = validateModelTarget(providerId, model);
      if (!target.ok) {
        writer.write(target.error);
        writer.end();
        return;
      }
      if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        writer.write(createErrorEvent('Messages are required', 'invalid-argument'));
        writer.end();
        return;
      }
      const messages = normalizeMessages(rawMessages as ClientMessage[]);

      console.log(JSON.stringify({
        traceId,
        event: 'request_parsed',
        providerId,
        model: target.model,
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

      for await (const event of streamModel({
        uid,
        providerId,
        model,
        messages,
        systemPrompt,
        maxTokens,
        temperature,
        tools,
        toolChoice,
        attachments,
        keyValue,
        sessionId,
        sessionType,
        traceId,
        // End cleanly with an error event before the 540s function timeout.
        timeoutMs: 530_000,
      })) {
        writer.write(event);
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
