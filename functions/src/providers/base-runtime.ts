/**
 * Base Runtime Utilities
 *
 * Shared utilities for all provider runtimes including:
 * - SSE stream parsing
 * - Logging helpers
 * - Common transformations
 */

import type {
  CanonicalMessage,
  CanonicalToolCall,
  CanonicalSSEEvent,
  CanonicalAttachment,
} from '../types/canonical';
import type { ProviderLogger, TraceLogEntry } from './types';

// ============================================================================
// SSE Stream Parsing
// ============================================================================

/**
 * Parse SSE events from a ReadableStream.
 * Yields individual SSE data payloads as strings.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data !== '[DONE]') {
            yield data;
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      if (data !== '[DONE]') {
        yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Create a console-based logger
 */
export function createConsoleLogger(): ProviderLogger {
  return {
    log(entry: TraceLogEntry) {
      console.log(JSON.stringify({
        ...entry,
        level: 'info',
      }));
    },
    error(entry: TraceLogEntry & { error: Error | string }) {
      console.error(JSON.stringify({
        ...entry,
        level: 'error',
        error: entry.error instanceof Error ? entry.error.message : entry.error,
      }));
    },
  };
}

/**
 * Generate a trace ID for request tracking
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `trace_${timestamp}_${random}`;
}

// ============================================================================
// Attachment Helpers
// ============================================================================

/**
 * Extract base64 data from an attachment
 */
export function getBase64Data(attachment: CanonicalAttachment): string {
  if (attachment.base64) {
    return attachment.base64;
  }
  const base64Index = attachment.uri.indexOf('base64,');
  if (base64Index >= 0) {
    return attachment.uri.slice(base64Index + 7);
  }
  return '';
}

/**
 * Get attachments for the last user message
 */
export function getLastUserMessageAttachments(
  messages: CanonicalMessage[],
  attachments?: CanonicalAttachment[]
): CanonicalAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  // Find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return attachments;
    }
  }
  return undefined;
}

// ============================================================================
// Tool Call Helpers
// ============================================================================

/**
 * In-progress tool call tracking
 */
export interface ToolCallInProgress {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Convert in-progress tool call to canonical format
 */
export function completeToolCall(inProgress: ToolCallInProgress): CanonicalToolCall {
  return {
    id: inProgress.id,
    type: 'function',
    function: {
      name: inProgress.name,
      arguments: inProgress.arguments,
    },
  };
}

// ============================================================================
// Message Filtering
// ============================================================================

/**
 * Filter out system messages (handled separately by most providers)
 */
export function filterSystemMessages(messages: CanonicalMessage[]): CanonicalMessage[] {
  return messages.filter(m => m.role !== 'system');
}

/**
 * Extract system prompt from messages
 */
export function extractSystemPrompt(
  messages: CanonicalMessage[],
  explicitSystemPrompt?: string
): string | undefined {
  if (explicitSystemPrompt) return explicitSystemPrompt;

  const systemMessage = messages.find(m => m.role === 'system');
  return systemMessage?.content || undefined;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Create a canonical error event
 */
export function createErrorEvent(message: string, code: string, details?: unknown): CanonicalSSEEvent {
  return {
    type: 'error',
    message,
    code,
    ...(details !== undefined ? { details } : {}),
  };
}

/**
 * Map HTTP status to error code
 */
export function httpStatusToErrorCode(status: number): string {
  switch (status) {
    case 400: return 'invalid-argument';
    case 401:
    case 403: return 'permission-denied';
    case 404: return 'not-found';
    case 429: return 'resource-exhausted';
    case 500:
    case 502:
    case 503: return 'internal';
    default: return 'unknown';
  }
}

// ============================================================================
// Finish Reason Mapping
// ============================================================================

/**
 * Map provider-specific stop reasons to canonical finish reasons
 */
export type CanonicalFinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';

/**
 * Map Claude stop reasons to canonical
 */
export function mapClaudeStopReason(stopReason: string): CanonicalFinishReason {
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    default:
      return 'stop';
  }
}

/**
 * Map OpenAI finish reasons to canonical
 */
export function mapOpenAIFinishReason(finishReason: string): CanonicalFinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'stop';
  }
}

/**
 * Map Gemini finish reasons to canonical
 */
export function mapGeminiFinishReason(finishReason: string): CanonicalFinishReason {
  switch (finishReason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
    case 'TOOL_CALLS':
      return 'tool_calls';
    default:
      return 'stop';
  }
}
