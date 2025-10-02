import {
  formatDate,
  formatDateTime,
  formatPercentage,
  truncateText,
  truncateTopic,
  formatLargeNumber,
  formatWinLossRatio,
  formatOrdinal,
  formatRank,
  formatTopicStats,
  formatTimeElapsed,
} from '@/services/stats/statsFormatter';

jest.useFakeTimers().setSystemTime(new Date('2025-01-10T12:00:00Z'));

describe('statsFormatter', () => {
  afterAll(() => {
    jest.useRealTimers();
  });

  it('formats dates and percentages', () => {
    const timestamp = Date.UTC(2025, 0, 1, 10, 30, 0);
    expect(formatDate(timestamp)).toBe(new Date(timestamp).toLocaleDateString());
    expect(formatDateTime(timestamp)).toBe(new Date(timestamp).toLocaleString());
    expect(formatPercentage(75.1234)).toBe('75%');
    expect(formatPercentage(75.1234, 2)).toBe('75.12%');
  });

  it('truncates text with word boundary preference', () => {
    expect(truncateText('Short text', 20)).toBe('Short text');
    expect(truncateText('This is a much longer sentence for truncation', 25)).toBe('This is a much longer...');
    expect(truncateTopic('Long debate topic title for display', 15)).toBe('Long debate...');
  });

  it('formats large numbers and ratios', () => {
    expect(formatLargeNumber(123)).toBe('123');
    expect(formatLargeNumber(1500)).toBe('1.5K');
    expect(formatLargeNumber(2_300_000)).toBe('2.3M');
    expect(formatLargeNumber(4_500_000_000)).toBe('4.5B');

    expect(formatWinLossRatio(6, 3)).toBe('2:1');
    expect(formatWinLossRatio(0, 0)).toBe('0:0');
    expect(formatWinLossRatio(0, 4)).toBe('0:4');
    expect(formatWinLossRatio(5, 0)).toBe('5:0');
  });

  it('formats ordinals, ranks, and topic stats', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
    expect(formatOrdinal(11)).toBe('11th');

    expect(formatRank(7)).toBe('#7');
    expect(formatTopicStats(3, 5)).toBe('3/5');
  });

  it('formats elapsed time based on current clock', () => {
    const now = Date.now();
    expect(formatTimeElapsed(now - 30 * 1000)).toBe('Just now');
    expect(formatTimeElapsed(now - 5 * 60 * 1000)).toBe('5 minutes ago');
    expect(formatTimeElapsed(now - 2 * 60 * 60 * 1000)).toBe('2 hours ago');
    expect(formatTimeElapsed(now - 3 * 24 * 60 * 60 * 1000)).toBe('3 days ago');
  });
});
