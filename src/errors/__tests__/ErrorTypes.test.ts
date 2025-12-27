import { AppError } from '../types/AppError';
import { NetworkError } from '../types/NetworkError';
import { APIError } from '../types/APIError';
import { AuthError } from '../types/AuthError';
import { ValidationError } from '../types/ValidationError';
import { ErrorCode } from '../codes/ErrorCodes';

describe('AppError', () => {
  it('creates error with required properties', () => {
    const error = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'Test error',
    });

    expect(error.code).toBe(ErrorCode.UNKNOWN);
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('AppError');
    expect(error.severity).toBe('error');
    expect(error.recoverable).toBe(true);
    expect(error.retryable).toBe(false);
    expect(error.timestamp).toBeDefined();
    expect(error.context).toEqual({});
  });

  it('uses custom user message when provided', () => {
    const error = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'Technical error',
      userMessage: 'Something went wrong',
    });

    expect(error.userMessage).toBe('Something went wrong');
  });

  it('falls back to default user message', () => {
    const error = new AppError({
      code: ErrorCode.NETWORK_OFFLINE,
      message: 'Network error',
    });

    expect(error.userMessage).toContain('offline');
  });

  it('preserves cause error', () => {
    const cause = new Error('Original error');
    const error = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'Wrapped error',
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it('serializes to JSON correctly', () => {
    const error = new AppError({
      code: ErrorCode.API_RATE_LIMITED,
      message: 'Rate limited',
      severity: 'warning',
      context: { provider: 'claude' },
    });

    const json = error.toJSON();

    expect(json.code).toBe(ErrorCode.API_RATE_LIMITED);
    expect(json.message).toBe('Rate limited');
    expect(json.severity).toBe('warning');
    expect(json.context).toEqual({ provider: 'claude' });
    expect(json.timestamp).toBeDefined();
  });

  it('toString returns formatted message', () => {
    const error = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'Test error',
    });

    expect(error.toString()).toBe('[E9999] Test error');
  });
});

