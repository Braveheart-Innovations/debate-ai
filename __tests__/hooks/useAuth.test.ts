import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useAuth } from '@/hooks/useAuth';
import type { RootState } from '@/store';
import type { User } from '@/types';

describe('useAuth', () => {
  const baseUserState: RootState['user'] = {
    currentUser: null,
    isAuthenticated: false,
    uiMode: 'simple',
  };

  it('reports unauthenticated state when no user is set', () => {
    const { result } = renderHookWithProviders(() => useAuth(), {
      preloadedState: {
        user: { ...baseUserState },
      },
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isPremium).toBe(false);
  });

  it('derives premium status from subscription tier', () => {
    const premiumUser: User = {
      id: 'user-1',
      email: 'premium@example.com',
      subscription: 'pro',
      uiMode: 'expert',
      preferences: {
        theme: 'dark',
        fontSize: 'medium',
      },
    };

    const { result } = renderHookWithProviders(() => useAuth(), {
      preloadedState: {
        user: {
          ...baseUserState,
          currentUser: premiumUser,
          isAuthenticated: true,
          uiMode: 'expert',
        },
      },
    });

    expect(result.current.user).toEqual(premiumUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isPremium).toBe(true);
  });

  it('treats free subscribers as non-premium', () => {
    const freeUser: User = {
      id: 'user-2',
      subscription: 'free',
      uiMode: 'simple',
      preferences: {
        theme: 'light',
        fontSize: 'small',
      },
    };

    const { result } = renderHookWithProviders(() => useAuth(), {
      preloadedState: {
        user: {
          ...baseUserState,
          currentUser: freeUser,
          isAuthenticated: true,
        },
      },
    });

    expect(result.current.isPremium).toBe(false);
  });
});
