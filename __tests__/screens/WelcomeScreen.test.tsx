import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import WelcomeScreen from '@/screens/WelcomeScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import type { GradientButton } from '@/components/molecules';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Ionicons: () => <Text>Ionicon</Text>,
    MaterialIcons: () => <Text>MaterialIcon</Text>,
    MaterialCommunityIcons: () => <Text>MaterialCommunityIcon</Text>,
  };
});

const mockGradientButton = capturePropsOf<typeof GradientButton>(({ title, onPress }) => (
  <Text accessibilityRole="button" onPress={onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    get GradientButton() {
      return mockGradientButton.Stub;
    },
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

describe('WelcomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGradientButton.reset();
  });

  it('marks onboarding complete when CTA is pressed', () => {
    const { getByText, store } = renderWithProviders(
      <WelcomeScreen navigation={{ replace: jest.fn() }} />
    );

    expect(store.getState().settings.hasCompletedOnboarding).toBe(false);

    fireEvent.press(getByText('Start Your AI Journey'));

    expect(store.getState().settings.hasCompletedOnboarding).toBe(true);
    expect(mockGradientButton.calls).toContainEqual(expect.objectContaining({ title: 'Start Your AI Journey' }));
  });
});
