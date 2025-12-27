import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useError } from '../useError';
import errorReducer, { addError } from '../../store/errorSlice';
import { ErrorCode } from '../../errors/codes/ErrorCodes';
import { AppError } from '../../errors/types/AppError';

// Mock ErrorService
jest.mock('../../services/errors/ErrorService', () => ({
  ErrorService: {
    handleError: jest.fn((error, _options) => {
      const appError = new (jest.requireActual('../../errors/types/AppError').AppError)({
        code: 'E9999',
        message: error.message || 'Test error',
        userMessage: 'Something went wrong',
        severity: 'error',
        recoverable: true,
        retryable: false,
      });
      return appError;
    }),
    handleSilent: jest.fn((error) => {
      const appError = new (jest.requireActual('../../errors/types/AppError').AppError)({
        code: 'E9999',
        message: error.message || 'Test error',
        userMessage: 'Something went wrong',
      });
      return appError;
    }),
    logError: jest.fn((code, message) => {
      const appError = new (jest.requireActual('../../errors/types/AppError').AppError)({
        code,
        message,
        userMessage: 'Something went wrong',
      });
      return appError;
    }),
    getUserMessage: jest.fn(() => 'User-friendly error message'),
  },
}));

// Import after mocking
import { ErrorService } from '../../services/errors/ErrorService';

const createTestStore = () =>
  configureStore({
    reducer: {
      errors: errorReducer,
    },
  });

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const store = createTestStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.createElement(Provider, { store } as any, children);
};

