import { createAppStore } from '@/store';

describe('createAppStore', () => {
  it('hydrates store with preloaded state', () => {
    const store = createAppStore({ user: { currentUser: null, isAuthenticated: false, uiMode: 'expert' } as never });
    expect(store.getState().user.uiMode).toBe('expert');
  });
});
