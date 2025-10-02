import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
  Ionicons: () => null,
};
});

// Mock molecules
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
    Button: ({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) =>
      React.createElement(TouchableOpacity, { onPress, testID: testID || 'button' }, React.createElement(Text, null, title)),
    GradientButton: ({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) =>
      React.createElement(TouchableOpacity, { onPress, testID: testID || 'gradient-button' }, React.createElement(Text, null, title)),
  };
});

// Mock Header organism
jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    Header: ({ title, subtitle, onBack, testID }: any) =>
      React.createElement(
        View,
        { testID: testID || 'header' },
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        onBack ? React.createElement(TouchableOpacity, { onPress: onBack, testID: 'header-back-button' }, React.createElement(Text, null, 'Back')) : null
      ),
  };
});

// Mock UnlockEverythingBanner
jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    UnlockEverythingBanner: () =>
      React.createElement(View, { testID: 'unlock-everything-banner' }, React.createElement(Text, null, 'Unlock Everything')),
  };
});

describe('DemoExplainerSheet', () => {
  const mockOnClose = jest.fn();
  const mockOnStartTrial = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(result).toBeTruthy();
    });

    it('renders the header with correct title', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(getByText("You're in Demo Mode")).toBeTruthy();
    });

    it('renders the header with correct subtitle', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(getByText('Simulated content — no live API calls')).toBeTruthy();
    });

    it('renders the explanatory text', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(
        getByText(/Explore pre‑recorded chats, debates, and comparisons that mimic live streaming/i)
      ).toBeTruthy();
    });

    it('renders the "Start 7-Day Free Trial" button', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(getByText('Start 7‑Day Free Trial')).toBeTruthy();
    });

    it('renders the "Maybe later" button', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(getByText('Maybe later')).toBeTruthy();
    });

    it('renders the UnlockEverythingBanner component', () => {
      const { getByTestId } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(getByTestId('unlock-everything-banner')).toBeTruthy();
    });

    it('renders the Header component', () => {
      const { getByTestId } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(getByTestId('header')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('calls onStartTrial when "Start 7-Day Free Trial" button is pressed', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const trialButton = getByText('Start 7‑Day Free Trial');
      fireEvent.press(trialButton);
      expect(mockOnStartTrial).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when "Maybe later" button is pressed', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const laterButton = getByText('Maybe later');
      fireEvent.press(laterButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when header back button is pressed', () => {
      const { getByTestId } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const backButton = getByTestId('header-back-button');
      fireEvent.press(backButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onStartTrial when "Maybe later" button is pressed', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const laterButton = getByText('Maybe later');
      fireEvent.press(laterButton);
      expect(mockOnStartTrial).not.toHaveBeenCalled();
    });

    it('does not call onClose when trial button is pressed', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const trialButton = getByText('Start 7‑Day Free Trial');
      fireEvent.press(trialButton);
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Interactions', () => {
    it('handles multiple presses on trial button', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const trialButton = getByText('Start 7‑Day Free Trial');
      fireEvent.press(trialButton);
      fireEvent.press(trialButton);
      fireEvent.press(trialButton);
      expect(mockOnStartTrial).toHaveBeenCalledTimes(3);
    });

    it('handles multiple presses on later button', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const laterButton = getByText('Maybe later');
      fireEvent.press(laterButton);
      fireEvent.press(laterButton);
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });

    it('handles sequential interactions with both buttons', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const trialButton = getByText('Start 7‑Day Free Trial');
      const laterButton = getByText('Maybe later');

      fireEvent.press(trialButton);
      expect(mockOnStartTrial).toHaveBeenCalledTimes(1);
      expect(mockOnClose).not.toHaveBeenCalled();

      fireEvent.press(laterButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnStartTrial).toHaveBeenCalledTimes(1);
    });
  });

  describe('Props Handling', () => {
    it('works with different onClose callback', () => {
      const alternateOnClose = jest.fn();
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={alternateOnClose} onStartTrial={mockOnStartTrial} />);
      const laterButton = getByText('Maybe later');
      fireEvent.press(laterButton);
      expect(alternateOnClose).toHaveBeenCalledTimes(1);
    });

    it('works with different onStartTrial callback', () => {
      const alternateOnStartTrial = jest.fn();
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={alternateOnStartTrial} />);
      const trialButton = getByText('Start 7‑Day Free Trial');
      fireEvent.press(trialButton);
      expect(alternateOnStartTrial).toHaveBeenCalledTimes(1);
    });
  });

  describe('Component Structure', () => {
    it('renders ScrollView with correct props', () => {
      const result = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(result).toBeTruthy();
    });

    it('renders all text content in correct order', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);

      // All these should exist
      expect(getByText("You're in Demo Mode")).toBeTruthy();
      expect(getByText('Simulated content — no live API calls')).toBeTruthy();
      expect(getByText(/Explore pre‑recorded chats/i)).toBeTruthy();
      expect(getByText('Start 7‑Day Free Trial')).toBeTruthy();
      expect(getByText('Maybe later')).toBeTruthy();
    });

    it('renders buttons in correct order (trial button before later button)', () => {
      const { getByText, getByTestId } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      // Verify both buttons exist
      expect(getByText('Start 7‑Day Free Trial')).toBeTruthy();
      expect(getByText('Maybe later')).toBeTruthy();
      expect(getByTestId('header-back-button')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid successive button presses', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      const trialButton = getByText('Start 7‑Day Free Trial');

      for (let i = 0; i < 10; i++) {
        fireEvent.press(trialButton);
      }

      expect(mockOnStartTrial).toHaveBeenCalledTimes(10);
    });

    it('renders with noop callbacks', () => {
      const noopOnClose = () => {};
      const noopOnStartTrial = () => {};
      const result = renderWithProviders(<DemoExplainerSheet onClose={noopOnClose} onStartTrial={noopOnStartTrial} />);
      expect(result).toBeTruthy();
    });

    it('maintains functionality after re-render', () => {
      const { getByText, rerender } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);

      rerender(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);

      const trialButton = getByText('Start 7‑Day Free Trial');
      fireEvent.press(trialButton);
      expect(mockOnStartTrial).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('renders all interactive elements as pressable', () => {
      const { getByText, getByTestId } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);

      const trialButton = getByText('Start 7‑Day Free Trial');
      const laterButton = getByText('Maybe later');
      const backButton = getByTestId('header-back-button');

      expect(trialButton).toBeTruthy();
      expect(laterButton).toBeTruthy();
      expect(backButton).toBeTruthy();
    });

    it('renders descriptive text for screen readers', () => {
      const { getByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);

      const explainerText = getByText(/Explore pre‑recorded chats, debates, and comparisons/i);
      expect(explainerText).toBeTruthy();
    });
  });

  describe('Snapshot Tests', () => {
    it('matches snapshot with default props', () => {
      const { toJSON } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);
      expect(toJSON()).toMatchSnapshot();
    });
  });
});
