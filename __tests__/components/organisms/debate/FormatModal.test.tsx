/**
 * FormatModal Test Suite
 * Comprehensive tests for the debate format selection modal
 */

import type { ReactNode } from 'react';
import { Modal, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { FormatModal, type FormatModalProps } from '@/components/organisms/debate/FormatModal';
import type { SheetHeader, Typography } from '@/components/molecules';

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: ReactNode }) => <>{children}</>,
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
  };
});

describe('FormatModal', () => {
  const mockOnSelect = jest.fn();
  const mockOnClose = jest.fn();

  const defaultProps: FormatModalProps = {
    visible: true,
    selected: 'oxford',
    onSelect: mockOnSelect,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);
      expect(getByText('Choose Debate Format')).toBeTruthy();
    });

    it('renders selectable debate format options', () => {
      const { getByText, queryByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      expect(getByText('Oxford')).toBeTruthy();
      expect(getByText('Lincoln-Douglas')).toBeTruthy();
      expect(getByText('Policy')).toBeTruthy();
      expect(queryByText('Socratic')).toBeNull();
    });

    it('renders format descriptions', () => {
      const { getByText, queryByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      expect(getByText(/Oxford-style motion debate/i)).toBeTruthy();
      expect(getByText(/Philosophical debate/i)).toBeTruthy();
      expect(getByText(/Data-driven debate/i)).toBeTruthy();
      expect(queryByText(/Inquiry-based dialogue/i)).toBeNull();
    });

    it('renders Oxford format highlights', () => {
      const { getByText, getAllByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      expect(getByText(/Motion debate with proposition/i)).toBeTruthy();
      expect(getAllByText(/Opening speeches, floor debate/i).length).toBeGreaterThan(0);
      expect(getByText(/2v2 \+ Q&A/i)).toBeTruthy();
      expect(getByText(/final audience vote/i)).toBeTruthy();
    });

    it('renders Lincoln-Douglas format highlights', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      expect(getByText(/Great for ethical dilemmas/i)).toBeTruthy();
      expect(getByText(/AC, CX, NC\/1NR/i)).toBeTruthy();
      expect(getByText(/values, criteria, and ballot weighing/i)).toBeTruthy();
    });

    it('renders Policy format highlights', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      expect(getByText(/Perfect for policy proposals/i)).toBeTruthy();
      expect(getByText(/1AC, 1NC, 2AC/i)).toBeTruthy();
      expect(getByText(/plan text, solvency, impacts, and drops/i)).toBeTruthy();
    });
  });

  describe('Selection State', () => {
    it('highlights the selected format (Oxford)', () => {
      const { getByText } = renderWithProviders(
        <FormatModal {...defaultProps} selected="oxford" />
      );

      const oxfordOption = getByText('Oxford').parent;
      expect(oxfordOption).toBeTruthy();
    });

    it('highlights the selected format (Lincoln-Douglas)', () => {
      const { getByText } = renderWithProviders(
        <FormatModal {...defaultProps} selected="lincoln_douglas" />
      );

      const lincolnOption = getByText('Lincoln-Douglas').parent;
      expect(lincolnOption).toBeTruthy();
    });

    it('highlights the selected format (Policy)', () => {
      const { getByText } = renderWithProviders(
        <FormatModal {...defaultProps} selected="policy" />
      );

      const policyOption = getByText('Policy').parent;
      expect(policyOption).toBeTruthy();
    });

  });

  describe('User Interactions', () => {
    it('calls onSelect and onClose when Oxford format is pressed', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      fireEvent.press(getByText('Oxford'));

      expect(mockOnSelect).toHaveBeenCalledWith('oxford');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelect and onClose when Lincoln-Douglas format is pressed', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      fireEvent.press(getByText('Lincoln-Douglas'));

      expect(mockOnSelect).toHaveBeenCalledWith('lincoln_douglas');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelect and onClose when Policy format is pressed', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      fireEvent.press(getByText('Policy'));

      expect(mockOnSelect).toHaveBeenCalledWith('policy');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when header close button is pressed', () => {
      const { getByTestId } = renderWithProviders(<FormatModal {...defaultProps} />);

      fireEvent.press(getByTestId('sheet-header'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(<FormatModal {...defaultProps} />);

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // First TouchableOpacity is the backdrop
      fireEvent.press(touchables[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Modal Visibility', () => {
    it('renders modal when visible is true', () => {
      const { getByText } = renderWithProviders(
        <FormatModal {...defaultProps} visible={true} />
      );

      expect(getByText('Choose Debate Format')).toBeTruthy();
    });

    it('passes visible prop correctly to Modal component', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <FormatModal {...defaultProps} visible={false} />
      );

      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('sets correct modal properties for accessibility', () => {
      const { UNSAFE_getByType } = renderWithProviders(<FormatModal {...defaultProps} />);

      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.animationType).toBe('fade');
      expect(modal.props.transparent).toBe(true);
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_getByType } = renderWithProviders(<FormatModal {...defaultProps} />);

      const modal = UNSAFE_getByType(Modal);

      modal.props.onRequestClose();

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid format selection', () => {
      const { getByText } = renderWithProviders(<FormatModal {...defaultProps} />);

      fireEvent.press(getByText('Oxford'));
      fireEvent.press(getByText('Policy'));

      // Both selections should be registered
      expect(mockOnSelect).toHaveBeenCalledTimes(2);
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });

    it('renders correctly with different selected formats', () => {
      const { rerender, getByText, queryByText } = renderWithProviders(
        <FormatModal {...defaultProps} selected="oxford" />
      );

      expect(getByText('Oxford')).toBeTruthy();

      rerender(<FormatModal {...defaultProps} selected="policy" />);

      expect(getByText('Policy')).toBeTruthy();
      expect(queryByText('Socratic')).toBeNull();
    });

    it('handles undefined callbacks gracefully', () => {
      const { getByText } = renderWithProviders(
        <FormatModal
          visible={true}
          selected="oxford"
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(() => fireEvent.press(getByText('Oxford'))).not.toThrow();
    });
  });
});
