import { act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useAuthSettings } from '@/hooks/settings/useAuthSettings';
import type { RootState } from '@/store';

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
};

describe('useAuthSettings', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs the user out and clears store state', async () => {
    const { result, store } = renderHookWithProviders(() => useAuthSettings(), {
      preloadedState: baseState,
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(store.getState().user.currentUser).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('confirms before signing out via alert dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result, store } = renderHookWithProviders(() => useAuthSettings(), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.signOutWithConfirmation();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [, , buttons] = alertSpy.mock.calls[0];
    const signOutButton = buttons?.find(button => button.text === 'Sign Out');

    await act(async () => {
      await signOutButton?.onPress?.();
    });

    expect(store.getState().user.currentUser).toBeNull();
  });

  it('allows clearing transient errors', () => {
    const { result } = renderHookWithProviders(() => useAuthSettings(), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
