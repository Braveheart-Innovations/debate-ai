import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateSetupSummary } from '@/components/organisms/debate/DebateSetupSummary';
import type { AIConfig } from '@/types';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('DebateSetupSummary', () => {
  const mockAIs: AIConfig[] = [
    { id: 'claude', provider: 'claude', name: 'Claude', apiKey: 'test', isConfigured: true },
  ];

  const defaultProps = {
    selectedTopic: 'Test Topic',
    customTopic: '',
    topicMode: 'preset' as const,
    selectedAIs: mockAIs,
    aiPersonalities: {},
  };

  it('renders topic', () => {
    const { getByText } = renderWithProviders(<DebateSetupSummary {...defaultProps} />);
    expect(getByText(/"Test Topic"/)).toBeTruthy();
  });

  it('renders in compact mode', () => {
    const { getByText } = renderWithProviders(<DebateSetupSummary {...defaultProps} compact={true} />);
    expect(getByText('Test Topic')).toBeTruthy();
  });
});
