import { TimeFormatterService } from '../TimeFormatterService';

describe('TimeFormatterService', () => {
  let service: TimeFormatterService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-04-10T12:00:00Z'));
    service = new TimeFormatterService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('formatVerificationTime', () => {
    it('formats various intervals with proper wording', () => {
      const now = Date.now();
      expect(service.formatVerificationTime(now)).toBe('Verified just now');
      expect(service.formatVerificationTime(now - 5 * 60 * 1000)).toBe('Verified 5 mins ago');
      expect(service.formatVerificationTime(now - 3 * 60 * 60 * 1000)).toBe('Verified 3 hours ago');
      expect(service.formatVerificationTime(now - 2 * 24 * 60 * 60 * 1000)).toBe('Verified 2 days ago');

      const spy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('4/1/2024');
      expect(service.formatVerificationTime(now - 10 * 24 * 60 * 60 * 1000)).toBe('Verified 4/1/2024');
      spy.mockRestore();
    });
  });

  it('calculates time difference helpers', () => {
    const now = Date.now();
    expect(service.getTimeDifference(now - 1000)).toBe(1000);
    expect(service.isWithinMinutes(now - 2 * 60 * 1000, 3)).toBe(true);
    expect(service.isWithinHours(now - 3 * 60 * 60 * 1000, 2)).toBe(false);
    expect(service.isWithinDays(now - 2 * 24 * 60 * 60 * 1000, 3)).toBe(true);
  });

  it('formatDuration handles optional end timestamp', () => {
    const start = Date.now() - (2 * 60 * 60 * 1000 + 15 * 60 * 1000);
    expect(service.formatDuration(start)).toBe('2h 15m');

    const customEnd = start + 5 * 60 * 1000 + 12 * 1000;
    expect(service.formatDuration(start, customEnd)).toBe('5m 12s');
  });

  it('returns current timestamp and formats date/time strings', () => {
    const now = service.getCurrentTimestamp();
    expect(now).toBe(Date.now());

    const spyDate = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('04/10/2024');
    expect(service.formatTimestamp(now)).toBe('04/10/2024');
    spyDate.mockRestore();

    const spyDateTime = jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('04/10/2024, 12:00 PM');
    expect(service.formatTimestampWithTime(now)).toBe('04/10/2024, 12:00 PM');
    spyDateTime.mockRestore();
  });

  it('derives verification freshness and status categories', () => {
    const now = Date.now();
    expect(service.isVerificationFresh(now - 20 * 60 * 1000)).toBe(true);
    expect(service.isVerificationStale(now - 2 * 24 * 60 * 60 * 1000)).toBe(true);

    expect(service.getVerificationStatus(now - 30 * 60 * 1000)).toBe('fresh');
    expect(service.getVerificationStatus(now - 12 * 60 * 60 * 1000)).toBe('recent');
    expect(service.getVerificationStatus(now - 2 * 24 * 60 * 60 * 1000)).toBe('stale');
  });
});
