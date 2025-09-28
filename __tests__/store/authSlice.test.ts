import reducer, {
  setUser,
  setUserProfile,
  setPremiumStatus,
  setAuthModalVisible,
  logout,
} from '@/store/authSlice';

const initialState = reducer(undefined, { type: 'init' });

describe('authSlice', () => {
  it('sets user and authentication state', () => {
    const user = { uid: '123', email: 'user@example.com', isAnonymous: false } as never;
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

  it('toggles auth modal and clears state on logout', () => {
    const visibleState = reducer(initialState, setAuthModalVisible(true));
    expect(visibleState.authModalVisible).toBe(true);

    const cleared = reducer(visibleState, logout());
    expect(cleared.user).toBeNull();
    expect(cleared.isAuthenticated).toBe(false);
    expect(cleared.authModalVisible).toBe(false);
  });
});
