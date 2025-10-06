import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useThemeSettings } from '@/hooks/settings/useThemeSettings';
import { themeService } from '@/services/settings';
import { useTheme } from '@/theme';
import type { Theme, ThemeMode } from '@/theme';

jest.mock('@/services/settings', () => {
  const actual = jest.requireActual('@/services/settings');
  return {
    ...actual,
    themeService: {
      getSystemTheme: jest.fn(),
      getThemeMode: jest.fn(),
      initializeTheme: jest.fn(),
      setThemeMode: jest.fn(),
      addThemeChangeListener: jest.fn(),
    },
  };
});

jest.mock('@/theme', () => {
  const actual = jest.requireActual('@/theme');
  return {
    ...actual,
    useTheme: jest.fn(),
  };
});

describe('useThemeSettings', () => {
  const mockThemeService = themeService as unknown as {
    getSystemTheme: jest.Mock;
    getThemeMode: jest.Mock;
    initializeTheme: jest.Mock;
    setThemeMode: jest.Mock;
    addThemeChangeListener: jest.Mock;
  };
  const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;
  const mockThemeContextSetter = jest.fn();
  let capturedListener: ((theme: 'light' | 'dark') => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeService.getSystemTheme.mockReturnValue('light');
    mockThemeService.getThemeMode.mockResolvedValue('light');
    mockThemeService.initializeTheme.mockResolvedValue('light');
    mockThemeService.setThemeMode.mockResolvedValue(undefined);
    capturedListener = null;
    mockThemeService.addThemeChangeListener.mockImplementation((listener: (theme: 'light' | 'dark') => void) => {
      capturedListener = listener;
      return jest.fn();
    });

    mockUseTheme.mockReturnValue({
      theme: { colors: { primary: '#123456' } } as Theme,
      themeMode: 'system' as ThemeMode,
      setThemeMode: mockThemeContextSetter,
      isDark: false,
    });
  });

  it('loads theme preferences and exposes derived flags', async () => {
    const { result } = renderHookWithProviders(() => useThemeSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockThemeService.getThemeMode).toHaveBeenCalledTimes(1);
    expect(result.current.themeMode).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(result.current.isLight).toBe(true);
    expect(result.current.systemTheme).toBe('light');

    await act(async () => {
      await result.current.setThemeMode('dark');
    });

    expect(mockThemeService.setThemeMode).toHaveBeenCalledWith('dark');
    expect(mockThemeContextSetter).toHaveBeenCalledWith('dark');

    await act(async () => {
      await result.current.toggleDarkMode();
    });

    expect(mockThemeService.setThemeMode).toHaveBeenLastCalledWith('light');

    await act(async () => {
      await result.current.resetToSystemTheme();
    });

    expect(mockThemeService.setThemeMode).toHaveBeenLastCalledWith('system');
  });

  it('reverts theme changes and surfaces errors when updates fail', async () => {
    const error = new Error('boom');
    mockThemeService.setThemeMode.mockRejectedValueOnce(error);

    const { result } = renderHookWithProviders(() => useThemeSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.setThemeMode('dark')).rejects.toThrow('boom');
    });

    expect(mockThemeService.getThemeMode.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('subscribes to theme changes and updates context accordingly', async () => {
    const unsubscribe = jest.fn();
    mockThemeService.addThemeChangeListener.mockImplementation((listener: (theme: 'light' | 'dark') => void) => {
      capturedListener = listener;
      return unsubscribe;
    });

    const { result, unmount } = renderHookWithProviders(() => useThemeSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      capturedListener?.('dark');
    });

    expect(mockThemeContextSetter).toHaveBeenCalledWith('dark');

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
