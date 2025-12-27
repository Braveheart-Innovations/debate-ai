// Error codes and types
export { ErrorCode } from './codes/ErrorCodes';
export type { ErrorSeverity, ErrorContext } from './codes/ErrorCodes';

// Error classes
export {
  AppError,
  NetworkError,
  APIError,
  AuthError,
  ValidationError,
} from './types';
export type { AppErrorOptions, AuthProvider } from './types';

// User-friendly messages
export { getUserFriendlyMessage, UserFriendlyMessages } from './messages/UserFriendlyMessages';

// Utilities
export { normalizeError } from './utils/ErrorNormalizer';
export type { NormalizeContext } from './utils/ErrorNormalizer';

export {
  withRetry,
  sleep,
  shouldRetry,
  isRetryableError,
  createRetryableAction,
  calculateMaxWaitTime,
  DEFAULT_RETRY_CONFIG,
} from './utils/RetryUtils';
export type { RetryConfig } from './utils/RetryUtils';
