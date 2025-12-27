// Mock the store before importing ErrorService
jest.mock('../../../store', () => ({
  store: {
    dispatch: jest.fn(),
  },
}));

// Mock Logger - create the mock object inline in the factory
jest.mock('../../logging/Logger', () => {
  const mockLoggerInstance = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    Logger: {
      getInstance: jest.fn(() => mockLoggerInstance),
      _mockInstance: mockLoggerInstance, // Expose for tests
    },
  };
});

// Mock CrashlyticsService
jest.mock('../../crashlytics', () => ({
  CrashlyticsService: {
    recordError: jest.fn(),
    log: jest.fn(),
  },
}));

import { ErrorService } from '../ErrorService';
import { store } from '../../../store';
import { CrashlyticsService } from '../../crashlytics';
import { Logger } from '../../logging/Logger';
import { AppError } from '../../../errors/types/AppError';
import { NetworkError } from '../../../errors/types/NetworkError';
import { APIError } from '../../../errors/types/APIError';
import { ErrorCode } from '../../../errors/codes/ErrorCodes';
import { addError } from '../../../store/errorSlice';

// Access mock instances - use unknown intermediate for type safety in tests
const mockStore = store as unknown as { dispatch: jest.Mock };
const mockCrashlytics = CrashlyticsService as unknown as { recordError: jest.Mock; log: jest.Mock };
const mockLogger = (Logger as unknown as { _mockInstance: { error: jest.Mock; warn: jest.Mock } })._mockInstance;

