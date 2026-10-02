import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { usePreDebateValidation } from '@/hooks/debate/usePreDebateValidation';
import { buildApiKeyStatus } from '@/store';

// Mock useFeatureAccess to control isDemo state
const mockIsDemo = jest.fn().mockReturnValue(false);
jest.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({
    isDemo: mockIsDemo(),
    isSubscriber: false,
    currentTier: 'free',
    hasAccess: jest.fn().mockReturnValue(true),
    loading: false,
  }),
}));

describe('usePreDebateValidation', () => {
  beforeEach(() => {
    mockIsDemo.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns isReady true when one provider is configured', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(), {
      preloadedState: {
        settings: {
          apiKeys: { claude: buildApiKeyStatus('key-1') },
        },
      },
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.configuredCount).toBe(1);
    expect(result.current.isDemo).toBe(false);
  });

  it('returns isReady true when two or more providers are configured', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(), {
      preloadedState: {
        settings: {
          apiKeys: { claude: buildApiKeyStatus('key-1'), openai: buildApiKeyStatus('key-2') },
        },
      },
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.configuredCount).toBe(2);
    expect(result.current.isDemo).toBe(false);
  });

  it('returns isReady true with three providers configured', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(), {
      preloadedState: {
        settings: {
          apiKeys: { claude: buildApiKeyStatus('key-1'), openai: buildApiKeyStatus('key-2'), google: buildApiKeyStatus('key-3') },
        },
      },
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.configuredCount).toBe(3);
  });

  it('returns isReady false when no providers are configured', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(), {
      preloadedState: {
        settings: {
          apiKeys: {},
        },
      },
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.configuredCount).toBe(0);
  });

  it('returns isReady true in demo mode regardless of configured providers', () => {
    mockIsDemo.mockReturnValue(true);

    const { result } = renderHookWithProviders(() => usePreDebateValidation(), {
      preloadedState: {
        settings: {
          apiKeys: {}, // No API keys
        },
      },
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.configuredCount).toBe(0);
    expect(result.current.isDemo).toBe(true);
  });

  it('filters out empty/falsy API keys when counting', () => {
    const { result } = renderHookWithProviders(() => usePreDebateValidation(), {
      preloadedState: {
        settings: {
          apiKeys: { claude: buildApiKeyStatus('key-1'), openai: buildApiKeyStatus(''), google: undefined },
        },
      },
    });

    expect(result.current.configuredCount).toBe(1);
    expect(result.current.isReady).toBe(true);
  });
});
