import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { FilterChip } from '@/components/molecules/history/FilterChip';
import type { Card } from '@/components/molecules';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: stubComponent<typeof Card>('card', { render: (p) => p.children }),
  };
});

describe('FilterChip', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(
      <FilterChip label="All" isActive={false} onPress={jest.fn()} />
    );
    expect(result).toBeTruthy();
  });
});
