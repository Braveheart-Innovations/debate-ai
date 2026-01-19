/**
 * Extracts a user-friendly error message from SSE error events.
 *
 * SSE error events can contain error information in various formats:
 * - { data: '{"error":{"message":"..."}}' } - OpenAI/DeepSeek style
 * - { data: '{"message":"..."}' } - Simple JSON
 * - { message: "..." } - Direct message property
 * - { status: 401 } - HTTP status code
 *
 * This utility normalizes all formats into user-friendly messages.
 */

export interface SSEErrorEvent {
  data?: string;
  message?: string | object;
  error?: string | object;
  status?: number;
  type?: string;
}

/**
 * Extract a user-friendly error message from an SSE error event.
 *
 * @param error - The error event from EventSource
 * @param defaultMessage - Fallback message if extraction fails
 * @returns A user-friendly error message string
 */
export function extractSSEErrorMessage(
  error: unknown,
  defaultMessage = 'Connection failed'
): string {
  if (!error || typeof error !== 'object') {
    return defaultMessage;
  }

  const errorObj = error as SSEErrorEvent;
  let errorMessage = defaultMessage;

  // Try to extract from 'data' property (most common in SSE)
  if (typeof errorObj.data === 'string' && errorObj.data) {
    const extracted = extractFromJsonString(errorObj.data);
    if (extracted) {
      errorMessage = extracted;
    }
  }
  // Try to extract from 'message' property
  else if (errorObj.message) {
    if (typeof errorObj.message === 'string') {
      const extracted = extractFromJsonString(errorObj.message);
      errorMessage = extracted || errorObj.message;
    } else if (typeof errorObj.message === 'object') {
      // message is an object - try to extract from it
      const msgObj = errorObj.message as Record<string, unknown>;
      errorMessage = extractNestedMessage(msgObj) || defaultMessage;
    }
  }
  // Try direct 'error' property
  else if (errorObj.error) {
    if (typeof errorObj.error === 'string') {
      errorMessage = errorObj.error;
    } else if (typeof errorObj.error === 'object') {
      const errObj = errorObj.error as Record<string, unknown>;
      errorMessage = extractNestedMessage(errObj) || defaultMessage;
    }
  }

  // Enhance message based on HTTP status code if available
  if (typeof errorObj.status === 'number') {
    errorMessage = enhanceWithStatusCode(errorObj.status, errorMessage);
  }

  return errorMessage;
}

/**
 * Extract error message from a JSON string.
 */
function extractFromJsonString(jsonStr: string): string | null {
  try {
    const parsed = JSON.parse(jsonStr);
    return extractNestedMessage(parsed);
  } catch {
    // Not valid JSON - check if it looks like a raw error message
    // Avoid returning malformed JSON, HTML, or other non-message content
    const trimmed = jsonStr.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') ||
        trimmed.startsWith('<') || trimmed.startsWith('<!')) {
      return null;
    }
    // Avoid very long strings (likely not user-friendly messages)
    if (trimmed.length > 200) {
      return null;
    }
    return trimmed;
  }
}

/**
 * Extract message from a parsed error object, checking common patterns.
 */
function extractNestedMessage(obj: Record<string, unknown>): string | null {
  // OpenAI/DeepSeek style: { error: { message: "..." } }
  if (obj.error && typeof obj.error === 'object') {
    const errorObj = obj.error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
    if (typeof errorObj.status === 'string') {
      return errorObj.status;
    }
  }

  // Simple style: { message: "..." }
  if (typeof obj.message === 'string') {
    return obj.message;
  }

  // Direct error string: { error: "..." }
  if (typeof obj.error === 'string') {
    return obj.error;
  }

  // Anthropic style: { type: "error", error: { message: "..." } }
  if (obj.type === 'error' && obj.error && typeof obj.error === 'object') {
    const errorObj = obj.error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
  }

  return null;
}

/**
 * Enhance or replace error message based on HTTP status code.
 */
function enhanceWithStatusCode(status: number, currentMessage: string): string {
  const lowerMessage = currentMessage.toLowerCase();

  switch (status) {
    case 401:
    case 403:
      // Keep specific auth messages, provide generic if not auth-related
      if (!lowerMessage.includes('api key') &&
          !lowerMessage.includes('auth') &&
          !lowerMessage.includes('credential') &&
          !lowerMessage.includes('unauthorized')) {
        return 'Invalid API key or unauthorized access';
      }
      break;
    case 429:
      if (!lowerMessage.includes('rate') && !lowerMessage.includes('limit')) {
        return 'Rate limit exceeded. Please try again later';
      }
      break;
    case 500:
    case 502:
    case 503:
    case 529:
      if (!lowerMessage.includes('overload') &&
          !lowerMessage.includes('unavailable') &&
          !lowerMessage.includes('temporarily')) {
        return 'The AI service is temporarily unavailable. Please try again';
      }
      break;
  }

  return currentMessage;
}

/**
 * Map common error types to user-friendly messages.
 * Use this for known error type strings.
 */
export function mapErrorTypeToMessage(errorType: string): string | null {
  const typeMap: Record<string, string> = {
    'overloaded_error': 'The AI service is temporarily overloaded. Please try again',
    'rate_limit_error': 'Rate limit exceeded. Please wait a moment before trying again',
    'authentication_error': 'Authentication failed. Please check your API key',
    'invalid_api_key': 'Invalid API key. Please check your settings',
    'invalid_request_error': 'Invalid request. Please try again',
    'server_error': 'The AI service encountered an error. Please try again',
    'timeout_error': 'Request timed out. Please try again',
  };

  return typeMap[errorType] || null;
}
