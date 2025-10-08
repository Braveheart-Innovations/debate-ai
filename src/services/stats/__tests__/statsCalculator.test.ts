import {
  calculateWinRate,
  calculateRoundWinRate,
  getTotalRounds,
  calculateTopicWinRate,
  hasDebateHistory,
  calculateDraws,
  getPerformanceTrend,
  getAverageRoundsPerDebate,
} from '../statsCalculator';
import { AIStats } from '../../../types/stats';

const createStats = (overrides: Partial<AIStats> = {}): AIStats => ({
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

describe('statsCalculator', () => {
  describe('calculateWinRate', () => {
    it('returns percentage when total > 0', () => {
      expect(calculateWinRate(7, 10)).toBe(70);
    });

    it('returns 0 when total is 0', () => {
      expect(calculateWinRate(3, 0)).toBe(0);
    });
  });

  describe('calculateRoundWinRate', () => {
    it('returns percentage for rounds', () => {
      expect(calculateRoundWinRate(4, 5)).toBe(80);
    });

    it('returns 0 when total rounds is 0', () => {
      expect(calculateRoundWinRate(1, 0)).toBe(0);
    });
  });

  it('getTotalRounds sums wins and losses', () => {
    const stats = createStats({ roundsWon: 11, roundsLost: 5 });
    expect(getTotalRounds(stats)).toBe(16);
  });

  describe('calculateTopicWinRate', () => {
    it('returns percentage when participated', () => {
      expect(calculateTopicWinRate(3, 4)).toBeCloseTo(75);
    });

    it('returns 0 when participated is 0', () => {
      expect(calculateTopicWinRate(2, 0)).toBe(0);
    });
  });

  it('hasDebateHistory returns true when totalDebates > 0', () => {
    expect(hasDebateHistory(createStats({ totalDebates: 1 }))).toBe(true);
  });

  it('hasDebateHistory returns false when totalDebates is 0', () => {
    expect(hasDebateHistory(createStats({ totalDebates: 0 }))).toBe(false);
  });

  it('calculateDraws subtracts wins and losses from total debates', () => {
    const stats = createStats({ totalDebates: 12, overallWins: 5, overallLosses: 4 });
    expect(calculateDraws(stats)).toBe(3);
  });

  describe('getPerformanceTrend', () => {
    it('returns improving when recent higher than overall by more than 5', () => {
      expect(getPerformanceTrend(80, 60)).toBe('improving');
    });

    it('returns declining when recent lower than overall by more than 5', () => {
      expect(getPerformanceTrend(40, 60)).toBe('declining');
    });

    it('returns stable for small differences', () => {
      expect(getPerformanceTrend(62, 60)).toBe('stable');
    });
  });

  describe('getAverageRoundsPerDebate', () => {
    it('returns 0 when no debates', () => {
      expect(getAverageRoundsPerDebate(createStats({ totalDebates: 0 }))).toBe(0);
    });

    it('returns average when debates exist', () => {
      const stats = createStats({ roundsWon: 9, roundsLost: 3, totalDebates: 4 });
      expect(getAverageRoundsPerDebate(stats)).toBe(3);
    });
  });
});
