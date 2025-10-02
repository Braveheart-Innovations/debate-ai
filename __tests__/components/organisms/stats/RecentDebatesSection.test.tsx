import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { RecentDebatesSection } from '@/components/organisms/stats/RecentDebatesSection';

const mockDebateHistoryHeader = jest.fn(() => <Text>Header</Text>);
const mockDebateHistoryItem = jest.fn(() => <Text>Item</Text>);

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DebateHistoryHeader: (props: any) => mockDebateHistoryHeader(props),
    DebateHistoryItem: (props: any) => mockDebateHistoryItem(props),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.mock('@/hooks/stats', () => ({
  useDebateStats: jest.fn(),
  useAIProviderInfo: jest.fn(() => ({ getAIInfo: jest.fn(() => ({ name: 'Claude', color: '#123' })) })),
  useStatsAnimations: jest.fn(() => ({
    getHistoryAnimation: jest.fn(() => ({ entering: undefined })),
    shouldUseAnimations: jest.fn(() => false),
    getSimpleAnimation: jest.fn(() => ({ entering: undefined })),
  })),
}));

jest.mock('@/services/stats', () => ({
  getRecentDebates: jest.fn(() => [{ debateId: 'd1' }]),
  transformDebateHistory: jest.fn(() => ([{
    debateId: 'd1',
    topic: 'Climate',
    timestamp: 123,
    winner: { name: 'Claude', color: '#123' },
  }])),
}));

describe('RecentDebatesSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no history', () => {
    const { useDebateStats } = require('@/hooks/stats');
    useDebateStats.mockReturnValue({ history: [], hasHistory: false });

    const { toJSON } = renderWithProviders(<RecentDebatesSection />);
    expect(toJSON()).toBeNull();
  });

  it('renders debates when history available', () => {
    const { useDebateStats } = require('@/hooks/stats');
    useDebateStats.mockReturnValue({ history: [{ debateId: 'd1' }], hasHistory: true });

    renderWithProviders(<RecentDebatesSection showElapsedTime showCount />);

    expect(mockDebateHistoryHeader).toHaveBeenCalledWith(expect.objectContaining({ showCount: true, totalCount: 1 }));
    expect(mockDebateHistoryItem).toHaveBeenCalledWith(expect.objectContaining({
      debateId: 'd1',
      topic: 'Climate',
      showElapsedTime: true,
    }));
  });
});
