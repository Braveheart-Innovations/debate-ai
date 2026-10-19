/**
 * A watch's schedule: every day, or every week on one weekday, at an hour in
 * the user's time zone (the browser's, changeable; web
 * docs/analyze-beyond-reports-plan.md, Decisions item 8). Times are computed
 * in that zone, so 7 AM stays 7 AM across a daylight-saving change.
 */

export interface WatchSchedule {
  every: 'day' | 'week';
  /** 0–23, on the zone's clock. */
  hour: number;
  /** 0 (Sunday) to 6, for a weekly watch. */
  weekday?: number;
  /** An IANA time zone ("America/Chicago"). */
  timeZone: string;
}

export class WatchInputError extends Error {}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The schedule a request asked for, checked. */
export function readSchedule(input: unknown): WatchSchedule {
  const value = (input ?? {}) as Record<string, unknown>;
  if (value.every !== 'day' && value.every !== 'week') throw new WatchInputError('A watch runs every day or every week.');
  const hour = value.hour;
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new WatchInputError('The hour must be 0 to 23.');
  const timeZone = value.timeZone;
  if (typeof timeZone !== 'string' || !isTimeZone(timeZone)) throw new WatchInputError('The time zone isn\'t one the app knows.');
  if (value.every === 'day') return { every: 'day', hour, timeZone };
  const weekday = value.weekday;
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new WatchInputError('A weekly watch needs a weekday, 0 (Sunday) to 6.');
  }
  return { every: 'week', hour, weekday, timeZone };
}

interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallClock(at: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}

/** How far the zone's clock is ahead of UTC at `at`. */
function zoneOffset(at: number, timeZone: string): number {
  const clock = wallClock(at, timeZone);
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) - Math.floor(at / 1000) * 1000;
}

/** When the zone's clock reads this date at this hour (an hour a daylight-saving change skips comes out an hour off). */
function zonedHour(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const asUtc = Date.UTC(year, month - 1, day, hour);
  return asUtc - zoneOffset(asUtc - zoneOffset(asUtc, timeZone), timeZone);
}

/** The first scheduled time after `after`. */
export function nextRunAfter(schedule: WatchSchedule, after: number): number {
  const today = wallClock(after, schedule.timeZone);
  // A week and a day covers a weekly watch whose hour today has passed.
  for (let offset = 0; offset <= 8; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    if (schedule.every === 'week' && date.getUTCDay() !== schedule.weekday) continue;
    const at = zonedHour(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), schedule.hour, schedule.timeZone);
    if (at > after) return at;
  }
  throw new Error('No scheduled time in the next 8 days');
}

/** A date as the watch's words give it: "Oct 19", with the year when it isn't this year, on the zone's calendar. */
export function formatDay(at: number, timeZone: string, now = Date.now()): string {
  const thisYear = wallClock(at, timeZone).year === wallClock(now, timeZone).year;
  return new Date(at).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }) });
}
