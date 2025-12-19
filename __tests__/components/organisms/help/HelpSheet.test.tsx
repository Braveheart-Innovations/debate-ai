import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HelpSheet } from '@/components/organisms/help/HelpSheet';
import { createAppStore } from '@/store';
import { HELP_CATEGORIES, HELP_TOPICS } from '@/config/help/topics';

// Mock expo modules
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-device', () => ({
  brand: 'Apple',
  modelName: 'iPhone 14',
  osName: 'iOS',
  osVersion: '16.0',
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  canOpenURL: jest.fn().mockResolvedValue(true),
  openURL: jest.fn().mockResolvedValue(undefined),
}));

// Mock the molecules
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, testID }: any) =>
      React.createElement(Text, { testID }, children),
    SheetHeader: ({ title, onClose, testID }: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: testID || 'sheet-header', onPress: onClose },
        React.createElement(Text, null, title)
      ),
  };
});

// Mock help molecules
jest.mock('@/components/molecules/help/HelpTopicCard', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    HelpTopicCard: ({ topic, isExpanded, onPress, testID }: any) =>
      React.createElement(
        TouchableOpacity,
        {
          testID: testID || `topic-card-${topic.id}`,
          onPress,
          accessibilityState: { expanded: isExpanded },
        },
        React.createElement(Text, null, topic.title),
        isExpanded && React.createElement(Text, { testID: `topic-content-${topic.id}` }, topic.content)
      ),
  };
});

jest.mock('@/components/molecules/help/FAQItem', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    FAQItem: ({ question, answer, isExpanded, onToggle, testID }: any) =>
      React.createElement(
        TouchableOpacity,
        {
          testID: testID || 'faq-item',
          onPress: onToggle,
          accessibilityState: { expanded: isExpanded },
        },
        React.createElement(Text, null, question),
        isExpanded && React.createElement(Text, null, answer)
      ),
  };
});

