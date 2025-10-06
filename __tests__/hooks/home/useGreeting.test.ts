import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useGreeting } from '@/hooks/home/useGreeting';
import type { RootState } from '@/store';
import { setUser } from '@/store';

const buildUserState = (overrides: Partial<RootState['user']> = {}): RootState['user'] => ({
  currentUser: {
    id: 'user-1',
    email: 'test@example.com',
    subscription: 'pro',
    uiMode: 'simple',
    preferences: { theme: 'light', fontSize: 'medium' },
    ...(overrides.currentUser ?? {}),
  },
  isAuthenticated: overrides.isAuthenticated ?? true,
  uiMode: overrides.uiMode ?? 'simple',
});

describe('useGreeting', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns personalized greeting data and user info helpers', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    expect(result.current.timeBasedGreeting).toBeDefined();
    expect(result.current.welcomeMessage).toBe('Welcome back!');
    expect(result.current.greeting).toEqual({
      timeBasedGreeting: result.current.timeBasedGreeting,
      welcomeMessage: 'Welcome back!',
    });

    const userInfo = result.current.getUserInfo();
    expect(userInfo).toEqual({
      hasUser: true,
      email: 'test@example.com',
      isAuthenticated: true,
      canPersonalize: false,
    });

    const morningGreeting = result.current.getGreetingForTime(9);
    expect(morningGreeting.timeBasedGreeting).toBe('Good morning');
    expect(morningGreeting.welcomeMessage).toBe('Welcome back!');
  });

  it('refreshGreeting recomputes greeting when user changes', () => {
    const { result, rerender, store } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    expect(result.current.welcomeMessage).toBe('Welcome back!');

    act(() => {
      store.dispatch(setUser({
        id: 'user-1',
        email: 'new@example.com',
        subscription: 'business',
        uiMode: 'simple',
        preferences: { theme: 'dark', fontSize: 'large' },
      }));
    });

    rerender();

    const refreshed = result.current.refreshGreeting();
    expect(refreshed.welcomeMessage).toBe('Welcome back!');
    expect(result.current.getUserInfo().email).toBe('new@example.com');
  });

  it('provides accurate time period detection helpers', () => {
    const getHoursSpy = jest.spyOn(Date.prototype, 'getHours');

    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    getHoursSpy.mockReturnValue(9);
    expect(result.current.isMorning()).toBe(true);
    expect(result.current.getTimePeriod()).toBe('morning');

    getHoursSpy.mockReturnValue(14);
    expect(result.current.isAfternoon()).toBe(true);
    expect(result.current.getTimePeriod()).toBe('afternoon');

    getHoursSpy.mockReturnValue(19);
    expect(result.current.isEvening()).toBe(true);
    expect(result.current.getTimePeriod()).toBe('evening');

    getHoursSpy.mockRestore();
  });
});
