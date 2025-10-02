import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { APIConfigHeader } from '@/components/organisms/api-config/APIConfigHeader';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(
        TouchableOpacity,
        { onPress, testID: `button-${title}` },
        React.createElement(Text, null, title)
      )
    ),
  };
});

describe('APIConfigHeader', () => {
  it('renders the default title and handles back press', () => {
    const onBack = jest.fn();
    const { getByText, getByTestId } = renderWithProviders(
      <APIConfigHeader onBack={onBack} />
    );

    expect(getByText('API Configuration')).toBeTruthy();

    fireEvent.press(getByTestId('button-←'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders a custom title when provided', () => {
    const onBack = jest.fn();
    const { getByText } = renderWithProviders(
      <APIConfigHeader onBack={onBack} title="Custom Title" />
    );

    expect(getByText('Custom Title')).toBeTruthy();
  });
});
