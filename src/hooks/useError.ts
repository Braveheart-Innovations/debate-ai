import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ErrorService } from '../services/errors/ErrorService';
import { AppError } from '../errors/types/AppError';
import { ErrorCode } from '../errors/codes/ErrorCodes';
import {
  selectFeatureError,
  selectHasErrors,
  clearFeatureError,
  clearErrors,
} from '../store/errorSlice';
import { withRetry, RetryConfig } from '../errors/utils/RetryUtils';
import { RootState } from '../store';
import { ErrorEntry } from '../store/errorSlice';

export interface UseErrorOptions {
  /** Feature identifier for scoped error tracking */
  feature?: string;
  /** Whether to show toast notifications (default: true) */
  showToast?: boolean;
  /** Whether to log to Crashlytics (default: true) */
  logToCrashlytics?: boolean;
}

export interface UseErrorReturn {
  /**
   * Handle an error with logging and optional toast.
   * Returns the normalized AppError for further handling.
   */
  handleError: (error: unknown, context?: Record<string, unknown>) => AppError;

  /**
   * Handle an error silently (log only, no toast).
   */
  handleErrorSilent: (error: unknown, context?: Record<string, unknown>) => AppError;

  /**
   * Clear the current feature's error.
   */
  clearError: () => void;

  /**
   * Clear all errors in the queue.
   */
  clearAllErrors: () => void;

  /**
   * The current error for this feature (if any).
   */
  featureError: ErrorEntry | null;

  /**
   * Whether there are any undismissed errors.
   */
  hasErrors: boolean;

  /**
   * Execute an async function with automatic error handling.
   * Returns undefined if an error occurs.
   */
  withErrorHandling: <T>(
    fn: () => Promise<T>,
    options?: { onError?: (error: AppError) => void }
  ) => Promise<T | undefined>;

  /**
   * Execute an async function with automatic retry on failure.
   */
  withRetry: <T>(
    fn: () => Promise<T>,
    config?: Partial<RetryConfig>,
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void
  ) => Promise<T>;

  /**
   * Log an error by code without an Error object.
   */
  logError: (code: ErrorCode, message: string) => AppError;

  /**
   * Get a user-friendly message for any error.
   */
  getUserMessage: (error: unknown) => string;
}

/**
 * useError - Hook for handling errors in components
 *
 * Provides utilities for error handling, display, and recovery.
 * Integrates with ErrorService and Redux error state.
 *
 * @example
 * ```tsx
 * function ChatScreen() {
 *   const { handleError, withErrorHandling, featureError } = useError({
 *     feature: 'chat',
 *   });
 *
 *   const sendMessage = async () => {
 *     await withErrorHandling(async () => {
 *       await chatService.sendMessage(content);
 *     });
 *   };
 *
 *   // Or handle manually:
 *   const sendWithManualHandling = async () => {
 *     try {
 *       await chatService.sendMessage(content);
 *     } catch (error) {
 *       const appError = handleError(error);
 *       if (appError.code === ErrorCode.API_RATE_LIMITED) {
 *         // Show rate limit UI
 *       }
 *     }
 *   };
 * }
 * ```
 */
export function useError(options: UseErrorOptions = {}): UseErrorReturn {
  const { feature, showToast = true, logToCrashlytics = true } = options;
  const dispatch = useDispatch();

  const featureError = useSelector((state: RootState) =>
    feature ? selectFeatureError(feature)(state) : null
  );
  const hasErrors = useSelector(selectHasErrors);

  const handleError = useCallback(
    (error: unknown, context?: Record<string, unknown>): AppError => {
      return ErrorService.handleError(error, {
        showToast,
        logToCrashlytics,
        context,
        feature,
      });
    },
    [showToast, logToCrashlytics, feature]
  );

  const handleErrorSilent = useCallback(
    (error: unknown, context?: Record<string, unknown>): AppError => {
      return ErrorService.handleSilent(error, context);
    },
    []
  );

  const clearError = useCallback(() => {
    if (feature) {
      dispatch(clearFeatureError(feature));
    }
  }, [dispatch, feature]);

  const clearAllErrors = useCallback(() => {
    dispatch(clearErrors());
  }, [dispatch]);

  const withErrorHandling = useCallback(
    async <T>(
      fn: () => Promise<T>,
      handlerOptions?: { onError?: (error: AppError) => void }
    ): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (error) {
        const appError = handleError(error);
        handlerOptions?.onError?.(appError);
        return undefined;
      }
    },
    [handleError]
  );

  const withRetryWrapper = useCallback(
    async <T>(
      fn: () => Promise<T>,
      config?: Partial<RetryConfig>,
      onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void
    ): Promise<T> => {
      return withRetry(fn, config, onRetry);
    },
    []
  );

  const logError = useCallback(
    (code: ErrorCode, message: string): AppError => {
      return ErrorService.logError(code, message, {
        showToast,
        logToCrashlytics,
        feature,
      });
    },
    [showToast, logToCrashlytics, feature]
  );

  const getUserMessage = useCallback((error: unknown): string => {
    return ErrorService.getUserMessage(error);
  }, []);

  return {
    handleError,
    handleErrorSilent,
    clearError,
    clearAllErrors,
    featureError,
    hasErrors,
    withErrorHandling,
    withRetry: withRetryWrapper,
    logError,
    getUserMessage,
  };
}
