/**
 * Error System Integration Tests
 *
 * Tests the complete flow from error occurrence through to UI display:
 * 1. Error occurs in component
 * 2. ErrorService normalizes and dispatches to Redux
 * 3. errorSlice reducer adds error to state
 * 4. ToastNotification component receives and displays error
 */

import React from 'react';
import { Text } from 'react-native';
import { fireEvent, waitFor, act } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import { ErrorCode } from '@/errors/codes/ErrorCodes';
import { AppError } from '@/errors/types/AppError';
import { createAppStore } from '@/store';
import { addError, dismissError, clearErrors } from '@/store/errorSlice';

// Mock dependencies for ToastNotification
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) => {
    const { Text } = require('react-native');
    return <Text testID={testID || `icon-${name}`}>{name}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Animated.timing = jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
  }));
  RN.Animated.spring = jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
  }));
  RN.Animated.parallel = jest.fn((animations) => ({
    start: jest.fn((callback) => {
      animations.forEach((anim: any) => anim.start());
      callback && callback();
    }),
  }));
  return RN;
});

const { ToastNotification } = require('@/components/molecules/feedback/ToastNotification');

describe('Error System Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Redux errorSlice', () => {
    it('adds error to state when addError is dispatched', () => {
      const store = createAppStore();

      store.dispatch(
        addError({
          code: ErrorCode.NETWORK_OFFLINE,
          message: 'You appear to be offline',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: true,
          feature: 'chat',
          dismissed: false,
        })
      );

      const state = store.getState().errors;
      expect(state.errorQueue).toHaveLength(1);
      expect(state.errorQueue[0].code).toBe(ErrorCode.NETWORK_OFFLINE);
      expect(state.errorQueue[0].message).toBe('You appear to be offline');
      expect(state.errorQueue[0].id).toBeDefined();
    });

    it('dismisses error when dismissError is dispatched', () => {
      const store = createAppStore();

      store.dispatch(
        addError({
          code: ErrorCode.UNKNOWN,
          message: 'Test error',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: false,
          dismissed: false,
        })
      );

      const errorId = store.getState().errors.errorQueue[0].id;
      expect(store.getState().errors.errorQueue[0].dismissed).toBe(false);

      store.dispatch(dismissError(errorId));

      expect(store.getState().errors.errorQueue[0].dismissed).toBe(true);
    });

    it('clears all errors when clearErrors is dispatched', () => {
      const store = createAppStore();

      store.dispatch(
        addError({
          code: ErrorCode.UNKNOWN,
          message: 'Error 1',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: false,
          dismissed: false,
        })
      );

      // Advance time past deduplication window (2 seconds)
      jest.advanceTimersByTime(3000);

      store.dispatch(
        addError({
          code: ErrorCode.UNKNOWN,
          message: 'Error 2',
          severity: 'warning',
          timestamp: Date.now(),
          recoverable: true,
          retryable: false,
          dismissed: false,
        })
      );

      expect(store.getState().errors.errorQueue).toHaveLength(2);

      store.dispatch(clearErrors());

      expect(store.getState().errors.errorQueue).toHaveLength(0);
    });

    it('handles multiple errors with different severities', () => {
      const store = createAppStore();

      const severities = ['success', 'info', 'warning', 'error', 'critical'] as const;
      // Use different error codes to avoid deduplication
      const codes = [
        ErrorCode.NETWORK_OFFLINE,
        ErrorCode.NETWORK_TIMEOUT,
        ErrorCode.NETWORK_DNS_FAILURE,
        ErrorCode.NETWORK_SSL_ERROR,
        ErrorCode.NETWORK_CONNECTION_REFUSED,
      ];

      severities.forEach((severity, index) => {
        store.dispatch(
          addError({
            code: codes[index],
            message: `${severity} message`,
            severity,
            timestamp: Date.now(),
            recoverable: true,
            retryable: false,
            dismissed: false,
          })
        );
      });

      const state = store.getState().errors;
      expect(state.errorQueue).toHaveLength(5);
      expect(state.errorQueue.map((e) => e.severity)).toEqual(severities);
    });
  });

  describe('ToastNotification Display', () => {
    const createToastProps = (overrides = {}) => ({
      message: 'Test message',
      severity: 'error' as const,
      visible: true,
      onDismiss: jest.fn(),
      ...overrides,
    });

    it('displays error message correctly', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ message: 'Network is offline' })} />
      );

      expect(getByText('Network is offline')).toBeTruthy();
    });

    it('shows correct icon for error severity', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ severity: 'error' })} />
      );

      expect(getByText('close-circle')).toBeTruthy();
    });

    it('shows correct icon for success severity', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ severity: 'success' })} />
      );

      expect(getByText('checkmark-circle')).toBeTruthy();
    });

    it('shows correct icon for warning severity', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ severity: 'warning' })} />
      );

      expect(getByText('warning')).toBeTruthy();
    });

    it('shows correct icon for info severity', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ severity: 'info' })} />
      );

      expect(getByText('information-circle')).toBeTruthy();
    });

    it('shows correct icon for critical severity', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ severity: 'critical' })} />
      );

      expect(getByText('alert-circle')).toBeTruthy();
    });

    it('shows retry button when retryable is true', () => {
      const onRetry = jest.fn();
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ retryable: true, onRetry })} />
      );

      const retryButton = getByText('Retry');
      expect(retryButton).toBeTruthy();

      fireEvent.press(retryButton);
      expect(onRetry).toHaveBeenCalled();
    });

    it('calls onDismiss when dismiss button pressed', () => {
      const onDismiss = jest.fn();
      const { getByText } = renderWithProviders(
        <ToastNotification {...createToastProps({ onDismiss })} />
      );

      const dismissButton = getByText('close');
      fireEvent.press(dismissButton);

      expect(onDismiss).toHaveBeenCalled();
    });

    it('auto-dismisses after duration', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...createToastProps({
            onDismiss,
            duration: 3000,
            severity: 'info',
          })}
        />
      );

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(onDismiss).toHaveBeenCalled();
    });

    it('does not auto-dismiss critical errors', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...createToastProps({
            onDismiss,
            duration: 3000,
            severity: 'critical',
          })}
        />
      );

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('AppError Construction', () => {
    it('creates AppError with all properties', () => {
      const appError = new AppError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Rate limited by API',
        userMessage: 'Please wait before trying again',
        severity: 'warning',
        recoverable: true,
        retryable: true,
        context: { provider: 'openai', action: 'sendMessage' },
      });

      expect(appError.code).toBe(ErrorCode.API_RATE_LIMITED);
      expect(appError.message).toBe('Rate limited by API');
      expect(appError.userMessage).toBe('Please wait before trying again');
      expect(appError.severity).toBe('warning');
      expect(appError.recoverable).toBe(true);
      expect(appError.retryable).toBe(true);
      expect(appError.context.provider).toBe('openai');
      expect(appError.timestamp).toBeDefined();
    });

    it('generates user message from error code when not provided', () => {
      const appError = new AppError({
        code: ErrorCode.NETWORK_OFFLINE,
        message: 'Internal network error',
      });

      expect(appError.userMessage).toBe(
        'You appear to be offline. Please check your internet connection.'
      );
    });

    it('serializes to JSON correctly', () => {
      const appError = new AppError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
        severity: 'error',
      });

      const json = appError.toJSON();

      expect(json.code).toBe(ErrorCode.UNKNOWN);
      expect(json.message).toBe('Test');
      expect(json.severity).toBe('error');
      expect(json.timestamp).toBeDefined();
    });

    it('formats toString correctly', () => {
      const appError = new AppError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Too many requests',
      });

      expect(appError.toString()).toBe('[E2004] Too many requests');
    });
  });

  describe('Error Feature Filtering', () => {
    it('stores feature with error', () => {
      const store = createAppStore();

      store.dispatch(
        addError({
          code: ErrorCode.NETWORK_OFFLINE,
          message: 'Chat error',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: false,
          feature: 'chat',
          dismissed: false,
        })
      );

      store.dispatch(
        addError({
          code: ErrorCode.NETWORK_TIMEOUT,
          message: 'Debate error',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: false,
          feature: 'debate',
          dismissed: false,
        })
      );

      const state = store.getState().errors;
      const chatErrors = state.errorQueue.filter((e) => e.feature === 'chat');
      const debateErrors = state.errorQueue.filter((e) => e.feature === 'debate');

      expect(chatErrors).toHaveLength(1);
      expect(debateErrors).toHaveLength(1);
    });

    it('tracks errors per feature in featureErrors', () => {
      const store = createAppStore();

      store.dispatch(
        addError({
          code: ErrorCode.NETWORK_OFFLINE,
          message: 'Chat offline',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: true,
          feature: 'chat',
          dismissed: false,
        })
      );

      const state = store.getState().errors;
      expect(state.featureErrors['chat']).toBeDefined();
      expect(state.featureErrors['chat']?.code).toBe(ErrorCode.NETWORK_OFFLINE);
    });

    it('sets activeToast when first error is added', () => {
      const store = createAppStore();

      store.dispatch(
        addError({
          code: ErrorCode.UNKNOWN,
          message: 'First error',
          severity: 'error',
          timestamp: Date.now(),
          recoverable: true,
          retryable: false,
          dismissed: false,
        })
      );

      const state = store.getState().errors;
      expect(state.activeToast).not.toBeNull();
      expect(state.activeToast?.message).toBe('First error');
    });
  });
});
