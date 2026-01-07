import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '../../store';

export type SubscriptionPlan = 'free' | 'pro' | 'business';

export interface SubscriptionStatus {
  plan: SubscriptionPlan;
  isActive: boolean;
  expiresAt?: Date;
  features: string[];
  purchaseDate?: Date;
  cancelledAt?: Date;
  willRenew: boolean;
}

export interface PlanFeatures {
  [key: string]: boolean | number;
  maxChatSessions: number;
  maxDebates: number;
  customTopics: boolean;
  expertMode: boolean;
  personalityVariants: number;
  prioritySupport: boolean;
  dataExport: boolean;
  advancedAnalytics: boolean;
}

class SubscriptionService {
  private static readonly SUBSCRIPTION_KEY = '@subscription_status';
  
  // Plan configurations
  private static readonly PLAN_FEATURES: Record<SubscriptionPlan, PlanFeatures> = {
    free: {
      maxChatSessions: 5,
      maxDebates: 3,
      customTopics: false,
      expertMode: false,
      personalityVariants: 3,
      prioritySupport: false,
      dataExport: false,
      advancedAnalytics: false,
    },
    pro: {
      maxChatSessions: 50,
      maxDebates: 25,
      customTopics: true,
      expertMode: true,
      personalityVariants: 8,
      prioritySupport: true,
      dataExport: true,
      advancedAnalytics: true,
    },
    business: {
      maxChatSessions: -1, // unlimited
      maxDebates: -1, // unlimited
      customTopics: true,
      expertMode: true,
      personalityVariants: 8,
      prioritySupport: true,
      dataExport: true,
      advancedAnalytics: true,
    },
  };

  /**
   * Get current subscription status
   */
  async getCurrentSubscription(): Promise<SubscriptionStatus> {
    try {
      // First check Redux store
      const state = store.getState();
      const userSubscription = state.user.currentUser?.subscription;
      
      if (userSubscription) {
        return this.createSubscriptionStatus(userSubscription);
      }

      // Fallback to local storage
      const statusJson = await AsyncStorage.getItem(SubscriptionService.SUBSCRIPTION_KEY);
      
      if (statusJson) {
        const status = JSON.parse(statusJson) as SubscriptionStatus;
        
        // Validate if subscription is still active
        if (status.expiresAt && new Date() > new Date(status.expiresAt)) {
          // Subscription expired, downgrade to free
          const freeStatus = this.createSubscriptionStatus('free');
          await this.saveSubscriptionStatus(freeStatus);
          return freeStatus;
        }
        
        return status;
      }

      // Default to free plan
      const freeStatus = this.createSubscriptionStatus('free');
      await this.saveSubscriptionStatus(freeStatus);
      return freeStatus;
    } catch (error) {
      console.error('Failed to get current subscription:', error);
      return this.createSubscriptionStatus('free');
    }
  }

  /**
   * Check if user has premium access
   */
  async isPremiumUser(): Promise<boolean> {
    try {
      const subscription = await this.getCurrentSubscription();
      return subscription.plan !== 'free' && subscription.isActive;
    } catch (error) {
      console.error('Failed to check premium status:', error);
      return false;
    }
  }

