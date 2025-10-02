import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { SheetHeader } = require('@/components/molecules/sheets/SheetHeader');

describe('SheetHeader', () => {
  it('renders title', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <SheetHeader title="Test Sheet" onClose={onClose} />
    );
    expect(getByText('Test Sheet')).toBeTruthy();
  });

  it('calls onClose when close button pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = renderWithProviders(
      <SheetHeader title="Test" onClose={onClose} testID="sheet-header" />
    );

    fireEvent.press(getByTestId('sheet-header-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
