import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { ModalHeader } = require('@/components/molecules/sheets/ModalHeader');

describe('ModalHeader', () => {
  it('renders title', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test Modal" onClose={onClose} />
    );
    expect(getByText('Test Modal')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test" subtitle="Description" onClose={onClose} />
    );
    expect(getByText('Description')).toBeTruthy();
  });

  it('renders with solid variant', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test" onClose={onClose} variant="solid" />
    );
    expect(getByText('Test')).toBeTruthy();
  });

  it('calls onClose when close button pressed', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ModalHeader title="Test" onClose={onClose} />
    );

    fireEvent.press(getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });
});
