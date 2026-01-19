import { ErrorService } from '@/services/errors/ErrorService';
import { ErrorCode } from '@/errors/codes/ErrorCodes';
import { AppError } from '@/errors/types/AppError';
import { store } from '@/store';
import { addError } from '@/store/errorSlice';

// Mock the Redux store
jest.mock('@/store', () => ({
  store: {
    dispatch: jest.fn(),
  },
}));

// Mock Logger to suppress console output during tests
jest.mock('@/services/logging/Logger', () => ({
  Logger: {
    getInstance: () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    }),
  },
}));

// Mock CrashlyticsService
jest.mock('@/services/crashlytics', () => ({
  CrashlyticsService: {
    recordError: jest.fn(),
  },
}));

describe('ErrorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleError', () => {
    it('handles Error instances and returns AppError', () => {
      const error = new Error('Test error message');
      const result = ErrorService.handleError(error);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Test error message');
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('handles string errors', () => {
      const result = ErrorService.handleError('String error message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('String error message');
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('handles actual AppError instances and preserves properties', () => {
      const appError = new AppError({
        code: ErrorCode.NETWORK_OFFLINE,
        message: 'Network is offline',
        severity: 'error',
        recoverable: true,
        retryable: true,
      });

      const result = ErrorService.handleError(appError);

      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
      expect(result.message).toBe('Network is offline');
      expect(result.retryable).toBe(true);
      expect(result.recoverable).toBe(true);
    });

    it('merges context when handling AppError with additional context', () => {
      const appError = new AppError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Rate limited',
        context: { provider: 'openai' },
      });

      const result = ErrorService.handleError(appError, {
        context: { action: 'sendMessage' },
      });

      expect(result.context.provider).toBe('openai');
      expect(result.context.action).toBe('sendMessage');
    });

    it('handles null/undefined errors gracefully', () => {
      const result = ErrorService.handleError(null);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.UNKNOWN);
    });

    it('adds feature context when provided', () => {
      const error = new Error('Test error');
      const result = ErrorService.handleError(error, { feature: 'chat' });

      expect(result.context.feature).toBe('chat');
    });

    it('dispatches to Redux store when showToast is true (default)', () => {
      const error = new Error('Test error');
      ErrorService.handleError(error);

      expect(store.dispatch).toHaveBeenCalled();
    });

    it('does not dispatch to Redux when showToast is false', () => {
      const error = new Error('Test error');
      ErrorService.handleError(error, { showToast: false });

      expect(store.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('Error Classification through handleError', () => {
    it('classifies network offline errors', () => {
      const error = new Error('Device is offline');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('classifies timeout errors', () => {
      const error = new Error('Request timeout exceeded');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });

    it('classifies DNS errors', () => {
      const error = new Error('DNS lookup failed ENOTFOUND');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_DNS_FAILURE);
    });

    it('classifies SSL errors', () => {
      const error = new Error('SSL certificate error');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_SSL_ERROR);
    });

    it('classifies connection refused errors', () => {
      const error = new Error('Connection refused ECONNREFUSED');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.NETWORK_CONNECTION_REFUSED);
    });

    it('classifies rate limit errors', () => {
      const error = new Error('Rate limit exceeded - too many requests');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('classifies 429 status code errors', () => {
      const error = new Error('Error 429: Too many requests');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('classifies HTTP status code errors', () => {
      const error = new Error('Request failed (401)');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.API_UNAUTHORIZED);
    });

    it('classifies 500 server errors', () => {
      const error = new Error('Internal server error (500)');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.API_SERVER_ERROR);
    });

    it('classifies session expired errors', () => {
      const error = new Error('Session has expired');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
    });

    it('classifies provider overloaded errors', () => {
      const error = new Error('Server is overloaded');
      const result = ErrorService.handleError(error);

      expect(result.code).toBe(ErrorCode.API_PROVIDER_OVERLOADED);
    });
  });

  describe('handleWithToast', () => {
    it('dispatches error to store', () => {
      const error = new Error('Toast error');
      ErrorService.handleWithToast(error);

      expect(store.dispatch).toHaveBeenCalled();
    });

    it('includes feature in dispatched error', () => {
      const error = new Error('Toast error');
      ErrorService.handleWithToast(error, { feature: 'subscription' });

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
        })
      );
    });

    it('returns AppError', () => {
      const error = new Error('Toast error');
      const result = ErrorService.handleWithToast(error);

      expect(result).toBeInstanceOf(AppError);
    });
  });

  describe('handleSilent', () => {
    it('does not dispatch to store', () => {
      const error = new Error('Silent error');
      ErrorService.handleSilent(error);

      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('returns processed AppError', () => {
      const error = new Error('Silent error');
      const result = ErrorService.handleSilent(error);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Silent error');
    });

    it('accepts context parameter', () => {
      const error = new Error('Silent error');
      const result = ErrorService.handleSilent(error, { provider: 'openai' });

      expect(result.context.provider).toBe('openai');
    });
  });

  describe('showSuccess', () => {
    it('dispatches success toast to store', () => {
      ErrorService.showSuccess('Operation completed!', 'test-feature');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
          payload: expect.objectContaining({
            message: 'Operation completed!',
            severity: 'success',
            feature: 'test-feature',
          }),
        })
      );
    });

    it('works without feature parameter', () => {
      ErrorService.showSuccess('Success message');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
          payload: expect.objectContaining({
            message: 'Success message',
            severity: 'success',
          }),
        })
      );
    });

    it('sets recoverable to true and retryable to false', () => {
      ErrorService.showSuccess('Success');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            recoverable: true,
            retryable: false,
          }),
        })
      );
    });
  });

  describe('showInfo', () => {
    it('dispatches info toast to store', () => {
      ErrorService.showInfo('Information message', 'info-feature');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
          payload: expect.objectContaining({
            message: 'Information message',
            severity: 'info',
            feature: 'info-feature',
          }),
        })
      );
    });

    it('works without feature parameter', () => {
      ErrorService.showInfo('Info message');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
          payload: expect.objectContaining({
            message: 'Info message',
            severity: 'info',
          }),
        })
      );
    });
  });

  describe('showWarning', () => {
    it('dispatches warning toast to store', () => {
      ErrorService.showWarning('Warning message', 'warning-feature');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
          payload: expect.objectContaining({
            message: 'Warning message',
            severity: 'warning',
            feature: 'warning-feature',
          }),
        })
      );
    });

    it('works without feature parameter', () => {
      ErrorService.showWarning('Caution message');

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
          payload: expect.objectContaining({
            message: 'Caution message',
            severity: 'warning',
          }),
        })
      );
    });
  });

  describe('getUserMessage', () => {
    it('returns userMessage from AppError', () => {
      const appError = new AppError({
        code: ErrorCode.NETWORK_OFFLINE,
        message: 'Internal message',
        userMessage: 'Custom user message',
      });

      const message = ErrorService.getUserMessage(appError);

      expect(message).toBe('Custom user message');
    });

    it('returns user-friendly message for Error instances', () => {
      const error = new Error('Some error');
      const message = ErrorService.getUserMessage(error);

      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
    });

    it('returns unknown error message for non-Error types', () => {
      const message = ErrorService.getUserMessage('string error');

      expect(message).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('createAppError', () => {
    it('creates AppError without handling (no logging/toast)', () => {
      const error = new Error('Test');
      const result = ErrorService.createAppError(error);

      expect(result).toBeInstanceOf(AppError);
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('accepts context parameter', () => {
      const error = new Error('Test');
      const result = ErrorService.createAppError(error, { provider: 'claude' });

      expect(result.context.provider).toBe('claude');
    });
  });

  describe('getSeverityLevel', () => {
    it('returns severity from AppError', () => {
      const appError = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
        severity: 'warning',
      });

      expect(ErrorService.getSeverityLevel(appError)).toBe('warning');
    });

    it('returns error for non-AppError', () => {
      expect(ErrorService.getSeverityLevel(new Error('Test'))).toBe('error');
    });
  });

  describe('isRetryable', () => {
    it('returns true for retryable AppError', () => {
      const appError = new AppError({
        code: ErrorCode.NETWORK_TIMEOUT,
        message: 'Timeout',
        retryable: true,
      });

      expect(ErrorService.isRetryable(appError)).toBe(true);
    });

    it('returns false for non-retryable AppError', () => {
      const appError = new AppError({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid',
        retryable: false,
      });

      expect(ErrorService.isRetryable(appError)).toBe(false);
    });

    it('returns false for non-AppError', () => {
      expect(ErrorService.isRetryable(new Error('Test'))).toBe(false);
    });
  });

  describe('isRecoverable', () => {
    it('returns recoverable flag from AppError', () => {
      const appError = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
        recoverable: false,
      });

      expect(ErrorService.isRecoverable(appError)).toBe(false);
    });

    it('returns true for non-AppError (default)', () => {
      expect(ErrorService.isRecoverable(new Error('Test'))).toBe(true);
    });
  });
});
