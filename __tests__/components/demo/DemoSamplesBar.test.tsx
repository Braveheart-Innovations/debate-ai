import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

const { DemoSamplesBar } = require('@/components/organisms/demo/DemoSamplesBar');

describe('DemoSamplesBar', () => {
  it('renders samples and triggers selection', () => {
    const handleSelect = jest.fn();
    const { getByText } = renderWithProviders(
      <DemoSamplesBar
        label="Demo Samples"
        samples={[{ id: 's1', title: 'Opening Statements' }]}
        onSelect={handleSelect}
      />
    );

    fireEvent.press(getByText('Opening Statements'));
    expect(handleSelect).toHaveBeenCalledWith('s1');
  });

  it('returns null when no samples provided', () => {
    const { toJSON } = renderWithProviders(
      <DemoSamplesBar label="Demo Samples" samples={[]} onSelect={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });
});
