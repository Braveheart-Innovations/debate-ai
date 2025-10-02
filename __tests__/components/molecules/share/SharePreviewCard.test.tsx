import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('@/components/organisms/common/AppLogo', () => ({
  AppLogo: () => null,
}));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
    Button: ({ title }: any) => React.createElement(Text, null, title),
  };
});

const { SharePreviewCard } = require('@/components/molecules/share/SharePreviewCard');

describe('SharePreviewCard', () => {
  const mockParticipants = [
    { id: 'claude', name: 'Claude', color: '#6366F1', icon: '🤖' },
    { id: 'gpt', name: 'GPT', color: '#10a37f', icon: '🤖' }
  ];

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <SharePreviewCard
        topic="Technology"
        participants={mockParticipants}
        winner="Claude"
      />
    );
    expect(result).toBeTruthy();
  });
});
