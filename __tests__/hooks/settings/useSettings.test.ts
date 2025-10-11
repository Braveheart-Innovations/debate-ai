import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useSettings } from '@/hooks/settings/useSettings';
import { settingsService, DEFAULT_SETTINGS } from '@/services/settings';

jest.mock('@/services/settings', () => {
  const actual = jest.requireActual('@/services/settings');
  return {
    ...actual,
    settingsService: {
      loadSettings: jest.fn(),
      updateSetting: jest.fn(),
      resetSettings: jest.fn(),
      exportSettings: jest.fn(),
      importSettings: jest.fn(),
    },
  };
});

describe('useSettings', () => {
  const mockLoadSettings = settingsService.loadSettings as jest.MockedFunction<typeof settingsService.loadSettings>;
  const mockUpdateSetting = settingsService.updateSetting as jest.MockedFunction<typeof settingsService.updateSetting>;
  const mockResetSettings = settingsService.resetSettings as jest.MockedFunction<typeof settingsService.resetSettings>;
  const mockExportSettings = settingsService.exportSettings as jest.MockedFunction<typeof settingsService.exportSettings>;
  const mockImportSettings = settingsService.importSettings as jest.MockedFunction<typeof settingsService.importSettings>;

  const loadedSettings = {
    ...DEFAULT_SETTINGS,
    themeMode: 'dark' as const,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      enabled: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadSettings.mockResolvedValue(loadedSettings);
    mockUpdateSetting.mockResolvedValue(undefined);
    mockResetSettings.mockResolvedValue(undefined);
    mockExportSettings.mockResolvedValue(JSON.stringify(loadedSettings));
    mockImportSettings.mockResolvedValue(undefined);
  });

  it('loads settings on mount and exposes current state', async () => {
    const { result } = renderHookWithProviders(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockLoadSettings).toHaveBeenCalledTimes(1);
    expect(result.current.settings.themeMode).toBe('dark');
    expect(result.current.error).toBeNull();
  });

  it('optimistically updates settings and persists changes', async () => {
    const { result } = renderHookWithProviders(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateSetting('themeMode', 'light');
    });

    expect(mockUpdateSetting).toHaveBeenCalledWith('themeMode', 'light');
    expect(result.current.settings.themeMode).toBe('light');

    mockUpdateSetting.mockRejectedValueOnce(new Error('failed to update'));
    mockLoadSettings.mockResolvedValueOnce(loadedSettings);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await expect(result.current.updateSetting('themeMode', 'dark')).rejects.toThrow('failed to update');
    });

    consoleSpy.mockRestore();

    expect(result.current.settings.themeMode).toBe('dark');
    expect(mockLoadSettings).toHaveBeenCalledTimes(2); // initial load + revert
  });

  it('supports reset, refresh, export, and import flows', async () => {
    const { result } = renderHookWithProviders(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.resetSettings();
    });

    expect(mockResetSettings).toHaveBeenCalledTimes(1);
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);

    await act(async () => {
      await result.current.refreshSettings();
    });

    expect(mockLoadSettings).toHaveBeenCalledTimes(2);

    let exported: string | undefined;
    await act(async () => {
      exported = await result.current.exportSettings();
    });
    expect(exported).toBe(JSON.stringify(loadedSettings));

    mockLoadSettings.mockResolvedValueOnce({ ...loadedSettings, themeMode: 'light' });

    await act(async () => {
      await result.current.importSettings(exported!);
    });

    expect(mockImportSettings).toHaveBeenCalledWith(exported);
    expect(mockLoadSettings).toHaveBeenCalledTimes(3);
    expect(result.current.settings.themeMode).toBe('light');
    expect(result.current.error).toBeNull();
  });

  it('handles load failures by resetting to defaults', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLoadSettings.mockRejectedValueOnce(new Error('load failed'));

    const { result } = renderHookWithProviders(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to load settings');
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    consoleSpy.mockRestore();
  });

  it('surfaces reset, export, and import errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHookWithProviders(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockResetSettings.mockRejectedValueOnce(new Error('reset failed'));
    await expect(result.current.resetSettings()).rejects.toThrow('reset failed');
    await waitFor(() => expect(result.current.error).toBe('Failed to reset settings'));

    mockExportSettings.mockRejectedValueOnce(new Error('export failed'));
    await expect(result.current.exportSettings()).rejects.toThrow('export failed');
    await waitFor(() => expect(result.current.error).toBe('Failed to export settings'));

    mockImportSettings.mockRejectedValueOnce(new Error('import failed'));
    await expect(result.current.importSettings('{}')).rejects.toThrow('import failed');
    await waitFor(() => expect(result.current.error).toBe('Failed to import settings'));
    expect(result.current.isLoading).toBe(false);

    consoleSpy.mockRestore();
  });
});
