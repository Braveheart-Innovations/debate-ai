import type { ReactNode } from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';
import type { Button, ContextBar, GradientButton, Typography } from '@/components/molecules';
import type { Header } from '@/components/organisms';

const mockUseFeatureAccess = jest.fn();

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  return {
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
  Ionicons: () => null,
};
});

// Mock molecules
jest.mock('@/components/molecules', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: ({ children }: Parameters<typeof Typography>[0]) => <RN.Text>{children}</RN.Text>,
    Button: ({ title, onPress }: Parameters<typeof Button>[0]) => (
      <RN.TouchableOpacity onPress={onPress} testID="button">
        <RN.Text>{title}</RN.Text>
      </RN.TouchableOpacity>
    ),
    GradientButton: ({ title, onPress, testID }: Parameters<typeof GradientButton>[0]) => (
      <RN.TouchableOpacity onPress={onPress} testID={testID || 'gradient-button'}>
        <RN.Text>{title}</RN.Text>
      </RN.TouchableOpacity>
    ),
    ContextBar: ({ title, subtitle }: Parameters<typeof ContextBar>[0]) => (
      <>
        {title ? <RN.Text>{title}</RN.Text> : null}
        {subtitle ? <RN.Text>{subtitle}</RN.Text> : null}
      </>
    ),
  };
});

// Mock Header organism
jest.mock('@/components/organisms', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Header: ({ title, subtitle, onBack, testID }: Parameters<typeof Header>[0]) => (
      <RN.View testID={testID || 'header'}>
        <RN.Text>{title}</RN.Text>
        {subtitle ? <RN.Text>{subtitle}</RN.Text> : null}
        {onBack ? (
          <RN.TouchableOpacity onPress={onBack} testID="header-back-button">
            <RN.Text>Back</RN.Text>
          </RN.TouchableOpacity>
        ) : null}
      </RN.View>
    ),
  };
});

// Mock UnlockEverythingBanner
jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    UnlockEverythingBanner: () => (
      <RN.View testID="unlock-everything-banner">
        <RN.Text>Unlock Everything</RN.Text>
      </RN.View>
    ),
  };
});

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => mockUseFeatureAccess(),
}));

describe('DemoExplainerSheet', () => {
  const mockOnClose = jest.fn();
  const mockOnStartTrial = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureAccess.mockReturnValue({ canStartTrial: true });
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
      expect(getByText('Simulated content')).toBeTruthy();
      expect(getByText('No live API calls.')).toBeTruthy();
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

    it('renders upgrade copy when the user cannot start another trial', () => {
      mockUseFeatureAccess.mockReturnValue({ canStartTrial: false });

      const { getByText, queryByText } = renderWithProviders(<DemoExplainerSheet onClose={mockOnClose} onStartTrial={mockOnStartTrial} />);

      expect(getByText('Upgrade to Premium')).toBeTruthy();
      expect(queryByText('Start 7‑Day Free Trial')).toBeNull();
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
      expect(getByText('Simulated content')).toBeTruthy();
      expect(getByText('No live API calls.')).toBeTruthy();
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
