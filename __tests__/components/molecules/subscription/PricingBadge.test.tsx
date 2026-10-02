import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PricingBadge } from '@/components/molecules/subscription/PricingBadge';

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('PricingBadge', () => {
  it('renders cost per message', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.005" />
    );
    expect(getByText('$0.005')).toBeTruthy();
  });

  it('renders free info when provided', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.001" freeInfo="Free tier available" />
    );
    expect(getByText(/Free tier available/)).toBeTruthy();
  });

  it('renders compact version', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.005" compact />
    );
    expect(getByText('~$0.005/msg')).toBeTruthy();
  });

  it('renders compact with free info', () => {
    const { getByText } = renderWithProviders(
      <PricingBadge costPerMessage="$0.001" freeInfo="Free" compact />
    );
    expect(getByText('Free')).toBeTruthy();
  });
});
