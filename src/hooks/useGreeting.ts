import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { RootState } from '../store';
import {
  generateCompleteGreeting,
  getTimePeriodForHour,
  ScreenCategory,
  TimePeriod,
} from '../utils/home/greetingGenerator';

interface UseGreetingOptions {
  /**
   * The screen category to get appropriate greetings for.
   * Defaults to 'home'.
   */
  screenCategory?: ScreenCategory;
}

/**
 * Custom hook for generating dynamic greetings.
 * - Generates a fresh greeting when screen gains focus
 * - Uses current time to select from appropriate greeting pool
 * - Supports screen-specific greeting pools
 */
export const useGreeting = (options: UseGreetingOptions = {}) => {
  const { screenCategory = 'home' } = options;
  const user = useSelector((state: RootState) => state.user.currentUser);

  // Generate initial greeting
  const [greeting, setGreeting] = useState(() =>
    generateCompleteGreeting(user?.email, undefined, screenCategory)
  );

  // Refresh greeting when screen gains focus
  useFocusEffect(
    useCallback(() => {
      setGreeting(generateCompleteGreeting(user?.email, undefined, screenCategory));
    }, [user?.email, screenCategory])
  );

  /**
   * Gets a greeting for a specific time (useful for testing).
   */
  const getGreetingForTime = useCallback((hour: number) => {
    return generateCompleteGreeting(user?.email, hour, screenCategory);
  }, [user?.email, screenCategory]);

  /**
   * Gets the current time period.
   */
  const getCurrentTimePeriod = useCallback((): TimePeriod => {
    return getTimePeriodForHour(new Date().getHours());
  }, []);

  /**
   * Manually refresh the greeting using current time.
   */
  const refreshGreeting = useCallback(() => {
    const newGreeting = generateCompleteGreeting(user?.email, undefined, screenCategory);
    setGreeting(newGreeting);
    return newGreeting;
  }, [user?.email, screenCategory]);

  return {
    // Current Greeting
    timeBasedGreeting: greeting.timeBasedGreeting,
    welcomeMessage: greeting.welcomeMessage,

    // Time Period
    getTimePeriod: getCurrentTimePeriod,

    // Utilities
    getGreetingForTime,
    refreshGreeting,

    // Complete Greeting Object
    greeting,
  };
};
