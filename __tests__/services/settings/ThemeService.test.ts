import type { ThemeMode } from '@/services/settings/ThemeService';

interface StoredThemePreferences {
  mode: ThemeMode;
  lastResolvedTheme: 'light' | 'dark';
  systemThemeEnabled: boolean;
}

type ThemeChange = { colorScheme: 'light' | 'dark' | null };

const mockListeners: Array<(change: ThemeChange) => Promise<void> | void> = [];
const mockGetColorScheme = jest.fn<"light" | "dark" | null, []>(() => 'light');
const mockAddChangeListener = jest.fn((cb: (change: ThemeChange) => Promise<void> | void) => {
  mockListeners.push(cb);
  return {
    remove: jest.fn(() => {
      const index = mockListeners.indexOf(cb);
      if (index >= 0) {
        mockListeners.splice(index, 1);
      }
    }),
  };
});

const setupThemeService = async (prefs?: Partial<StoredThemePreferences> & { mode: ThemeMode }) => {
  jest.resetModules();
  mockListeners.length = 0;
  mockGetColorScheme.mockReset();
  mockGetColorScheme.mockReturnValue((prefs?.lastResolvedTheme ?? 'light') as 'light' | 'dark');
  mockAddChangeListener.mockReset();
  mockAddChangeListener.mockImplementation((cb: (change: ThemeChange) => Promise<void> | void) => {
    mockListeners.push(cb);
    return {
      remove: jest.fn(() => {
        const index = mockListeners.indexOf(cb);
        if (index >= 0) {
          mockListeners.splice(index, 1);
        }
      }),
    };
  });

  const stored: StoredThemePreferences | null = prefs
    ? {
        mode: prefs.mode,
        lastResolvedTheme: prefs.lastResolvedTheme ?? 'light',
        systemThemeEnabled:
          prefs.systemThemeEnabled ?? (prefs.mode === 'system' ? true : false),
      }
    : null;

  let storageValue: string | null = stored ? JSON.stringify(stored) : null;

  const getItem = jest.fn(async () => storageValue);
  const setItem = jest.fn(async (_key: string, value: string) => {
    storageValue = value;
  });
  const removeItem = jest.fn(async () => {
    storageValue = null;
  });

  jest.doMock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
      getItem,
      setItem,
      removeItem,
    },
    getItem,
    setItem,
    removeItem,
  }));

  jest.doMock('react-native', () => ({
    Appearance: {
      getColorScheme: mockGetColorScheme,
      addChangeListener: mockAddChangeListener,
    },
  }));

  const themeServiceModule = require('@/services/settings/ThemeService');
  const themeService = themeServiceModule.default as typeof themeServiceModule.default;
  const AsyncStorageModule = require('@react-native-async-storage/async-storage');
  const AsyncStorage = (AsyncStorageModule.default || AsyncStorageModule) as {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };

  return {
    themeService,
    AsyncStorage,
    getItem,
    setItem,
    removeItem,
    getStorage: () =>
      storageValue ? (JSON.parse(storageValue) as StoredThemePreferences) : null,
  };
};

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('ThemeService', () => {
  it('initializes using stored preferences and applies theme', async () => {
    const { themeService, setItem, getStorage } = await setupThemeService({
      mode: 'dark',
      lastResolvedTheme: 'dark',
      systemThemeEnabled: false,
    });

    const resolved = await themeService.initializeTheme();

    expect(resolved).toBe('dark');
    expect(themeService.getCurrentTheme()).toBe('dark');
    expect(setItem).toHaveBeenCalled();
    expect(getStorage()).toMatchObject({ mode: 'dark', lastResolvedTheme: 'dark' });
  });

  it('persists manual theme changes when setting mode directly', async () => {
    const { themeService, setItem, getStorage } = await setupThemeService({
      mode: 'system',
      lastResolvedTheme: 'light',
      systemThemeEnabled: true,
    });

    await themeService.setThemeMode('light');

    expect(themeService.getCurrentTheme()).toBe('light');
    expect(setItem).toHaveBeenCalled();
    expect(getStorage()).toMatchObject({
      mode: 'light',
      systemThemeEnabled: false,
      lastResolvedTheme: 'light',
    });
  });

  it('toggles system mode by switching to the opposite resolved theme', async () => {
    const { themeService, getStorage } = await setupThemeService({
      mode: 'system',
      lastResolvedTheme: 'light',
      systemThemeEnabled: true,
    });

    await themeService.initializeTheme();
    await themeService.toggleTheme();

    expect(themeService.getCurrentTheme()).toBe('dark');
    expect(getStorage()).toMatchObject({ mode: 'dark', systemThemeEnabled: false });
  });

  it('reacts to system theme changes when system mode is enabled', async () => {
    const { themeService } = await setupThemeService({
      mode: 'system',
      lastResolvedTheme: 'light',
      systemThemeEnabled: true,
    });

    await themeService.initializeTheme();
    const systemListener = mockListeners[0];
    expect(systemListener).toBeDefined();

    await systemListener?.({ colorScheme: 'dark' });

    expect(themeService.getCurrentTheme()).toBe('dark');
  });

  it('notifies subscribed listeners and respects unsubscription', async () => {
    const { themeService } = await setupThemeService({
      mode: 'light',
      lastResolvedTheme: 'light',
      systemThemeEnabled: false,
    });

    const listener = jest.fn();
    const unsubscribe = themeService.addThemeChangeListener(listener);

    await themeService.setThemeMode('dark');
    expect(listener).toHaveBeenCalledWith('dark');

    listener.mockClear();
    unsubscribe();

    await themeService.setThemeMode('light');
    expect(listener).not.toHaveBeenCalled();
  });
});
