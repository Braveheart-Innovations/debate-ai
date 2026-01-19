import { normalizeError } from '@/errors/utils/ErrorNormalizer';
import { AppError } from '@/errors/types/AppError';
import { NetworkError } from '@/errors/types/NetworkError';
import { APIError } from '@/errors/types/APIError';
import { AuthError } from '@/errors/types/AuthError';
import { ErrorCode } from '@/errors/codes/ErrorCodes';

describe('normalizeError', () => {
  describe('AppError passthrough', () => {
    it('returns AppError instance as-is when no context provided', () => {
      const appError = new AppError({
        code: ErrorCode.NETWORK_OFFLINE,
        message: 'Test',
      });

      const result = normalizeError(appError);

      expect(result).toBe(appError);
    });

    it('creates new AppError with merged context when context provided', () => {
      const appError = new AppError({
        code: ErrorCode.NETWORK_OFFLINE,
        message: 'Test',
        context: { existing: 'value' },
      });

      const result = normalizeError(appError, { provider: 'openai' });

      expect(result).not.toBe(appError);
      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
      expect(result.context.existing).toBe('value');
      expect(result.context.provider).toBe('openai');
    });

    it('preserves all AppError properties when merging context', () => {
      const appError = new AppError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Rate limited',
        userMessage: 'Custom message',
        severity: 'warning',
        recoverable: true,
        retryable: true,
      });

      const result = normalizeError(appError, { action: 'chat' });

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
      expect(result.userMessage).toBe('Custom message');
      expect(result.severity).toBe('warning');
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });
  });

  describe('Network Error Classification', () => {
    it('classifies "offline" as NETWORK_OFFLINE', () => {
      const error = new Error('Device is offline');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('classifies "no internet" as NETWORK_OFFLINE', () => {
      const error = new Error('No internet connection available');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('classifies "timeout" as NETWORK_TIMEOUT', () => {
      const error = new Error('Request timeout');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });

    it('classifies "dns" errors as NETWORK_DNS_FAILURE', () => {
      const error = new Error('DNS resolution failed');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_DNS_FAILURE);
    });

    it('classifies "ENOTFOUND" as NETWORK_DNS_FAILURE', () => {
      const error = new Error('getaddrinfo ENOTFOUND api.example.com');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_DNS_FAILURE);
    });

    it('classifies "ssl" errors as NETWORK_SSL_ERROR', () => {
      const error = new Error('SSL handshake failed');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_SSL_ERROR);
    });

    it('classifies "certificate" errors as NETWORK_SSL_ERROR', () => {
      const error = new Error('Invalid certificate');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_SSL_ERROR);
    });

    it('classifies "ECONNREFUSED" as NETWORK_CONNECTION_REFUSED', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_CONNECTION_REFUSED);
    });

    it('classifies "connection refused" as NETWORK_CONNECTION_REFUSED', () => {
      const error = new Error('Connection refused by server');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_CONNECTION_REFUSED);
    });

    it('classifies generic "network" errors as NetworkError', () => {
      const error = new Error('Network request failed');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(NetworkError);
    });

    it('classifies "fetch" errors as NetworkError', () => {
      const error = new Error('fetch failed');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(NetworkError);
    });

    it('classifies "socket" errors as NetworkError', () => {
      const error = new Error('Socket closed unexpectedly');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(NetworkError);
    });
  });

  describe('API Error Classification', () => {
    it('classifies (401) status as API_UNAUTHORIZED', () => {
      const error = new Error('Request failed (401)');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_UNAUTHORIZED);
    });

    it('classifies (403) status as API_FORBIDDEN', () => {
      const error = new Error('Access denied (403)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_FORBIDDEN);
    });

    it('classifies (404) status as API_NOT_FOUND', () => {
      const error = new Error('Resource not found (404)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_NOT_FOUND);
    });

    it('classifies (429) status as API_RATE_LIMITED', () => {
      const error = new Error('Too many requests (429)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('classifies (500) status as API_SERVER_ERROR', () => {
      const error = new Error('Internal server error (500)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_SERVER_ERROR);
    });

    it('classifies (503) status as API_SERVICE_UNAVAILABLE', () => {
      const error = new Error('Service unavailable (503)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_SERVICE_UNAVAILABLE);
    });

    it('parses status: XXX format', () => {
      const error = new Error('Request failed with status: 401');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_UNAUTHORIZED);
    });

    it('classifies "rate limit" text as API_RATE_LIMITED', () => {
      const error = new Error('Rate limit exceeded');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('classifies "too many requests" as API_RATE_LIMITED', () => {
      const error = new Error('Too many requests, please slow down');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('classifies "overload" as API_PROVIDER_OVERLOADED', () => {
      const error = new Error('Server is overloaded');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });

    it('classifies "temporarily busy" as API_PROVIDER_OVERLOADED', () => {
      const error = new Error('Service is temporarily busy');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });

    it('classifies "capacity" errors as API_PROVIDER_OVERLOADED', () => {
      const error = new Error('At capacity, try again later');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });

    it('classifies 529 status as API_PROVIDER_OVERLOADED', () => {
      const error = new Error('Error code 529: Site is overloaded');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });

    it('classifies "verification required" as API_VERIFICATION_REQUIRED', () => {
      const error = new Error('Organization must be verified to use streaming');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.API_VERIFICATION_REQUIRED);
    });

    it('uses provider from context when available', () => {
      const error = new Error('Rate limit exceeded');
      const result = normalizeError(error, { provider: 'claude' });

      expect(result.context.provider).toBe('claude');
    });
  });

  describe('Auth Error Classification', () => {
    it('classifies Firebase auth/invalid-credential', () => {
      const error = new Error('Firebase: Error (auth/invalid-credential)');
      const result = normalizeError(error);

      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('classifies Firebase auth/user-not-found', () => {
      const error = new Error('Firebase: Error (auth/user-not-found)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_USER_NOT_FOUND);
    });

    it('classifies Firebase auth/email-already-in-use', () => {
      const error = new Error('Firebase: Error (auth/email-already-in-use)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_EMAIL_IN_USE);
    });

    it('classifies Firebase auth/weak-password', () => {
      const error = new Error('Firebase: Error (auth/weak-password)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_WEAK_PASSWORD);
    });

    it('classifies Firebase auth/user-disabled', () => {
      const error = new Error('Firebase: Error (auth/user-disabled)');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_USER_DISABLED);
    });

    it('classifies Firebase auth/network-request-failed as NetworkError due to "network" keyword', () => {
      // Note: "network" keyword triggers network error detection before Firebase check
      const error = new Error('Firebase: Error (auth/network-request-failed)');
      const result = normalizeError(error);

      // Network detection runs first, so this becomes a network error
      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('classifies "session expired" as AUTH_SESSION_EXPIRED', () => {
      const error = new Error('Your session has expired');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
    });

    it('classifies "auth disabled" as AUTH_USER_DISABLED', () => {
      // isAuthError requires "auth" or similar keyword to trigger auth classification
      const error = new Error('Auth error: user has been disabled');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_USER_DISABLED);
    });

    it('classifies "password" errors as AUTH_INVALID_CREDENTIALS', () => {
      const error = new Error('Incorrect password');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('classifies "credential" errors as AUTH_INVALID_CREDENTIALS', () => {
      const error = new Error('Invalid credentials provided');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('classifies "login no account" as AUTH_USER_NOT_FOUND', () => {
      // isAuthError requires "login" or similar keyword to trigger auth classification
      const error = new Error('Login failed: no account found with this email');
      const result = normalizeError(error);

      expect(result.code).toBe(ErrorCode.AUTH_USER_NOT_FOUND);
    });
  });

  describe('String Error Handling', () => {
    it('converts string to AppError', () => {
      const result = normalizeError('Something went wrong');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Something went wrong');
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('includes context with string errors', () => {
      const result = normalizeError('Error message', { feature: 'chat' });

      expect(result.context.feature).toBe('chat');
    });
  });

  describe('Object Error Handling', () => {
    it('extracts message from object with message property', () => {
      const errorObj = { message: 'Error from object' };
      const result = normalizeError(errorObj);

      expect(result.message).toBe('Error from object');
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('handles objects with code and message', () => {
      const errorObj = { code: 'SOME_CODE', message: 'Error message' };
      const result = normalizeError(errorObj);

      // Note: normalizeError doesn't preserve arbitrary codes
      expect(result.message).toBe('Error message');
    });
  });

  describe('Unknown Error Handling', () => {
    it('handles null', () => {
      const result = normalizeError(null);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
      expect(result.message).toBe('An unknown error occurred');
    });

    it('handles undefined', () => {
      const result = normalizeError(undefined);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('handles numbers', () => {
      const result = normalizeError(42);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('handles empty objects', () => {
      const result = normalizeError({});

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('Error Properties', () => {
    it('sets default severity to error', () => {
      const result = normalizeError(new Error('Test'));

      expect(result.severity).toBe('error');
    });

    it('sets default recoverable to true', () => {
      const result = normalizeError(new Error('Test'));

      expect(result.recoverable).toBe(true);
    });

    it('preserves original error as cause', () => {
      const original = new Error('Original');
      const result = normalizeError(original);

      expect(result.cause).toBe(original);
    });

    it('generates user-friendly message based on code', () => {
      const error = new Error('Device is offline');
      const result = normalizeError(error);

      expect(result.userMessage).toBe(
        'You appear to be offline. Please check your internet connection.'
      );
    });
  });
});