describe('HelpSheet', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderHelpSheet = (storeOverrides?: { sheetData?: Record<string, unknown> }) => {
    const store = createAppStore({
      navigation: {
        activeSheet: 'help',
        sheetVisible: true,
        sheetData: storeOverrides?.sheetData,
        helpWebViewUrl: null,
      },
    });

    return renderWithProviders(<HelpSheet onClose={mockOnClose} />, { store });
  };

  describe('initial state', () => {
    it('renders with guides tab active by default', () => {
      const { getByText } = renderHelpSheet();

      // Guides tab should be visible and active
      expect(getByText('Guides')).toBeTruthy();
      expect(getByText('FAQ')).toBeTruthy();
      expect(getByText('Contact')).toBeTruthy();
    });

    it('renders category filter chips', () => {
      const { getAllByText } = renderHelpSheet();

      // Should show "All" chip
      expect(getAllByText('All').length).toBeGreaterThan(0);

      // Should show category chips (may have multiple matches if topics share titles)
      HELP_CATEGORIES.forEach((category) => {
        expect(getAllByText(category.title).length).toBeGreaterThan(0);
      });
    });

    it('renders topic cards when on guides tab', () => {
      const { getByTestId } = renderHelpSheet();

      // Should render at least one topic card
      const firstTopicId = Object.keys(HELP_TOPICS)[0];
      expect(getByTestId(`topic-card-${firstTopicId}`)).toBeTruthy();
    });
  });

  describe('topic context', () => {
    it('expands correct topic when opened with topicId in sheetData', async () => {
      const { getByTestId } = renderHelpSheet({
        sheetData: { topicId: 'debate-arena' },
      });

      await waitFor(() => {
        const topicCard = getByTestId('topic-card-debate-arena');
        expect(topicCard.props.accessibilityState.expanded).toBe(true);
      });
    });

    it('selects topic category in filter when topicId provided', async () => {
      const { getByTestId } = renderHelpSheet({
        sheetData: { topicId: 'debate-formats' },
      });

      // The debate-formats topic is in debate-arena category
      // Topics displayed should be filtered to debate-arena
      await waitFor(() => {
        const topicCard = getByTestId('topic-card-debate-formats');
        expect(topicCard).toBeTruthy();
      });
    });
  });

  describe('category context', () => {
    it('filters to correct category when opened with categoryId', async () => {
      const { queryByTestId, getByTestId } = renderHelpSheet({
        sheetData: { categoryId: 'expert-mode' },
      });

      await waitFor(() => {
        // Should show expert-mode topics
        expect(getByTestId('topic-card-expert-temperature')).toBeTruthy();
      });
    });

    it('does not expand any topic when only categoryId provided', async () => {
      const { getByTestId } = renderHelpSheet({
        sheetData: { categoryId: 'chat' },
      });

      await waitFor(() => {
        // Topics should not be expanded
        const topicCard = getByTestId('topic-card-quick-start-wizard');
        expect(topicCard.props.accessibilityState.expanded).toBe(false);
      });
    });
  });

  describe('topic interactions', () => {
    it('expands topic when pressed', async () => {
      const { getByTestId } = renderHelpSheet();

      const topicCard = getByTestId('topic-card-debate-arena');
      fireEvent.press(topicCard);

      await waitFor(() => {
        expect(topicCard.props.accessibilityState.expanded).toBe(true);
      });
    });

    it('collapses topic when pressed again', async () => {
      const { getByTestId } = renderHelpSheet({
        sheetData: { topicId: 'debate-arena' },
      });

      await waitFor(() => {
        const topicCard = getByTestId('topic-card-debate-arena');
        expect(topicCard.props.accessibilityState.expanded).toBe(true);
      });

      const topicCard = getByTestId('topic-card-debate-arena');
      fireEvent.press(topicCard);

      await waitFor(() => {
        expect(topicCard.props.accessibilityState.expanded).toBe(false);
      });
    });
  });

  describe('category filter', () => {
    it('filters topics when category chip pressed', async () => {
      const { getAllByText, getByTestId } = renderHelpSheet();

      // Press "Expert Mode" category chip (first one is the chip, others may be topic titles)
      const expertModeChips = getAllByText('Expert Mode');
      fireEvent.press(expertModeChips[0]);

      await waitFor(() => {
        // Should show expert-mode topics
        expect(getByTestId('topic-card-expert-temperature')).toBeTruthy();
      });
    });

    it('shows all topics when All chip pressed', async () => {
      const { getByText, getByTestId } = renderHelpSheet({
        sheetData: { categoryId: 'expert-mode' },
      });

      // First verify we're filtered
      await waitFor(() => {
        expect(getByTestId('topic-card-expert-temperature')).toBeTruthy();
      });

      // Press "All" chip
      const allChip = getByText('All');
      fireEvent.press(allChip);

      await waitFor(() => {
        // Should show topics from all categories
        expect(getByTestId('topic-card-debate-arena')).toBeTruthy();
      });
    });
  });

  describe('tab switching', () => {
    it('switches to FAQ tab when pressed', async () => {
      const { getByText, getAllByTestId } = renderHelpSheet();

      const faqTab = getByText('FAQ');
      fireEvent.press(faqTab);

      await waitFor(() => {
        // Should show FAQ items (multiple items)
        expect(getAllByTestId('faq-item').length).toBeGreaterThan(0);
      });
    });

    it('switches to Contact tab when pressed', async () => {
      const { getByText } = renderHelpSheet();

      const contactTab = getByText('Contact');
      fireEvent.press(contactTab);

      await waitFor(() => {
        // Should show contact options
        expect(getByText('Get Help')).toBeTruthy();
        expect(getByText('Contact Support')).toBeTruthy();
      });
    });
  });

  describe('close behavior', () => {
    it('calls onClose when header close is pressed', () => {
      const { getByTestId } = renderHelpSheet();

      fireEvent.press(getByTestId('help-sheet-header'));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
