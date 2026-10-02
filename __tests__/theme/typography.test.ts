import { Platform } from 'react-native';
import { getFontFamily, typography } from '@/theme/typography';

// The spied type resolves to Platform.select's last overload, which omits the
// `default` branch the first overload accepts; read it back via an `in` check.
const defaultOf = (config: object): unknown => ('default' in config ? config.default : undefined);

describe('typography', () => {
  let selectSpy: jest.SpiedFunction<typeof Platform.select>;
  const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS') || { value: Platform.OS }; 

  beforeEach(() => {
    selectSpy = jest.spyOn(Platform, 'select');
  });

  afterEach(() => {
    selectSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', originalDescriptor);
  });

  it('returns platform font families', () => {
    selectSpy.mockImplementation((config) => config.android ?? defaultOf(config));
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    expect(getFontFamily()).toBe(typography.fonts.android);

    selectSpy.mockImplementation((config) => config.ios ?? defaultOf(config));
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(getFontFamily('semibold')).toBe(`${typography.fonts.ios}-Semibold`);

    selectSpy.mockImplementation((config) => defaultOf(config));
    Object.defineProperty(Platform, 'OS', { value: 'windows', configurable: true });
    expect(getFontFamily('bold')).toBe(typography.fonts.fallback);
  });
});
