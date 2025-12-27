import { AppError, AppErrorOptions } from './AppError';
import { ErrorCode } from '../codes/ErrorCodes';

/**
 * Error class for validation-related issues.
 * Used for input validation, format checking, and constraint violations.
 */
export class ValidationError extends AppError {
  readonly field?: string;
  readonly value?: unknown;

  constructor(options: AppErrorOptions & { field?: string; value?: unknown }) {
    super({
      ...options,
      severity: 'warning',
      recoverable: true,
      retryable: false,
    });
    this.name = 'ValidationError';
    this.field = options.field;
    this.value = options.value;
  }

  /**
   * Create an error for a required field.
   */
  static required(field: string): ValidationError {
    return new ValidationError({
      code: ErrorCode.VALIDATION_REQUIRED,
      message: `${field} is required`,
      userMessage: `Please enter a ${field.toLowerCase()}.`,
      field,
    });
  }

  /**
   * Create an error for invalid format.
   */
  static invalidFormat(field: string, expectedFormat?: string): ValidationError {
    const message = expectedFormat
      ? `${field} has invalid format. Expected: ${expectedFormat}`
      : `${field} has invalid format`;
    return new ValidationError({
      code: ErrorCode.VALIDATION_INVALID_FORMAT,
      message,
      field,
    });
  }

  /**
   * Create an error for invalid API key.
   */
  static apiKeyInvalid(provider: string): ValidationError {
    return new ValidationError({
      code: ErrorCode.VALIDATION_API_KEY_INVALID,
      message: `Invalid API key format for ${provider}`,
      userMessage: `The API key for ${provider} appears to be invalid. Please check and try again.`,
      field: 'apiKey',
      context: { provider },
    });
  }

  /**
   * Create an error for message too long.
   */
  static messageTooLong(maxLength: number, currentLength?: number): ValidationError {
    const message = currentLength
      ? `Message is ${currentLength} characters, maximum is ${maxLength}`
      : `Message exceeds ${maxLength} characters`;
    return new ValidationError({
      code: ErrorCode.VALIDATION_MESSAGE_TOO_LONG,
      message,
      userMessage: `Your message is too long. Please shorten it to ${maxLength} characters.`,
      field: 'content',
    });
  }

  /**
   * Create an error for attachment too large.
   */
  static attachmentTooLarge(maxSizeMB: number, actualSizeMB?: number): ValidationError {
    const message = actualSizeMB
      ? `Attachment is ${actualSizeMB.toFixed(1)}MB, maximum is ${maxSizeMB}MB`
      : `Attachment exceeds ${maxSizeMB}MB limit`;
    return new ValidationError({
      code: ErrorCode.VALIDATION_ATTACHMENT_TOO_LARGE,
      message,
      userMessage: `Attachment is too large. Maximum size is ${maxSizeMB}MB.`,
      field: 'attachment',
    });
  }

  /**
   * Create an error for unsupported format.
   */
  static unsupportedFormat(format: string, supportedFormats?: string[]): ValidationError {
    const supported = supportedFormats?.join(', ') || 'supported formats';
    return new ValidationError({
      code: ErrorCode.VALIDATION_UNSUPPORTED_FORMAT,
      message: `Format '${format}' is not supported. Use: ${supported}`,
      field: 'format',
      value: format,
    });
  }
}
