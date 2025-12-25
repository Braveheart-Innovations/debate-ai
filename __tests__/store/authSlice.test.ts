import reducer, {
  setUser,
  setUserProfile,
  setPremiumStatus,
  setAuthModalVisible,
  logout,
  setAuthLoading,
  setSocialAuthLoading,
  setSocialAuthError,
  setLastAuthMethod,
  setAuthUser,
} from '@/store/authSlice';

const initialState = reducer(undefined, { type: 'init' });

describe('authSlice', () => {
  it('sets user and authentication state', () => {
    const user = { uid: '123', email: 'user@example.com' } as never;
    const state = reducer(initialState, setUser(user));
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
  });

  it('updates user profile and premium status', () => {
    const profile = {
      email: 'user@example.com',
      displayName: 'User',
      photoURL: null,
      createdAt: Date.now(),
      membershipStatus: 'free' as const,
    };
    let state = reducer(initialState, setUserProfile(profile));
    expect(state.userProfile).toEqual(profile);
    expect(state.isPremium).toBe(false);

    state = reducer(state, setPremiumStatus(true));
    expect(state.isPremium).toBe(true);
    expect(state.userProfile?.membershipStatus).toBe('premium');
  });

  it('sets premium status without userProfile', () => {
    // Test branch where userProfile is null
    const state = reducer(initialState, setPremiumStatus(true));
    expect(state.isPremium).toBe(true);
    expect(state.userProfile).toBeNull(); // Should remain null
  });

  it('toggles auth modal and clears state on logout', () => {
    const visibleState = reducer(initialState, setAuthModalVisible(true));
    expect(visibleState.authModalVisible).toBe(true);

    const cleared = reducer(visibleState, logout());
    expect(cleared.user).toBeNull();
    expect(cleared.isAuthenticated).toBe(false);
    expect(cleared.authModalVisible).toBe(false);
  });

  it('sets auth loading state', () => {
    const state = reducer(initialState, setAuthLoading(true));
    expect(state.authLoading).toBe(true);
  });

  it('sets social auth loading state', () => {
    const state = reducer(initialState, setSocialAuthLoading(true));
    expect(state.socialAuthLoading).toBe(true);
  });

  it('sets social auth error', () => {
    const state = reducer(initialState, setSocialAuthError('Auth failed'));
    expect(state.socialAuthError).toBe('Auth failed');

    const clearedState = reducer(state, setSocialAuthError(null));
    expect(clearedState.socialAuthError).toBeNull();
  });

  it('sets last auth method', () => {
    const state = reducer(initialState, setLastAuthMethod('google'));
    expect(state.lastAuthMethod).toBe('google');
  });

  it('sets auth user and derived states', () => {
    const user = { uid: '456', email: 'test@test.com' };
    const state = reducer(initialState, setAuthUser(user as never));
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
  });

  it('clears user with setAuthUser null', () => {
    const user = { uid: '123', email: 'test@test.com' };
    let state = reducer(initialState, setAuthUser(user as never));
    expect(state.isAuthenticated).toBe(true);

    state = reducer(state, setAuthUser(null));
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
