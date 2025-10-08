import { DateFormatterService } from '../DateFormatterService';
import { NativeModules, Platform } from 'react-native';

describe('DateFormatterService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-04-10T12:00:00Z'));
    (Platform as unknown as { OS: string }).OS = 'ios';
    (NativeModules as unknown as { SettingsManager: unknown; I18nManager: { localeIdentifier: string } }).SettingsManager = {
      settings: { AppleLocale: 'en-US', AppleLanguages: ['en-US'] },
    };
    (NativeModules as unknown as { I18nManager: { localeIdentifier: string } }).I18nManager = {
      localeIdentifier: 'en_US',
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('derives locale from platform settings and allows override', () => {
    const service = new DateFormatterService();
    expect((service as unknown as { locale: string }).locale).toBe('en-US');

    service.setLocale('fr-FR');
    const formatted = service.formatAbsoluteDate(Date.now());
    expect(formatted).toContain('avr');
  });

  it('uses android locale when platform is android', () => {
    (Platform as unknown as { OS: string }).OS = 'android';
    (NativeModules as unknown as { I18nManager: { localeIdentifier: string } }).I18nManager.localeIdentifier = 'es_ES';

    const service = new DateFormatterService();
    // Reset to ensure deterministic output for rest of tests
    (Platform as unknown as { OS: string }).OS = 'ios';

    service.setLocale('es-ES');
    const formatted = service.formatAbsoluteDate(Date.now());
    expect(formatted.toLowerCase()).toContain('abr');
  });

  it('formatRelativeDate handles today, yesterday, within week, and older dates', () => {
    const service = new DateFormatterService();
    service.setLocale('en-US');
    const now = Date.now();

    const spyTime = jest
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('03:00 PM');
    const spyDate = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValueOnce('Mon 03:00 PM')
      .mockReturnValueOnce('Apr 3');

    expect(service.formatRelativeDate(now)).toBe('Today, 03:00 PM');
    expect(service.formatRelativeDate(now - 24 * 60 * 60 * 1000)).toBe('Yesterday, 03:00 PM');
    expect(service.formatRelativeDate(now - 2 * 24 * 60 * 60 * 1000)).toBe('Mon 03:00 PM');
    expect(service.formatRelativeDate(now - 400 * 24 * 60 * 60 * 1000)).toBe('Apr 3');

    spyTime.mockRestore();
    spyDate.mockRestore();
  });

  it('formatAbsoluteDate respects includeTime and includeYear options', () => {
    const service = new DateFormatterService();
    service.setLocale('en-US');

    const ts = new Date('2024-04-01T10:00:00Z').getTime();
    const spy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('Apr 1, 2024, 10:00 AM');

    service.formatAbsoluteDate(ts, {});
    expect(spy).toHaveBeenLastCalledWith('en-US', expect.objectContaining({ hour: '2-digit' }));

    service.formatAbsoluteDate(ts, { includeTime: false, includeYear: false, locale: 'en-GB' });
    expect(spy).toHaveBeenLastCalledWith('en-GB', expect.not.objectContaining({ hour: expect.anything() }));

    spy.mockRestore();
  });

  it('formatTimeAgo handles boundaries', () => {
    const service = new DateFormatterService();
    const now = Date.now();

    expect(service.formatTimeAgo(now - 30 * 1000)).toBe('Just now');
    expect(service.formatTimeAgo(now - 5 * 60 * 1000)).toBe('5 minutes ago');
    expect(service.formatTimeAgo(now - 2 * 60 * 60 * 1000)).toBe('2 hours ago');
    expect(service.formatTimeAgo(now - 3 * 24 * 60 * 60 * 1000)).toBe('3 days ago');
    expect(service.formatTimeAgo(now - 2 * 7 * 24 * 60 * 60 * 1000)).toBe('2 weeks ago');
    expect(service.formatTimeAgo(now - 3 * 30 * 24 * 60 * 60 * 1000)).toBe('3 months ago');
    expect(service.formatTimeAgo(now - 2 * 365 * 24 * 60 * 60 * 1000)).toBe('2 years ago');
  });

  it('formatDuration returns compact human readable strings', () => {
    const service = new DateFormatterService();
    const start = Date.now();
    expect(service.formatDuration(start, start + 45 * 1000)).toBe('45s');
    expect(service.formatDuration(start, start + 5 * 60 * 1000 + 12 * 1000)).toBe('5m 12s');
    expect(service.formatDuration(start, start + 2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe('2h 30m');
  });

  it('getDateGroup categorizes timestamps', () => {
    const service = new DateFormatterService();
    const now = Date.now();

    const todayGroup = service.getDateGroup(now);
    const yesterdayGroup = service.getDateGroup(now - 24 * 60 * 60 * 1000);
    const weekGroup = service.getDateGroup(now - 3 * 24 * 60 * 60 * 1000);
    const pastMonth = service.getDateGroup(now - 20 * 24 * 60 * 60 * 1000);
    const pastYear = service.getDateGroup(now - 200 * 24 * 60 * 60 * 1000);
    const older = service.getDateGroup(now - 500 * 24 * 60 * 60 * 1000);

    expect([todayGroup, yesterdayGroup, weekGroup]).toEqual(['Today', 'Yesterday', 'This Week']);
    expect(pastMonth).toBe('This Month');
    expect(pastYear).toMatch(/\d{4}/);
    expect(older).toMatch(/\d{4}/);
  });

  it('formatForContext delegates to appropriate formatting method', () => {
    const service = new DateFormatterService();
    const ts = Date.now() - 2 * 60 * 60 * 1000;

    const relativeSpy = jest.spyOn(service, 'formatRelativeDate');
    const timeAgoSpy = jest.spyOn(service, 'formatTimeAgo');
    const absoluteSpy = jest.spyOn(service, 'formatAbsoluteDate');

    service.formatForContext(ts, 'card');
    expect(relativeSpy).toHaveBeenCalled();

    service.formatForContext(ts, 'list');
    expect(timeAgoSpy).toHaveBeenCalled();

    service.formatForContext(ts, 'detail');
    expect(absoluteSpy).toHaveBeenCalledWith(ts, { includeTime: true, includeYear: true });

    const iso = service.formatForContext(ts, 'export');
    expect(iso).toMatch(/T/);

    relativeSpy.mockRestore();
    timeAgoSpy.mockRestore();
    absoluteSpy.mockRestore();
  });
});
