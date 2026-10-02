import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { StatsLeaderboard } from '@/components/organisms/stats/StatsLeaderboard';
import { useSortedStats } from '@/hooks/stats';
import type { SortedAIStats } from '@/types/stats';

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

// Full useSortedStats result for the given rows (the component reads sortedStats/isEmpty).
const createSortedStatsResult = (sortedStats: SortedAIStats[]): ReturnType<typeof useSortedStats> => {
  const helpers = {
    sortedStats,
    sortBy: 'winRate' as const,
    getTopPerformers: (count: number) => sortedStats.slice(0, count),
    getAIRank: (aiId: string) => sortedStats.find((item) => item.aiId === aiId)?.rank ?? null,
    isInTopN: (aiId: string, n: number) => sortedStats.some((item) => item.aiId === aiId && item.rank <= n),
    isEmpty: sortedStats.length === 0,
    hasSingleAI: sortedStats.length === 1,
    hasMultipleAIs: sortedStats.length > 1,
  };
  const [topPerformer] = sortedStats;
  if (!topPerformer) {
    return { ...helpers, topPerformer: null, averageWinRate: 0, totalActiveAIs: 0, competitiveBalance: 0 };
  }
  return {
    ...helpers,
    topPerformer,
    averageWinRate: topPerformer.stats.winRate,
    totalActiveAIs: sortedStats.length,
    competitiveBalance: 100,
  };
};

describe('StatsLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when stats empty', () => {
    jest.mocked(useSortedStats).mockReturnValue(createSortedStatsResult([]));

    const { toJSON } = renderWithProviders(<StatsLeaderboard />);
    expect(toJSON()).toBeNull();
  });

  it('renders leaderboard items when stats available', () => {
    jest.mocked(useSortedStats).mockReturnValue(
      createSortedStatsResult([
        {
          aiId: 'ai-1',
          rank: 1,
          stats: { winRate: 75, roundWinRate: 70, totalDebates: 4, overallWins: 3, overallLosses: 1, roundsWon: 8, roundsLost: 4, lastDebated: Date.now(), topics: {} },
        },
      ])
    );

    const { getByText } = renderWithProviders(<StatsLeaderboard />);

    expect(getByText('🏆 Leaderboard')).toBeTruthy();
    expect(getByText('Claude')).toBeTruthy();
  });
});
