import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { createMockUserProfile } from '../../test-utils/fixtures';

describe('useFeatureAccess', () => {
  it('returns demo state when user is not premium', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: {
          isPremium: false,
          authLoading: false,
          userProfile: createMockUserProfile({ membershipStatus: 'demo' }),
        },
      },
    });

    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isPremium).toBe(false);
    expect(result.current.isDemo).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('returns premium state when user is premium', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: {
          isPremium: true,
          authLoading: false,
          userProfile: createMockUserProfile({ membershipStatus: 'premium' }),
        },
      },
    });

    expect(result.current.membershipStatus).toBe('premium');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isDemo).toBe(false);
    expect(result.current.canAccessLiveAI).toBe(true);
  });

  it('returns trial state when user is in trial', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: {
          isPremium: true, // trial users have premium access
          authLoading: false,
          userProfile: createMockUserProfile({ membershipStatus: 'trial' }),
        },
      },
    });

    expect(result.current.membershipStatus).toBe('trial');
    expect(result.current.isInTrial).toBe(true);
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isDemo).toBe(false);
  });

  it('returns loading true when auth is loading', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: {
          isPremium: false,
          authLoading: true,
          isAuthenticated: true,
          userProfile: null,
        },
      },
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.isDemo).toBe(false);
    expect(result.current.canStartTrial).toBe(false);
    expect(result.current.canAccessLiveAI).toBe(false);
  });

  it('does not expose trial eligibility before authenticated profile resolves', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: {
          isAuthenticated: true,
          isPremium: false,
          authLoading: true,
          userProfile: null,
        },
      },
    });

    expect(result.current.isDemo).toBe(false);
    expect(result.current.canStartTrial).toBe(false);
  });

  it('maps free/canceled/past_due to demo', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: {
          isPremium: false,
          authLoading: false,
          userProfile: createMockUserProfile({ membershipStatus: 'canceled' }),
        },
      },
    });

    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isDemo).toBe(true);
  });
});
