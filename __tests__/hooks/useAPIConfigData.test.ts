import { renderHook } from '@testing-library/react-native';

jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'claude', enabled: true },
    { id: 'openai', enabled: true },
    { id: 'perplexity', enabled: false },
  ],
}));

const mockUseAPIKeys = jest.fn();
const mockUseConnectionTest = jest.fn();
const mockUseExpertMode = jest.fn();
const mockUseProviderVerification = jest.fn();

jest.mock('@/hooks/useAPIKeys', () => ({
  useAPIKeys: () => mockUseAPIKeys(),
}));

jest.mock('@/hooks/useConnectionTest', () => ({
  useConnectionTest: () => mockUseConnectionTest(),
}));

jest.mock('@/hooks/useExpertMode', () => ({
  useExpertMode: () => mockUseExpertMode(),
}));

jest.mock('@/hooks/useProviderVerification', () => ({
  useProviderVerification: () => mockUseProviderVerification(),
}));

import { useAPIConfigData } from '@/hooks/useAPIConfigData';
import { buildApiKeyStatus } from '@/store';

describe('useAPIConfigData', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAPIKeys.mockReturnValue({
      apiKeys: { claude: 'key-1', openai: 'key-2' },
      apiKeyStatuses: { claude: buildApiKeyStatus('key-1'), openai: buildApiKeyStatus('key-2') },
    });
    mockUseConnectionTest.mockReturnValue({
      testStatuses: {
        claude: { status: 'testing', message: 'please wait' },
      },
    });
    mockUseExpertMode.mockReturnValue({
      getConfig: jest.fn((providerId: string) => ({ providerId, params: { temperature: 0.5 } })),
    });
    mockUseProviderVerification.mockReturnValue({
      verifiedProviders: ['openai'],
      getVerificationMessage: jest.fn().mockReturnValue('Verified just now'),
      getVerificationModel: jest.fn().mockReturnValue('gpt-4'),
    });
  });

  it('splits providers into enabled and disabled groups', () => {
    const { result } = renderHook(() => useAPIConfigData());

    expect(result.current.enabledProviders.map(provider => provider.id)).toEqual([
      'claude',
      'openai',
      'runway',
      'elevenlabs',
    ]);
    expect(result.current.disabledProviders).toEqual([{ id: 'perplexity', enabled: false }]);
    expect(result.current.configuredCount).toBe(2);
  });

  it('combines verification statuses with test statuses', () => {
    const { result } = renderHook(() => useAPIConfigData());
    const status = result.current.verificationStatus;

    expect(status.claude).toEqual({ status: 'testing', message: 'please wait', model: undefined });
    expect(status.openai).toEqual({ status: 'success', message: 'Verified just now', model: 'gpt-4' });
  });

  it('maps expert mode configs for validated providers', () => {
    const { result } = renderHook(() => useAPIConfigData());
    expect(result.current.expertModeConfigs).toEqual({
      claude: { providerId: 'claude', params: { temperature: 0.5 } },
      openai: { providerId: 'openai', params: { temperature: 0.5 } },
    });
  });
});
