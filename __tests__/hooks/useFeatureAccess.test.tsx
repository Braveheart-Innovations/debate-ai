import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { createAppStore } from '@/store';

describe('useFeatureAccess', () => {
  it('returns demo state when user is not premium', () => {
    const store = createAppStore({
      ...createAppStore().getState(),
      auth: {
        isPremium: false,
        authLoading: false,
        userProfile: { membershipStatus: 'demo' },
      } as any,
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess(), { store });

    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isPremium).toBe(false);
    expect(result.current.isDemo).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('returns premium state when user is premium', () => {
    const store = createAppStore({
      ...createAppStore().getState(),
      auth: {
        isPremium: true,
        authLoading: false,
        userProfile: { membershipStatus: 'premium' },
      } as any,
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess(), { store });

    expect(result.current.membershipStatus).toBe('premium');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isDemo).toBe(false);
    expect(result.current.canAccessLiveAI).toBe(true);
  });

  it('returns trial state when user is in trial', () => {
    const store = createAppStore({
      ...createAppStore().getState(),
      auth: {
        isPremium: true, // trial users have premium access
        authLoading: false,
        userProfile: { membershipStatus: 'trial' },
      } as any,
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess(), { store });

    expect(result.current.membershipStatus).toBe('trial');
    expect(result.current.isInTrial).toBe(true);
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isDemo).toBe(false);
  });

  it('returns loading true when auth is loading', () => {
    const store = createAppStore({
      ...createAppStore().getState(),
      auth: {
        isPremium: false,
        authLoading: true,
        userProfile: null,
      } as any,
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess(), { store });

    expect(result.current.loading).toBe(true);
  });

  it('maps free/canceled/past_due to demo', () => {
    const store = createAppStore({
      ...createAppStore().getState(),
      auth: {
        isPremium: false,
        authLoading: false,
        userProfile: { membershipStatus: 'canceled' },
      } as any,
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess(), { store });

    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isDemo).toBe(true);
  });
});
