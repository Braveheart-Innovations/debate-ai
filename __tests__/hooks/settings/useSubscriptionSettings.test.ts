import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useSubscriptionSettings } from '@/hooks/settings/useSubscriptionSettings';
import { subscriptionService } from '@/services/settings';
import type { RootState } from '@/store';
import type { PlanFeatures, SubscriptionStatus } from '@/services/settings';

jest.mock('@/services/settings', () => {
  const actual = jest.requireActual('@/services/settings');
  return {
    ...actual,
    subscriptionService: {
      getCurrentSubscription: jest.fn(),
      getExpiryInfo: jest.fn(),
      canAccessFeature: jest.fn(),
      getFeatureLimit: jest.fn(),
      initiatePurchase: jest.fn(),
      cancelSubscription: jest.fn(),
      restorePurchases: jest.fn(),
      getPlanFeatures: jest.fn(),
    },
  };
});

describe('useSubscriptionSettings', () => {
  const mockSubscriptionService = subscriptionService as unknown as {
    getCurrentSubscription: jest.MockedFunction<typeof subscriptionService.getCurrentSubscription>;
    getExpiryInfo: jest.MockedFunction<typeof subscriptionService.getExpiryInfo>;
    canAccessFeature: jest.MockedFunction<typeof subscriptionService.canAccessFeature>;
    getFeatureLimit: jest.MockedFunction<typeof subscriptionService.getFeatureLimit>;
    initiatePurchase: jest.MockedFunction<typeof subscriptionService.initiatePurchase>;
    cancelSubscription: jest.MockedFunction<typeof subscriptionService.cancelSubscription>;
    restorePurchases: jest.MockedFunction<typeof subscriptionService.restorePurchases>;
    getPlanFeatures: jest.MockedFunction<typeof subscriptionService.getPlanFeatures>;
  };

  const subscription: SubscriptionStatus = {
    plan: 'pro',
    isActive: true,
    features: ['prioritySupport'],
    willRenew: true,
    expiresAt: new Date(Date.now() + 3600000),
  };

  const expiryInfo = { daysRemaining: 5, willExpire: false };

  const planFeatures: PlanFeatures = {
    maxChatSessions: 50,
    maxDebates: 25,
    customTopics: true,
    expertMode: true,
    personalityVariants: 12,
    prioritySupport: true,
    dataExport: true,
    advancedAnalytics: true,
  };

  const baseState: Partial<RootState> = {
    user: {
      currentUser: {
        id: 'user-1',
        subscription: 'pro',
        uiMode: 'simple',
        preferences: { theme: 'light', fontSize: 'medium' },
      },
      isAuthenticated: true,
      uiMode: 'simple',
    },
  } as Partial<RootState>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSubscriptionService.getCurrentSubscription.mockResolvedValue(subscription);
    mockSubscriptionService.getExpiryInfo.mockResolvedValue(expiryInfo);
    mockSubscriptionService.canAccessFeature.mockResolvedValue(true);
    mockSubscriptionService.getFeatureLimit.mockResolvedValue(999);
    mockSubscriptionService.initiatePurchase.mockResolvedValue(undefined);
    mockSubscriptionService.cancelSubscription.mockResolvedValue(undefined);
    mockSubscriptionService.restorePurchases.mockResolvedValue(undefined);
    mockSubscriptionService.getPlanFeatures.mockReturnValue(planFeatures);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads subscription state, exposes helpers, and refreshes expiry info', async () => {
    const { result } = renderHookWithProviders(() => useSubscriptionSettings(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockSubscriptionService.getCurrentSubscription).toHaveBeenCalled();
    expect(result.current.subscription.plan).toBe('pro');
    expect(result.current.expiryInfo).toEqual(expiryInfo);
    expect(result.current.planFeatures).toEqual(planFeatures);
    expect(result.current.isPremium).toBe(true);

    const canAccess = await result.current.canAccessFeature('prioritySupport');
    expect(canAccess).toBe(true);
    expect(mockSubscriptionService.canAccessFeature).toHaveBeenCalledWith('prioritySupport');

    const limit = await result.current.getFeatureLimit('maxChatSessions');
    expect(limit).toBe(999);

    await act(async () => {
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(mockSubscriptionService.getExpiryInfo.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('handles upgrade, cancellation, and restore flows with refresh', async () => {
    mockSubscriptionService.getCurrentSubscription.mockResolvedValue({
      ...subscription,
      plan: 'business',
    });
    mockSubscriptionService.getCurrentSubscription.mockResolvedValueOnce(subscription);

    const { result } = renderHookWithProviders(() => useSubscriptionSettings(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsAfterMount = mockSubscriptionService.getCurrentSubscription.mock.calls.length;

    await act(async () => {
      await result.current.upgradeToPro();
    });

    expect(mockSubscriptionService.initiatePurchase).toHaveBeenCalledWith('pro');
    expect(mockSubscriptionService.getCurrentSubscription.mock.calls.length).toBeGreaterThan(callsAfterMount);

    const callsAfterUpgrade = mockSubscriptionService.getCurrentSubscription.mock.calls.length;

    await act(async () => {
      await result.current.cancelSubscription();
    });
    expect(mockSubscriptionService.cancelSubscription).toHaveBeenCalled();
    expect(mockSubscriptionService.getCurrentSubscription.mock.calls.length).toBeGreaterThan(callsAfterUpgrade);

    const callsAfterCancel = mockSubscriptionService.getCurrentSubscription.mock.calls.length;

    await act(async () => {
      await result.current.restorePurchases();
    });
    expect(mockSubscriptionService.restorePurchases).toHaveBeenCalled();
    expect(mockSubscriptionService.getCurrentSubscription.mock.calls.length).toBeGreaterThan(callsAfterCancel);

    expect(result.current.subscription.plan).toBe('business');
  });

  it('handles subscription load failures with graceful fallback', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSubscriptionService.getCurrentSubscription.mockRejectedValue(new Error('load fail'));
    mockSubscriptionService.getExpiryInfo.mockResolvedValue(expiryInfo);

    const { result } = renderHookWithProviders(() => useSubscriptionSettings(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.subscription.plan).toBe('free');
    expect(result.current.error).toBe('Failed to load subscription status');
    consoleSpy.mockRestore();
  });

  it('returns safe defaults when feature helpers fail', async () => {
    const { result } = renderHookWithProviders(() => useSubscriptionSettings(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockSubscriptionService.canAccessFeature.mockRejectedValueOnce(new Error('no feature'));
    expect(await result.current.canAccessFeature('prioritySupport')).toBe(false);

    mockSubscriptionService.getFeatureLimit.mockRejectedValueOnce(new Error('limit fail'));
    expect(await result.current.getFeatureLimit('maxChatSessions')).toBe(0);
  });

  it('surfaces errors from upgrade, cancel, and restore actions', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHookWithProviders(() => useSubscriptionSettings(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockSubscriptionService.initiatePurchase.mockRejectedValueOnce(new Error('purchase fail'));
    await act(async () => {
      await expect(result.current.upgradeToPro()).rejects.toThrow('purchase fail');
    });
    await waitFor(() => expect(result.current.error).toBe('Failed to upgrade subscription'));
    expect(result.current.isLoading).toBe(false);

    mockSubscriptionService.cancelSubscription.mockRejectedValueOnce(new Error('cancel fail'));
    await act(async () => {
      await expect(result.current.cancelSubscription()).rejects.toThrow('cancel fail');
    });
    await waitFor(() => expect(result.current.error).toBe('Failed to cancel subscription'));

    mockSubscriptionService.restorePurchases.mockRejectedValueOnce(new Error('restore fail'));
    await act(async () => {
      await expect(result.current.restorePurchases()).rejects.toThrow('restore fail');
    });
    await waitFor(() => expect(result.current.error).toBe('Failed to restore purchases'));

    consoleSpy.mockRestore();
  });
});
