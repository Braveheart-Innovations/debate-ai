import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useAPIKeys } from '@/hooks/useAPIKeys';
import APIKeyService from '@/services/APIKeyService';
import { buildApiKeyStatus } from '@/store';
import type { RootStateOverrides } from '../../test-utils/services/state';

jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: {
    saveKey: jest.fn().mockResolvedValue(undefined),
    deleteKey: jest.fn().mockResolvedValue(undefined),
    getKey: jest.fn().mockResolvedValue(null),
    loadKeys: jest.fn().mockResolvedValue({}),
    clearAllKeys: jest.fn().mockResolvedValue(undefined),
    validateKeyFormat: jest.fn().mockImplementation((_, key: string) => ({
      isValid: key.trim().length > 0,
      message: key.trim().length > 0 ? 'ok' : 'empty',
    })),
    maskKey: jest.fn().mockImplementation((key: string) => `masked:${key}`),
  },
}));

const mockedService = jest.mocked(APIKeyService);

// The settings slice stores masked ApiKeyStatus metadata, never raw keys.
const createPreloadedState = (keys: Record<string, string> = {}): RootStateOverrides => ({
  settings: {
    apiKeys: Object.fromEntries(
      Object.entries(keys).map(([providerId, key]) => [providerId, buildApiKeyStatus(key)])
    ),
  },
});

describe('useAPIKeys', () => {
  const existingKeys: Record<string, string> = { claude: 'anthropic-key', openai: 'sk-test' };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedService.getKey.mockImplementation(async (provider: string) => existingKeys[provider] || null);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('initialises local keys from store and masks appropriately', () => {
    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    expect(result.current.apiKeys.claude).toBe('anth•••••-key');
    expect(result.current.hasKey('claude')).toBe(true);
    expect(result.current.hasKey('google')).toBe(false);
    expect(result.current.getKeyCount()).toBeGreaterThanOrEqual(2);
    expect(result.current.maskKey('secret')).toBe('masked:secret');
    expect(mockedService.maskKey).toHaveBeenCalledWith('secret');
  });

  it('updates a key and syncs redux state', async () => {
    const { result, store } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    await act(async () => {
      await result.current.updateKey('claude', 'new-key');
    });

    expect(mockedService.saveKey).toHaveBeenCalledWith('claude', 'new-key');
    expect(store.getState().settings.apiKeys?.claude).toEqual(expect.objectContaining({
      configured: true,
      maskedLabel: '••••••••',
    }));
    expect(result.current.apiKeys.claude).toBe('••••••••');
  });

  it('reverts optimistic update on update error', async () => {
    mockedService.saveKey.mockRejectedValueOnce(new Error('save failed'));

    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    await act(async () => {
      await expect(result.current.updateKey('claude', 'bad-key')).rejects.toThrow('save failed');
    });

    expect(result.current.apiKeys.claude).toBe('anth•••••-key');
    expect(result.current.error).toBe('Failed to update claude API key');
  });

  it('deletes keys and handles error recovery', async () => {
    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    await act(async () => {
      await result.current.deleteKey('openai');
    });

    expect(mockedService.deleteKey).toHaveBeenCalledWith('openai');

    mockedService.deleteKey.mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      await expect(result.current.deleteKey('claude')).rejects.toThrow('boom');
    });

    await act(async () => {});
    expect(result.current.apiKeys.claude).toBe('anth•••••-key');
    expect(result.current.error).toBe('Failed to delete claude API key');
  });

  it('refreshes keys from storage and sets loading state', async () => {
    mockedService.loadKeys.mockResolvedValueOnce({ claude: 'fresh', google: 'ai-key' });

    const { result, store } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState({}),
    });

    await act(async () => {
      await result.current.refreshKeys();
    });

    expect(mockedService.loadKeys).toHaveBeenCalled();
    expect(result.current.apiKeys.claude).toBe('••••••••');
    expect(store.getState().settings.apiKeys?.google).toEqual(expect.objectContaining({
      configured: true,
      maskedLabel: '••••••••',
    }));
    expect(result.current.isLoading).toBe(false);
  });

  it('clears all keys and restores on failure', async () => {
    mockedService.clearAllKeys.mockResolvedValueOnce(undefined);
    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    await act(async () => {
      await result.current.clearAll();
    });

    expect(mockedService.clearAllKeys).toHaveBeenCalled();

    mockedService.clearAllKeys.mockRejectedValueOnce(new Error('clear failed'));
    mockedService.loadKeys.mockResolvedValueOnce(existingKeys);

    await act(async () => {
      await expect(result.current.clearAll()).rejects.toThrow('clear failed');
    });

    expect(mockedService.loadKeys).toHaveBeenCalled();
    expect(result.current.apiKeys.claude).toBe('anth•••••-key');
  });

  it('validates using service and reports invalid states', () => {
    const invalidResult = { isValid: false, message: 'bad' };
    mockedService.validateKeyFormat.mockReturnValueOnce(invalidResult);

    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState({}),
    });

    expect(result.current.validateKey('openai', 'bad')).toEqual(invalidResult);
    expect(mockedService.validateKeyFormat).toHaveBeenCalledWith('openai', 'bad');
  });
});
