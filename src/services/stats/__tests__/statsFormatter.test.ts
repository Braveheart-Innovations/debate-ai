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
} from '../statsFormatter';

describe('statsFormatter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('formatDate delegates to toLocaleDateString', () => {
    const ts = new Date('2024-01-01T00:00:00Z').getTime();
    const spy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('1/1/2024');

    expect(formatDate(ts)).toBe('1/1/2024');
    expect(spy).toHaveBeenCalled();
  });

  it('formatDateTime delegates to toLocaleString', () => {
    const ts = new Date('2024-02-02T12:34:56Z').getTime();
    const spy = jest
      .spyOn(Date.prototype, 'toLocaleString')
      .mockReturnValue('2/2/2024, 12:34:56 PM');

    expect(formatDateTime(ts)).toBe('2/2/2024, 12:34:56 PM');
    expect(spy).toHaveBeenCalled();
  });

  it('formatPercentage uses decimals parameter', () => {
    expect(formatPercentage(12.3456, 2)).toBe('12.35%');
  });

  describe('truncateText', () => {
    it('returns text unchanged when shorter than max length', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    it('truncates at word boundary when close to limit', () => {
      expect(truncateText('Hello amazing world', 15)).toBe('Hello amazing...');
    });

    it('truncates directly when no word boundary near end', () => {
      expect(truncateText('Supercalifragilistic', 10)).toBe('Supercalif...');
    });
  });

  it('truncateTopic proxies to truncateText with default length', () => {
    const longTopic = 'A very descriptive topic name that is too long';
    expect(truncateTopic(longTopic)).toBe(truncateText(longTopic, 30));
  });

  it('formatLargeNumber handles different magnitudes', () => {
    expect(formatLargeNumber(999)).toBe('999');
    expect(formatLargeNumber(12_300)).toBe('12.3K');
    expect(formatLargeNumber(9_500_000)).toBe('9.5M');
    expect(formatLargeNumber(3_200_000_000)).toBe('3.2B');
  });

  it('formatWinLossRatio reduces ratio using gcd', () => {
    expect(formatWinLossRatio(10, 5)).toBe('2:1');
    expect(formatWinLossRatio(0, 4)).toBe('0:4');
    expect(formatWinLossRatio(4, 0)).toBe('4:0');
    expect(formatWinLossRatio(0, 0)).toBe('0:0');
  });

  it('formatOrdinal applies proper suffix', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
    expect(formatOrdinal(4)).toBe('4th');
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(22)).toBe('22nd');
  });

  it('formatRank prefixes with hash', () => {
    expect(formatRank(8)).toBe('#8');
  });

  it('formatTopicStats returns won/participated', () => {
    expect(formatTopicStats(3, 5)).toBe('3/5');
  });

  describe('formatTimeElapsed', () => {
    it('handles minutes, hours, and days thresholds', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-03-01T12:00:00Z'));

      const now = Date.now();
      expect(formatTimeElapsed(now - 30 * 1000)).toBe('Just now');
      expect(formatTimeElapsed(now - 5 * 60 * 1000)).toBe('5 minutes ago');
      expect(formatTimeElapsed(now - 2 * 60 * 60 * 1000)).toBe('2 hours ago');
      expect(formatTimeElapsed(now - 3 * 24 * 60 * 60 * 1000)).toBe('3 days ago');
    });
  });
});
