import { AppError } from '../types/AppError';
import { NetworkError } from '../types/NetworkError';
import { APIError } from '../types/APIError';
import { AuthError } from '../types/AuthError';
import { ErrorCode, ErrorContext } from '../codes/ErrorCodes';

export interface NormalizeContext extends ErrorContext {
  provider?: string;
  action?: string;
}

/**
 * Normalize any error to an AppError for consistent handling.
 * Detects error types and creates appropriate specialized errors.
 */
export function normalizeError(
  error: unknown,
  context?: NormalizeContext
): AppError {
  // Already an AppError - return as-is with optional context merge
  if (error instanceof AppError) {
    if (context) {
      return new AppError({
        code: error.code,
        message: error.message,
        userMessage: error.userMessage,
        severity: error.severity,
        recoverable: error.recoverable,
        retryable: error.retryable,
        cause: error.cause,
        context: { ...error.context, ...context },
      });
    }
    return error;
  }

  // Standard Error - analyze message for type detection
  if (error instanceof Error) {
    return normalizeStandardError(error, context);
  }

  // String error
  if (typeof error === 'string') {
    return new AppError({
      code: ErrorCode.UNKNOWN,
      message: error,
      context: context || {},
    });
  }

  // Object with message property
  if (error && typeof error === 'object' && 'message' in error) {
    const errorObj = error as { message: string; code?: string };
    return new AppError({
      code: ErrorCode.UNKNOWN,
      message: String(errorObj.message),
      context: context || {},
    });
  }

  // Unknown type
  return new AppError({
    code: ErrorCode.UNKNOWN,
    message: 'An unknown error occurred',
    context: context || {},
  });
}

/**
 * Analyze a standard Error and create an appropriate specialized error.
 */
function normalizeStandardError(
  error: Error,
  context?: NormalizeContext
): AppError {
  const message = error.message.toLowerCase();
  const provider = context?.provider;

  // Network-related errors
  if (isNetworkError(message)) {
    return createNetworkError(error, message);
  }

  // API-related errors - check for HTTP status codes
  const statusMatch = message.match(/\((\d{3})\)/) || message.match(/status[:\s]+(\d{3})/i);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    return APIError.fromHttpStatus(statusCode, provider, error.message);
  }

  // Provider-specific patterns
  if (isOverloadError(message)) {
    return APIError.providerOverloaded(provider || 'AI');
  }

  if (isVerificationError(message)) {
    return APIError.verificationRequired(provider || 'AI');
  }

  if (isRateLimitError(message)) {
    return APIError.rateLimited(provider || 'AI');
  }

  // Firebase error codes - check BEFORE generic auth check
  const firebaseMatch = error.message.match(/auth\/([a-z-]+)/);
  if (firebaseMatch) {
    return AuthError.fromFirebaseCode(`auth/${firebaseMatch[1]}`, error.message);
  }

  // Auth-related errors (generic patterns)
  if (isAuthError(message)) {
    return createAuthError(error, message);
  }

  // Default fallback
  return new AppError({
    code: ErrorCode.UNKNOWN,
    message: error.message,
    cause: error,
    context: context || {},
  });
}

function isNetworkError(message: string): boolean {
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('no internet') ||
    message.includes('timeout') ||
    message.includes('dns') ||
    message.includes('socket') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('ssl') ||
    message.includes('certificate')
  );
}

function createNetworkError(error: Error, message: string): NetworkError {
  if (message.includes('offline') || message.includes('no internet')) {
    return NetworkError.offline();
  }
  if (message.includes('timeout')) {
    return NetworkError.timeout();
  }
  if (message.includes('dns') || message.includes('enotfound')) {
    return NetworkError.dnsFailure();
  }
  if (message.includes('ssl') || message.includes('certificate')) {
    return NetworkError.sslError(error.message);
  }
  if (message.includes('refused') || message.includes('econnrefused')) {
    return NetworkError.connectionRefused();
  }

  return new NetworkError({
    code: ErrorCode.NETWORK_OFFLINE,
    message: error.message,
    cause: error,
  });
}

function isOverloadError(message: string): boolean {
  return (
    message.includes('overload') ||
    message.includes('temporarily busy') ||
    message.includes('capacity') ||
    message.includes('529')
  );
}

function isVerificationError(message: string): boolean {
  return (
    message.includes('organization must be verified') ||
    message.includes('verify organization') ||
    message.includes('verification required')
  );
}

function isRateLimitError(message: string): boolean {
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  );
}

function isAuthError(message: string): boolean {
  return (
    message.includes('auth') ||
    message.includes('sign in') ||
    message.includes('session') ||
    message.includes('login') ||
    message.includes('password') ||
    message.includes('credential')
  );
}

function createAuthError(error: Error, message: string): AuthError {
  if (message.includes('expired') || message.includes('session')) {
    return AuthError.sessionExpired();
  }
  if (message.includes('disabled')) {
    return AuthError.userDisabled();
  }
  if (message.includes('not found') || message.includes('no account')) {
    return AuthError.userNotFound();
  }
  if (message.includes('password') || message.includes('credential')) {
    return AuthError.invalidCredentials();
  }

  return new AuthError({
    code: ErrorCode.AUTH_INVALID_CREDENTIALS,
    message: error.message,
    cause: error,
  });
}
