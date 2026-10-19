import { WatchInputError, formatDay, nextRunAfter, readSchedule } from '../schedule';

const chicago = { every: 'day' as const, hour: 7, timeZone: 'America/Chicago' };

describe('nextRunAfter', () => {
  it('a daily watch runs at its hour on the zone\'s clock: later today, else tomorrow', () => {
    // 6 AM in Chicago (CDT, UTC-5) → 7 AM the same day.
    expect(nextRunAfter(chicago, Date.UTC(2026, 9, 19, 11))).toBe(Date.UTC(2026, 9, 19, 12));
    // At 7 AM exactly → the next day.
    expect(nextRunAfter(chicago, Date.UTC(2026, 9, 19, 12))).toBe(Date.UTC(2026, 9, 20, 12));
  });

  it('keeps 7 AM at 7 AM across the end of daylight saving', () => {
    // Oct 31, 8 AM CDT → Nov 1, 7 AM CST (UTC-6).
    expect(nextRunAfter(chicago, Date.UTC(2026, 9, 31, 13))).toBe(Date.UTC(2026, 10, 1, 13));
  });

  it('a weekly watch runs on its weekday, a week on when today\'s hour has passed', () => {
    const mondays = { every: 'week' as const, hour: 9, weekday: 1, timeZone: 'Europe/London' };
    // Saturday Oct 17 → Monday Oct 19, 9 AM BST (UTC+1).
    expect(nextRunAfter(mondays, Date.UTC(2026, 9, 17, 12))).toBe(Date.UTC(2026, 9, 19, 8));
    // Monday Oct 19 at 10 AM BST → Monday Oct 26, 9 AM GMT (the clocks went back on Oct 25).
    expect(nextRunAfter(mondays, Date.UTC(2026, 9, 19, 9))).toBe(Date.UTC(2026, 9, 26, 9));
  });

  it('works in a zone ahead of UTC across its date line', () => {
    const tokyo = { every: 'day' as const, hour: 0, timeZone: 'Asia/Tokyo' };
    // Oct 19, 14:00Z is Oct 19, 23:00 in Tokyo → midnight Oct 20 there, 15:00Z.
    expect(nextRunAfter(tokyo, Date.UTC(2026, 9, 19, 14))).toBe(Date.UTC(2026, 9, 19, 15));
  });
});

describe('readSchedule', () => {
  it('keeps what a schedule needs', () => {
    expect(readSchedule({ every: 'day', hour: 7, weekday: 3, timeZone: 'America/Chicago' })).toEqual(chicago);
    expect(readSchedule({ every: 'week', hour: 0, weekday: 0, timeZone: 'UTC' })).toEqual({ every: 'week', hour: 0, weekday: 0, timeZone: 'UTC' });
  });

  it.each([
    [{ every: 'month', hour: 7, timeZone: 'UTC' }, 'every day or every week'],
    [{ every: 'day', hour: 24, timeZone: 'UTC' }, 'hour must be 0 to 23'],
    [{ every: 'day', hour: 6.5, timeZone: 'UTC' }, 'hour must be 0 to 23'],
    [{ every: 'day', hour: 7, timeZone: 'Mars/Olympus' }, 'time zone'],
    [{ every: 'week', hour: 7, timeZone: 'UTC' }, 'weekday'],
    [undefined, 'every day or every week'],
  ])('refuses %j', (input, message) => {
    expect(() => readSchedule(input)).toThrow(WatchInputError);
    expect(() => readSchedule(input)).toThrow(message);
  });
});

describe('formatDay', () => {
  it('gives the date on the zone\'s calendar, with the year only when it isn\'t this year', () => {
    const now = Date.UTC(2026, 9, 19, 12);
    expect(formatDay(Date.UTC(2026, 9, 19, 3), 'America/Chicago', now)).toBe('Oct 18');
    expect(formatDay(Date.UTC(2026, 9, 19, 12), 'America/Chicago', now)).toBe('Oct 19');
    expect(formatDay(Date.UTC(2025, 11, 31, 12), 'UTC', now)).toBe('Dec 31, 2025');
  });
});
