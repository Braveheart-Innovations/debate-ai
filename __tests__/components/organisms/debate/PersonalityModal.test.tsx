import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PersonalityModal } from '@/components/organisms/debate/PersonalityModal';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    SheetHeader: ({ onClose }: { onClose: () => void }) =>
      React.createElement(TouchableOpacity, { onPress: onClose, testID: 'close-button' }),
    GradientButton: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) =>
      React.createElement(TouchableOpacity, { onPress, testID: 'confirm-button', disabled }, React.createElement(Text, null, title)),
  };
});

describe('PersonalityModal', () => {
  const mockPersonalities = [
    { id: 'default', name: 'Default', emoji: '🤖', tagline: 'Standard', bio: 'Normal', signatureMoves: [] },
  ];

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    selectedPersonalityId: 'default',
    availablePersonalities: mockPersonalities,
  };

  it('renders when visible', () => {
    const { getByText } = renderWithProviders(<PersonalityModal {...defaultProps} />);
    expect(getByText('🤖 Default')).toBeTruthy();
  });

  it('calls onConfirm when confirmed', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = renderWithProviders(<PersonalityModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.press(getByTestId('confirm-button'));
    expect(onConfirm).toHaveBeenCalledWith('default');
  });

  it('calls onClose when closed', () => {
    const onClose = jest.fn();
    const { getByTestId } = renderWithProviders(<PersonalityModal {...defaultProps} onClose={onClose} />);
    fireEvent.press(getByTestId('close-button'));
    expect(onClose).toHaveBeenCalled();
  });
});
