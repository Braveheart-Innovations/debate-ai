import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: () => <Text>Ionicon</Text>,
    MaterialIcons: () => <Text>MaterialIcon</Text>,
    MaterialCommunityIcons: () => <Text>MaterialCommunityIcon</Text>,
  };
});

const mockGradientButton = jest.fn(({ title, onPress }: { title: string; onPress: () => void }) => (
  <Text accessibilityRole="button" onPress={onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    GradientButton: (props: any) => mockGradientButton(props),
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const WelcomeScreen = require('@/screens/WelcomeScreen').default;

describe('WelcomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks onboarding complete when CTA is pressed', () => {
    const { getByText, store } = renderWithProviders(<WelcomeScreen />);

    expect(store.getState().settings.hasCompletedOnboarding).toBe(false);

    fireEvent.press(getByText('Start Your AI Journey'));

    expect(store.getState().settings.hasCompletedOnboarding).toBe(true);
    expect(mockGradientButton).toHaveBeenCalledWith(expect.objectContaining({ title: 'Start Your AI Journey' }));
  });
});
