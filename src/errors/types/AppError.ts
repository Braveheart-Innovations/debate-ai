import { ErrorCode, ErrorSeverity, ErrorContext } from '../codes/ErrorCodes';
import { getUserFriendlyMessage } from '../messages/UserFriendlyMessages';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  userMessage?: string;
  severity?: ErrorSeverity;
  recoverable?: boolean;
  context?: ErrorContext;
  cause?: Error;
  retryable?: boolean;
  retryAction?: () => Promise<void>;
}

/**
 * Base error class for all application errors.
 * Provides structured error information for logging, display, and recovery.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly severity: ErrorSeverity;
  readonly recoverable: boolean;
  readonly context: ErrorContext;
  readonly cause?: Error;
  readonly retryable: boolean;
  readonly retryAction?: () => Promise<void>;
  readonly timestamp: number;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = options.userMessage || getUserFriendlyMessage(options.code);
    this.severity = options.severity || 'error';
    this.recoverable = options.recoverable ?? true;
    this.context = options.context || {};
    this.cause = options.cause;
    this.retryable = options.retryable ?? false;
    this.retryAction = options.retryAction;
    this.timestamp = Date.now();

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Serialize error for logging or transmission.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      recoverable: this.recoverable,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  /**
   * Create a string representation for logging.
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}
