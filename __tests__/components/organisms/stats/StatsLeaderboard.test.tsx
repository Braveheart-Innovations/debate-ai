import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { StatsLeaderboard } from '@/components/organisms/stats/StatsLeaderboard';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    StatsCard: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    StatsCardHeader: ({ title }: { title: React.ReactNode }) => React.createElement(Text, null, title),
    StatsCardRow: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    StatItem: () => null,
    WinRateDisplay: () => null,
    RankBadge: () => null,
  };
});

jest.mock('@/hooks/stats', () => ({
  useSortedStats: jest.fn(),
  useAIProviderInfo: jest.fn(() => ({ getAIInfo: jest.fn(() => ({ name: 'Claude', color: '#abc' })) })),
  useStatsAnimations: jest.fn(() => ({
    getLeaderboardAnimation: jest.fn(() => ({ entering: undefined })),
    shouldUseAnimations: jest.fn(() => false),
    getSimpleAnimation: jest.fn(() => ({ entering: undefined })),
  })),
}));

jest.mock('@/services/stats', () => ({ formatDate: jest.fn(() => 'Jan 1'), }));

describe('StatsLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when stats empty', () => {
    const { useSortedStats } = require('@/hooks/stats');
    useSortedStats.mockReturnValue({ sortedStats: [], isEmpty: true });

    const { toJSON } = renderWithProviders(<StatsLeaderboard />);
    expect(toJSON()).toBeNull();
  });

  it('renders leaderboard items when stats available', () => {
    const { useSortedStats } = require('@/hooks/stats');
    useSortedStats.mockReturnValue({
      sortedStats: [
        {
          aiId: 'ai-1',
          rank: 1,
          stats: { winRate: 75, roundWinRate: 70, totalDebates: 4, overallWins: 3, overallLosses: 1, roundsWon: 8, roundsLost: 4, lastDebated: Date.now() },
        },
      ],
      isEmpty: false,
    });

    const { getByText } = renderWithProviders(<StatsLeaderboard />);

    expect(getByText('🏆 Leaderboard')).toBeTruthy();
    expect(getByText('Claude')).toBeTruthy();
  });
});
