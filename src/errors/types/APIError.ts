import { AppError, AppErrorOptions } from './AppError';
import { ErrorCode } from '../codes/ErrorCodes';

/**
 * Error class for API-related issues.
 * Used for HTTP errors, provider-specific errors, and streaming failures.
 */
export class APIError extends AppError {
  readonly statusCode: number;
  readonly provider?: string;
  readonly originalResponse?: unknown;

  constructor(options: AppErrorOptions & {
    statusCode: number;
    provider?: string;
    originalResponse?: unknown;
  }) {
    super({
      ...options,
      context: {
        ...options.context,
        provider: options.provider,
        statusCode: options.statusCode,
      },
    });
    this.name = 'APIError';
    this.statusCode = options.statusCode;
    this.provider = options.provider;
    this.originalResponse = options.originalResponse;
  }

  /**
   * Create an APIError from an HTTP status code.
   */
  static fromHttpStatus(
    statusCode: number,
    provider?: string,
    originalMessage?: string
  ): APIError {
    const errorMap: Record<number, { code: ErrorCode; message: string; retryable: boolean }> = {
      400: { code: ErrorCode.API_BAD_REQUEST, message: 'Bad request', retryable: false },
      401: { code: ErrorCode.API_UNAUTHORIZED, message: 'Invalid API key', retryable: false },
      403: { code: ErrorCode.API_FORBIDDEN, message: 'Access forbidden', retryable: false },
      404: { code: ErrorCode.API_NOT_FOUND, message: 'Resource not found', retryable: false },
      429: { code: ErrorCode.API_RATE_LIMITED, message: 'Rate limit exceeded', retryable: true },
      500: { code: ErrorCode.API_SERVER_ERROR, message: 'Server error', retryable: true },
      502: { code: ErrorCode.API_SERVER_ERROR, message: 'Bad gateway', retryable: true },
      503: { code: ErrorCode.API_SERVICE_UNAVAILABLE, message: 'Service unavailable', retryable: true },
      504: { code: ErrorCode.API_SERVER_ERROR, message: 'Gateway timeout', retryable: true },
      529: { code: ErrorCode.API_PROVIDER_OVERLOADED, message: 'Service overloaded', retryable: true },
    };

    const mapped = errorMap[statusCode] || {
      code: ErrorCode.API_SERVER_ERROR,
      message: 'API error',
      retryable: statusCode >= 500,
    };

    const message = originalMessage
      ? `${provider || 'API'} error (${statusCode}): ${originalMessage}`
      : `${provider || 'API'} error: ${mapped.message}`;

    return new APIError({
      code: mapped.code,
      message,
      statusCode,
      provider,
      retryable: mapped.retryable,
    });
  }

  /**
   * Create an error for provider overload (e.g., Claude 529).
   */
  static providerOverloaded(provider: string): APIError {
    return new APIError({
      code: ErrorCode.API_PROVIDER_OVERLOADED,
      message: `${provider} is currently overloaded`,
      userMessage: `${provider} is currently busy. Please try again in a moment.`,
      statusCode: 503,
      provider,
      severity: 'warning',
      retryable: true,
    });
  }

  /**
   * Create an error for organization verification required.
   */
  static verificationRequired(provider: string): APIError {
    return new APIError({
      code: ErrorCode.API_VERIFICATION_REQUIRED,
      message: `${provider} requires organization verification for streaming`,
      userMessage: `Streaming is disabled for ${provider}. Non-streaming mode will be used.`,
      statusCode: 403,
      provider,
      severity: 'info',
      retryable: false,
    });
  }

  /**
   * Create an error for streaming failure.
   */
  static streamingFailed(provider: string, reason?: string): APIError {
    return new APIError({
      code: ErrorCode.API_STREAMING_FAILED,
      message: reason || `Streaming failed for ${provider}`,
      statusCode: 0,
      provider,
      severity: 'warning',
      retryable: true,
    });
  }

  /**
   * Create an error for rate limiting.
   */
  static rateLimited(provider: string, retryAfter?: number): APIError {
    const message = retryAfter
      ? `Rate limited by ${provider}. Retry after ${retryAfter}s`
      : `Rate limited by ${provider}`;
    return new APIError({
      code: ErrorCode.API_RATE_LIMITED,
      message,
      statusCode: 429,
      provider,
      severity: 'warning',
      retryable: true,
    });
  }

  /**
   * Create an error for invalid API key.
   */
  static invalidApiKey(provider: string): APIError {
    return new APIError({
      code: ErrorCode.API_UNAUTHORIZED,
      message: `Invalid API key for ${provider}`,
      userMessage: `Your ${provider} API key is invalid. Please check your settings.`,
      statusCode: 401,
      provider,
      severity: 'error',
      retryable: false,
    });
  }

  /**
   * Create an error for content filtering.
   */
  static contentFiltered(provider: string): APIError {
    return new APIError({
      code: ErrorCode.API_CONTENT_FILTERED,
      message: `Response filtered by ${provider} content policy`,
      statusCode: 400,
      provider,
      severity: 'warning',
      retryable: false,
    });
  }
}
