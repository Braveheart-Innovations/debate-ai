import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { getFirestore, collection, doc, onSnapshot } from '@react-native-firebase/firestore';
import { onAuthStateChanged } from '@/services/firebase/auth';
import type { MembershipStatus } from '@/types/subscription';
import { SubscriptionManager } from '@/services/subscription/SubscriptionManager';

export const useFeatureAccess = () => {
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('demo');
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Local premium override from Settings (simulated premium mode)
  const simulatedPremium = useSelector((state: RootState) => state.auth?.isPremium) || false;

  useEffect(() => {
    let unsub: undefined | (() => void);
    let authUnsub: undefined | (() => void);
    const init = async () => {
      try {
        setLoading(true);
        const status = await SubscriptionManager.checkSubscriptionStatus();
        setMembershipStatus(status);
        const days = await SubscriptionManager.getTrialDaysRemaining();
        setTrialDaysRemaining(days);

        // Subscribe to auth changes and wire Firestore listener per-user
        authUnsub = onAuthStateChanged((user) => {
          // Tear down previous Firestore listener when auth changes
          if (unsub) {
            try { unsub(); } catch (_e) { void _e; }
            unsub = undefined;
          }

          if (user) {
            const db = getFirestore();
            const userDocRef = doc(collection(db, 'users'), user.uid);
            unsub = onSnapshot(
              userDocRef,
              async () => {
                const s = await SubscriptionManager.checkSubscriptionStatus();
                setMembershipStatus(s);
                const d = await SubscriptionManager.getTrialDaysRemaining();
                setTrialDaysRemaining(d);
              },
              (err: unknown) => {
                const code = (err as { code?: string } | undefined)?.code;
                if (code === 'firestore/permission-denied') {
                  // Likely signed out or no access; downgrade view state quietly
                  setMembershipStatus('demo');
                  setTrialDaysRemaining(null);
                  return; // swallow warning
                }
                console.error('FeatureAccess onSnapshot error', err);
              }
            );
          } else {
            // Signed out: reset state
            setMembershipStatus('demo');
            setTrialDaysRemaining(null);
          }
        });
      } finally {
        setLoading(false);
      }
    };
    init();
    return () => {
      if (unsub) unsub();
      if (authUnsub) authUnsub();
    };
  }, []);

  const effectivePremium = simulatedPremium || membershipStatus === 'premium';
  const canAccessLiveAI = membershipStatus === 'trial' || effectivePremium;
  const isInTrial = membershipStatus === 'trial';
  const isPremium = effectivePremium;
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