describe('ErrorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleError', () => {
    it('normalizes and handles a standard Error', () => {
      const error = new Error('Something went wrong');

      const result = ErrorService.handleError(error);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Something went wrong');
      expect(mockStore.dispatch).toHaveBeenCalled();
    });

    it('passes through AppError unchanged', () => {
      const appError = new AppError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Rate limited',
        userMessage: 'Too many requests',
      });

      const result = ErrorService.handleError(appError);

      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
      expect(result.userMessage).toBe('Too many requests');
    });

    it('logs error to Logger', () => {
      const error = new Error('Test error');

      ErrorService.handleError(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error'),
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('logs to Crashlytics for non-info severity', () => {
      const error = new AppError({
        code: ErrorCode.API_SERVER_ERROR,
        message: 'Server error',
        severity: 'error',
      });

      ErrorService.handleError(error);

      expect(mockCrashlytics.recordError).toHaveBeenCalled();
    });

    it('skips Crashlytics for info severity', () => {
      const error = new AppError({
        code: ErrorCode.API_VERIFICATION_REQUIRED,
        message: 'Verification required',
        severity: 'info',
      });

      ErrorService.handleError(error);

      expect(mockCrashlytics.recordError).not.toHaveBeenCalled();
    });

    it('dispatches to Redux when showToast is true', () => {
      const error = new Error('Test error');

      ErrorService.handleError(error, { showToast: true });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: addError.type,
        })
      );
    });

    it('skips Redux dispatch when showToast is false', () => {
      const error = new Error('Test error');

      ErrorService.handleError(error, { showToast: false });

      expect(mockStore.dispatch).not.toHaveBeenCalled();
    });

    it('adds feature context when provided', () => {
      const error = new Error('Test error');

      const result = ErrorService.handleError(error, { feature: 'chat' });

      expect(result.context.feature).toBe('chat');
    });

    it('adds custom context to error', () => {
      const error = new Error('Test error');

      const result = ErrorService.handleError(error, {
        context: { provider: 'claude', action: 'sendMessage' },
      });

      expect(result.context.provider).toBe('claude');
      expect(result.context.action).toBe('sendMessage');
    });

    it('skips Crashlytics when logToCrashlytics is false', () => {
      const error = new AppError({
        code: ErrorCode.API_SERVER_ERROR,
        message: 'Server error',
        severity: 'error',
      });

      ErrorService.handleError(error, { logToCrashlytics: false });

      expect(mockCrashlytics.recordError).not.toHaveBeenCalled();
    });
  });

  describe('handleSilent', () => {
    it('logs error but does not show toast', () => {
      const error = new Error('Silent error');

      ErrorService.handleSilent(error);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockStore.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('handleWithToast', () => {
    it('shows toast but skips Crashlytics', () => {
      const error = new AppError({
        code: ErrorCode.VALIDATION_REQUIRED,
        message: 'Field required',
        severity: 'warning',
      });

      ErrorService.handleWithToast(error);

      expect(mockStore.dispatch).toHaveBeenCalled();
      expect(mockCrashlytics.recordError).not.toHaveBeenCalled();
    });
  });

  describe('handleWithCrashlytics', () => {
    it('logs to Crashlytics but skips toast', () => {
      const error = new AppError({
        code: ErrorCode.API_SERVER_ERROR,
        message: 'Background error',
        severity: 'error',
      });

      ErrorService.handleWithCrashlytics(error);

      expect(mockCrashlytics.recordError).toHaveBeenCalled();
      expect(mockStore.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('getUserMessage', () => {
    it('returns userMessage from AppError', () => {
      const error = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Technical error',
        userMessage: 'Something went wrong',
      });

      expect(ErrorService.getUserMessage(error)).toBe('Something went wrong');
    });

    it('normalizes Error and returns user message', () => {
      const error = new Error('Network request failed - device is offline');

      const message = ErrorService.getUserMessage(error);

      expect(message).toContain('offline');
    });

    it('returns default message for unknown errors', () => {
      const message = ErrorService.getUserMessage('string error');

      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(0);
    });
  });

  describe('createAppError', () => {
    it('creates AppError without handling', () => {
      const error = new Error('Test error');

      const result = ErrorService.createAppError(error);

      expect(result).toBeInstanceOf(AppError);
      expect(mockStore.dispatch).not.toHaveBeenCalled();
      expect(mockCrashlytics.recordError).not.toHaveBeenCalled();
    });

    it('adds context to created error', () => {
      const error = new Error('Test error');

      const result = ErrorService.createAppError(error, { provider: 'claude' });

      expect(result.context.provider).toBe('claude');
    });
  });

  describe('logError', () => {
    it('creates and handles error by code', () => {
      const result = ErrorService.logError(
        ErrorCode.APP_PREMIUM_REQUIRED,
        'Premium feature accessed',
        { feature: 'debate' }
      );

      expect(result.code).toBe(ErrorCode.APP_PREMIUM_REQUIRED);
      expect(mockStore.dispatch).toHaveBeenCalled();
    });
  });

  describe('getSeverityLevel', () => {
    it('returns severity from AppError', () => {
      const error = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
        severity: 'warning',
      });

      expect(ErrorService.getSeverityLevel(error)).toBe('warning');
    });

    it('returns "error" for non-AppError', () => {
      expect(ErrorService.getSeverityLevel(new Error('Test'))).toBe('error');
      expect(ErrorService.getSeverityLevel('string')).toBe('error');
    });
  });

  describe('isRetryable', () => {
    it('returns true for retryable AppError', () => {
      const error = NetworkError.timeout();

      expect(ErrorService.isRetryable(error)).toBe(true);
    });

    it('returns false for non-retryable AppError', () => {
      const error = APIError.invalidApiKey('claude');

      expect(ErrorService.isRetryable(error)).toBe(false);
    });

    it('returns false for non-AppError', () => {
      expect(ErrorService.isRetryable(new Error('Test'))).toBe(false);
    });
  });

  describe('isRecoverable', () => {
    it('returns true for recoverable AppError', () => {
      const error = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
        recoverable: true,
      });

      expect(ErrorService.isRecoverable(error)).toBe(true);
    });

    it('returns false for non-recoverable AppError', () => {
      const error = new AppError({
        code: ErrorCode.AUTH_USER_DISABLED,
        message: 'User disabled',
        recoverable: false,
      });

      expect(ErrorService.isRecoverable(error)).toBe(false);
    });

    it('returns true for non-AppError (default recoverable)', () => {
      expect(ErrorService.isRecoverable(new Error('Test'))).toBe(true);
    });
  });

  describe('error normalization integration', () => {
    it('normalizes network errors correctly', () => {
      const error = new Error('fetch failed: network error');

      const result = ErrorService.handleError(error);

      expect(result).toBeInstanceOf(NetworkError);
    });

    it('normalizes API errors correctly', () => {
      const error = new Error('API error (429): Rate limit exceeded');

      const result = ErrorService.handleError(error);

      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe(ErrorCode.API_RATE_LIMITED);
    });
  });
});
