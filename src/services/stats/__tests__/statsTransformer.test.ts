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
} from '../statsTransformer';
import { AIStats, DebateRound } from '../../../types/stats';

const createAIStats = (overrides: Partial<AIStats>): AIStats => ({
  winRate: 50,
  roundWinRate: 55,
  totalDebates: 10,
  overallWins: 6,
  overallLosses: 3,
  roundsWon: 18,
  roundsLost: 12,
  lastDebated: Date.now(),
  topics: {},
  ...overrides,
});

describe('statsTransformer', () => {
  const statsMap = {
    alpha: createAIStats({ winRate: 80, totalDebates: 5, roundWinRate: 60 }),
    beta: createAIStats({ winRate: 60, totalDebates: 10, roundWinRate: 70 }),
    gamma: createAIStats({ winRate: 90, totalDebates: 3, roundWinRate: 40 }),
  };

  it('sortByWinRate ranks descending', () => {
    const sorted = sortByWinRate(statsMap);
    expect(sorted.map(s => s.aiId)).toEqual(['gamma', 'alpha', 'beta']);
    expect(sorted[0].rank).toBe(1);
  });

  it('sortByTotalDebates ranks by debates descending', () => {
    const sorted = sortByTotalDebates(statsMap);
    expect(sorted.map(s => s.aiId)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('sortByRoundWinRate ranks by round win rate descending', () => {
    const sorted = sortByRoundWinRate(statsMap);
    expect(sorted.map(s => s.aiId)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('getTopTopics orders by wins then win rate', () => {
    const topics = {
      history: { participated: 5, won: 4 },
      science: { participated: 3, won: 3 },
      art: { participated: 4, won: 2 },
      tech: { participated: 2, won: 2 },
    };

    const result = getTopTopics(topics, 3);
    expect(result.map(t => t.topic)).toEqual(['history', 'science', 'tech']);
    expect(result[0].winRate).toBeCloseTo(80);
  });

  it('transformDebateHistory maps debates with formatted date and winner', () => {
    const history: DebateRound[] = [
      {
        debateId: '1',
        topic: 'AI Safety',
        participants: ['alpha', 'beta'],
        roundWinners: {},
        overallWinner: 'alpha',
        timestamp: new Date('2024-01-01T10:00:00Z').getTime(),
      },
    ];
    const getAIInfo = jest.fn().mockReturnValue({ name: 'Alpha', color: '#000' });
    const spy = jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/1/2024, 10:00 AM');

    const result = transformDebateHistory(history, getAIInfo);
    expect(getAIInfo).toHaveBeenCalledWith('alpha');
    expect(result).toEqual([
      expect.objectContaining({
        debateId: '1',
        topic: 'AI Safety',
        formattedDate: '1/1/2024, 10:00 AM',
        winner: { name: 'Alpha', color: '#000' },
      }),
    ]);
    spy.mockRestore();
  });

  it('getRecentDebates returns newest debates up to limit', () => {
    const history: DebateRound[] = Array.from({ length: 6 }, (_, idx) => ({
      debateId: `${idx}`,
      topic: 'Topic',
      participants: ['alpha', 'beta'],
      roundWinners: {},
      timestamp: idx,
    }));

    const result = getRecentDebates(history, 3);
    expect(result.map(d => d.debateId)).toEqual(['5', '4', '3']);
  });

  describe('filterActiveAIs', () => {
    it('removes inactive entries', () => {
      const mixedStats = {
        active: createAIStats({ totalDebates: 1 }),
        inactive: createAIStats({ totalDebates: 0, roundsWon: 0, roundsLost: 0 }),
      };

      expect(filterActiveAIs(mixedStats)).toEqual({
        active: mixedStats.active,
      });
    });
  });

  it('calculateLeaderboardSummary aggregates totals and averages', () => {
    const summary = calculateLeaderboardSummary(statsMap);
    expect(summary.totalAIs).toBe(3);
    expect(summary.totalDebates).toBe(18);
    expect(summary.topPerformer?.aiId).toBe('gamma');
    expect(summary.averageWinRate).toBeCloseTo((80 + 60 + 90) / 3);
  });

  it('groupDebatesByPeriod groups by requested period', () => {
    const base = new Date('2024-01-01T00:00:00Z').getTime();
    const history: DebateRound[] = [
      { debateId: 'd1', topic: '', participants: [], roundWinners: {}, timestamp: base },
      { debateId: 'd2', topic: '', participants: [], roundWinners: {}, timestamp: base + 2 * 24 * 60 * 60 * 1000 },
      { debateId: 'd3', topic: '', participants: [], roundWinners: {}, timestamp: base + 8 * 24 * 60 * 60 * 1000 },
    ];

    const byDay = groupDebatesByPeriod(history, 'day');
    expect(Object.values(byDay)).toHaveLength(3);

    const byWeek = groupDebatesByPeriod(history, 'week');
    expect(Object.values(byWeek)).toHaveLength(2);

    const byMonth = groupDebatesByPeriod(history, 'month');
    expect(Object.values(byMonth)).toHaveLength(2);
  });

  it('calculateHeadToHead tallies wins, draws, and win rates', () => {
    const history: DebateRound[] = [
      {
        debateId: '1',
        topic: 'AI',
        participants: ['alpha', 'beta'],
        roundWinners: {},
        overallWinner: 'alpha',
        timestamp: 1,
      },
      {
        debateId: '2',
        topic: 'Ethics',
        participants: ['alpha', 'beta'],
        roundWinners: {},
        overallWinner: 'beta',
        timestamp: 2,
      },
      {
        debateId: '3',
        topic: 'Science',
        participants: ['alpha', 'beta'],
        roundWinners: {},
        overallWinner: undefined,
        timestamp: 3,
      },
      {
        debateId: '4',
        topic: 'History',
        participants: ['alpha', 'gamma'],
        roundWinners: {},
        overallWinner: 'gamma',
        timestamp: 4,
      },
    ];

    const summary = calculateHeadToHead(history, 'alpha', 'beta');
    expect(summary).toEqual({
      totalDebates: 3,
      ai1Wins: 1,
      ai2Wins: 1,
      draws: 1,
      ai1WinRate: (1 / 3) * 100,
      ai2WinRate: (1 / 3) * 100,
    });
  });
});
