import { normalizeError } from '../utils/ErrorNormalizer';
import { AppError } from '../types/AppError';
import { NetworkError } from '../types/NetworkError';
import { APIError } from '../types/APIError';
import { AuthError } from '../types/AuthError';
import { ErrorCode } from '../codes/ErrorCodes';

describe('ErrorNormalizer', () => {
  describe('normalizeError', () => {
    it('returns AppError as-is when already an AppError', () => {
      const original = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test error',
      });

      const result = normalizeError(original);

      expect(result).toBe(original);
    });

    it('merges context when AppError has additional context', () => {
      const original = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test error',
        context: { original: true },
      });

      const result = normalizeError(original, { provider: 'claude' });

      expect(result.context.original).toBe(true);
      expect(result.context.provider).toBe('claude');
    });

    it('normalizes string error to AppError', () => {
      const result = normalizeError('Something went wrong');

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
      expect(result.message).toBe('Something went wrong');
    });

    it('normalizes object with message to AppError', () => {
      const result = normalizeError({ message: 'Object error', code: 'ERR001' });

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Object error');
    });

    it('normalizes unknown type to AppError', () => {
      const result = normalizeError(12345);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('normalizes null to AppError', () => {
      const result = normalizeError(null);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('normalizes undefined to AppError', () => {
      const result = normalizeError(undefined);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('network error detection', () => {
    it('detects offline error', () => {
      const result = normalizeError(new Error('Network request failed - device is offline'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('detects no internet error', () => {
      const result = normalizeError(new Error('No internet connection'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('detects timeout error', () => {
      const result = normalizeError(new Error('Request timeout'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });

    it('detects DNS failure', () => {
      const result = normalizeError(new Error('DNS lookup failed'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_DNS_FAILURE);
    });

    it('detects ENOTFOUND error', () => {
      const result = normalizeError(new Error('ENOTFOUND api.example.com'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_DNS_FAILURE);
    });

    it('detects SSL error', () => {
      const result = normalizeError(new Error('SSL certificate error'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_SSL_ERROR);
    });

    it('detects connection refused', () => {
      const result = normalizeError(new Error('ECONNREFUSED'));

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_CONNECTION_REFUSED);
    });

    it('detects generic network error', () => {
      const result = normalizeError(new Error('Network error occurred'));

      expect(result).toBeInstanceOf(NetworkError);
    });

    it('detects fetch error', () => {
      const result = normalizeError(new Error('fetch failed'));

      expect(result).toBeInstanceOf(NetworkError);
    });
  });

  describe('API error detection', () => {
    it('detects HTTP status code in parentheses', () => {
      const result = normalizeError(new Error('Claude API error (429): Rate limited'));

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('detects HTTP status with status prefix', () => {
      const result = normalizeError(new Error('Request failed with status: 500'));

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_SERVER_ERROR);
    });

    it('detects overload error pattern', () => {
      const result = normalizeError(
        new Error('Service is temporarily overloaded'),
        { provider: 'claude' }
      );

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });

    it('detects temporarily busy pattern', () => {
      const result = normalizeError(new Error('Claude is temporarily busy'));

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });

    it('detects verification required pattern', () => {
      const result = normalizeError(
        new Error('Organization must be verified for streaming')
      );

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_VERIFICATION_REQUIRED);
    });

    it('detects rate limit pattern', () => {
      const result = normalizeError(new Error('Rate limit exceeded'));

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('detects too many requests pattern', () => {
      const result = normalizeError(new Error('Too many requests'));

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });
  });

  describe('auth error detection', () => {
    it('detects session expired', () => {
      const result = normalizeError(new Error('Session has expired'));

      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
    });

    it('detects auth-related patterns', () => {
      // The normalizer groups auth-related messages
      const result = normalizeError(new Error('Auth error: user disabled'));

      expect(result).toBeInstanceOf(AuthError);
    });

    it('detects password error', () => {
      const result = normalizeError(new Error('Wrong password'));

      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('detects Firebase auth code in message', () => {
      const result = normalizeError(new Error('Firebase: Error (auth/user-not-found)'));

      expect(result).toBeInstanceOf(AuthError);
      // Firebase error code mapping is handled
      expect(result.code).toBe(ErrorCode.AUTH_USER_NOT_FOUND);
    });

    it('maps Firebase auth/wrong-password code', () => {
      const result = normalizeError(new Error('Firebase: Error (auth/wrong-password)'));

      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('maps Firebase auth/email-already-in-use code', () => {
      const result = normalizeError(new Error('Firebase: Error (auth/email-already-in-use)'));

      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe(ErrorCode.AUTH_EMAIL_IN_USE);
    });
  });

  describe('context preservation', () => {
    it('adds provider context to normalized error', () => {
      const result = normalizeError(
        new Error('Request failed'),
        { provider: 'claude', action: 'sendMessage' }
      );

      expect(result.context.provider).toBe('claude');
      expect(result.context.action).toBe('sendMessage');
    });

    it('preserves cause in normalized error', () => {
      const original = new Error('Original error');
      const result = normalizeError(original);

      expect(result.cause).toBe(original);
    });
  });
});
