import { AppError, AppErrorOptions } from './AppError';
import { ErrorCode } from '../codes/ErrorCodes';

export type AuthProvider = 'email' | 'apple' | 'google';

/**
 * Error class for authentication-related issues.
 * Used for sign-in failures, session issues, and account problems.
 */
export class AuthError extends AppError {
  readonly authProvider?: AuthProvider;

  constructor(options: AppErrorOptions & { authProvider?: AuthProvider }) {
    super({
      ...options,
      severity: options.severity || 'error',
    });
    this.name = 'AuthError';
    this.authProvider = options.authProvider;
  }

  /**
   * Create an error for invalid credentials.
   */
  static invalidCredentials(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid email or password',
      authProvider: 'email',
    });
  }

  /**
   * Create an error for session expiration.
   */
  static sessionExpired(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_SESSION_EXPIRED,
      message: 'Session has expired',
      recoverable: true,
    });
  }

  /**
   * Create an error for disabled user account.
   */
  static userDisabled(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_USER_DISABLED,
      message: 'User account is disabled',
      recoverable: false,
    });
  }

  /**
   * Create an error for email already in use.
   */
  static emailInUse(email?: string): AuthError {
    const message = email
      ? `Email ${email} is already in use`
      : 'Email is already in use';
    return new AuthError({
      code: ErrorCode.AUTH_EMAIL_IN_USE,
      message,
      authProvider: 'email',
    });
  }

  /**
   * Create an error for weak password.
   */
  static weakPassword(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_WEAK_PASSWORD,
      message: 'Password is too weak',
      authProvider: 'email',
    });
  }

  /**
   * Create an error for social auth failure.
   */
  static socialAuthFailed(provider: 'apple' | 'google', reason?: string): AuthError {
    const code = provider === 'apple'
      ? ErrorCode.AUTH_APPLE_SIGN_IN_FAILED
      : ErrorCode.AUTH_GOOGLE_SIGN_IN_FAILED;

    return new AuthError({
      code,
      message: reason || `${provider} sign-in failed`,
      userMessage: `Unable to sign in with ${provider === 'apple' ? 'Apple' : 'Google'}. Please try again or use another method.`,
      authProvider: provider,
    });
  }

  /**
   * Create an error for user not found.
   */
  static userNotFound(email?: string): AuthError {
    const message = email
      ? `No account found for ${email}`
      : 'No account found with this email';
    return new AuthError({
      code: ErrorCode.AUTH_USER_NOT_FOUND,
      message,
      authProvider: 'email',
    });
  }

  /**
   * Create an error for network issues during auth.
   */
  static networkError(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_NETWORK_ERROR,
      message: 'Network error during authentication',
      severity: 'warning',
      retryable: true,
    });
  }

  /**
   * Create an AuthError from a Firebase error code.
   */
  static fromFirebaseCode(code: string, originalMessage?: string): AuthError {
    const firebaseErrorMap: Record<string, () => AuthError> = {
      'auth/user-not-found': () => AuthError.userNotFound(),
      'auth/wrong-password': () => AuthError.invalidCredentials(),
      'auth/invalid-email': () => new AuthError({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email format',
      }),
      'auth/email-already-in-use': () => AuthError.emailInUse(),
      'auth/weak-password': () => AuthError.weakPassword(),
      'auth/user-disabled': () => AuthError.userDisabled(),
      'auth/network-request-failed': () => AuthError.networkError(),
      'auth/too-many-requests': () => new AuthError({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Too many failed attempts. Please try again later.',
        retryable: true,
      }),
    };

    const factory = firebaseErrorMap[code];
    if (factory) {
      return factory();
    }

    return new AuthError({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: originalMessage || 'Authentication failed',
    });
  }
}
