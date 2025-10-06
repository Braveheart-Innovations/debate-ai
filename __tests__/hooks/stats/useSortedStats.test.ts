import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useSortedStats } from '@/hooks/stats/useSortedStats';
import type { RootState } from '@/store';

const debateState: RootState['debateStats'] = {
  stats: {
    claude: {
      totalDebates: 10,
      roundsWon: 30,
      roundsLost: 20,
      overallWins: 6,
      overallLosses: 4,
      lastDebated: 1700000000000,
      winRate: 60,
      roundWinRate: 60,
      topics: {
        climate: { participated: 5, won: 3 },
      },
    },
    gpt4: {
      totalDebates: 8,
      roundsWon: 18,
      roundsLost: 22,
      overallWins: 3,
      overallLosses: 5,
      lastDebated: 1699990000000,
      winRate: 37.5,
      roundWinRate: 45,
      topics: {
        climate: { participated: 5, won: 2 },
      },
    },
  },
  history: [],
  currentDebate: undefined,
  preservedTopic: null,
  preservedTopicMode: 'preset',
};

describe('useSortedStats', () => {
  it('returns sorted stats with leaderboard metrics and helpers', () => {
    const { result } = renderHookWithProviders(() => useSortedStats('winRate'), {
      preloadedState: { debateStats: debateState },
    });

    expect(result.current.sortedStats.map(item => item.aiId)).toEqual(['claude', 'gpt4']);
    expect(result.current.topPerformer?.aiId).toBe('claude');
    expect(result.current.averageWinRate).toBeCloseTo(48.75, 5);
    expect(result.current.totalActiveAIs).toBe(2);
    expect(result.current.competitiveBalance).toBeCloseTo(88.75, 5);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.hasMultipleAIs).toBe(true);

    expect(result.current.getTopPerformers(1)).toHaveLength(1);
    expect(result.current.getAIRank('claude')).toBe(1);
    expect(result.current.getAIRank('gpt4')).toBe(2);
    expect(result.current.isInTopN('gpt4', 1)).toBe(false);

    const totalDebatesSort = renderHookWithProviders(() => useSortedStats('totalDebates'), {
      preloadedState: { debateStats: debateState },
    });
    expect(totalDebatesSort.result.current.sortedStats.map(item => item.aiId)).toEqual(['claude', 'gpt4']);

    const roundWinRateSort = renderHookWithProviders(() => useSortedStats('roundWinRate'), {
      preloadedState: { debateStats: debateState },
    });
    expect(roundWinRateSort.result.current.sortedStats.map(item => item.aiId)).toEqual(['claude', 'gpt4']);
  });

  it('handles empty stats gracefully', () => {
    const { result } = renderHookWithProviders(() => useSortedStats('winRate'), {
      preloadedState: {
        debateStats: {
          stats: {},
          history: [],
          currentDebate: undefined,
          preservedTopic: null,
          preservedTopicMode: 'preset',
        },
      },
    });

    expect(result.current.sortedStats).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.getTopPerformers(3)).toEqual([]);
    expect(result.current.getAIRank('claude')).toBeNull();
    expect(result.current.isInTopN('claude', 1)).toBe(false);
    expect(result.current.averageWinRate).toBe(0);
    expect(result.current.competitiveBalance).toBe(0);
  });
});
