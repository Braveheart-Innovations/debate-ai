import { Alert } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { usePreDebateValidation } from '@/hooks/debate/usePreDebateValidation';
import type { RootState } from '@/store';

describe('usePreDebateValidation', () => {
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

  const navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void } = {
    navigate: jest.fn(),
  };

  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    navigation.navigate = jest.fn();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks navigation when fewer than two providers are configured', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(navigation), {
      preloadedState: {
        settings: {
          ...baseSettingsState,
          apiKeys: { claude: 'key-1' },
        },
      },
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.configuredCount).toBe(1);

    const readiness = result.current.checkReadiness();
    expect(readiness).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(
      'Set Up Your AIs First',
      expect.stringContaining('You need at least 2 AIs configured'),
      expect.any(Array)
    );

    const [, , buttons] = alertSpy.mock.calls[0];
    expect(buttons).toHaveLength(2);

    act(() => {
      buttons?.[0].onPress?.();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });

    act(() => {
      buttons?.[1].onPress?.();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('APIConfig');
  });

  it('allows navigation when two or more providers are configured', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(navigation), {
      preloadedState: {
        settings: {
          ...baseSettingsState,
          apiKeys: { claude: 'key-1', openai: 'key-2' },
        },
      },
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.configuredCount).toBe(2);

    const readiness = result.current.checkReadiness();
    expect(readiness).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
