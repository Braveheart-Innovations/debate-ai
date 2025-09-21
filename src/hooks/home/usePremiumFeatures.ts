import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { SessionService } from '../../services/home/SessionService';
import { AIConfigurationService } from '../../services/home/AIConfigurationService';
import { HOME_CONSTANTS } from '../../config/homeConstants';

/**
 * Custom hook for managing premium features and subscription status.
 * Handles premium status detection, feature limits, and tier validation.
 */
export const usePremiumFeatures = () => {
  const user = useSelector((state: RootState) => state.user.currentUser);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});

  // Premium gating removed — treat all users as having full access to AI features.
  const isPremium = true;

  /**
   * Gets the maximum number of AIs allowed based on premium status.
   * 
   * @returns Maximum AI limit for current user
   */
  const getMaxAILimit = (): number => {
    const availableAICount = AIConfigurationService.getAvailableAICount(apiKeys);
    return SessionService.calculateSessionLimits(availableAICount);
  };

  /**
   * Checks if user can select more AIs.
   * 
   * @param currentSelectionCount - Current number of selected AIs
   * @returns True if more AIs can be selected
   */
  const canSelectMoreAIs = (currentSelectionCount: number): boolean => {
    const maxLimit = getMaxAILimit();
    return currentSelectionCount < maxLimit;
  };

  /**
   * Gets feature availability based on premium status.
   * 
   * @returns Object with feature availability flags
   */
  const getFeatureAvailability = () => {
    return {
      unlimitedAIs: isPremium,
      customTopics: isPremium,
      expertMode: isPremium,
      prioritySupport: isPremium,
      advancedPersonalities: isPremium,
      sessionHistory: isPremium,
      analyticsInsights: isPremium,
    };
  };

  /**
   * Gets subscription tier information.
   * 
   * @returns Object with subscription details
   */
  const getSubscriptionInfo = () => {
    return {
      tier: user?.subscription || 'free',
      isPremium,
      isFree: !isPremium,
      isPro: user?.subscription === 'pro',
      isBusiness: user?.subscription === 'business',
    };
  };

  /**
   * Gets AI selection limits information.
   * 
   * @returns Object with AI limit details
   */
  const getAILimits = () => {
    const availableCount = AIConfigurationService.getAvailableAICount(apiKeys);
    const maxAllowed = getMaxAILimit();
    
    return {
      maxAllowed,
      availableCount,
      selectionLimit: HOME_CONSTANTS.MAX_AIS_FOR_CHAT,
    };
  };

  /**
   * Checks if a specific feature is available.
   * 
   * @param featureName - Name of the feature to check
   * @returns True if feature is available
   */
  const isFeatureAvailable = (featureName: keyof ReturnType<typeof getFeatureAvailability>): boolean => {
    const features = getFeatureAvailability();
    return features[featureName];
  };

  /**
   * Gets premium upgrade benefits.
   * 
   * @returns Array of premium benefits
   */
  const getUpgradeBenefits = () => {
    if (isPremium) {
      return [];
    }

    return [
      'Unlimited AI selections',
      'Custom conversation topics',
      'Expert mode with advanced controls',
      'Priority customer support',
      'Advanced AI personalities',
      'Session history tracking',
      'Analytics insights',
    ];
  };

  /**
   * Validates if user can perform an action based on premium status.
   * 
   * @param action - Action to validate
   * @param context - Additional context for validation
   * @returns True if action is allowed
   */
  const canPerformAction = (
    action: 'selectAI' | 'createCustomTopic' | 'accessExpertMode' | 'viewAnalytics',
    context?: { currentAICount?: number }
  ): boolean => {
    switch (action) {
      case 'selectAI':
        if (context?.currentAICount !== undefined) {
          return canSelectMoreAIs(context.currentAICount);
        }
        return true;
      
      case 'createCustomTopic':
      case 'accessExpertMode':
      case 'viewAnalytics':
        return isPremium;
      
      default:
        return false;
    }
  };

  /**
   * Gets usage statistics for the current tier.
   * 
   * @param currentAISelection - Current AI selection count
   * @returns Usage statistics object
   */
  const getUsageStats = (currentAISelection: number) => {
    const limits = getAILimits();
    
    return {
      aiUsage: {
        current: currentAISelection,
        limit: limits.maxAllowed,
        percentage: (currentAISelection / limits.maxAllowed) * 100,
        remaining: limits.maxAllowed - currentAISelection,
      },
      isAtLimit: currentAISelection >= limits.maxAllowed,
      needsUpgrade: false,
    };
  };

  return {
    // Premium Status
    isPremium,
    isFree: !isPremium,
    
    // Subscription Info
    getSubscriptionInfo,
    
    // Limits
    getMaxAILimit,
    canSelectMoreAIs,
    getAILimits,
    
    // Features
    getFeatureAvailability,
    isFeatureAvailable,
    canPerformAction,
    
    // Upgrade Info
    getUpgradeBenefits,
    
    // Usage
    getUsageStats,
    
    // Computed Properties
    maxAIs: getMaxAILimit(),
    features: getFeatureAvailability(),
    subscription: getSubscriptionInfo(),
  };
};
