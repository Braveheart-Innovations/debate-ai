import { useEffect, useState } from 'react';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import type { MembershipStatus } from '@/types/subscription';
import { SubscriptionManager } from '@/services/subscription/SubscriptionManager';

export const useFeatureAccess = () => {
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('demo');
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: undefined | (() => void);
    const init = async () => {
      try {
        setLoading(true);
        const status = await SubscriptionManager.checkSubscriptionStatus();
        setMembershipStatus(status);
        const days = await SubscriptionManager.getTrialDaysRemaining();
        setTrialDaysRemaining(days);

        // Subscribe to user doc changes for real-time updates
        const user = getAuth().currentUser;
        if (user) {
          unsub = getFirestore()
            .collection('users')
            .doc(user.uid)
            .onSnapshot(async () => {
              const s = await SubscriptionManager.checkSubscriptionStatus();
              setMembershipStatus(s);
              const d = await SubscriptionManager.getTrialDaysRemaining();
              setTrialDaysRemaining(d);
            }, (err) => {
              console.error('FeatureAccess onSnapshot error', err);
            });
        }
      } finally {
        setLoading(false);
      }
    };
    init();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const canAccessLiveAI = membershipStatus === 'trial' || membershipStatus === 'premium';
  const isInTrial = membershipStatus === 'trial';
  const isPremium = membershipStatus === 'premium';
  const isDemo = membershipStatus === 'demo';

  const refresh = async () => {
    setLoading(true);
    try {
      const status = await SubscriptionManager.checkSubscriptionStatus();
      setMembershipStatus(status);
      const days = await SubscriptionManager.getTrialDaysRemaining();
      setTrialDaysRemaining(days);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    membershipStatus,
    trialDaysRemaining,
    canAccessLiveAI,
    isInTrial,
    isPremium,
    isDemo,
    refresh,
  } as const;
};

export default useFeatureAccess;