describe('useError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleError', () => {
    it('calls ErrorService.handleError with error', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(ErrorService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          showToast: true,
          logToCrashlytics: true,
        })
      );
    });

    it('passes feature option to ErrorService', () => {
      const { result } = renderHook(() => useError({ feature: 'chat' }), { wrapper });

      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(ErrorService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          feature: 'chat',
        })
      );
    });

    it('passes context to ErrorService', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      act(() => {
        result.current.handleError(new Error('Test'), { provider: 'claude' });
      });

      expect(ErrorService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: { provider: 'claude' },
        })
      );
    });

    it('returns AppError from ErrorService', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      let appError: AppError | undefined;
      act(() => {
        appError = result.current.handleError(new Error('Test'));
      });

      expect(appError).toBeInstanceOf(AppError);
    });
  });

  describe('handleErrorSilent', () => {
    it('calls ErrorService.handleSilent', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      act(() => {
        result.current.handleErrorSilent(new Error('Silent error'));
      });

      expect(ErrorService.handleSilent).toHaveBeenCalledWith(
        expect.any(Error),
        undefined
      );
    });
  });

  describe('clearError', () => {
    it('dispatches clearFeatureError when feature is set', () => {
      const store = createTestStore();
      const customWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(Provider, { store } as React.ComponentProps<typeof Provider>, children);

      // Add an error first
      store.dispatch(addError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
        severity: 'error',
        timestamp: Date.now(),
        recoverable: true,
        retryable: false,
        feature: 'chat',
        dismissed: false,
      }));

      const { result } = renderHook(() => useError({ feature: 'chat' }), {
        wrapper: customWrapper,
      });

      expect(store.getState().errors.featureErrors.chat).not.toBeUndefined();

      act(() => {
        result.current.clearError();
      });

      expect(store.getState().errors.featureErrors.chat).toBeUndefined();
    });
  });

  describe('clearAllErrors', () => {
    it('dispatches clearErrors action', () => {
      const store = createTestStore();
      const customWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(Provider, { store } as React.ComponentProps<typeof Provider>, children);

      // Add errors
      store.dispatch(addError({
        code: ErrorCode.UNKNOWN,
        message: 'Error 1',
        severity: 'error',
        timestamp: Date.now(),
        recoverable: true,
        retryable: false,
        dismissed: false,
      }));

      const { result } = renderHook(() => useError(), { wrapper: customWrapper });

      expect(store.getState().errors.errorQueue.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearAllErrors();
      });

      expect(store.getState().errors.errorQueue).toHaveLength(0);
    });
  });

  describe('featureError', () => {
    it('returns error for feature from store', () => {
      const store = createTestStore();
      const customWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(Provider, { store } as React.ComponentProps<typeof Provider>, children);

      store.dispatch(addError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Rate limited',
        severity: 'warning',
        timestamp: Date.now(),
        recoverable: true,
        retryable: true,
        feature: 'chat',
        dismissed: false,
      }));

      const { result } = renderHook(() => useError({ feature: 'chat' }), {
        wrapper: customWrapper,
      });

      expect(result.current.featureError).not.toBeNull();
      expect(result.current.featureError?.code).toBe(ErrorCode.API_RATE_LIMITED);
    });

    it('returns null when no feature specified', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      expect(result.current.featureError).toBeNull();
    });
  });

  describe('hasErrors', () => {
    it('returns true when errors exist', () => {
      const store = createTestStore();
      const customWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(Provider, { store } as React.ComponentProps<typeof Provider>, children);

      store.dispatch(addError({
        code: ErrorCode.UNKNOWN,
        message: 'Error',
        severity: 'error',
        timestamp: Date.now(),
        recoverable: true,
        retryable: false,
        dismissed: false,
      }));

      const { result } = renderHook(() => useError(), { wrapper: customWrapper });

      expect(result.current.hasErrors).toBe(true);
    });

    it('returns false when no errors', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      expect(result.current.hasErrors).toBe(false);
    });
  });

  describe('withErrorHandling', () => {
    it('returns result on success', async () => {
      const { result } = renderHook(() => useError(), { wrapper });

      const value = await result.current.withErrorHandling(async () => 'success');

      expect(value).toBe('success');
    });

    it('returns undefined and handles error on failure', async () => {
      const { result } = renderHook(() => useError(), { wrapper });

      const value = await result.current.withErrorHandling(async () => {
        throw new Error('Failed');
      });

      expect(value).toBeUndefined();
      expect(ErrorService.handleError).toHaveBeenCalled();
    });

    it('calls onError callback on failure', async () => {
      const { result } = renderHook(() => useError(), { wrapper });
      const onError = jest.fn();

      await result.current.withErrorHandling(
        async () => {
          throw new Error('Failed');
        },
        { onError }
      );

      expect(onError).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns result on success', async () => {
      const { result } = renderHook(() => useError(), { wrapper });

      const promise = result.current.withRetry(async () => 'success');
      jest.runAllTimers();

      const value = await promise;

      expect(value).toBe('success');
    });

    it('retries on failure', async () => {
      const { result } = renderHook(() => useError(), { wrapper });

      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('success');

      const promise = result.current.withRetry(fn, { maxAttempts: 3, jitter: false });

      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      const value = await promise;

      expect(value).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('logError', () => {
    it('calls ErrorService.logError with code and message', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      act(() => {
        result.current.logError(ErrorCode.APP_PREMIUM_REQUIRED, 'Premium required');
      });

      expect(ErrorService.logError).toHaveBeenCalledWith(
        ErrorCode.APP_PREMIUM_REQUIRED,
        'Premium required',
        expect.any(Object)
      );
    });
  });

  describe('getUserMessage', () => {
    it('calls ErrorService.getUserMessage', () => {
      const { result } = renderHook(() => useError(), { wrapper });

      const message = result.current.getUserMessage(new Error('Test'));

      expect(ErrorService.getUserMessage).toHaveBeenCalled();
      expect(message).toBe('User-friendly error message');
    });
  });

  describe('options', () => {
    it('respects showToast option', () => {
      const { result } = renderHook(() => useError({ showToast: false }), { wrapper });

      act(() => {
        result.current.handleError(new Error('Test'));
      });

      expect(ErrorService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          showToast: false,
        })
      );
    });

    it('respects logToCrashlytics option', () => {
      const { result } = renderHook(() => useError({ logToCrashlytics: false }), { wrapper });

      act(() => {
        result.current.handleError(new Error('Test'));
      });

      expect(ErrorService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          logToCrashlytics: false,
        })
      );
    });
  });
});
