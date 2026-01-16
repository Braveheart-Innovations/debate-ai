import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { generateCompleteGreeting } from '../../utils/home/greetingGenerator';

type TimePeriod = 'morning' | 'afternoon' | 'evening';

const getTimePeriod = (): TimePeriod => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

/**
 * Custom hook for generating dynamic greetings.
 * - Generates a fresh greeting on each mount
 * - Automatically updates when time period changes (morning → afternoon → evening)
 * - Checks for time period changes every minute
 */
export const useGreeting = () => {
  const user = useSelector((state: RootState) => state.user.currentUser);

  // Track current time period to detect changes
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(getTimePeriod);

  // Generate fresh greeting on mount and when time period changes
  const [greeting, setGreeting] = useState(() =>
    generateCompleteGreeting(user?.email)
  );

  // Check for time period changes every minute
  useEffect(() => {
    const checkTimePeriod = () => {
      const newPeriod = getTimePeriod();
      if (newPeriod !== timePeriod) {
        setTimePeriod(newPeriod);
        setGreeting(generateCompleteGreeting(user?.email));
      }
    };

    const interval = setInterval(checkTimePeriod, 60000);
    return () => clearInterval(interval);
  }, [timePeriod, user?.email]);

  /**
   * Gets a greeting for a specific time (useful for testing).
   */
  const getGreetingForTime = useCallback((hour: number) => {
    return generateCompleteGreeting(user?.email, hour);
  }, [user?.email]);

  /**
   * Checks if it's currently morning (evaluates fresh each call).
   */
  const isMorning = useCallback((): boolean => {
    return getTimePeriod() === 'morning';
  }, []);

  /**
   * Checks if it's currently afternoon (evaluates fresh each call).
   */
  const isAfternoon = useCallback((): boolean => {
    return getTimePeriod() === 'afternoon';
  }, []);

  /**
   * Checks if it's currently evening (evaluates fresh each call).
   */
  const isEvening = useCallback((): boolean => {
    return getTimePeriod() === 'evening';
  }, []);

  /**
   * Gets user display information.
   */
  const getUserInfo = useCallback(() => {
    return {
      hasUser: !!user,
      email: user?.email || null,
      isAuthenticated: !!user?.email,
      canPersonalize: false,
    };
  }, [user]);

  /**
   * Manually refresh the greeting.
   */
  const refreshGreeting = useCallback(() => {
    const newGreeting = generateCompleteGreeting(user?.email);
    setGreeting(newGreeting);
    return newGreeting;
  }, [user?.email]);

  return {
    // Current Greeting
    timeBasedGreeting: greeting.timeBasedGreeting,
    welcomeMessage: greeting.welcomeMessage,

    // Time Checks (evaluate fresh each call)
    isMorning,
    isAfternoon,
    isEvening,
    getTimePeriod,

    // User Info
    getUserInfo,

    // Utilities
    getGreetingForTime,
    refreshGreeting,

    // Complete Greeting Object
    greeting,
  };
};
