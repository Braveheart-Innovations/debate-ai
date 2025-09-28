import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useAPIKeys } from '@/hooks/useAPIKeys';
import type { RootState } from '@/store';
import APIKeyService from '@/services/APIKeyService';

jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: {
    saveKey: jest.fn(),
    deleteKey: jest.fn(),
    clearAllKeys: jest.fn(),
    loadKeys: jest.fn(),
    validateKeyFormat: jest.fn().mockReturnValue({ isValid: true, message: 'ok' }),
    maskKey: jest.fn((key: string) => `mask:${key}`),
  },
}));

const mockedService = APIKeyService as jest.Mocked<typeof APIKeyService>;

describe('useAPIKeys', () => {
  const baseState: Partial<RootState> = {
    settings: {
      theme: 'auto',
      fontSize: 'medium',
      apiKeys: { claude: 'existing-claude', openai: 'existing-openai' },
      realtimeRelayUrl: undefined,
      verifiedProviders: [],
      verificationTimestamps: {},
      verificationModels: {},
      expertMode: {},
      hasCompletedOnboarding: false,
      recordModeEnabled: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates keys and syncs redux state', async () => {
    mockedService.saveKey.mockResolvedValueOnce();

    const { result, store } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.updateKey('claude', 'new-value');
    });

    expect(mockedService.saveKey).toHaveBeenCalledWith('claude', 'new-value');
    expect(store.getState().settings.apiKeys.claude).toBe('new-value');
    expect(result.current.apiKeys.claude).toBe('new-value');
  });

  it('reverts local state when update fails', async () => {
    mockedService.saveKey.mockRejectedValueOnce(new Error('failed'));

    const { result, store } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: baseState,
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await expect(result.current.updateKey('claude', 'broken')).rejects.toThrow('failed');
    });

    consoleError.mockRestore();

    expect(result.current.apiKeys.claude).toBe('existing-claude');
    expect(store.getState().settings.apiKeys.claude).toBe('existing-claude');
    expect(result.current.error).toBe('Failed to update claude API key');
  });

  it('refreshes keys from secure storage and updates counts', async () => {
    mockedService.loadKeys.mockResolvedValueOnce({ claude: 'remote-claude', openai: 'remote-openai' });

    const { result, store } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.refreshKeys();
    });

    expect(mockedService.loadKeys).toHaveBeenCalled();
    expect(store.getState().settings.apiKeys).toEqual({ claude: 'remote-claude', openai: 'remote-openai' });
    expect(result.current.apiKeys.claude).toBe('remote-claude');
    expect(result.current.hasKey('claude')).toBe(true);
    expect(result.current.getKeyCount()).toBeGreaterThanOrEqual(2);
  });

  it('clears all keys and resets local view', async () => {
    mockedService.clearAllKeys.mockResolvedValueOnce();

    const { result, store } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.clearAll();
    });

    expect(mockedService.clearAllKeys).toHaveBeenCalled();
    expect(store.getState().settings.apiKeys).toEqual({});
    expect(result.current.getKeyCount()).toBe(0);
  });

  it('proxies validation and masking helpers', () => {
    const { result } = renderHookWithProviders(() => useAPIKeys(), {
      preloadedState: baseState,
    });

    const validation = result.current.validateKey('claude', 'abc');
    const masked = result.current.maskKey('secret');

    expect(mockedService.validateKeyFormat).toHaveBeenCalledWith('claude', 'abc');
    expect(validation).toEqual({ isValid: true, message: 'ok' });
    expect(masked).toBe('mask:secret');
  });
});
