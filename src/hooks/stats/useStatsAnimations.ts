import { useMemo } from 'react';
import { FadeInDown, type EntryOrExitLayoutType } from 'react-native-reanimated';

export interface AnimationConfig {
  delay: number;
  duration: number;
  /** Anything Reanimated's `entering` prop accepts (builders, classes, functions, keyframes). */
  entering: EntryOrExitLayoutType;
}

/**
 * Custom hook for managing statistics screen animations
 * Provides consistent animation configurations and stagger calculations
 */
export const useStatsAnimations = () => {
  // Base animation configuration
  const baseConfig = useMemo(() => ({
    staggerDelay: 100, // milliseconds between each item
    baseDuration: 600, // base animation duration
    maxDelay: 2000, // maximum delay to prevent too long waits
  }), []);
  
  // Calculate staggered delay for items
  const getStaggerDelay = useMemo(() => {
    return (index: number, customStagger?: number): number => {
      const stagger = customStagger || baseConfig.staggerDelay;
      const delay = index * stagger;
      return Math.min(delay, baseConfig.maxDelay);
    };
  }, [baseConfig]);
  
  // Get animation configuration for leaderboard items
  const getLeaderboardAnimation = useMemo(() => {
    return (index: number): AnimationConfig => ({
      delay: getStaggerDelay(index),
      duration: baseConfig.baseDuration,
      entering: FadeInDown.delay(getStaggerDelay(index)),
    });
  }, [baseConfig, getStaggerDelay]);
  
  // Get animation configuration for history items (faster stagger)
  const getHistoryAnimation = useMemo(() => {
    return (index: number): AnimationConfig => ({
      delay: getStaggerDelay(index, 50), // Faster stagger for history
      duration: baseConfig.baseDuration,
      entering: FadeInDown.delay(getStaggerDelay(index, 50)),
    });
  }, [baseConfig, getStaggerDelay]);
  
  // Get animation configuration for topic badges
  const getTopicAnimation = useMemo(() => {
    return (index: number): AnimationConfig => ({
      delay: getStaggerDelay(index, 30), // Very fast stagger for small items
      duration: baseConfig.baseDuration * 0.8, // Slightly faster
      entering: FadeInDown.delay(getStaggerDelay(index, 30)),
    });
  }, [baseConfig, getStaggerDelay]);
  
  // Batch animation configurations for multiple items
  const getBatchAnimations = useMemo(() => {
    return (count: number, animationType: 'leaderboard' | 'history' | 'topics' = 'leaderboard'): AnimationConfig[] => {
      const getAnimation = {
        leaderboard: getLeaderboardAnimation,
        history: getHistoryAnimation,
        topics: getTopicAnimation,
      }[animationType];
      
      return Array.from({ length: count }, (_, index) => getAnimation(index));
    };
  }, [getLeaderboardAnimation, getHistoryAnimation, getTopicAnimation]);
  
  // Calculate total animation duration for a batch
  const getBatchDuration = useMemo(() => {
    return (count: number, animationType: 'leaderboard' | 'history' | 'topics' = 'leaderboard'): number => {
      const animations = getBatchAnimations(count, animationType);
      const maxDelay = Math.max(...animations.map(anim => anim.delay));
      const maxDuration = Math.max(...animations.map(anim => anim.duration));
      return maxDelay + maxDuration;
    };
  }, [getBatchAnimations]);
  
  // Performance optimization: disable animations for large lists
  const shouldUseAnimations = useMemo(() => {
    return (itemCount: number, maxItems: number = 20): boolean => {
      return itemCount <= maxItems;
    };
  }, []);
  
  // Get simplified animation for performance mode
  const getSimpleAnimation = useMemo(() => {
    return (): AnimationConfig => ({
      delay: 0,
      duration: baseConfig.baseDuration * 0.5,
      entering: FadeInDown,
    });
  }, [baseConfig]);
  
  return {
    // Core animation functions
    getLeaderboardAnimation,
    getHistoryAnimation,
    getTopicAnimation,
    
    // Batch operations
    getBatchAnimations,
    getBatchDuration,
    
    // Performance utilities
    shouldUseAnimations,
    getSimpleAnimation,
    
    // Utility functions
    getStaggerDelay,
    
    // Configuration
    baseConfig,
  };
};