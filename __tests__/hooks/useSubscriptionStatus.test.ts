import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import type { RootState } from '@/store';
import type { SubscriptionTier } from '@/types';

describe('useSubscriptionStatus', () => {
  const buildUserState = (subscription: SubscriptionTier | undefined): RootState['user'] => ({
    currentUser: subscription
      ? {
          id: 'user-1',
          subscription,
          uiMode: 'simple',
          preferences: { theme: 'light', fontSize: 'medium' },
        }
      : null,
    isAuthenticated: !!subscription,
    uiMode: 'simple',
  });

  it('derives flags for free tier users', () => {
    const { result } = renderHookWithProviders(() => useSubscriptionStatus(), {
      preloadedState: {
        user: buildUserState('free'),
      },
    });

    expect(result.current.subscription).toBe('free');
    expect(result.current.isFree).toBe(true);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.isPro).toBe(false);
    expect(result.current.isBusiness).toBe(false);
    expect(result.current.hasFeatureAccess('expertMode')).toBe(false);
    expect(result.current.getSubscriptionLabel()).toBe('Free');
    expect(result.current.getFeatureLimit('monthlyChats')).toBeGreaterThan(0);
    expect(result.current.isFeatureUnlimited('monthlyChats')).toBe(false);
    expect(result.current.getDaysRemaining()).toBeNull();
    expect(result.current.isTrialActive()).toBe(false);
    expect(result.current.canUpgrade()).toBe(true);
    expect(result.current.getUpgradeOptions()).toEqual(['pro', 'business']);
  });

  it('treats pro tier as premium and grants premium features', () => {
    const { result } = renderHookWithProviders(() => useSubscriptionStatus(), {
      preloadedState: {
        user: buildUserState('pro'),
      },
    });

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isPro).toBe(true);
    expect(result.current.hasFeatureAccess('customPersonalities')).toBe(true);
    expect(result.current.getFeatureLimit('monthlyChats')).toBe(500);
    expect(result.current.isFeatureUnlimited('exportCount')).toBe(false);
    expect(result.current.getDaysRemaining()).toBe(30);
    expect(result.current.canUpgrade()).toBe(true);
    expect(result.current.getUpgradeOptions()).toEqual(['business']);
  });

  it('treats business tier as fully premium with unlimited features', () => {
    const { result } = renderHookWithProviders(() => useSubscriptionStatus(), {
      preloadedState: {
        user: buildUserState('business'),
      },
    });

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isBusiness).toBe(true);
    expect(result.current.hasFeatureAccess('apiAccess')).toBe(true);
    expect(result.current.isFeatureUnlimited('monthlyChats')).toBe(true);
    expect(result.current.getSubscriptionLabel()).toBe('Business');
    expect(result.current.getFeatureLimit('exportCount')).toBe(-1);
    expect(result.current.canUpgrade()).toBe(false);
    expect(result.current.getUpgradeOptions()).toEqual([]);
  });

  it('defaults to pro tier when no current user is present', () => {
    const { result } = renderHookWithProviders(() => useSubscriptionStatus(), {
      preloadedState: {
        user: buildUserState(undefined),
      },
    });

    expect(result.current.subscription).toBe('pro');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isFree).toBe(false);
  });
});
