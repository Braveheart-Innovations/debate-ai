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

const { DebateHistoryItem } = require('@/components/molecules/stats/DebateHistoryItem');

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    default: { View },
  };
});

describe('DebateHistoryItem', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(
      <DebateHistoryItem
        debateId="1"
        topic="Technology"
        timestamp={Date.now()}
        winner={null}
      />
    );
    expect(result).toBeTruthy();
  });
});
