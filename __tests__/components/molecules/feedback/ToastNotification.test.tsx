import React from 'react';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock dependencies
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) => {
    const { Text } = require('react-native');
    return <Text testID={testID || `icon-${name}`}>{name}</Text>;
  }
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

describe('ToastNotification', () => {
  const defaultProps = {
    message: 'Test message',
    severity: 'info' as const,
    visible: true,
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} />
      );
      expect(getByText('Test message')).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      const { queryByText } = renderWithProviders(
        <ToastNotification {...defaultProps} visible={false} />
      );
      expect(queryByText('Test message')).toBeNull();
    });

    it('displays the message text', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} message="Custom error message" />
      );
      expect(getByText('Custom error message')).toBeTruthy();
    });
  });

  describe('Severity Variants', () => {
    it('renders success severity correctly', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} severity="success" />
      );
      expect(getByText('checkmark-circle')).toBeTruthy();
    });

    it('renders info severity correctly', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} severity="info" />
      );
      expect(getByText('information-circle')).toBeTruthy();
    });

    it('renders warning severity correctly', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} severity="warning" />
      );
      expect(getByText('warning')).toBeTruthy();
    });

    it('renders error severity correctly', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} severity="error" />
      );
      expect(getByText('close-circle')).toBeTruthy();
    });

    it('renders critical severity correctly', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} severity="critical" />
      );
      expect(getByText('alert-circle')).toBeTruthy();
    });

    it('auto-dismisses success toasts', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...defaultProps}
          onDismiss={onDismiss}
          duration={2000}
          severity="success"
        />
      );

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('Dismiss Behavior', () => {
    it('calls onDismiss when dismiss button is pressed', () => {
      const onDismiss = jest.fn();
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} onDismiss={onDismiss} />
      );

      const dismissIcon = getByText('close');
      fireEvent.press(dismissIcon);

      expect(onDismiss).toHaveBeenCalled();
    });

    it('auto-dismisses after duration for non-critical errors', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...defaultProps}
          onDismiss={onDismiss}
          duration={2000}
          severity="info"
        />
      );

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(onDismiss).toHaveBeenCalled();
    });

    it('does not auto-dismiss critical errors', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...defaultProps}
          onDismiss={onDismiss}
          duration={2000}
          severity="critical"
        />
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not auto-dismiss when duration is 0', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...defaultProps}
          onDismiss={onDismiss}
          duration={0}
        />
      );

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('Retry Button', () => {
    it('shows retry button when retryable is true and onRetry is provided', () => {
      const onRetry = jest.fn();
      const { getByText } = renderWithProviders(
        <ToastNotification
          {...defaultProps}
          retryable={true}
          onRetry={onRetry}
        />
      );

      expect(getByText('Retry')).toBeTruthy();
    });

    it('does not show retry button when retryable is false', () => {
      const { queryByText } = renderWithProviders(
        <ToastNotification
          {...defaultProps}
          retryable={false}
          onRetry={() => {}}
        />
      );

      expect(queryByText('Retry')).toBeNull();
    });

    it('calls onRetry when retry button is pressed', () => {
      const onRetry = jest.fn();
      const { getByText } = renderWithProviders(
        <ToastNotification
          {...defaultProps}
          retryable={true}
          onRetry={onRetry}
        />
      );

      fireEvent.press(getByText('Retry'));
      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('Position', () => {
    it('renders at top position by default', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} />
      );
      expect(getByText('Test message')).toBeTruthy();
    });

    it('renders at bottom position when specified', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} position="bottom" />
      );
      expect(getByText('Test message')).toBeTruthy();
    });
  });

  describe('Default Props', () => {
    it('uses default duration of 4000ms', () => {
      const onDismiss = jest.fn();
      renderWithProviders(
        <ToastNotification
          {...defaultProps}
          onDismiss={onDismiss}
        />
      );

      act(() => {
        jest.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalled();
    });

    it('defaults retryable to false', () => {
      const { queryByText } = renderWithProviders(
        <ToastNotification {...defaultProps} onRetry={() => {}} />
      );
      expect(queryByText('Retry')).toBeNull();
    });

    it('defaults position to top', () => {
      const { getByText } = renderWithProviders(
        <ToastNotification {...defaultProps} />
      );
      expect(getByText('Test message')).toBeTruthy();
    });
  });
});
