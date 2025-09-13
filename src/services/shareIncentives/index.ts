/**
 * Share Incentives Service
 * Gamifies sharing with milestones and rewards
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export interface ShareMilestone {
  count: number;
  reward: string;
  title: string;
  message: string;
  icon: string;
}

export interface UnlockedReward {
  reward: string;
  unlockedAt: number;
  milestone: ShareMilestone;
}

const MILESTONES: ShareMilestone[] = [
  {
    count: 1,
    reward: 'first_share_bonus',
    title: 'First Share!',
    message: 'You\'ve shared your first debate! Keep spreading the AI debate revolution.',
    icon: '🎉',
  },
  {
    count: 3,
    reward: 'social_butterfly',
    title: 'Social Butterfly',
    message: 'You\'ve shared 3 debates! Your friends must love these AI battles.',
    icon: '🦋',
  },
  {
    count: 5,
    reward: 'premium_topics_24h',
    title: 'Super Sharer',
    message: 'You\'ve unlocked premium debate motions for 24 hours!',
    icon: '🏆',
  },
  {
    count: 10,
    reward: 'viral_master',
    title: 'Viral Master',
    message: 'You\'ve unlocked the exclusive "Debate Master" badge!',
    icon: '🚀',
  },
  {
    count: 25,
    reward: 'influencer_status',
    title: 'AI Debate Influencer',
    message: 'You\'re officially an AI Debate influencer! Exclusive features unlocked.',
    icon: '⭐',
  },
  {
    count: 50,
    reward: 'legendary_sharer',
    title: 'Legendary Sharer',
    message: 'You\'re a legend! You\'ve helped AI debates go viral.',
    icon: '👑',
  },
];

export class ShareIncentiveService {
  private shareCount = 0;
  private initialized = false;
  
  async initialize() {
    if (this.initialized) return;
    
    try {
      const count = await AsyncStorage.getItem('share_count');
      this.shareCount = count ? parseInt(count, 10) : 0;
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize share incentives:', error);
    }
  }
  
  async recordShare(): Promise<UnlockedReward | null> {
    await this.initialize();
    
    this.shareCount++;
    
    try {
      await AsyncStorage.setItem('share_count', this.shareCount.toString());
      
      const milestone = MILESTONES.find(m => m.count === this.shareCount);
      if (milestone) {
        const reward = await this.unlockReward(milestone);
        this.showMilestoneReward(milestone);
        return reward;
      }
    } catch (error) {
      console.error('Failed to record share:', error);
    }
    
    return null;
  }
  
  private showMilestoneReward(milestone: ShareMilestone) {
    Alert.alert(
      `${milestone.icon} ${milestone.title}`,
      milestone.message,
      [
        {
          text: 'Awesome!',
          style: 'default',
        },
      ],
      { cancelable: false }
    );
  }
  
  private async unlockReward(milestone: ShareMilestone): Promise<UnlockedReward> {
    const reward: UnlockedReward = {
      reward: milestone.reward,
      unlockedAt: Date.now(),
      milestone,
    };
    
    try {
      const rewardsStr = await AsyncStorage.getItem('unlocked_rewards');
      const rewards = rewardsStr ? JSON.parse(rewardsStr) : [];
      rewards.push(reward);
      await AsyncStorage.setItem('unlocked_rewards', JSON.stringify(rewards));
    } catch (error) {
      console.error('Failed to save unlocked reward:', error);
    }
    
    return reward;
  }
  
  async getShareCount(): Promise<number> {
    await this.initialize();
    return this.shareCount;
  }
  
  async getUnlockedRewards(): Promise<UnlockedReward[]> {
    try {
      const rewardsStr = await AsyncStorage.getItem('unlocked_rewards');
      return rewardsStr ? JSON.parse(rewardsStr) : [];
    } catch (error) {
      console.error('Failed to get unlocked rewards:', error);
      return [];
    }
  }
  
  async getNextMilestone(): Promise<ShareMilestone | null> {
    await this.initialize();
    
    const nextMilestone = MILESTONES.find(m => m.count > this.shareCount);
    return nextMilestone || null;
  }
  
  async getProgressToNextMilestone(): Promise<{
    current: number;
    next: number;
    progress: number;
    milestone: ShareMilestone | null;
  }> {
    await this.initialize();
    
    const nextMilestone = await this.getNextMilestone();
    
    if (!nextMilestone) {
      return {
        current: this.shareCount,
        next: this.shareCount,
        progress: 100,
        milestone: null,
      };
    }
    
    const previousMilestone = MILESTONES
      .filter(m => m.count < nextMilestone.count)
      .sort((a, b) => b.count - a.count)[0];
    
    const start = previousMilestone?.count || 0;
    const progress = ((this.shareCount - start) / (nextMilestone.count - start)) * 100;
    
    return {
      current: this.shareCount,
      next: nextMilestone.count,
      progress: Math.min(Math.max(progress, 0), 100),
      milestone: nextMilestone,
    };
  }
  
  async hasReward(rewardType: string): Promise<boolean> {
    const rewards = await this.getUnlockedRewards();
    return rewards.some(r => r.reward === rewardType);
  }
  
  async isPremiumUnlocked(): Promise<boolean> {
    const rewards = await this.getUnlockedRewards();
    const premiumRewards = rewards.filter(r => r.reward.includes('premium'));
    
    // Check if any 24h premium rewards are still active
    const now = Date.now();
    for (const reward of premiumRewards) {
      if (reward.reward === 'premium_topics_24h') {
        const expiresAt = reward.unlockedAt + (24 * 60 * 60 * 1000);
        if (now < expiresAt) {
          return true;
        }
      }
    }
    
    // Check for permanent premium rewards
    return rewards.some(r => 
      r.reward === 'viral_master' || 
      r.reward === 'influencer_status' || 
      r.reward === 'legendary_sharer'
    );
  }
  
  // Reset for testing purposes
  async resetForTesting() {
    if (__DEV__) {
      await AsyncStorage.removeItem('share_count');
      await AsyncStorage.removeItem('unlocked_rewards');
      this.shareCount = 0;
      // Reset completed for testing
    }
  }
}

// Export singleton instance
export const shareIncentives = new ShareIncentiveService();
