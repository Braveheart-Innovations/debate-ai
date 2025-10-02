import {
  sortByWinRate,
  sortByTotalDebates,
  sortByRoundWinRate,
  getTopTopics,
  transformDebateHistory,
  getRecentDebates,
  filterActiveAIs,
  calculateLeaderboardSummary,
  groupDebatesByPeriod,
  calculateHeadToHead,
} from '@/services/stats/statsTransformer';
import type { AIStats, DebateRound } from '@/types/stats';

const statsMap: Record<string, AIStats> = {
  alice: {
    winRate: 80,
    roundWinRate: 75,
    totalDebates: 10,
    overallWins: 8,
    overallLosses: 2,
    roundsWon: 30,
    roundsLost: 10,
    lastDebated: Date.now(),
    topics: {
      tech: { participated: 5, won: 4 },
      science: { participated: 3, won: 2 },
    },
  },
  bob: {
    winRate: 60,
    roundWinRate: 55,
    totalDebates: 15,
    overallWins: 9,
    overallLosses: 6,
    roundsWon: 33,
    roundsLost: 27,
    lastDebated: Date.now(),
    topics: {
      politics: { participated: 6, won: 3 },
      tech: { participated: 2, won: 1 },
    },
  },
  carol: {
    winRate: 0,
    roundWinRate: 0,
    totalDebates: 0,
    overallWins: 0,
    overallLosses: 0,
    roundsWon: 0,
    roundsLost: 0,
    lastDebated: Date.now(),
    topics: {},
  },
};

describe('statsTransformer', () => {
  const history: DebateRound[] = [
    {
      debateId: 'd1',
      topic: 'tech',
      participants: ['alice', 'bob'],
      roundWinners: { 1: 'alice', 2: 'bob' },
      overallWinner: 'alice',
      timestamp: Date.UTC(2025, 0, 1, 12, 0, 0),
    },
    {
      debateId: 'd2',
      topic: 'politics',
      participants: ['alice', 'bob'],
      roundWinners: { 1: 'bob' },
      overallWinner: 'bob',
      timestamp: Date.UTC(2025, 0, 3, 12, 0, 0),
    },
    {
      debateId: 'd3',
      topic: 'science',
      participants: ['alice', 'carol'],
      roundWinners: { 1: 'alice' },
      overallWinner: 'alice',
      timestamp: Date.UTC(2025, 0, 5, 12, 0, 0),
    },
  ];

  it('sorts by win rate, debates, and round win rate', () => {
    expect(sortByWinRate(statsMap).map(s => s.aiId)).toEqual(['alice', 'bob', 'carol']);
    expect(sortByTotalDebates(statsMap).map(s => s.aiId)).toEqual(['bob', 'alice', 'carol']);
    expect(sortByRoundWinRate(statsMap).map(s => s.aiId)).toEqual(['alice', 'bob', 'carol']);
  });

  it('returns top topics limited by won count and win rate', () => {
    const top = getTopTopics(statsMap.alice.topics, 2);
    expect(top).toEqual([
      { topic: 'tech', won: 4, participated: 5, winRate: 80 },
      { topic: 'science', won: 2, participated: 3, winRate: (2 / 3) * 100 },
    ]);
  });

  it('transforms debate history to formatted objects', () => {
    const debates = transformDebateHistory(history, id => ({ name: id, color: '#fff' }));
    expect(debates[0]).toMatchObject({ debateId: 'd1', winner: { name: 'alice' } });
    expect(debates[2]).toMatchObject({ debateId: 'd3', winner: { name: 'alice' } });
  });

  it('gets recent debates in reverse order with limit', () => {
    const recentTwo = getRecentDebates(history, 2);
    expect(recentTwo.map(d => d.debateId)).toEqual(['d3', 'd2']);
  });

  it('filters active AIs and computes leaderboard summary', () => {
    const filtered = filterActiveAIs(statsMap);
    expect(Object.keys(filtered)).toEqual(['alice', 'bob']);

    const summary = calculateLeaderboardSummary(statsMap);
    expect(summary).toMatchObject({
      totalAIs: 2,
      totalDebates: 25,
      totalRounds: 100,
      topPerformer: expect.objectContaining({ aiId: 'alice' }),
    });
    expect(summary.averageWinRate).toBeCloseTo((80 + 60) / 2, 5);
  });

  it('groups debates by period', () => {
    const byDay = groupDebatesByPeriod(history, 'day');
    expect(Object.keys(byDay)).toHaveLength(3);

    const byWeek = groupDebatesByPeriod(history, 'week');
    expect(Object.values(byWeek).map(arr => arr.length)).toEqual([2, 1]);

    const byMonth = groupDebatesByPeriod(history, 'month');
    expect(Object.keys(byMonth)).toEqual(['2025-01']);
  });

  it('calculates head to head stats', () => {
    const matchup = calculateHeadToHead(history, 'alice', 'bob');
    expect(matchup).toEqual({
      totalDebates: 2,
      ai1Wins: 1,
      ai2Wins: 1,
      draws: 0,
      ai1WinRate: 50,
      ai2WinRate: 50,
    });

    const none = calculateHeadToHead(history, 'bob', 'carol');
    expect(none).toEqual({
      totalDebates: 0,
      ai1Wins: 0,
      ai2Wins: 0,
      draws: 0,
      ai1WinRate: 0,
      ai2WinRate: 0,
    });
  });
});
