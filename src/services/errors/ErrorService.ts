import { AppError } from '../../errors/types/AppError';
import { normalizeError } from '../../errors/utils/ErrorNormalizer';
import { Logger } from '../logging/Logger';
import { CrashlyticsService } from '../crashlytics';
import { store } from '../../store';
import { addError } from '../../store/errorSlice';
import { ErrorCode, ErrorSeverity } from '../../errors/codes/ErrorCodes';
import { getUserFriendlyMessage } from '../../errors/messages/UserFriendlyMessages';

export interface ErrorHandleOptions {
  /** Show toast notification (default: true) */
  showToast?: boolean;
  /** Log to Crashlytics (default: true for non-info severity) */
  logToCrashlytics?: boolean;
  /** Additional context for the error */
  context?: Record<string, unknown>;
  /** Feature/area where error occurred */
  feature?: string;
}

/**
 * ErrorService - Centralized error handling service
 *
 * Features:
 * - Normalize any error to AppError
 * - Log errors via Logger (with Crashlytics integration)
 * - Dispatch to Redux for toast display
 * - Provide user-friendly error messages
 *
 * Usage:
 * ```
 * try {
 *   await someOperation();
 * } catch (error) {
 *   ErrorService.handleError(error, { feature: 'chat' });
 * }
 * ```
 */
class ErrorServiceClass {
  private static instance: ErrorServiceClass;
  private logger = Logger.getInstance();

  private constructor() {}

  /**
   * Get the singleton ErrorService instance.
   */
  static getInstance(): ErrorServiceClass {
    if (!ErrorServiceClass.instance) {
      ErrorServiceClass.instance = new ErrorServiceClass();
    }
    return ErrorServiceClass.instance;
  }

  /**
   * Main entry point for handling errors throughout the app.
   * Normalizes the error, logs it, and optionally shows a toast.
   */
  handleError(
    error: unknown,
    options: ErrorHandleOptions = {}
  ): AppError {
    const {
      showToast = true,
      logToCrashlytics = true,
      context,
      feature,
    } = options;

    // Normalize to AppError
    const appError = normalizeError(error, context as { provider?: string; action?: string });

    // Add feature context if provided
    if (feature) {
      appError.context.feature = feature;
    }

    // Log to Logger (which may also log to Crashlytics)
    this.logger.error(
      `[${appError.code}] ${appError.message}`,
      appError.cause,
      appError.context
    );

    // Additional Crashlytics logging for AppError-specific data
    if (logToCrashlytics && appError.severity !== 'info') {
      this.logToCrashlytics(appError);
    }

    // Dispatch to Redux for UI toast
    if (showToast) {
      this.dispatchToRedux(appError, feature);
    }

    return appError;
  }

  /**
   * Show a success toast notification.
   * Use for positive feedback to user actions.
   */
  showSuccess(message: string, feature?: string): void {
    store.dispatch(addError({
      code: ErrorCode.UNKNOWN, // Success messages don't need specific codes
      message,
      severity: 'success',
      timestamp: Date.now(),
      recoverable: true,
      retryable: false,
      feature,
      dismissed: false,
    }));
  }

  /**
   * Show an info toast notification.
   * Use for informational messages that don't indicate errors.
   */
  showInfo(message: string, feature?: string): void {
    store.dispatch(addError({
      code: ErrorCode.UNKNOWN,
      message,
      severity: 'info',
      timestamp: Date.now(),
      recoverable: true,
      retryable: false,
      feature,
      dismissed: false,
    }));
  }

  /**
   * Show a warning toast notification.
   * Use for caution messages that don't block the user.
   */
  showWarning(message: string, feature?: string): void {
    store.dispatch(addError({
      code: ErrorCode.UNKNOWN,
      message,
      severity: 'warning',
      timestamp: Date.now(),
      recoverable: true,
      retryable: false,
      feature,
      dismissed: false,
    }));
  }

