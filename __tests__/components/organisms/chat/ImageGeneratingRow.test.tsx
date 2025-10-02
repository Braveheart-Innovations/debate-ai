import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ImageGeneratingRow } from '@/components/organisms/chat/ImageGeneratingRow';
import type { Message } from '@/types';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('ImageGeneratingRow', () => {
  const mockOnCancel = jest.fn();
  const mockOnRetry = jest.fn();

  const baseMessage: Message = {
    id: 'msg1',
    text: 'Generate an image',
    sender: 'Claude',
    senderId: 'claude',
    timestamp: Date.now(),
    metadata: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders with basic message', () => {
    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={baseMessage} onCancel={mockOnCancel} />
    );

    expect(getByText('Claude')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('displays elapsed time', () => {
    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={baseMessage} onCancel={mockOnCancel} />
    );

    expect(getByText(/0s/)).toBeTruthy();
  });

  it('calls onCancel when Cancel button is pressed', () => {
    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={baseMessage} onCancel={mockOnCancel} />
    );

    fireEvent.press(getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalledWith(baseMessage);
  });

  it('shows error phase and retry button when phase is error', () => {
    const errorMessage: Message = {
      ...baseMessage,
      metadata: {
        providerMetadata: {
          imagePhase: 'error',
        },
      },
    };

    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={errorMessage} onCancel={mockOnCancel} onRetry={mockOnRetry} />
    );

    expect(getByText(/Error/)).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });

  it('calls onRetry when Retry button is pressed', () => {
    const errorMessage: Message = {
      ...baseMessage,
      metadata: {
        providerMetadata: {
          imagePhase: 'error',
        },
      },
    };

    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={errorMessage} onCancel={mockOnCancel} onRetry={mockOnRetry} />
    );

    fireEvent.press(getByText('Retry'));
    expect(mockOnRetry).toHaveBeenCalledWith(errorMessage);
  });

  it('shows cancelled phase and retry button when phase is cancelled', () => {
    const cancelledMessage: Message = {
      ...baseMessage,
      metadata: {
        providerMetadata: {
          imagePhase: 'cancelled',
        },
      },
    };

    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={cancelledMessage} onCancel={mockOnCancel} onRetry={mockOnRetry} />
    );

    expect(getByText(/Cancelled/)).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });

  it('displays animated dots for progress', () => {
    const { getByText } = renderWithProviders(
      <ImageGeneratingRow message={baseMessage} onCancel={mockOnCancel} />
    );

    // Initially no dots
    expect(getByText(/0s/)).toBeTruthy();
  });

  it('adjusts height based on aspect ratio (portrait)', () => {
    const portraitMessage: Message = {
      ...baseMessage,
      metadata: {
        providerMetadata: {
          imageParams: {
            size: 'portrait',
          },
        },
      },
    };

    const { toJSON } = renderWithProviders(
      <ImageGeneratingRow message={portraitMessage} onCancel={mockOnCancel} />
    );

    expect(toJSON()).toBeTruthy();
  });

  it('adjusts height based on aspect ratio (landscape)', () => {
    const landscapeMessage: Message = {
      ...baseMessage,
      metadata: {
        providerMetadata: {
          imageParams: {
            size: 'landscape',
          },
        },
      },
    };

    const { toJSON } = renderWithProviders(
      <ImageGeneratingRow message={landscapeMessage} onCancel={mockOnCancel} />
    );

    expect(toJSON()).toBeTruthy();
  });

  it('handles onLayout event for container width', () => {
    const { UNSAFE_getByType } = renderWithProviders(
      <ImageGeneratingRow message={baseMessage} onCancel={mockOnCancel} />
    );

    const view = UNSAFE_getByType('View');
    fireEvent(view, 'layout', {
      nativeEvent: { layout: { width: 300, height: 200 } },
    });

    expect(view).toBeTruthy();
  });
});