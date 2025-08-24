import { store } from '../store';

/**
 * Premium Features Configuration
 * Defines what features are available for free vs premium users
 */
export const PREMIUM_FEATURES = {
  // Debate Features
  customDebateTopics: {
    free: false,  // Free users can only use pre-defined topics
    premium: true,
  },
  debateTopicSuggestions: {
    free: 3,      // Free users get 3 suggested topics
    premium: -1,  // Premium users get unlimited (-1 = unlimited)
  },
  
  // Personality Features
  aiPersonalities: {
    free: ['neutral', 'friendly', 'professional'],  // Basic personalities
    premium: 'all',  // Access to all 12 personalities
  },
  
  // Expert Mode
  expertMode: {
    free: false,
    premium: true,
  },
  customModelSelection: {
    free: false,  // Free users use default models
    premium: true,  // Premium users can choose specific models
  },
  
  // History & Storage
  conversationHistory: {
    free: 10,     // Last 10 conversations
    premium: -1,  // Unlimited history
  },
  debateHistory: {
    free: 5,      // Last 5 debates
    premium: -1,  // Unlimited debate history
  },
  
  // Advanced Features
  shareDebateTranscripts: {
    free: false,
    premium: true,
  },
  exportConversations: {
    free: false,
    premium: true,
  },
  
  // AI Model Access (for future when we might limit some models)
  modelAccess: {
    free: ['gpt-4o-mini', 'claude-3-haiku', 'gemini-1.5-flash'],  // Basic models
    premium: 'all',  // Access to all models including GPT-5, Claude Opus, etc.
  },
  
  // Rate Limits (messages per day - for future implementation)
  dailyMessageLimit: {
    free: 100,
    premium: -1,  // Unlimited
  },
};

/**
 * Check if a user has access to a premium feature
 */
export function hasFeatureAccess(featureName: keyof typeof PREMIUM_FEATURES): boolean {
  const state = store.getState();
  const isPremium = state.auth?.isPremium || false;
  
  const feature = PREMIUM_FEATURES[featureName];
  if (!feature) return true; // If feature not defined, allow access
  
  if (isPremium) {
    const premiumValue = feature.premium;
    return premiumValue === true || premiumValue === 'all' || premiumValue === -1;
  }
  
  const freeValue = feature.free;
  return freeValue === true || (typeof freeValue === 'string' && freeValue === 'all') || (typeof freeValue === 'number' && freeValue > 0);
}

/**
 * Get the limit for a feature (for numerical limits)
 */
export function getFeatureLimit(featureName: keyof typeof PREMIUM_FEATURES): number | 'unlimited' | string[] {
  const state = store.getState();
  const isPremium = state.auth?.isPremium || false;
  
  const feature = PREMIUM_FEATURES[featureName];
  if (!feature) return 'unlimited';
  
  const limit = isPremium ? feature.premium : feature.free;
  
  if (limit === -1) return 'unlimited';
  if (typeof limit === 'string' && limit === 'all') return 'unlimited';
  if (Array.isArray(limit)) return limit;
  if (typeof limit === 'number') return limit;
  if (typeof limit === 'boolean') return limit ? 'unlimited' : 0;
  
  return 0;
}

/**
 * Check if user has reached their limit for a feature
 */
export function hasReachedLimit(featureName: keyof typeof PREMIUM_FEATURES, currentCount: number): boolean {
  const limit = getFeatureLimit(featureName);
  
  if (limit === 'unlimited') return false;
  if (Array.isArray(limit)) return false; // Not applicable for array limits
  if (typeof limit === 'number') return currentCount >= limit;
  
  return true;
}

/**
 * Get available personalities based on subscription
 */
export function getAvailablePersonalities(): string[] {
  const state = store.getState();
  const isPremium = state.auth?.isPremium || false;
  
  if (isPremium) {
    // Return all personalities for premium users
    return [
      'neutral', 'friendly', 'professional', 'academic', 'socratic',
      'devil_advocate', 'optimistic', 'analytical', 'creative', 
      'empathetic', 'challenging', 'supportive'
    ];
  }
  
  // Return only basic personalities for free users
  return PREMIUM_FEATURES.aiPersonalities.free as string[];
}

/**
 * Check if a specific model is available to the user
 */
export function isModelAvailable(modelId: string): boolean {
  const state = store.getState();
  const isPremium = state.auth?.isPremium || false;
  
  if (isPremium) return true; // Premium users have access to all models
  
  const freeModels = PREMIUM_FEATURES.modelAccess.free as string[];
  return freeModels.includes(modelId);
}

/**
 * Get premium upsell message for a specific feature
 */
export function getPremiumUpsellMessage(featureName: keyof typeof PREMIUM_FEATURES): string {
  const messages: Record<string, string> = {
    customDebateTopics: 'Upgrade to Premium to create custom debate topics!',
    aiPersonalities: 'Unlock all 12 AI personalities with Premium!',
    expertMode: 'Expert mode with advanced settings is a Premium feature.',
    conversationHistory: 'Premium members get unlimited conversation history.',
    shareDebateTranscripts: 'Share debate transcripts with Premium membership.',
    exportConversations: 'Export your conversations with Premium.',
    dailyMessageLimit: 'You\'ve reached your daily message limit. Upgrade to Premium for unlimited messages!',
  };
  
  return messages[featureName] || 'This feature requires a Premium membership.';
}