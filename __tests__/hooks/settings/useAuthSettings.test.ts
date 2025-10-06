import { act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useAuthSettings } from '@/hooks/settings/useAuthSettings';
import * as storeModule from '@/store';
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

  it('captures sign-out failures and sets error state', async () => {
    const logoutSpy = jest.spyOn(storeModule, 'logout').mockImplementation(() => {
      throw new Error('boom');
    });
    const { result } = renderHookWithProviders(() => useAuthSettings(), {
      preloadedState: baseState,
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(result.current.signOut()).rejects.toThrow('boom');

    await waitFor(() => expect(result.current.error).toBe('Failed to sign out'));
    expect(result.current.isLoading).toBe(false);

    consoleSpy.mockRestore();
    logoutSpy.mockRestore();
  });

  it('alerts when confirmation sign-out fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const logoutSpy = jest.spyOn(storeModule, 'logout').mockImplementation(() => {
      throw new Error('fail');
    });
    const { result } = renderHookWithProviders(() => useAuthSettings(), {
      preloadedState: baseState,
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      result.current.signOutWithConfirmation();
    });

    const [, , buttons] = alertSpy.mock.calls[0];

    await act(async () => {
      await buttons?.find(button => button.text === 'Sign Out')?.onPress?.();
    });

    await waitFor(() => expect(alertSpy.mock.calls.length).toBeGreaterThan(1));
    expect(alertSpy.mock.calls[1][0]).toBe('Error');

    consoleSpy.mockRestore();
    logoutSpy.mockRestore();
  });
});
