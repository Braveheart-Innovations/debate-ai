import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { StatCard } from '@/components/molecules/history/StatCard';
import type { Card } from '@/components/molecules';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: stubComponent<typeof Card>('card', { render: (p) => p.children }),
  };
});

describe('StatCard', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(
      <StatCard title="Debates" value={12} />
    );
    expect(result).toBeTruthy();
  });
});