describe('NetworkError', () => {
  it('creates offline error with factory method', () => {
    const error = NetworkError.offline();

    expect(error.code).toBe(ErrorCode.NETWORK_OFFLINE);
    expect(error.isOffline).toBe(true);
    expect(error.retryable).toBe(true);
    expect(error.severity).toBe('warning');
    expect(error.name).toBe('NetworkError');
  });

  it('creates timeout error with factory method', () => {
    const error = NetworkError.timeout(5000);

    expect(error.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    expect(error.message).toContain('5000');
    expect(error.retryable).toBe(true);
  });

  it('creates DNS failure error', () => {
    const error = NetworkError.dnsFailure('api.example.com');

    expect(error.code).toBe(ErrorCode.NETWORK_DNS_FAILURE);
    expect(error.message).toContain('api.example.com');
  });

  it('creates SSL error', () => {
    const error = NetworkError.sslError('Certificate expired');

    expect(error.code).toBe(ErrorCode.NETWORK_SSL_ERROR);
    expect(error.retryable).toBe(false); // SSL errors not retryable
  });

  it('creates connection refused error', () => {
    const error = NetworkError.connectionRefused('localhost');

    expect(error.code).toBe(ErrorCode.NETWORK_CONNECTION_REFUSED);
    expect(error.message).toContain('localhost');
    expect(error.retryable).toBe(true);
  });
});

describe('APIError', () => {
  describe('fromHttpStatus', () => {
    it('maps 400 to bad request', () => {
      const error = APIError.fromHttpStatus(400, 'claude', 'Invalid params');

      expect(error.code).toBe(ErrorCode.API_BAD_REQUEST);
      expect(error.statusCode).toBe(400);
      expect(error.provider).toBe('claude');
      expect(error.retryable).toBe(false);
    });

    it('maps 401 to unauthorized', () => {
      const error = APIError.fromHttpStatus(401, 'openai');

      expect(error.code).toBe(ErrorCode.API_UNAUTHORIZED);
      expect(error.retryable).toBe(false);
    });

    it('maps 429 to rate limited', () => {
      const error = APIError.fromHttpStatus(429, 'claude');

      expect(error.code).toBe(ErrorCode.API_RATE_LIMITED);
      expect(error.retryable).toBe(true);
    });

    it('maps 500 to server error', () => {
      const error = APIError.fromHttpStatus(500, 'gemini');

      expect(error.code).toBe(ErrorCode.API_SERVER_ERROR);
      expect(error.retryable).toBe(true);
    });

    it('maps 503 to service unavailable', () => {
      const error = APIError.fromHttpStatus(503, 'claude');

      expect(error.code).toBe(ErrorCode.API_SERVICE_UNAVAILABLE);
      expect(error.retryable).toBe(true);
    });

    it('maps 529 to provider overloaded', () => {
      const error = APIError.fromHttpStatus(529, 'claude');

      expect(error.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
      expect(error.retryable).toBe(true);
    });

    it('defaults to server error for unknown status', () => {
      const error = APIError.fromHttpStatus(418, 'teapot');

      expect(error.code).toBe(ErrorCode.API_SERVER_ERROR);
    });
  });

  it('creates provider overloaded error', () => {
    const error = APIError.providerOverloaded('Claude');

    expect(error.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    expect(error.userMessage).toContain('Claude');
    expect(error.userMessage).toContain('busy');
    expect(error.severity).toBe('warning');
    expect(error.retryable).toBe(true);
  });

  it('creates verification required error', () => {
    const error = APIError.verificationRequired('OpenAI');

    expect(error.code).toBe(ErrorCode.API_VERIFICATION_REQUIRED);
    expect(error.severity).toBe('info');
    expect(error.retryable).toBe(false);
  });

  it('creates streaming failed error', () => {
    const error = APIError.streamingFailed('Claude', 'Connection lost');

    expect(error.code).toBe(ErrorCode.API_STREAMING_FAILED);
    expect(error.retryable).toBe(true);
  });

  it('creates rate limited error', () => {
    const error = APIError.rateLimited('Claude', 60);

    expect(error.code).toBe(ErrorCode.API_RATE_LIMITED);
    expect(error.message).toContain('60');
  });

  it('creates invalid API key error', () => {
    const error = APIError.invalidApiKey('OpenAI');

    expect(error.code).toBe(ErrorCode.API_UNAUTHORIZED);
    expect(error.userMessage).toContain('OpenAI');
    expect(error.retryable).toBe(false);
  });

  it('creates content filtered error', () => {
    const error = APIError.contentFiltered('Claude');

    expect(error.code).toBe(ErrorCode.API_CONTENT_FILTERED);
    expect(error.retryable).toBe(false);
  });
});

describe('AuthError', () => {
  it('creates invalid credentials error', () => {
    const error = AuthError.invalidCredentials();

    expect(error.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(error.authProvider).toBe('email');
  });

  it('creates session expired error', () => {
    const error = AuthError.sessionExpired();

    expect(error.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
    expect(error.recoverable).toBe(true);
  });

  it('creates user disabled error', () => {
    const error = AuthError.userDisabled();

    expect(error.code).toBe(ErrorCode.AUTH_USER_DISABLED);
    expect(error.recoverable).toBe(false);
  });

  it('creates email in use error', () => {
    const error = AuthError.emailInUse('test@example.com');

    expect(error.code).toBe(ErrorCode.AUTH_EMAIL_IN_USE);
    expect(error.message).toContain('test@example.com');
  });

  it('creates weak password error', () => {
    const error = AuthError.weakPassword();

    expect(error.code).toBe(ErrorCode.AUTH_WEAK_PASSWORD);
  });

  it('creates Apple sign-in failed error', () => {
    const error = AuthError.socialAuthFailed('apple', 'User cancelled');

    expect(error.code).toBe(ErrorCode.AUTH_APPLE_SIGN_IN_FAILED);
    expect(error.authProvider).toBe('apple');
    expect(error.userMessage).toContain('Apple');
  });

  it('creates Google sign-in failed error', () => {
    const error = AuthError.socialAuthFailed('google');

    expect(error.code).toBe(ErrorCode.AUTH_GOOGLE_SIGN_IN_FAILED);
    expect(error.authProvider).toBe('google');
  });

  it('creates user not found error', () => {
    const error = AuthError.userNotFound('test@example.com');

    expect(error.code).toBe(ErrorCode.AUTH_USER_NOT_FOUND);
    expect(error.message).toContain('test@example.com');
  });

  it('creates network error', () => {
    const error = AuthError.networkError();

    expect(error.code).toBe(ErrorCode.AUTH_NETWORK_ERROR);
    expect(error.retryable).toBe(true);
  });

  describe('fromFirebaseCode', () => {
    it('maps auth/user-not-found', () => {
      const error = AuthError.fromFirebaseCode('auth/user-not-found');
      expect(error.code).toBe(ErrorCode.AUTH_USER_NOT_FOUND);
    });

    it('maps auth/wrong-password', () => {
      const error = AuthError.fromFirebaseCode('auth/wrong-password');
      expect(error.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('maps auth/email-already-in-use', () => {
      const error = AuthError.fromFirebaseCode('auth/email-already-in-use');
      expect(error.code).toBe(ErrorCode.AUTH_EMAIL_IN_USE);
    });

    it('maps auth/weak-password', () => {
      const error = AuthError.fromFirebaseCode('auth/weak-password');
      expect(error.code).toBe(ErrorCode.AUTH_WEAK_PASSWORD);
    });

    it('maps auth/network-request-failed', () => {
      const error = AuthError.fromFirebaseCode('auth/network-request-failed');
      expect(error.code).toBe(ErrorCode.AUTH_NETWORK_ERROR);
    });

    it('defaults to invalid credentials for unknown codes', () => {
      const error = AuthError.fromFirebaseCode('auth/unknown-error', 'Unknown');
      expect(error.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });
  });
});

describe('ValidationError', () => {
  it('creates required field error', () => {
    const error = ValidationError.required('Email');

    expect(error.code).toBe(ErrorCode.VALIDATION_REQUIRED);
    expect(error.field).toBe('Email');
    expect(error.userMessage).toContain('email');
    expect(error.severity).toBe('warning');
    expect(error.recoverable).toBe(true);
    expect(error.retryable).toBe(false);
  });

  it('creates invalid format error', () => {
    const error = ValidationError.invalidFormat('Email', 'email@example.com');

    expect(error.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT);
    expect(error.field).toBe('Email');
    expect(error.message).toContain('email@example.com');
  });

  it('creates API key invalid error', () => {
    const error = ValidationError.apiKeyInvalid('Claude');

    expect(error.code).toBe(ErrorCode.VALIDATION_API_KEY_INVALID);
    expect(error.field).toBe('apiKey');
    expect(error.context.provider).toBe('Claude');
  });

  it('creates message too long error', () => {
    const error = ValidationError.messageTooLong(4000, 5000);

    expect(error.code).toBe(ErrorCode.VALIDATION_MESSAGE_TOO_LONG);
    expect(error.message).toContain('5000');
    expect(error.message).toContain('4000');
    expect(error.userMessage).toContain('4000');
  });

  it('creates attachment too large error', () => {
    const error = ValidationError.attachmentTooLarge(10, 15.5);

    expect(error.code).toBe(ErrorCode.VALIDATION_ATTACHMENT_TOO_LARGE);
    expect(error.message).toContain('15.5');
    expect(error.userMessage).toContain('10');
  });

  it('creates unsupported format error', () => {
    const error = ValidationError.unsupportedFormat('exe', ['jpg', 'png', 'pdf']);

    expect(error.code).toBe(ErrorCode.VALIDATION_UNSUPPORTED_FORMAT);
    expect(error.value).toBe('exe');
    expect(error.message).toContain('jpg');
  });
});
