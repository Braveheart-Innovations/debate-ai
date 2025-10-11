import { Platform } from 'react-native';
import { getFontFamily, typography } from '@/theme/typography';

describe('typography', () => {
  let selectSpy: jest.SpyInstance;
  const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS') || { value: Platform.OS }; 

  beforeEach(() => {
    selectSpy = jest.spyOn(Platform, 'select');
  });

  afterEach(() => {
    selectSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', originalDescriptor);
  });

  it('returns platform font families', () => {
    selectSpy.mockImplementation((config: any) => config.android ?? config.default);
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    expect(getFontFamily()).toBe(typography.fonts.android);

    selectSpy.mockImplementation((config: any) => config.ios ?? config.default);
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(getFontFamily('semibold')).toBe(`${typography.fonts.ios}-Semibold`);

    selectSpy.mockImplementation((config: any) => config.default);
    Object.defineProperty(Platform, 'OS', { value: 'windows', configurable: true });
    expect(getFontFamily('bold')).toBe(typography.fonts.fallback);
  });
});
