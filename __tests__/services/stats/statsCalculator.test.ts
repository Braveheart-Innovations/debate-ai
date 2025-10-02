import {
  calculateWinRate,
  calculateRoundWinRate,
  getTotalRounds,
  calculateTopicWinRate,
  hasDebateHistory,
  calculateDraws,
  getPerformanceTrend,
  getAverageRoundsPerDebate,
} from '@/services/stats/statsCalculator';
import type { AIStats } from '@/types/stats';

describe('statsCalculator', () => {
  const baseStats: AIStats = {
    winRate: 0,
    roundWinRate: 0,
    totalDebates: 10,
    overallWins: 6,
    overallLosses: 3,
    roundsWon: 18,
    roundsLost: 12,
    lastDebated: Date.now(),
    topics: {
      tech: { participated: 5, won: 3 },
      politics: { participated: 2, won: 1 },
    },
  };

  it('computes win rates with zero safeguards', () => {
    expect(calculateWinRate(3, 4)).toBe(75);
    expect(calculateWinRate(0, 0)).toBe(0);

    expect(calculateRoundWinRate(5, 20)).toBe(25);
    expect(calculateRoundWinRate(1, 0)).toBe(0);
  });

  it('derives totals and topic stats', () => {
    expect(getTotalRounds(baseStats)).toBe(30);
    expect(calculateTopicWinRate(3, 5)).toBe(60);
    expect(calculateTopicWinRate(0, 0)).toBe(0);
  });

  it('computes history helpers', () => {
    expect(hasDebateHistory({ ...baseStats, totalDebates: 0 })).toBe(false);
    expect(hasDebateHistory(baseStats)).toBe(true);

    expect(calculateDraws(baseStats)).toBe(1);
  });

  it('detects performance trend against overall', () => {
    expect(getPerformanceTrend(80, 60)).toBe('improving');
    expect(getPerformanceTrend(40, 60)).toBe('declining');
    expect(getPerformanceTrend(62, 60)).toBe('stable');
  });

  it('averages rounds per debate with zero guard', () => {
    expect(getAverageRoundsPerDebate(baseStats)).toBe(3);
    expect(getAverageRoundsPerDebate({ ...baseStats, totalDebates: 0 })).toBe(0);
  });
});
