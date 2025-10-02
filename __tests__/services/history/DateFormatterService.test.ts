import { DateFormatterService } from '@/services/history/DateFormatterService';

describe('DateFormatterService', () => {
  let service: DateFormatterService;

  beforeEach(() => {
    (DateFormatterService as unknown as { instance?: DateFormatterService }).instance = undefined;
    service = DateFormatterService.getInstance();
    service.setLocale('en-US');
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('formats relative dates across common ranges', () => {
    const timeSpy = jest
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('10:00 AM');
    const dateSpy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Thu 09:30 AM');

    const now = Date.now();
    expect(service.formatRelativeDate(now)).toBe('Today, 10:00 AM');
    expect(service.formatRelativeDate(now - 24 * 60 * 60 * 1000)).toBe('Yesterday, 10:00 AM');

    // Within the last week uses weekday formatting
    expect(service.formatRelativeDate(now - 3 * 24 * 60 * 60 * 1000)).toBe('Thu 09:30 AM');

    dateSpy.mockReturnValue('Jan 1');
    expect(service.formatRelativeDate(now - 10 * 24 * 60 * 60 * 1000)).toBe('Jan 1');

    timeSpy.mockRestore();
    dateSpy.mockRestore();
  });

  it('formats absolute dates with default options', () => {
    const dateSpy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Jan 10, 2025, 10:00 AM');

    const result = service.formatAbsoluteDate(Date.now());

    expect(result).toBe('Jan 10, 2025, 10:00 AM');
    expect(dateSpy).toHaveBeenCalledWith('en-US', expect.objectContaining({ hour: '2-digit', minute: '2-digit', year: 'numeric' }));
    dateSpy.mockRestore();
  });

  it('formats relative time differences', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    expect(service.formatTimeAgo(1_700_000_000_000 - 30 * 1000)).toBe('Just now');
    expect(service.formatTimeAgo(1_700_000_000_000 - 5 * 60 * 1000)).toBe('5 minutes ago');
    expect(service.formatTimeAgo(1_700_000_000_000 - 2 * 60 * 60 * 1000)).toBe('2 hours ago');
    expect(service.formatTimeAgo(1_700_000_000_000 - 3 * 24 * 60 * 60 * 1000)).toBe('3 days ago');
    expect(service.formatTimeAgo(1_700_000_000_000 - 2 * 7 * 24 * 60 * 60 * 1000)).toBe('2 weeks ago');
    expect(service.formatTimeAgo(1_700_000_000_000 - 5 * 30 * 24 * 60 * 60 * 1000)).toBe('5 months ago');
    expect(service.formatTimeAgo(1_700_000_000_000 - 2 * 365 * 24 * 60 * 60 * 1000)).toBe('2 years ago');
  });

  it('formats durations and date groups', () => {
    expect(service.formatDuration(0, 65 * 1000)).toBe('1m 5s');
    expect(service.formatDuration(0, 3 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('3h 5m');

    const dateSpy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('January 2024');

    const now = Date.now();
    expect(service.getDateGroup(now)).toBe('Today');
    expect(service.getDateGroup(now - 24 * 60 * 60 * 1000)).toBe('Yesterday');
    expect(service.getDateGroup(now - 3 * 24 * 60 * 60 * 1000)).toBe('This Week');
    expect(service.getDateGroup(now - 40 * 24 * 60 * 60 * 1000)).toBe('January 2024');

    dateSpy.mockRestore();
  });

  it('formats for specific contexts', () => {
    const iso = service.formatForContext(1_700_000_000_000, 'export');
    expect(iso).toBe(new Date(1_700_000_000_000).toISOString());

    const dateSpy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Jan 10, 2025, 10:00 AM');
    const timeSpy = jest
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('10:00 AM');

    const now = Date.now();
    expect(service.formatForContext(now, 'card')).toContain('Today');
    expect(service.formatForContext(now - 5 * 60 * 1000, 'list')).toContain('minutes ago');
    expect(service.formatForContext(now, 'detail')).toBe('Jan 10, 2025, 10:00 AM');

    dateSpy.mockRestore();
    timeSpy.mockRestore();
  });
});
