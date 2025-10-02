import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { APIComingSoon } from '@/components/organisms/api-config/APIComingSoon';
import type { AIProvider } from '@/config/aiProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('APIComingSoon', () => {
  const providers: AIProvider[] = [
    {
      id: 'test-provider',
      name: 'Test Provider',
      company: 'Test Co',
      color: '#000000',
      gradient: ['#000000', '#111111'],
      icon: '🤖',
      iconType: 'letter',
      apiKeyPrefix: 'sk-',
      apiKeyPlaceholder: 'sk-...',
      docsUrl: 'https://example.com/docs',
      getKeyUrl: 'https://example.com/key',
      description: 'A test provider description',
      features: ['feature-a'],
      enabled: true,
    },
  ];

  it('renders a list of providers with the supplied title', () => {
    const { getByText } = renderWithProviders(
      <APIComingSoon providers={providers} title="Coming Up" testID="coming-soon" />
    );

    expect(getByText('Coming Up')).toBeTruthy();
    expect(getByText('Test Provider')).toBeTruthy();
    expect(getByText('🤖')).toBeTruthy();
  });

  it('returns null when no providers are supplied', () => {
    const { toJSON } = renderWithProviders(<APIComingSoon providers={[]} />);

    expect(toJSON()).toBeNull();
  });
});
