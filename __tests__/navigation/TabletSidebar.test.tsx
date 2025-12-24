import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { TabletSidebar } from '@/navigation/TabletSidebar';

// Mock dependencies
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('TabletSidebar', () => {
  const mockOnTabPress = jest.fn();

  const defaultProps = {
    activeTab: 'Home',
    onTabPress: mockOnTabPress,
    configuredCount: 2,
    isDemo: false,
  };

  beforeEach(() => {
    mockOnTabPress.mockClear();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByText } = renderWithProviders(<TabletSidebar {...defaultProps} />);
      expect(getByText('Symposium')).toBeTruthy();
    });

    it('renders all navigation items', () => {
      const { getByText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      expect(getByText('Chat')).toBeTruthy();
      expect(getByText('Debate')).toBeTruthy();
      expect(getByText('Compare')).toBeTruthy();
      expect(getByText('History')).toBeTruthy();
    });

    it('renders app branding section', () => {
      const { getByText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      const branding = getByText('Symposium');
      expect(branding).toBeTruthy();
    });

    it('renders with safe area insets applied', () => {
      const { getByText } = renderWithProviders(<TabletSidebar {...defaultProps} />);
      expect(getByText('Symposium')).toBeTruthy();
    });
  });

  describe('Active Tab Highlighting', () => {
    it('highlights Home tab when active', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="Home" />
      );

      const chatTab = getByLabelText('Chat');
      expect(chatTab.props.accessibilityState.selected).toBe(true);
    });

    it('highlights DebateTab when active', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="DebateTab" />
      );

      const debateTab = getByLabelText('Debate');
      expect(debateTab.props.accessibilityState.selected).toBe(true);
    });

    it('highlights Compare tab when active', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="Compare" />
      );

      const compareTab = getByLabelText('Compare');
      expect(compareTab.props.accessibilityState.selected).toBe(true);
    });

    it('highlights History tab when active', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="History" />
      );

      const historyTab = getByLabelText('History');
      expect(historyTab.props.accessibilityState.selected).toBe(true);
    });

    it('only highlights one tab at a time', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="Compare" />
      );

      expect(getByLabelText('Chat').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Debate').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Compare').props.accessibilityState.selected).toBe(true);
      expect(getByLabelText('History').props.accessibilityState.selected).toBe(false);
    });
  });

  describe('Badge Display', () => {
    it('shows badge on Debate tab when configuredCount < 2 and not demo', () => {
      const { getByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={1} isDemo={false} />
      );

      expect(getByText('!')).toBeTruthy();
    });

    it('hides badge when configuredCount >= 2', () => {
      const { queryByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={2} isDemo={false} />
      );

      expect(queryByText('!')).toBeNull();
    });

    it('hides badge when in demo mode regardless of configuredCount', () => {
      const { queryByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={0} isDemo={true} />
      );

      expect(queryByText('!')).toBeNull();
    });

    it('hides badge when configuredCount is 0 but isDemo is true', () => {
      const { queryByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={0} isDemo={true} />
      );

      expect(queryByText('!')).toBeNull();
    });

    it('shows badge when configuredCount is 1 and isDemo is false', () => {
      const { getByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={1} isDemo={false} />
      );

      expect(getByText('!')).toBeTruthy();
    });

    it('shows badge when configuredCount is 0 and isDemo is false', () => {
      const { getByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={0} isDemo={false} />
      );

      expect(getByText('!')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('calls onTabPress with correct tab name when Chat is pressed', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      fireEvent.press(getByLabelText('Chat'));
      expect(mockOnTabPress).toHaveBeenCalledWith('Home');
      expect(mockOnTabPress).toHaveBeenCalledTimes(1);
    });

    it('calls onTabPress with correct tab name when Debate is pressed', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      fireEvent.press(getByLabelText('Debate'));
      expect(mockOnTabPress).toHaveBeenCalledWith('DebateTab');
      expect(mockOnTabPress).toHaveBeenCalledTimes(1);
    });

    it('calls onTabPress with correct tab name when Compare is pressed', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      fireEvent.press(getByLabelText('Compare'));
      expect(mockOnTabPress).toHaveBeenCalledWith('Compare');
      expect(mockOnTabPress).toHaveBeenCalledTimes(1);
    });

    it('calls onTabPress with correct tab name when History is pressed', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      fireEvent.press(getByLabelText('History'));
      expect(mockOnTabPress).toHaveBeenCalledWith('History');
      expect(mockOnTabPress).toHaveBeenCalledTimes(1);
    });

    it('allows pressing the currently active tab', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="Home" />
      );

      fireEvent.press(getByLabelText('Chat'));
      expect(mockOnTabPress).toHaveBeenCalledWith('Home');
    });

    it('handles multiple tab presses', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      fireEvent.press(getByLabelText('Chat'));
      fireEvent.press(getByLabelText('Debate'));
      fireEvent.press(getByLabelText('History'));

      expect(mockOnTabPress).toHaveBeenCalledTimes(3);
      expect(mockOnTabPress).toHaveBeenNthCalledWith(1, 'Home');
      expect(mockOnTabPress).toHaveBeenNthCalledWith(2, 'DebateTab');
      expect(mockOnTabPress).toHaveBeenNthCalledWith(3, 'History');
    });
  });

  describe('Accessibility', () => {
    it('sets correct accessibility role for all tabs', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      expect(getByLabelText('Chat').props.accessibilityRole).toBe('tab');
      expect(getByLabelText('Debate').props.accessibilityRole).toBe('tab');
      expect(getByLabelText('Compare').props.accessibilityRole).toBe('tab');
      expect(getByLabelText('History').props.accessibilityRole).toBe('tab');
    });

    it('sets correct accessibility state for active tab', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="DebateTab" />
      );

      const debateTab = getByLabelText('Debate');
      expect(debateTab.props.accessibilityState).toEqual({ selected: true });
    });

    it('sets correct accessibility state for inactive tabs', () => {
      const { getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="DebateTab" />
      );

      expect(getByLabelText('Chat').props.accessibilityState).toEqual({ selected: false });
      expect(getByLabelText('Compare').props.accessibilityState).toEqual({ selected: false });
      expect(getByLabelText('History').props.accessibilityState).toEqual({ selected: false });
    });

    it('has correct accessibility labels', () => {
      const { getByLabelText } = renderWithProviders(<TabletSidebar {...defaultProps} />);

      expect(getByLabelText('Chat')).toBeTruthy();
      expect(getByLabelText('Debate')).toBeTruthy();
      expect(getByLabelText('Compare')).toBeTruthy();
      expect(getByLabelText('History')).toBeTruthy();
    });
  });

  describe('Theme Integration', () => {
    it('renders in light mode', () => {
      const { getByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} />,
        {
          preloadedState: {
            settings: {
              theme: 'light',
              fontSize: 'medium',
              apiKeys: {},
              verifiedProviders: [],
              verificationTimestamps: {},
              verificationModels: {},
              expertMode: {},
              hasCompletedOnboarding: true,
              recordModeEnabled: false,
            },
          },
        }
      );

      expect(getByText('Symposium')).toBeTruthy();
    });

    it('renders in dark mode', () => {
      const { getByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} />,
        {
          preloadedState: {
            settings: {
              theme: 'dark',
              fontSize: 'medium',
              apiKeys: {},
              verifiedProviders: [],
              verificationTimestamps: {},
              verificationModels: {},
              expertMode: {},
              hasCompletedOnboarding: true,
              recordModeEnabled: false,
            },
          },
        }
      );

      expect(getByText('Symposium')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles configuredCount of 0', () => {
      const { getByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={0} isDemo={false} />
      );

      expect(getByText('!')).toBeTruthy();
    });

    it('handles large configuredCount values', () => {
      const { queryByText } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={999} isDemo={false} />
      );

      expect(queryByText('!')).toBeNull();
    });

    it('handles undefined activeTab gracefully', () => {
      const { getByText, getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="" />
      );

      expect(getByText('Symposium')).toBeTruthy();

      // No tab should be highlighted
      expect(getByLabelText('Chat').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Debate').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Compare').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('History').props.accessibilityState.selected).toBe(false);
    });

    it('handles invalid activeTab value', () => {
      const { getByText, getByLabelText } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="InvalidTab" />
      );

      expect(getByText('Symposium')).toBeTruthy();

      // No tab should be highlighted
      expect(getByLabelText('Chat').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Debate').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Compare').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('History').props.accessibilityState.selected).toBe(false);
    });
  });

  describe('Props Variations', () => {
    it('updates when activeTab prop changes', () => {
      const { getByLabelText, rerender } = renderWithProviders(
        <TabletSidebar {...defaultProps} activeTab="Home" />
      );

      expect(getByLabelText('Chat').props.accessibilityState.selected).toBe(true);

      rerender(<TabletSidebar {...defaultProps} activeTab="Compare" />);

      expect(getByLabelText('Chat').props.accessibilityState.selected).toBe(false);
      expect(getByLabelText('Compare').props.accessibilityState.selected).toBe(true);
    });

    it('updates badge visibility when configuredCount changes', () => {
      const { queryByText, rerender } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={0} isDemo={false} />
      );

      expect(queryByText('!')).toBeTruthy();

      rerender(<TabletSidebar {...defaultProps} configuredCount={2} isDemo={false} />);

      expect(queryByText('!')).toBeNull();
    });

    it('updates badge visibility when isDemo changes', () => {
      const { queryByText, rerender } = renderWithProviders(
        <TabletSidebar {...defaultProps} configuredCount={1} isDemo={false} />
      );

      expect(queryByText('!')).toBeTruthy();

      rerender(<TabletSidebar {...defaultProps} configuredCount={1} isDemo={true} />);

      expect(queryByText('!')).toBeNull();
    });
  });
});
