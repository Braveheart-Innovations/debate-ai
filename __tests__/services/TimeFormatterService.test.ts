import { TimeFormatterService } from '@/services/TimeFormatterService';

describe('TimeFormatterService', () => {
  let service: TimeFormatterService;

  const advanceTo = (isoDate: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(isoDate));
  };

  beforeEach(() => {
    (TimeFormatterService as unknown as { instance?: TimeFormatterService }).instance = undefined;
    service = TimeFormatterService.getInstance();
    advanceTo('2025-01-10T12:00:00Z');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('formats verification time based on recency', () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    expect(service.formatVerificationTime(now)).toBe('Verified just now');
    expect(service.formatVerificationTime(now - 30 * 60 * 1000)).toBe('Verified 30 mins ago');
    expect(service.formatVerificationTime(oneHourAgo)).toBe('Verified 1 hour ago');
    expect(service.formatVerificationTime(twoDaysAgo)).toBe('Verified 2 days ago');
  });

  it('falls back to locale date for older timestamps', () => {
    const spy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Jan 01, 2024');

    const result = service.formatVerificationTime(Date.now() - 10 * 24 * 60 * 60 * 1000);

    expect(result).toBe('Verified Jan 01, 2024');
    spy.mockRestore();
  });

  it('computes time utilities', () => {
    const now = Date.now();

    expect(service.getTimeDifference(now - 1000)).toBe(1000);
    expect(service.isWithinMinutes(now - 5 * 60 * 1000, 5)).toBe(true);
    expect(service.isWithinHours(now - 2 * 60 * 60 * 1000, 1)).toBe(false);
    expect(service.isWithinDays(now - 23 * 60 * 60 * 1000, 1)).toBe(true);
  });

  it('formats durations in human readable form', () => {
    const now = Date.now();

    expect(service.formatDuration(now - 2 * 60 * 60 * 1000)).toBe('2h 0m');
    expect(service.formatDuration(now - 5 * 60 * 1000, now - 60 * 1000)).toBe('4m 0s');
    expect(service.formatDuration(now - 15 * 1000, now - 2000)).toBe('13s');
  });

  it('formats timestamps with and without time', () => {
    const spyDate = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Jan 01, 2025');
    const spyDateTime = jest
      .spyOn(Date.prototype, 'toLocaleString')
      .mockReturnValue('Jan 01, 2025, 12:00 PM');

    const ts = 1_735_680_000_000; // Arbitrary timestamp

    expect(service.formatTimestamp(ts)).toBe('Jan 01, 2025');
    expect(service.formatTimestampWithTime(ts)).toBe('Jan 01, 2025, 12:00 PM');

    spyDate.mockRestore();
    spyDateTime.mockRestore();
  });

  it('derives verification freshness and status', () => {
    const now = Date.now();
    const freshTs = now - 30 * 60 * 1000;
    const staleTs = now - 2 * 24 * 60 * 60 * 1000;

    expect(service.isVerificationFresh(freshTs)).toBe(true);
    expect(service.isVerificationStale(staleTs)).toBe(true);
    expect(service.getVerificationStatus(freshTs)).toBe('fresh');
    expect(service.getVerificationStatus(now - 20 * 60 * 60 * 1000)).toBe('recent');
    expect(service.getVerificationStatus(staleTs)).toBe('stale');
  });
});
