import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
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

const { ShareActionButtons } = require('@/components/molecules/share/ShareActionButtons');

describe('ShareActionButtons', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(
      <ShareActionButtons
        onShareImage={() => {}}
        onCopyLink={() => {}}
        isGenerating={false}
      />
    );
    expect(result).toBeTruthy();
  });
});
