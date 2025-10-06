import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useDebateStats } from '@/hooks/stats/useDebateStats';
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
        ai: { participated: 2, won: 1 },
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
        ethics: { participated: 3, won: 1 },
      },
    },
  },
  history: [
    {
      debateId: 'debate-1',
      topic: 'climate',
      participants: ['claude', 'gpt4'],
      roundWinners: { 1: 'claude', 2: 'gpt4', 3: 'claude' },
      overallWinner: 'claude',
      timestamp: 1700005000000,
    },
    {
      debateId: 'debate-2',
      topic: 'ethics',
      participants: ['claude', 'gpt4'],
      roundWinners: { 1: 'gpt4', 2: 'claude' },
      overallWinner: 'gpt4',
      timestamp: 1700010000000,
    },
  ],
  currentDebate: {
    debateId: 'debate-live',
    topic: 'innovation',
    participants: ['claude', 'gpt4'],
    roundWinners: {},
    timestamp: 1700015000000,
  },
  preservedTopic: 'democracy',
  preservedTopicMode: 'custom',
};

describe('useDebateStats', () => {
  it('selects debate stats and computes derived metrics', () => {
    const { result } = renderHookWithProviders(() => useDebateStats(), {
      preloadedState: { debateStats: debateState },
    });

    expect(result.current.stats).toBe(debateState.stats);
    expect(result.current.history).toHaveLength(2);
    expect(result.current.currentDebate?.debateId).toBe('debate-live');
    expect(result.current.hasStats).toBe(true);
    expect(result.current.hasHistory).toBe(true);
    expect(result.current.totalActiveAIs).toBe(2);
    expect(result.current.totalDebates).toBe((10 + 8) / 2);
    expect(result.current.totalRounds).toBe((30 + 20 + 18 + 22) / 2);
    expect(result.current.preservedTopic).toBe('democracy');
    expect(result.current.preservedTopicMode).toBe('custom');
  });
});
