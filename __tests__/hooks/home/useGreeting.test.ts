import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useGreeting } from '@/hooks/home/useGreeting';
import { GREETING_POOLS } from '@/utils/home/greetingGenerator';
import type { RootState } from '@/store';
import { setUser } from '@/store';

// Mock useFocusEffect to behave like useEffect (run callback once on mount)
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = callback();
      return cleanup;
    }, [callback]);
  },
}));

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
  });

  it('returns greeting from late_night pool for late night hours (0-3am)', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const lateNightGreeting = result.current.getGreetingForTime(2);

    // Verify it returns a valid late night greeting from home pool
    const lateNightGreetingTexts = GREETING_POOLS.home.late_night.map((g) => g.greeting);
    const lateNightSubtitles = GREETING_POOLS.home.late_night.map((g) => g.subtitle);

    expect(lateNightGreetingTexts).toContain(lateNightGreeting.timeBasedGreeting);
    expect(lateNightSubtitles).toContain(lateNightGreeting.welcomeMessage);
  });

  it('returns greeting from morning pool for morning hours (4-11am)', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const morningGreeting = result.current.getGreetingForTime(9);

    // Verify it returns a valid morning greeting from home pool
    const morningGreetingTexts = GREETING_POOLS.home.morning.map((g) => g.greeting);
    const morningSubtitles = GREETING_POOLS.home.morning.map((g) => g.subtitle);

    expect(morningGreetingTexts).toContain(morningGreeting.timeBasedGreeting);
    expect(morningSubtitles).toContain(morningGreeting.welcomeMessage);
  });

  it('returns greeting from afternoon pool for afternoon hours (12-4pm)', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const afternoonGreeting = result.current.getGreetingForTime(14);

    // Verify it returns a valid afternoon greeting from home pool
    const afternoonGreetingTexts = GREETING_POOLS.home.afternoon.map((g) => g.greeting);
    const afternoonSubtitles = GREETING_POOLS.home.afternoon.map((g) => g.subtitle);

    expect(afternoonGreetingTexts).toContain(afternoonGreeting.timeBasedGreeting);
    expect(afternoonSubtitles).toContain(afternoonGreeting.welcomeMessage);
  });

  it('returns greeting from evening pool for evening hours (5pm+)', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const eveningGreeting = result.current.getGreetingForTime(19);

    // Verify it returns a valid evening greeting from home pool
    const eveningGreetingTexts = GREETING_POOLS.home.evening.map((g) => g.greeting);
    const eveningSubtitles = GREETING_POOLS.home.evening.map((g) => g.subtitle);

    expect(eveningGreetingTexts).toContain(eveningGreeting.timeBasedGreeting);
    expect(eveningSubtitles).toContain(eveningGreeting.welcomeMessage);
  });

  it('returns screen-specific greetings when screenCategory is provided', () => {
    const { result } = renderHookWithProviders(
      () => useGreeting({ screenCategory: 'debate' }),
      {
        preloadedState: {
          user: buildUserState(),
        },
      }
    );

    const morningGreeting = result.current.getGreetingForTime(9);

    // Verify it returns a valid morning greeting from debate pool
    const debateMorningGreetings = GREETING_POOLS.debate.morning.map((g) => g.greeting);
    const debateMorningSubtitles = GREETING_POOLS.debate.morning.map((g) => g.subtitle);

    expect(debateMorningGreetings).toContain(morningGreeting.timeBasedGreeting);
    expect(debateMorningSubtitles).toContain(morningGreeting.welcomeMessage);
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

    let refreshed: ReturnType<typeof result.current.refreshGreeting>;
    act(() => {
      refreshed = result.current.refreshGreeting();
    });
    expect(typeof refreshed!.welcomeMessage).toBe('string');
    expect(refreshed!.welcomeMessage.length).toBeGreaterThan(0);
  });

  it('provides accurate time period detection via getTimePeriod', () => {
    const getHoursSpy = jest.spyOn(Date.prototype, 'getHours');

    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    getHoursSpy.mockReturnValue(2);
    expect(result.current.getTimePeriod()).toBe('late_night');

    getHoursSpy.mockReturnValue(9);
    expect(result.current.getTimePeriod()).toBe('morning');

    getHoursSpy.mockReturnValue(14);
    expect(result.current.getTimePeriod()).toBe('afternoon');

    getHoursSpy.mockReturnValue(19);
    expect(result.current.getTimePeriod()).toBe('evening');

    getHoursSpy.mockRestore();
  });

  it('defaults to home screen category when none provided', () => {
    const { result } = renderHookWithProviders(() => useGreeting(), {
      preloadedState: {
        user: buildUserState(),
      },
    });

    const morningGreeting = result.current.getGreetingForTime(9);

    // Should be from home pool, not any other screen pool
    const homeMorningGreetings = GREETING_POOLS.home.morning.map((g) => g.greeting);
    expect(homeMorningGreetings).toContain(morningGreeting.timeBasedGreeting);
  });
});
