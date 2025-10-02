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
    GlassCard: ({ children }: any) => children,
    Button: ({ title }: any) => React.createElement(Text, null, title),
  };
});

const { DebateTypingIndicator } = require('@/components/molecules/debate/DebateTypingIndicator');

describe('DebateTypingIndicator', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<DebateTypingIndicator />);
    expect(result).toBeTruthy();
  });
});
