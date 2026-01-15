import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useGreeting } from '@/hooks/home/useGreeting';
import { GREETING_POOLS } from '@/utils/home/greetingGenerator';
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

  it('returns greeting data with valid structure', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    // Verify greeting structure
    expect(typeof result.current.timeBasedGreeting).toBe('string');
    expect(result.current.timeBasedGreeting.length).toBeGreaterThan(0);
    expect(typeof result.current.welcomeMessage).toBe('string');
    expect(result.current.welcomeMessage.length).toBeGreaterThan(0);

    // Verify complete greeting object
    expect(result.current.greeting).toEqual({
      timeBasedGreeting: result.current.timeBasedGreeting,
      welcomeMessage: result.current.welcomeMessage,
    });

    // Verify user info helpers
    const userInfo = result.current.getUserInfo();
    expect(userInfo).toEqual({
      hasUser: true,
      email: 'test@example.com',
      isAuthenticated: true,
      canPersonalize: false,
    });
  });

  it('returns greeting from morning pool for morning hours', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const morningGreeting = result.current.getGreetingForTime(9);

    // Verify it returns a valid morning greeting
    const morningGreetingTexts = GREETING_POOLS.morning.map((g) => g.greeting);
    const morningSubtitles = GREETING_POOLS.morning.map((g) => g.subtitle);

    expect(morningGreetingTexts).toContain(morningGreeting.timeBasedGreeting);
    expect(morningSubtitles).toContain(morningGreeting.welcomeMessage);
  });

  it('returns greeting from afternoon pool for afternoon hours', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const afternoonGreeting = result.current.getGreetingForTime(14);

    // Verify it returns a valid afternoon greeting
    const afternoonGreetingTexts = GREETING_POOLS.afternoon.map((g) => g.greeting);
    const afternoonSubtitles = GREETING_POOLS.afternoon.map((g) => g.subtitle);

    expect(afternoonGreetingTexts).toContain(afternoonGreeting.timeBasedGreeting);
    expect(afternoonSubtitles).toContain(afternoonGreeting.welcomeMessage);
  });

  it('returns greeting from evening pool for evening hours', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const eveningGreeting = result.current.getGreetingForTime(19);

    // Verify it returns a valid evening greeting
    const eveningGreetingTexts = GREETING_POOLS.evening.map((g) => g.greeting);
    const eveningSubtitles = GREETING_POOLS.evening.map((g) => g.subtitle);

    expect(eveningGreetingTexts).toContain(eveningGreeting.timeBasedGreeting);
    expect(eveningSubtitles).toContain(eveningGreeting.welcomeMessage);
  });

  it('refreshGreeting returns new greeting when called', () => {
    const { result, rerender, store } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    // Verify initial greeting exists
    expect(typeof result.current.welcomeMessage).toBe('string');
    expect(result.current.welcomeMessage.length).toBeGreaterThan(0);

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
    expect(typeof refreshed.welcomeMessage).toBe('string');
    expect(refreshed.welcomeMessage.length).toBeGreaterThan(0);
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
