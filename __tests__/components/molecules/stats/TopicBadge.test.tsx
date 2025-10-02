import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
  };
});

const { TopicBadge } = require('@/components/molecules/stats/TopicBadge');

describe('TopicBadge', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(
      <TopicBadge
        topic="Technology"
        wins={3}
        participations={5}
      />
    );
    expect(result).toBeTruthy();
  });
});
