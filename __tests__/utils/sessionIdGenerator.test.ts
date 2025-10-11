import { generateSessionId, generateSimpleSessionId, validateSessionId, extractTimestampFromSessionId } from '@/utils/home/sessionIdGenerator';
import { HOME_CONSTANTS } from '@/config/homeConstants';

describe('sessionIdGenerator', () => {
  let dateSpy: jest.SpyInstance<number, []>;
  let randomSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    dateSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    dateSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('generates enhanced session IDs with random component', () => {
    const id = generateSessionId();
    const randomValue = randomSpy.mock.results[0].value as number;
    const expectedRandom = randomValue.toString(36).substr(2, HOME_CONSTANTS.SESSION_ID_RANDOM_LENGTH);
    expect(id).toBe(`${HOME_CONSTANTS.SESSION_ID_PREFIX}1700000000000_${expectedRandom}`);
    expect(validateSessionId(id)).toBe(true);
    expect(extractTimestampFromSessionId(id)).toBe(1700000000000);
  });

  it('generates simple session IDs', () => {
    const id = generateSimpleSessionId();
    expect(id).toBe(`${HOME_CONSTANTS.SESSION_ID_PREFIX}1700000000000`);
    expect(validateSessionId(id)).toBe(true);
    expect(extractTimestampFromSessionId(id)).toBe(1700000000000);
  });

  it('rejects invalid session IDs', () => {
    expect(validateSessionId('invalid')).toBe(false);
    expect(extractTimestampFromSessionId('invalid')).toBeNull();
  });
});
