import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
  };
});

const { FilterChip } = require('@/components/molecules/history/FilterChip');

describe('FilterChip', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<FilterChip />);
    expect(result).toBeTruthy();
  });
});
