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

const { PersonalityChip } = require('@/components/molecules/debate/PersonalityChip');

describe('PersonalityChip', () => {
  const mockPersonality = {
    id: 'analytical',
    name: 'Analytical',
    emoji: '🧠',
    description: 'Logical and detail-oriented'
  };

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <PersonalityChip
        personality={mockPersonality}
        isSelected={false}
        onPress={() => {}}
      />
    );
    expect(result).toBeTruthy();
  });
});
