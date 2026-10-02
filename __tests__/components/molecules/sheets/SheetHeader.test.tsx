import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SheetHeader } from '@/components/molecules/sheets/SheetHeader';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

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

  it('omits close button when no close handler is supplied', () => {
    const { queryByTestId } = renderWithProviders(
      <SheetHeader title="Blocking Sheet" testID="sheet-header" />
    );

    expect(queryByTestId('sheet-header-close')).toBeNull();
  });
});
