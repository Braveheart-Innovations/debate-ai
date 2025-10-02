import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const mockAnimation = {
    delay: jest.fn().mockReturnThis(),
    springify: jest.fn().mockReturnThis(),
  };
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    FadeInDown: mockAnimation,
    default: { View },
  };
});
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
  };
});

const { SessionCard } = require('@/components/molecules/history/SessionCard');

describe('SessionCard', () => {
  const mockSession = {
    id: '1',
    selectedAIs: [{ name: 'Claude', id: 'claude' }],
    sessionType: 'chat',
    timestamp: Date.now(),
    messages: [],
  };

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <SessionCard session={mockSession} onPress={() => {}} />
    );
    expect(result).toBeTruthy();
  });
});
