import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SharePreviewCard } from '@/components/molecules/share/SharePreviewCard';
import { createMockAIConfig } from '@test-utils/fixtures';
import type { Button, Card } from '@/components/molecules';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/organisms/common/AppLogo', () => ({
  AppLogo: () => null,
}));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: stubComponent<typeof Card>('card', { render: (p) => p.children }),
    Button: stubComponent<typeof Button>('button', { text: (p) => p.title }),
  };
});

describe('SharePreviewCard', () => {
  const mockParticipants = [
    createMockAIConfig({ id: 'claude', name: 'Claude', color: '#6366F1', icon: '🤖' }),
    createMockAIConfig({ id: 'gpt', provider: 'openai', name: 'GPT', color: '#10a37f', icon: '🤖' }),
  ];

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <SharePreviewCard
        topic="Technology"
        participants={mockParticipants}
        winner={mockParticipants[0]}
      />
    );
    expect(result).toBeTruthy();
  });
});
