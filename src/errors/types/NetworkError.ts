import { AppError, AppErrorOptions } from './AppError';
import { ErrorCode } from '../codes/ErrorCodes';

/**
 * Error class for network-related issues.
 * Used for connectivity problems, timeouts, and DNS failures.
 */
export class NetworkError extends AppError {
  readonly isOffline: boolean;
  readonly statusCode?: number;

  constructor(options: AppErrorOptions & { isOffline?: boolean; statusCode?: number }) {
    super({
      ...options,
      severity: options.severity || 'warning',
      recoverable: options.recoverable ?? true,
      retryable: options.retryable ?? true,
    });
    this.name = 'NetworkError';
    this.isOffline = options.isOffline ?? false;
    this.statusCode = options.statusCode;
  }

  /**
   * Create an error for offline state.
   */
  static offline(): NetworkError {
    return new NetworkError({
      code: ErrorCode.NETWORK_OFFLINE,
      message: 'Device is offline',
      isOffline: true,
      retryable: true,
    });
  }

  /**
   * Create an error for request timeout.
   */
  static timeout(timeoutMs?: number): NetworkError {
    const message = timeoutMs
      ? `Request timed out after ${timeoutMs}ms`
      : 'Request timed out';
    return new NetworkError({
      code: ErrorCode.NETWORK_TIMEOUT,
      message,
      retryable: true,
    });
  }

  /**
   * Create an error for DNS failure.
   */
  static dnsFailure(host?: string): NetworkError {
    const message = host
      ? `DNS lookup failed for ${host}`
      : 'DNS lookup failed';
    return new NetworkError({
      code: ErrorCode.NETWORK_DNS_FAILURE,
      message,
      retryable: true,
    });
  }

  /**
   * Create an error for SSL/TLS issues.
   */
  static sslError(details?: string): NetworkError {
    return new NetworkError({
      code: ErrorCode.NETWORK_SSL_ERROR,
      message: details || 'SSL/TLS connection failed',
      retryable: false,
    });
  }

  /**
   * Create an error for connection refused.
   */
  static connectionRefused(host?: string): NetworkError {
    const message = host
      ? `Connection refused by ${host}`
      : 'Connection refused';
    return new NetworkError({
      code: ErrorCode.NETWORK_CONNECTION_REFUSED,
      message,
      retryable: true,
    });
  }
}
