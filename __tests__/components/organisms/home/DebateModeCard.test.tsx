import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateModeCard } from '@/components/organisms/home/DebateModeCard';
import type { AIConfig } from '@/types';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'gradient' }, children);
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    GradientButton: ({ title, onPress }: any) =>
      React.createElement(
        Text,
        { accessibilityRole: 'button', onPress },
        title
      ),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/organisms/common/AIAvatar', () => ({
  AIAvatar: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'ai-avatar' });
  },
}));

const sampleAI: AIConfig = {
  id: 'ai',
  name: 'Claude',
  provider: 'claude',
  model: 'haiku',
  color: '#f60',
};

describe('DebateModeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows guidance message when less than two AIs selected', () => {
    const { getByText, queryByText } = renderWithProviders(
      <DebateModeCard selectedAIs={[sampleAI]} onStartDebate={jest.fn()} />
    );

    expect(getByText('Select 1 more AI for debate mode')).toBeTruthy();
    expect(queryByText('Choose Debate Topic')).toBeNull();
  });

  it('renders start button and triggers haptics when ready', () => {
    const onStartDebate = jest.fn();

    const { getByText } = renderWithProviders(
      <DebateModeCard
        selectedAIs={[sampleAI, { ...sampleAI, id: 'ai-2', name: 'GPT-4' }]}
        onStartDebate={onStartDebate}
      />
    );

    const button = getByText('Choose Debate Topic');
    fireEvent.press(button);

    expect(onStartDebate).toHaveBeenCalled();
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
    expect(getByText('Ready to debate! Choose a topic below')).toBeTruthy();
  });
});
