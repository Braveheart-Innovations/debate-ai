import { AppError } from '../types/AppError';
import { ErrorCode } from '../codes/ErrorCodes';

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Initial delay in milliseconds (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Optional list of error codes that should trigger retry */
  retryableCodes?: ErrorCode[];
  /** Whether to add jitter to delay (default: true) */
  jitter?: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Execute a function with automatic retry on failure.
 * Uses exponential backoff with optional jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void
): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= mergedConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt
      if (attempt === mergedConfig.maxAttempts) {
        throw lastError;
      }

      // Check if error is retryable
      if (!shouldRetry(error, mergedConfig.retryableCodes)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(
        mergedConfig.baseDelayMs * Math.pow(mergedConfig.backoffMultiplier, attempt - 1),
        mergedConfig.maxDelayMs
      );

      // Add jitter (0-25% of delay)
      if (mergedConfig.jitter) {
        delay += delay * Math.random() * 0.25;
      }

      // Notify caller about retry
      onRetry?.(attempt, lastError, delay);

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed');
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error should trigger a retry.
 */
export function shouldRetry(error: unknown, allowedCodes?: ErrorCode[]): boolean {
  // AppError with retryable flag
  if (error instanceof AppError) {
    if (allowedCodes && allowedCodes.length > 0) {
      return allowedCodes.includes(error.code);
    }
    return error.retryable;
  }

  // Standard Error - check message patterns
  if (error instanceof Error) {
    return isRetryableError(error);
  }

  // Unknown error - don't retry
  return false;
}

/**
 * Check if a standard Error is likely retryable based on message patterns.
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Retryable patterns
  const retryablePatterns = [
    'timeout',
    'network',
    'connection',
    'rate limit',
    'too many requests',
    'overload',
    'busy',
    'temporarily unavailable',
    'service unavailable',
    '429',
    '502',
    '503',
    '504',
    '529',
    'econnreset',
    'etimedout',
    'econnrefused',
  ];

  // Non-retryable patterns (take precedence)
  const nonRetryablePatterns = [
    'invalid api key',
    'unauthorized',
    'forbidden',
    'not found',
    '401',
    '403',
    '404',
    'authentication',
    'permission denied',
  ];

  // Check non-retryable first
  for (const pattern of nonRetryablePatterns) {
    if (message.includes(pattern)) {
      return false;
    }
  }

  // Check retryable patterns
  for (const pattern of retryablePatterns) {
    if (message.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Create a debounced version of a function that retries on failure.
 * Useful for user-triggered actions that might fail temporarily.
 */
export function createRetryableAction<T extends unknown[], R>(
  action: (...args: T) => Promise<R>,
  config: Partial<RetryConfig> = {}
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    return withRetry(() => action(...args), config);
  };
}

/**
 * Calculate the total maximum wait time for a retry configuration.
 * Useful for timeout calculations.
 */
export function calculateMaxWaitTime(config: Partial<RetryConfig> = {}): number {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let totalWait = 0;

  for (let attempt = 1; attempt < mergedConfig.maxAttempts; attempt++) {
    const delay = Math.min(
      mergedConfig.baseDelayMs * Math.pow(mergedConfig.backoffMultiplier, attempt - 1),
      mergedConfig.maxDelayMs
    );
    totalWait += delay;
  }

  // Add 25% for potential jitter
  if (mergedConfig.jitter) {
    totalWait *= 1.25;
  }

  return totalWait;
}
