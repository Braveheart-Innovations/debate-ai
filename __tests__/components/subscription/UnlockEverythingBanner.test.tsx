import React from 'react';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('UnlockEverythingBanner', () => {
  it('displays pricing and feature bullets', () => {
    const { getByText } = renderWithProviders(<UnlockEverythingBanner />);

    expect(getByText('Unlock Everything')).toBeTruthy();
    expect(getByText('$5.99/month')).toBeTruthy();
    expect(getByText(/Create Mode/i)).toBeTruthy();
  });
});