  /**
   * Show an error toast notification with a custom message.
   * Use when you have a user-friendly error message that should be shown directly,
   * bypassing the error normalization that maps to generic messages.
   */
  showError(message: string, feature?: string): void {
    store.dispatch(addError({
      code: ErrorCode.UNKNOWN,
      message,
      severity: 'error',
      timestamp: Date.now(),
      recoverable: true,
      retryable: true,
      feature,
      dismissed: false,
    }));
  }

  /**
   * Handle error silently (log only, no toast).
   * Use for errors that don't need user notification.
   */
  handleSilent(error: unknown, context?: Record<string, unknown>): AppError {
    return this.handleError(error, {
      showToast: false,
      context,
    });
  }

  /**
   * Handle error with toast only (no Crashlytics).
   * Use for minor user-facing issues that don't need crash reporting.
   */
  handleWithToast(error: unknown, context?: Record<string, unknown>): AppError {
    return this.handleError(error, {
      showToast: true,
      logToCrashlytics: false,
      context,
    });
  }

  /**
   * Handle error with Crashlytics only (no toast).
   * Use for background errors that should be tracked but not shown.
   */
  handleWithCrashlytics(error: unknown, context?: Record<string, unknown>): AppError {
    return this.handleError(error, {
      showToast: false,
      logToCrashlytics: true,
      context,
    });
  }

  /**
   * Get a user-friendly error message for any error type.
   */
  getUserMessage(error: unknown): string {
    if (error instanceof AppError) {
      return error.userMessage;
    }
    if (error instanceof Error) {
      const normalized = normalizeError(error);
      return normalized.userMessage;
    }
    return getUserFriendlyMessage(ErrorCode.UNKNOWN);
  }

  /**
   * Create an AppError without handling it (logging/toast).
   * Useful when you need to transform an error but handle it yourself.
   */
  createAppError(error: unknown, context?: Record<string, unknown>): AppError {
    return normalizeError(error, context as { provider?: string; action?: string });
  }

  /**
   * Log an error message without an Error object.
   * Useful for error conditions that don't have an exception.
   */
  logError(
    code: ErrorCode,
    message: string,
    options: ErrorHandleOptions = {}
  ): AppError {
    const appError = new AppError({
      code,
      message,
      context: options.context,
    });

    return this.handleError(appError, options);
  }

  /**
   * Log error details to Crashlytics with AppError-specific attributes.
   */
  private logToCrashlytics(appError: AppError): void {
    // Create an Error object for Crashlytics
    const errorForCrashlytics = new Error(appError.message);
    errorForCrashlytics.name = appError.name;
    if (appError.stack) {
      errorForCrashlytics.stack = appError.stack;
    }

    // Build attributes from error properties
    const attributes: Record<string, string> = {
      errorCode: appError.code,
      severity: appError.severity,
      recoverable: String(appError.recoverable),
      retryable: String(appError.retryable),
      timestamp: String(appError.timestamp),
      ...this.stringifyContext(appError.context),
    };

    CrashlyticsService.recordError(errorForCrashlytics, attributes);
  }

  /**
   * Dispatch error to Redux store for UI display.
   */
  private dispatchToRedux(appError: AppError, feature?: string): void {
    store.dispatch(addError({
      code: appError.code,
      message: appError.userMessage,
      severity: appError.severity,
      timestamp: appError.timestamp,
      recoverable: appError.recoverable,
      retryable: appError.retryable,
      feature,
      dismissed: false,
    }));
  }

  /**
   * Convert context object to string values for Crashlytics.
   */
  private stringifyContext(context: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null) {
        result[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
    return result;
  }

  /**
   * Get the severity level for display/styling.
   */
  getSeverityLevel(error: unknown): ErrorSeverity {
    if (error instanceof AppError) {
      return error.severity;
    }
    return 'error';
  }

  /**
   * Check if an error is retryable.
   */
  isRetryable(error: unknown): boolean {
    if (error instanceof AppError) {
      return error.retryable;
    }
    return false;
  }

  /**
   * Check if an error is recoverable.
   */
  isRecoverable(error: unknown): boolean {
    if (error instanceof AppError) {
      return error.recoverable;
    }
    return true;
  }
}

// Export singleton instance
export const ErrorService = ErrorServiceClass.getInstance();
