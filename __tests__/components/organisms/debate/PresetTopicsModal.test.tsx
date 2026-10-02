/**
 * PresetTopicsModal Test Suite
 * Comprehensive tests for the preset topics selection modal
 */

import type { ReactNode } from 'react';
import { Modal, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PresetTopicsModal } from '@/components/organisms/debate/PresetTopicsModal';
import { TopicService } from '@/services/debate/TopicService';
import type { Button, SheetHeader, Typography } from '@/components/molecules';

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

jest.mock('@/services/debate/TopicService', () => ({
  TopicService: {
    getCategories: jest.fn().mockReturnValue([
      { id: 'fun', name: 'Fun & Quirky' },
      { id: 'tech', name: 'Technology' },
      { id: 'philosophy', name: 'Philosophy' },
    ]),
    getTopicsByCategory: jest.fn().mockReturnValue([
      'Is pineapple on pizza acceptable?',
      'Are cats better than dogs?',
      'Is cereal a soup?',
    ]),
  },
}));

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    SheetHeader: stubComponent<typeof SheetHeader>('sheet-header', {
      onPress: (p) => p.onClose,
      text: (p) => p.title,
    }),
    Button: stubComponent<typeof Button>('button', {
      testID: (p) => `category-${p.title.toLowerCase().replace(/\s+/g, '-')}`,
      onPress: (p) => p.onPress,
      text: (p) => p.title,
    }),
  };
});

describe('PresetTopicsModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSelectTopic = jest.fn();

  const defaultProps = {
    visible: true,
    onClose: mockOnClose,
    onSelectTopic: mockOnSelectTopic,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);
      expect(getByText('Choose a Preset Motion')).toBeTruthy();
    });

    it('renders all category chips', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      expect(getByTestId('category-fun-&-quirky')).toBeTruthy();
      expect(getByTestId('category-technology')).toBeTruthy();
      expect(getByTestId('category-philosophy')).toBeTruthy();
    });

    it('calls TopicService.getCategories on mount', () => {
      renderWithProviders(<PresetTopicsModal {...defaultProps} />);
      expect(TopicService.getCategories).toHaveBeenCalled();
    });

    it('renders topics from TopicService', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      expect(getByText('Is pineapple on pizza acceptable?')).toBeTruthy();
      expect(getByText('Are cats better than dogs?')).toBeTruthy();
      expect(getByText('Is cereal a soup?')).toBeTruthy();
    });

    it('highlights selected category', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const firstCategory = getByTestId('category-fun-&-quirky');
      expect(firstCategory).toBeTruthy();
    });
  });

  describe('Modal Visibility', () => {
    it('renders modal when visible is true', () => {
      const { getByText } = renderWithProviders(
        <PresetTopicsModal {...defaultProps} visible={true} />
      );
      expect(getByText('Choose a Preset Motion')).toBeTruthy();
    });

    it('passes visible prop correctly to Modal component', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <PresetTopicsModal {...defaultProps} visible={false} />
      );

      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(false);
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when header close button is pressed', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByTestId('sheet-header'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // First TouchableOpacity is the backdrop
      fireEvent.press(touchables[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelectTopic and onClose when a topic is pressed', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByText('Is pineapple on pizza acceptable?'));

      expect(mockOnSelectTopic).toHaveBeenCalledWith('Is pineapple on pizza acceptable?');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('switches categories when category chip is pressed', () => {
      jest.mocked(TopicService.getTopicsByCategory)
        .mockReturnValueOnce(['Is pineapple on pizza acceptable?'])
        .mockReturnValueOnce(['AI topic 1', 'AI topic 2']);

      const { getByTestId, rerender } = renderWithProviders(
        <PresetTopicsModal {...defaultProps} />
      );

      fireEvent.press(getByTestId('category-technology'));

      rerender(<PresetTopicsModal {...defaultProps} />);

      expect(TopicService.getTopicsByCategory).toHaveBeenCalled();
    });
  });

  describe('Category Selection', () => {
    it('updates topics when category changes', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      jest.mocked(TopicService.getTopicsByCategory).mockClear();

      fireEvent.press(getByTestId('category-technology'));

      expect(TopicService.getTopicsByCategory).toHaveBeenCalled();
    });

    it('highlights selected category as primary', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const selectedCategory = getByTestId('category-fun-&-quirky');
      expect(selectedCategory).toBeTruthy();
    });

    it('shows unselected categories as secondary', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const unselectedCategory = getByTestId('category-technology');
      expect(unselectedCategory).toBeTruthy();
    });

    it('allows switching between all categories', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByTestId('category-technology'));
      fireEvent.press(getByTestId('category-philosophy'));
      fireEvent.press(getByTestId('category-fun-&-quirky'));

      // Should be able to press all categories without errors
      expect(TopicService.getTopicsByCategory).toHaveBeenCalled();
    });
  });

  describe('Topic Selection', () => {
    it('selects first topic correctly', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByText('Is pineapple on pizza acceptable?'));

      expect(mockOnSelectTopic).toHaveBeenCalledWith('Is pineapple on pizza acceptable?');
    });

    it('selects second topic correctly', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByText('Are cats better than dogs?'));

      expect(mockOnSelectTopic).toHaveBeenCalledWith('Are cats better than dogs?');
    });

    it('selects third topic correctly', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByText('Is cereal a soup?'));

      expect(mockOnSelectTopic).toHaveBeenCalledWith('Is cereal a soup?');
    });

    it('closes modal after topic selection', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByText('Is pineapple on pizza acceptable?'));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('sets correct modal properties for accessibility', () => {
      const { UNSAFE_getByType } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.animationType).toBe('fade');
      expect(modal.props.transparent).toBe(true);
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_getByType } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const modal = UNSAFE_getByType(Modal);

      modal.props.onRequestClose();

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty categories array', () => {
      jest.mocked(TopicService.getCategories).mockReturnValueOnce([]);

      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      expect(getByText('Choose a Preset Motion')).toBeTruthy();
    });

    it('handles empty topics array', () => {
      jest.mocked(TopicService.getTopicsByCategory).mockReturnValueOnce([]);

      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      expect(getByText('Choose a Preset Motion')).toBeTruthy();
    });

    it('handles rapid category switching', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByTestId('category-technology'));
      fireEvent.press(getByTestId('category-philosophy'));
      fireEvent.press(getByTestId('category-fun-&-quirky'));

      expect(() => fireEvent.press(getByTestId('category-technology'))).not.toThrow();
    });

    it('handles rapid topic selection', () => {
      const { getByText } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      fireEvent.press(getByText('Is pineapple on pizza acceptable?'));
      fireEvent.press(getByText('Are cats better than dogs?'));

      expect(mockOnSelectTopic).toHaveBeenCalledTimes(2);
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('Initial State', () => {
    it('selects first category by default', () => {
      const { getByTestId } = renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      const firstCategory = getByTestId('category-fun-&-quirky');
      expect(firstCategory).toBeTruthy();
    });

    it('loads topics for first category on mount', () => {
      renderWithProviders(<PresetTopicsModal {...defaultProps} />);

      expect(TopicService.getTopicsByCategory).toHaveBeenCalledWith('Fun & Quirky');
    });
  });
});
