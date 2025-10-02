import React from 'react';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

const { UnlockEverythingBanner } = require('@/components/organisms/subscription/UnlockEverythingBanner');

describe('UnlockEverythingBanner', () => {
  it('displays pricing and feature bullets', () => {
    const { getByText } = renderWithProviders(<UnlockEverythingBanner />);

    expect(getByText('Unlock Everything')).toBeTruthy();
    expect(getByText('$7.99/month')).toBeTruthy();
    expect(getByText(/Collaborate on ideas/i)).toBeTruthy();
  });
});
