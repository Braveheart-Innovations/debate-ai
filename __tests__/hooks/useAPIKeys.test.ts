import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useAPIKeys } from '@/hooks/useAPIKeys';
import APIKeyService from '@/services/APIKeyService';
import type { RootState } from '@/store';

jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: {
    saveKey: jest.fn().mockResolvedValue(undefined),
    deleteKey: jest.fn().mockResolvedValue(undefined),
    loadKeys: jest.fn().mockResolvedValue({}),
    clearAllKeys: jest.fn().mockResolvedValue(undefined),
    validateKeyFormat: jest.fn().mockImplementation((_, key: string) => ({
      isValid: key.trim().length > 0,
      message: key.trim().length > 0 ? 'ok' : 'empty',
    })),
    maskKey: jest.fn().mockImplementation((key: string) => `masked:${key}`),
  },
}));

const mockedService = APIKeyService as jest.Mocked<any>;

const createPreloadedState = (keys: Record<string, string> = {}) => ({
  settings: {
    theme: 'auto',
    fontSize: 'medium',
    apiKeys: keys,
    realtimeRelayUrl: undefined,
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    expertMode: {},
    hasCompletedOnboarding: false,
    recordModeEnabled: false,
  },
} as Partial<RootState>);

describe('useAPIKeys', () => {
  const existingKeys = { claude: 'anthropic-key', openai: 'sk-test' };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('initialises local keys from store and masks appropriately', () => {
    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    expect(result.current.apiKeys.claude).toBe('anthropic-key');
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
    expect(store.getState().settings.apiKeys?.claude).toBe('new-key');
    expect(result.current.apiKeys.claude).toBe('new-key');
  });

  it('reverts optimistic update on update error', async () => {
    mockedService.saveKey.mockRejectedValueOnce(new Error('save failed'));

    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: createPreloadedState(existingKeys),
    });

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.updateKey('claude', 'bad-key');
      } catch (err) {
        caught = err as Error;
      }
    });

    expect(caught?.message).toBe('save failed');
    expect(result.current.apiKeys.claude).toBe('anthropic-key');
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

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.deleteKey('claude');
      } catch (err) {
        caught = err as Error;
      }
    });

    await act(async () => {});
    expect(result.current.apiKeys.claude).toBe('anthropic-key');
    expect(result.current.error).toBe('Failed to delete claude API key');
    expect(caught?.message).toBe('boom');
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
    expect(result.current.apiKeys.claude).toBe('fresh');
    expect(store.getState().settings.apiKeys?.google).toBe('ai-key');
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

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.clearAll();
      } catch (err) {
        caught = err as Error;
      }
    });

    expect(caught?.message).toBe('clear failed');
    expect(mockedService.loadKeys).toHaveBeenCalled();
    expect(result.current.apiKeys.claude).toBe('anthropic-key');
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
