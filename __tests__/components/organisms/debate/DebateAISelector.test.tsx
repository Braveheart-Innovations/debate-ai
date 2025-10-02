import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateAISelector } from '@/components/organisms/debate/DebateAISelector';
import type { AIConfig } from '@/types';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    GradientButton: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(TouchableOpacity, { onPress, testID: 'next-button' }, React.createElement(Text, null, title)),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(TouchableOpacity, { onPress, testID: 'back-button' }, React.createElement(Text, null, title)),
  };
});

jest.mock('@/components/organisms/home/DynamicAISelector', () => ({
  DynamicAISelector: () => null,
}));

describe('DebateAISelector', () => {
  const mockAIs: AIConfig[] = [
    { id: 'claude', provider: 'claude', name: 'Claude', apiKey: 'test', isConfigured: true },
  ];

  const defaultProps = {
    selectedTopic: 'Test',
    customTopic: '',
    topicMode: 'preset' as const,
    configuredAIs: mockAIs,
    selectedAIs: [],
    maxAIs: 2,
    isPremium: false,
    aiPersonalities: {},
    onToggleAI: jest.fn(),
    onPersonalityChange: jest.fn(),
    onAddAI: jest.fn(),
    onNext: jest.fn(),
    onBack: jest.fn(),
  };

  it('renders AI selector', () => {
    const { getByText } = renderWithProviders(<DebateAISelector {...defaultProps} />);
    expect(getByText('Back to Motion')).toBeTruthy();
  });
});
