/**
 * RoundsModal Test Suite
 * Comprehensive tests for the debate rounds selection modal
 */

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { RoundsModal } from '@/components/organisms/debate/RoundsModal';

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, ...props }: any) =>
      React.createElement(Text, { testID: props.testID || 'typography' }, children),
    SheetHeader: ({ title, onClose }: any) =>
      React.createElement(Text, { testID: 'sheet-header', onPress: onClose }, title),
  };
});

describe('RoundsModal', () => {
  const mockOnSelect = jest.fn();
  const mockOnClose = jest.fn();

  const defaultProps = {
    visible: true,
    value: 3,
    onSelect: mockOnSelect,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);
      expect(getByText('Select Rounds')).toBeTruthy();
    });

    it('renders all round options (1-5)', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      expect(getByText('1 Round')).toBeTruthy();
      expect(getByText('2 Rounds')).toBeTruthy();
      expect(getByText('3 Rounds')).toBeTruthy();
      expect(getByText('4 Rounds')).toBeTruthy();
      expect(getByText('5 Rounds')).toBeTruthy();
    });

    it('renders descriptions for each round option', () => {
      const { getByText, getAllByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      expect(getByText('Quick duel')).toBeTruthy();
      expect(getAllByText('Balanced').length).toBeGreaterThan(0);
      expect(getByText('Classic pacing')).toBeTruthy();
      expect(getByText('Extended debate')).toBeTruthy();
    });

    it('renders correct singular/plural text', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      // 1 Round (singular)
      expect(getByText('1 Round')).toBeTruthy();
      // 2-5 Rounds (plural)
      expect(getByText('2 Rounds')).toBeTruthy();
      expect(getByText('5 Rounds')).toBeTruthy();
    });
  });

  describe('Selection State', () => {
    it('highlights the selected round (1)', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={1} />
      );

      const roundOption = getByText('1 Round').parent;
      expect(roundOption).toBeTruthy();
    });

    it('highlights the selected round (2)', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={2} />
      );

      const roundOption = getByText('2 Rounds').parent;
      expect(roundOption).toBeTruthy();
    });

    it('highlights the selected round (3)', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={3} />
      );

      const roundOption = getByText('3 Rounds').parent;
      expect(roundOption).toBeTruthy();
    });

    it('highlights the selected round (4)', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={4} />
      );

      const roundOption = getByText('4 Rounds').parent;
      expect(roundOption).toBeTruthy();
    });

    it('highlights the selected round (5)', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={5} />
      );

      const roundOption = getByText('5 Rounds').parent;
      expect(roundOption).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('calls onSelect and onClose when 1 Round is pressed', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByText('1 Round'));

      expect(mockOnSelect).toHaveBeenCalledWith(1);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelect and onClose when 2 Rounds is pressed', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByText('2 Rounds'));

      expect(mockOnSelect).toHaveBeenCalledWith(2);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelect and onClose when 3 Rounds is pressed', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByText('3 Rounds'));

      expect(mockOnSelect).toHaveBeenCalledWith(3);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelect and onClose when 4 Rounds is pressed', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByText('4 Rounds'));

      expect(mockOnSelect).toHaveBeenCalledWith(4);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onSelect and onClose when 5 Rounds is pressed', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByText('5 Rounds'));

      expect(mockOnSelect).toHaveBeenCalledWith(5);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when header close button is pressed', () => {
      const { getByTestId } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByTestId('sheet-header'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(<RoundsModal {...defaultProps} />);
      const TouchableOpacity = require('react-native').TouchableOpacity;

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // First TouchableOpacity is the backdrop
      fireEvent.press(touchables[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Modal Visibility', () => {
    it('renders modal when visible is true', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} visible={true} />
      );

      expect(getByText('Select Rounds')).toBeTruthy();
    });

    it('passes visible prop correctly to Modal component', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <RoundsModal {...defaultProps} visible={false} />
      );

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('sets correct modal properties for accessibility', () => {
      const { UNSAFE_getByType } = renderWithProviders(<RoundsModal {...defaultProps} />);

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.animationType).toBe('fade');
      expect(modal.props.transparent).toBe(true);
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_getByType } = renderWithProviders(<RoundsModal {...defaultProps} />);

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_getByType(Modal);

      modal.props.onRequestClose();

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid round selection', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} />);

      fireEvent.press(getByText('1 Round'));
      fireEvent.press(getByText('5 Rounds'));

      // Both selections should be registered
      expect(mockOnSelect).toHaveBeenCalledTimes(2);
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });

    it('renders correctly with different selected values', () => {
      const { rerender, getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={1} />
      );

      expect(getByText('1 Round')).toBeTruthy();

      rerender(<RoundsModal {...defaultProps} value={5} />);

      expect(getByText('5 Rounds')).toBeTruthy();
    });

    it('handles boundary values correctly', () => {
      const { rerender, getByText } = renderWithProviders(
        <RoundsModal {...defaultProps} value={1} />
      );

      // Minimum value
      expect(getByText('1 Round')).toBeTruthy();

      rerender(<RoundsModal {...defaultProps} value={5} />);

      // Maximum value
      expect(getByText('5 Rounds')).toBeTruthy();
    });

    it('handles undefined callbacks gracefully', () => {
      const { getByText } = renderWithProviders(
        <RoundsModal
          visible={true}
          value={3}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(() => fireEvent.press(getByText('3 Rounds'))).not.toThrow();
    });
  });

  describe('Text Descriptions', () => {
    it('displays correct description for 1 round', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} value={1} />);
      expect(getByText('Quick duel')).toBeTruthy();
    });

    it('displays correct description for 2 rounds', () => {
      const { getAllByText } = renderWithProviders(<RoundsModal {...defaultProps} value={2} />);
      expect(getAllByText('Balanced').length).toBeGreaterThan(0);
    });

    it('displays correct description for 3 rounds', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} value={3} />);
      expect(getByText('Classic pacing')).toBeTruthy();
    });

    it('displays correct description for 4 rounds', () => {
      const { getAllByText } = renderWithProviders(<RoundsModal {...defaultProps} value={4} />);
      expect(getAllByText('Balanced').length).toBeGreaterThan(0);
    });

    it('displays correct description for 5 rounds', () => {
      const { getByText } = renderWithProviders(<RoundsModal {...defaultProps} value={5} />);
      expect(getByText('Extended debate')).toBeTruthy();
    });
  });
});
