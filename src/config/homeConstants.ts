/**
 * Constants used throughout the Home Screen functionality.
 * Centralized configuration for limits, timing, and other fixed values.
 */
export const HOME_CONSTANTS = {
  // AI Selection Limits
  MAX_AIS_FOR_CHAT: 3,
  MIN_AIS_FOR_CHAT: 1,

  // Session Management
  SESSION_ID_PREFIX: 'session_',
  SESSION_ID_RANDOM_LENGTH: 9,

  // Greeting System
  GREETING_TIMES: {
    MORNING_END: 12,
    AFTERNOON_END: 17,
  },

  // UI Constants
  SCROLL_PADDING: {
    HORIZONTAL: 16,
    VERTICAL: 24,
    BOTTOM_EXTRA: 32,
  },

  // Navigation
  SCREENS: {
    CHAT: 'Chat',
    API_CONFIG: 'APIConfig',
  },

  // Quick Start
  QUICK_START_VALIDATION: {
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 50,
    MIN_SUBTITLE_LENGTH: 1,
    MAX_SUBTITLE_LENGTH: 100,
  },
} as const;

/**
 * Type definitions for HOME_CONSTANTS to ensure type safety
 */
export type HomeConstants = typeof HOME_CONSTANTS;
