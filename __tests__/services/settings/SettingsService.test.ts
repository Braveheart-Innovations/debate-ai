import AsyncStorage from '@react-native-async-storage/async-storage';
import settingsService, { DEFAULT_SETTINGS } from '@/services/settings/SettingsService';

const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
};

const sampleSettings = {
  ...DEFAULT_SETTINGS,
  themeMode: 'dark' as const,
  notifications: {
    enabled: false,
    soundEnabled: false,
    vibrationEnabled: true,
  },
};

describe('SettingsService', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
    storage.removeItem.mockReset();
  });

  it('loads default settings when none are stored', async () => {
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);

    const settings = await settingsService.loadSettings();

    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(storage.setItem).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"version":"1.0.0"'));
  });

  it('migrates legacy settings versions and preserves values', async () => {
    const legacy = { ...sampleSettings, version: '0.9.0', accessibility: { ...sampleSettings.accessibility, highContrast: true } };
    storage.getItem.mockResolvedValue(JSON.stringify(legacy));
    storage.setItem.mockResolvedValue(undefined);

    const settings = await settingsService.loadSettings();

    expect(settings.version).toBe('1.0.0');
    expect(settings.accessibility.highContrast).toBe(true);
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('saves and updates settings with validation', async () => {
    storage.setItem.mockResolvedValue(undefined);
    storage.getItem.mockResolvedValue(JSON.stringify(sampleSettings));

    await settingsService.saveSettings(sampleSettings);
    expect(storage.setItem).toHaveBeenLastCalledWith(expect.any(String), expect.stringContaining('"themeMode":"dark"'));

    await settingsService.updateSetting('themeMode', 'light');
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it('handles reset, export, import, and clear operations', async () => {
    storage.setItem.mockResolvedValue(undefined);
    storage.getItem.mockResolvedValue(JSON.stringify(sampleSettings));
    storage.removeItem.mockResolvedValue(undefined);

    await settingsService.resetSettings();
    expect(storage.setItem).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"themeMode":"system"'));

    const exported = await settingsService.exportSettings();
    expect(JSON.parse(exported)).toEqual(sampleSettings);

    await settingsService.importSettings(JSON.stringify({ themeMode: 'light' }));
    expect(storage.setItem).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"themeMode":"light"'));

    await settingsService.clearSettings();
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it('falls back to defaults when importing invalid payload', async () => {
    storage.setItem.mockResolvedValue(undefined);
    await expect(settingsService.importSettings('not-json')).rejects.toThrow('Unable to import settings');
  });

  it('returns stored app version and handles errors gracefully', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(sampleSettings));
    expect(await settingsService.getAppVersion()).toBe('1.0.0');

    storage.getItem.mockRejectedValue(new Error('boom'));
    expect(await settingsService.getAppVersion()).toBe(DEFAULT_SETTINGS.version);
  });

  describe('onboarding persistence', () => {
    it('loads onboarding state as false when not set', async () => {
      storage.getItem.mockResolvedValue(null);

      const result = await settingsService.loadOnboardingState();

      expect(result).toBe(false);
      expect(storage.getItem).toHaveBeenCalledWith('@hasCompletedOnboarding');
    });

    it('loads onboarding state as true when set to "true"', async () => {
      storage.getItem.mockResolvedValue('true');

      const result = await settingsService.loadOnboardingState();

      expect(result).toBe(true);
    });

    it('loads onboarding state as false when set to other values', async () => {
      storage.getItem.mockResolvedValue('false');

      const result = await settingsService.loadOnboardingState();

      expect(result).toBe(false);
    });

    it('saves onboarding state correctly', async () => {
      storage.setItem.mockResolvedValue(undefined);

      await settingsService.saveOnboardingState(true);

      expect(storage.setItem).toHaveBeenCalledWith('@hasCompletedOnboarding', 'true');
    });

    it('saves onboarding state as false correctly', async () => {
      storage.setItem.mockResolvedValue(undefined);

      await settingsService.saveOnboardingState(false);

      expect(storage.setItem).toHaveBeenCalledWith('@hasCompletedOnboarding', 'false');
    });

    it('handles errors gracefully when loading onboarding state', async () => {
      storage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await settingsService.loadOnboardingState();

      expect(result).toBe(false);
    });

    it('handles errors gracefully when saving onboarding state', async () => {
      storage.setItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(settingsService.saveOnboardingState(true)).resolves.not.toThrow();
    });
  });
});
