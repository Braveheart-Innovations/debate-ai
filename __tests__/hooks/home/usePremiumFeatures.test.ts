import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { usePremiumFeatures } from '@/hooks/home/usePremiumFeatures';
import type { RootState } from '@/store';
import { AIConfigurationService } from '@/services/home/AIConfigurationService';
import { SessionService } from '@/services/home/SessionService';
import { HOME_CONSTANTS } from '@/config/homeConstants';

jest.mock('@/services/home/AIConfigurationService', () => ({
  AIConfigurationService: {
    getAvailableAICount: jest.fn(),
  },
}));

jest.mock('@/services/home/SessionService', () => ({
  SessionService: {
    calculateSessionLimits: jest.fn(),
  },
}));

describe('usePremiumFeatures', () => {
  const mockGetAvailableAICount = AIConfigurationService.getAvailableAICount as jest.MockedFunction<typeof AIConfigurationService.getAvailableAICount>;
  const mockCalculateSessionLimits = SessionService.calculateSessionLimits as jest.MockedFunction<typeof SessionService.calculateSessionLimits>;

  const baseState: Partial<RootState> = {
    user: {
      currentUser: {
        id: 'user-1',
        email: 'pro@example.com',
        subscription: 'pro',
        uiMode: 'simple',
        preferences: { theme: 'light', fontSize: 'medium' },
      },
      isAuthenticated: true,
      uiMode: 'simple',
    },
    settings: {
      theme: 'light',
      fontSize: 'medium',
      apiKeys: { claude: 'key' },
      expertMode: {},
      verifiedProviders: [],
      verificationTimestamps: {},
      verificationModels: {},
      hasCompletedOnboarding: true,
    },
  } as Partial<RootState>;

  beforeEach(() => {
    mockGetAvailableAICount.mockReturnValue(5);
    mockCalculateSessionLimits.mockReturnValue(3);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exposes premium flags, limits, and feature availability', () => {
    const { result } = renderHookWithProviders(() => usePremiumFeatures(), {
      preloadedState: baseState,
    });

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isFree).toBe(false);
    expect(result.current.maxAIs).toBe(3);
    expect(result.current.getMaxAILimit()).toBe(3);
    expect(result.current.canSelectMoreAIs(2)).toBe(true);
    expect(result.current.canSelectMoreAIs(3)).toBe(false);

    expect(mockGetAvailableAICount).toHaveBeenCalledWith({ claude: 'key' });
    expect(mockCalculateSessionLimits).toHaveBeenCalledWith(5);

    expect(result.current.getFeatureAvailability()).toMatchObject({ expertMode: true, sessionHistory: true });
    expect(result.current.isFeatureAvailable('expertMode')).toBe(true);
    expect(result.current.getUpgradeBenefits()).toEqual([]);

    const subscription = result.current.getSubscriptionInfo();
    expect(subscription).toEqual({
      tier: 'pro',
      isPremium: true,
      isFree: false,
      isPro: true,
      isBusiness: false,
    });

    const limits = result.current.getAILimits();
    expect(limits).toEqual({
      maxAllowed: 3,
      availableCount: 5,
      selectionLimit: HOME_CONSTANTS.MAX_AIS_FOR_CHAT,
    });

    const usage = result.current.getUsageStats(2);
    expect(usage.aiUsage.current).toBe(2);
    expect(usage.aiUsage.limit).toBe(3);
    expect(usage.aiUsage.remaining).toBe(1);
    expect(usage.aiUsage.percentage).toBeCloseTo((2 / 3) * 100, 5);
    expect(usage.needsUpgrade).toBe(false);

    expect(result.current.canPerformAction('selectAI', { currentAICount: 3 })).toBe(false);
    expect(result.current.canPerformAction('viewAnalytics')).toBe(true);
    expect(result.current.isFeatureAvailable('advancedPersonalities')).toBe(true);
  });
});
