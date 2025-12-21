import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ErrorBoundary } from '@/components/organisms/common/ErrorBoundary';

// Mock CrashlyticsService
const mockRecordError = jest.fn();
jest.mock('@/services/crashlytics', () => ({
  CrashlyticsService: {
    recordError: (...args: unknown[]) => mockRecordError(...args),
  },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(
        TouchableOpacity,
        { onPress, testID: `button-${title}` },
        React.createElement(Text, null, title)
      )
    ),
  };
});

jest.mock('@/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
  };
});

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = jest.fn();
    mockRecordError.mockClear();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error occurs', () => {
    const { getByText } = renderWithProviders(
      <ErrorBoundary>
        <Text>Everything is fine</Text>
      </ErrorBoundary>
    );

    expect(getByText('Everything is fine')).toBeTruthy();
  });

  it('calls onError and shows the fallback when a child throws', () => {
    const ProblemChild = () => {
      throw new Error('Boom');
    };
    const onError = jest.fn();

    const { getByText } = renderWithProviders(
      <ErrorBoundary onError={onError}>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });

  it('allows the fallback to reset error state and recover', async () => {
    const ThrowingChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error('Transient boom');
      }
      return <Text>Recovered content</Text>;
    };

    const Harness = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);

      return (
        <ErrorBoundary
          fallback={({ resetError }) => (
            <TouchableOpacity
              testID="custom-reset"
              onPress={() => {
                setShouldThrow(false);
                resetError();
              }}
            >
              <Text>Reset</Text>
            </TouchableOpacity>
          )}
        >
          <ThrowingChild shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    };

    const { getByTestId, queryByText } = renderWithProviders(<Harness />);

    const resetButton = getByTestId('custom-reset');
    expect(resetButton).toBeTruthy();

    fireEvent.press(resetButton);

    await waitFor(() => {
      expect(queryByText('Recovered content')).toBeTruthy();
    });
  });

  it('records error to Crashlytics when a child throws', () => {
    const ProblemChild = () => {
      throw new Error('Test crash');
    };

    renderWithProviders(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(mockRecordError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        type: 'react_error_boundary',
      })
    );
  });

  it('shows fatal error UI when level is fatal', () => {
    const ProblemChild = () => {
      throw new Error('Fatal error');
    };

    const { getByText, queryByTestId } = renderWithProviders(
      <ErrorBoundary level="fatal">
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(getByText('App Error')).toBeTruthy();
    // Fatal errors should not show "Try Again" button
    expect(queryByTestId('button-Try Again')).toBeNull();
  });

  it('shows Report Issue button when showReportButton is true', () => {
    const ProblemChild = () => {
      throw new Error('Error with report');
    };

    const { getByTestId } = renderWithProviders(
      <ErrorBoundary showReportButton={true}>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(getByTestId('button-Report Issue')).toBeTruthy();
  });

  it('includes level in Crashlytics context', () => {
    const ProblemChild = () => {
      throw new Error('Level test');
    };

    renderWithProviders(
      <ErrorBoundary level="fatal">
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(mockRecordError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: 'fatal',
      })
    );
  });
});
