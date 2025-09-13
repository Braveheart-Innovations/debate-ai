/**
 * Configuration constants for the DebateSetupScreen
 * Extracted to centralize setup-specific configuration
 */

export const DEBATE_SETUP_CONFIG = {
  // AI Selection Configuration
  MIN_DEBATERS: 2,
  MAX_DEBATERS: 6,
  REQUIRED_DEBATERS: 2, // For standard debate mode
  
  // Topic Configuration
  DEFAULT_TOPIC_MODE: 'preset' as const,
  TOPIC_MIN_LENGTH: 10,
  TOPIC_MAX_LENGTH: 200,
  SUGGESTED_TOPICS_COUNT: 6, // Number of suggested topics to show
  
  // Step Configuration
  STEP_LABELS: ['Motion', 'Debaters', 'Personalities', 'Review'] as const,
  STEPS: {
    TOPIC: 'topic' as const,
    AI_SELECTION: 'ai' as const,
    PERSONALITY: 'personality' as const,
    REVIEW: 'review' as const,
  },
  
  // Animation Configuration
  ANIMATION_DURATION: 300,
  STAGGER_DELAY: 50, // Delay between animated elements
  
  // UI Configuration
  TOPIC_CARD_HEIGHT: 80,
  AI_CARD_HEIGHT: 120,
  PERSONALITY_CHIP_HEIGHT: 36,
  
  // Validation Messages
  VALIDATION_MESSAGES: {
    TOPIC_REQUIRED: 'Please choose or enter a debate motion first!',
    TOPIC_TOO_SHORT: 'Motion must be at least 10 characters long',
    TOPIC_TOO_LONG: 'Motion must be less than 200 characters long',
    DEBATERS_REQUIRED: 'Please select exactly 2 AIs for the debate!',
    MIN_DEBATERS: 'You need at least 2 AIs for a debate!',
    MAX_DEBATERS_EXCEEDED: 'Maximum 6 AIs allowed in a debate',
    INVALID_SELECTION: 'Invalid AI selection',
  },
  
  // Premium Feature Configuration
  PREMIUM_FEATURES: {
    CUSTOM_TOPICS: true,
    PERSONALITY_SELECTION: true,
    EXTENDED_DEBATES: true,
    ADVANCED_SETTINGS: true,
  },
  
  // Topic Mode Configuration
  TOPIC_MODES: {
    PRESET: 'preset' as const,
    CUSTOM: 'custom' as const,
    SURPRISE: 'surprise' as const,
  },
  
  // Estimated Duration (in minutes)
  ESTIMATED_DURATION: {
    SHORT_TOPIC: 5,
    MEDIUM_TOPIC: 10,
    LONG_TOPIC: 15,
    COMPLEX_TOPIC: 20,
  },
} as const;

export type DebateSetupConfig = typeof DEBATE_SETUP_CONFIG;
export type TopicMode = typeof DEBATE_SETUP_CONFIG.TOPIC_MODES[keyof typeof DEBATE_SETUP_CONFIG.TOPIC_MODES];
export type DebateStep = typeof DEBATE_SETUP_CONFIG.STEPS[keyof typeof DEBATE_SETUP_CONFIG.STEPS];