  /**
   * Check if user can access a specific feature
   */
  async canAccessFeature(feature: keyof PlanFeatures): Promise<boolean> {
    try {
      const subscription = await this.getCurrentSubscription();
      const planFeatures = SubscriptionService.PLAN_FEATURES[subscription.plan];
      
      const featureValue = planFeatures[feature];
      
      // Boolean features
      if (typeof featureValue === 'boolean') {
        return featureValue;
      }
      
      // Numeric features (assume positive means available)
      if (typeof featureValue === 'number') {
        return featureValue > 0;
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to check feature access for ${feature}:`, error);
      return false;
    }
  }

  /**
   * Get feature limit for numeric features
   */
  async getFeatureLimit(feature: keyof PlanFeatures): Promise<number> {
    try {
      const subscription = await this.getCurrentSubscription();
      const planFeatures = SubscriptionService.PLAN_FEATURES[subscription.plan];
      
      const featureValue = planFeatures[feature];
      
      if (typeof featureValue === 'number') {
        return featureValue;
      }
      
      return 0;
    } catch (error) {
      console.error(`Failed to get feature limit for ${feature}:`, error);
      return 0;
    }
  }

  /**
   * Get plan features for a specific plan
   */
  getPlanFeatures(plan: SubscriptionPlan): PlanFeatures {
    return SubscriptionService.PLAN_FEATURES[plan];
  }

  /**
   * Initiate purchase flow
   */
  async initiatePurchase(plan: SubscriptionPlan): Promise<void> {
    try {
      // This would integrate with react-native-iap
      // For now, we'll simulate the purchase flow
      console.warn(`Initiating purchase for ${plan} plan`);
      
      // TODO: Implement actual purchase logic with react-native-iap
      // 1. Get available products
      // 2. Request purchase
      // 3. Validate receipt
      // 4. Update subscription status
      
      throw new Error('Purchase flow not yet implemented');
    } catch (error) {
      console.error('Failed to initiate purchase:', error);
      throw new Error('Unable to start purchase process');
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<void> {
    try {
      // This would integrate with react-native-iap
      console.warn('Restoring purchases...');
      
      // TODO: Implement actual restore logic with react-native-iap
      // 1. Get available purchases
      // 2. Validate receipts
      // 3. Update subscription status
      
      throw new Error('Restore purchases not yet implemented');
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      throw new Error('Unable to restore purchases');
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(): Promise<void> {
    try {
      const currentSubscription = await this.getCurrentSubscription();
      
      if (currentSubscription.plan === 'free') {
        throw new Error('No active subscription to cancel');
      }

      // Update subscription to mark as cancelled
      const cancelledSubscription: SubscriptionStatus = {
        ...currentSubscription,
        cancelledAt: new Date(),
        willRenew: false,
      };

      await this.saveSubscriptionStatus(cancelledSubscription);
      
      // TODO: Integrate with actual subscription provider (App Store/Google Play)
      console.warn('Subscription cancelled successfully');
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      throw new Error('Unable to cancel subscription');
    }
  }

  /**
   * Get subscription expiry info
   */
  async getExpiryInfo(): Promise<{ daysRemaining: number; willExpire: boolean } | null> {
    try {
      const subscription = await this.getCurrentSubscription();
      
      if (!subscription.expiresAt || subscription.plan === 'free') {
        return null;
      }

      const now = new Date();
      const expiryDate = new Date(subscription.expiresAt);
      const timeDiff = expiryDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

      return {
        daysRemaining: Math.max(0, daysRemaining),
        willExpire: !subscription.willRenew,
      };
    } catch (error) {
      console.error('Failed to get expiry info:', error);
      return null;
    }
  }

  /**
   * Update subscription status (internal use)
   */
  async updateSubscriptionStatus(status: SubscriptionStatus): Promise<void> {
    await this.saveSubscriptionStatus(status);
  }

  /**
   * Create subscription status object
   */
  private createSubscriptionStatus(plan: SubscriptionPlan): SubscriptionStatus {
    const features = Object.entries(SubscriptionService.PLAN_FEATURES[plan])
      .filter(([_, value]) => value === true)
      .map(([key, _]) => key);

    return {
      plan,
      isActive: true,
      features,
      willRenew: plan !== 'free',
      // For free plan, no expiry date
      ...(plan !== 'free' && {
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        purchaseDate: new Date(),
      }),
    };
  }

  /**
   * Save subscription status to storage
   */
  private async saveSubscriptionStatus(status: SubscriptionStatus): Promise<void> {
    try {
      const statusJson = JSON.stringify(status);
      await AsyncStorage.setItem(SubscriptionService.SUBSCRIPTION_KEY, statusJson);
    } catch (error) {
      console.error('Failed to save subscription status:', error);
      throw new Error('Unable to save subscription status');
    }
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();
export default subscriptionService;