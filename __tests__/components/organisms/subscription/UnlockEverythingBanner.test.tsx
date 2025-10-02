import React from 'react';
import { Text, View } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    MaterialIcons: ({ children }: any) => <Text>{children}</Text>,
    MaterialCommunityIcons: ({ children }: any) => <Text>{children}</Text>,
  };
});

jest.mock('@/components/molecules', () => {
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

describe('UnlockEverythingBanner', () => {
  it('renders key selling points', () => {
    const { getByText } = renderWithProviders(<UnlockEverythingBanner />);

    expect(getByText('Unlock Everything')).toBeTruthy();
    expect(getByText('$7.99/month')).toBeTruthy();
    expect(getByText(/Collaborate on ideas/)).toBeTruthy();
  });
});
