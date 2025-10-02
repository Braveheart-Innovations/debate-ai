import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Card: ({ children }: any) => children,
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { GPT5LatencyWarning } = require('@/components/molecules/chat/GPT5LatencyWarning');

describe('GPT5LatencyWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('renders warning when not dismissed', async () => {
    const { getByText } = renderWithProviders(<GPT5LatencyWarning />);

    await waitFor(() => {
      expect(getByText('GPT-5 Performance Notice')).toBeTruthy();
    });
  });

  it('does not render when permanently dismissed', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
    
    const { queryByText } = renderWithProviders(<GPT5LatencyWarning />);

    await waitFor(() => {
      expect(queryByText('GPT-5 Performance Notice')).toBeNull();
    });
  });

  it('calls onDismiss when dismiss button pressed', async () => {
    const onDismiss = jest.fn();
    const { getByText } = renderWithProviders(
      <GPT5LatencyWarning onDismiss={onDismiss} />
    );

    await waitFor(() => {
      expect(getByText('Dismiss')).toBeTruthy();
    });

    fireEvent.press(getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('saves dismissal preference when "Don\'t show again" pressed', async () => {
    const { getByText } = renderWithProviders(<GPT5LatencyWarning />);

    await waitFor(() => {
      expect(getByText("Don't show again")).toBeTruthy();
    });

    fireEvent.press(getByText("Don't show again"));

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('gpt5_latency_warning_dismissed', 'true');
    });
  });

  it('shows alternative button when showAlternativeButton is true', async () => {
    const { getByText } = renderWithProviders(
      <GPT5LatencyWarning showAlternativeButton />
    );

    await waitFor(() => {
      expect(getByText('Switch to GPT-4o (Faster)')).toBeTruthy();
    });
  });

  it('calls onSwitchToAlternative when alternative button pressed', async () => {
    const onSwitchToAlternative = jest.fn();
    const { getByText } = renderWithProviders(
      <GPT5LatencyWarning
        showAlternativeButton
        onSwitchToAlternative={onSwitchToAlternative}
      />
    );

    await waitFor(() => {
      fireEvent.press(getByText('Switch to GPT-4o (Faster)'));
      expect(onSwitchToAlternative).toHaveBeenCalled();
    });
  });
});
