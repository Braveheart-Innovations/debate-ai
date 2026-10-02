import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SwipeableActions } from '@/components/molecules/history/SwipeableActions';
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

describe('SwipeableActions', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(
      <SwipeableActions onDelete={jest.fn()} />
    );
    expect(result).toBeTruthy();
  });
});
