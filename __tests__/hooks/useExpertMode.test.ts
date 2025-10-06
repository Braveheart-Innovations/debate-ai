import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useExpertMode } from '@/hooks/useExpertMode';
import { DEFAULT_PARAMETERS } from '@/config/modelConfigs';
import { getEnabledProviders } from '@/config/aiProviders';
import type { RootState } from '@/store';
import type { AIProvider } from '@/types';

jest.mock('@/config/aiProviders', () => ({
  getEnabledProviders: jest.fn(),
}));

describe('useExpertMode', () => {
  const getEnabledProvidersMock = getEnabledProviders as jest.MockedFunction<typeof getEnabledProviders>;

  const baseSettingsState: RootState['settings'] = {
    theme: 'auto',
    fontSize: 'medium',
    apiKeys: {},
    realtimeRelayUrl: undefined,
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    expertMode: {},
    hasCompletedOnboarding: false,
    recordModeEnabled: false,
  };

  const stubProvider = (id: AIProvider) => ({
    id,
    name: id,
    company: 'Test Co',
    color: '#000000',
    gradient: ['#000000', '#111111'] as [string, string],
    apiKeyPrefix: '',
    apiKeyPlaceholder: '',
    docsUrl: '',
    getKeyUrl: '',
    description: '',
    features: [],
    enabled: true,
  });

  beforeEach(() => {
    getEnabledProvidersMock.mockReturnValue([
      stubProvider('claude'),
      stubProvider('openai'),
      stubProvider('google'),
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns default configs for providers without overrides', () => {
    const { result } = renderHookWithProviders(() => useExpertMode(), {
      preloadedState: {
        settings: {
          ...baseSettingsState,
          expertMode: {},
        },
      },
    });

    const claudeConfig = result.current.getConfig('claude');
    expect(claudeConfig).toEqual({ enabled: false, parameters: DEFAULT_PARAMETERS });
    expect(result.current.isEnabled('claude')).toBe(false);
    expect(result.current.getParameterValue('claude', 'temperature')).toBe(DEFAULT_PARAMETERS.temperature);
    expect(result.current.hasCustomParameters('claude')).toBe(false);
    expect(result.current.hasCustomModel('claude')).toBe(false);
  });

  it('updates expert mode state via the provided mutators', () => {
    const { result, store } = renderHookWithProviders(() => useExpertMode(), {
      preloadedState: {
        settings: {
          ...baseSettingsState,
          expertMode: {
            claude: {
              enabled: true,
              selectedModel: 'claude-3-opus',
              parameters: { ...DEFAULT_PARAMETERS },
            },
          },
        },
      },
    });

    act(() => {
      result.current.disableExpertMode('claude');
    });
    expect(result.current.isEnabled('claude')).toBe(false);

    act(() => {
      result.current.toggleExpertMode('claude');
    });
    expect(result.current.isEnabled('claude')).toBe(true);

    act(() => {
      result.current.updateModel('claude', 'claude-3-sonnet');
    });
    expect(store.getState().settings.expertMode.claude?.selectedModel).toBe('claude-3-sonnet');
    expect(result.current.hasCustomModel('claude')).toBe(true);

    act(() => {
      result.current.updateModel('claude', '');
    });
    expect(store.getState().settings.expertMode.claude?.selectedModel).toBeUndefined();
    expect(result.current.hasCustomModel('claude')).toBe(false);

    act(() => {
      result.current.updateParameter('claude', 'temperature', 1.2);
    });
    expect(result.current.getParameterValue('claude', 'temperature')).toBe(1.2);
    expect(result.current.hasCustomParameters('claude')).toBe(true);

    act(() => {
      result.current.resetParameters('claude');
    });
    expect(result.current.getParameterValue('claude', 'temperature')).toBe(DEFAULT_PARAMETERS.temperature);
    expect(result.current.hasCustomParameters('claude')).toBe(false);

    act(() => {
      result.current.updateParameters('claude', { topP: 0.5, frequencyPenalty: 1 });
    });
    expect(result.current.getParameterValue('claude', 'topP')).toBe(0.5);
    expect(result.current.hasCustomParameters('claude')).toBe(true);

    act(() => {
      result.current.resetAllSettings('claude');
    });
    const resetConfig = result.current.getConfig('claude');
    expect(resetConfig.enabled).toBe(false);
    expect(resetConfig.parameters).toEqual(DEFAULT_PARAMETERS);
  });

  it('reports enabled and configured providers using store state and provider metadata', () => {
    const { result } = renderHookWithProviders(() => useExpertMode(), {
      preloadedState: {
        settings: {
          ...baseSettingsState,
          expertMode: {
            claude: {
              enabled: true,
              parameters: { ...DEFAULT_PARAMETERS },
            },
            openai: {
              enabled: false,
              parameters: { ...DEFAULT_PARAMETERS, temperature: 0.9 },
            },
          },
        },
      },
    });

    const enabledProviders = result.current.getEnabledProviders();
    expect(enabledProviders).toEqual(['claude']);

    const configuredProviders = result.current.getConfiguredProviders();
    expect(configuredProviders.sort()).toEqual(['claude', 'openai']);
  });
});
