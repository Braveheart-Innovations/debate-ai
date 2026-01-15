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
  const [hasUsedTrial, setHasUsedTrial] = useState(false);
  const [loading, setLoading] = useState(true);

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
        const usedTrial = await SubscriptionManager.hasUserUsedTrial();
        setHasUsedTrial(usedTrial);

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
                const t = await SubscriptionManager.hasUserUsedTrial();
                setHasUsedTrial(t);
              },
              (err: unknown) => {
                const code = (err as { code?: string } | undefined)?.code;
                if (code === 'firestore/permission-denied') {
                  // Likely signed out or no access; downgrade view state quietly
                  setMembershipStatus('demo');
                  setTrialDaysRemaining(null);
                  setHasUsedTrial(false);
                  return; // swallow warning
                }
                console.error('FeatureAccess onSnapshot error', err);
              }
            );
          } else {
            // Signed out: reset state
            setMembershipStatus('demo');
            setTrialDaysRemaining(null);
            setHasUsedTrial(false);
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

  // Check trial status from both local state AND Redux (Redux updates immediately, local state is async)
  const reduxMembershipStatus = useSelector((state: RootState) => state.auth?.userProfile?.membershipStatus);
  const effectiveStatus = loading ? (reduxMembershipStatus || membershipStatus) : membershipStatus;

  const isInTrial = effectiveStatus === 'trial';
  // isPremium includes both 'premium' AND 'trial' users (trial = premium access)
  const isPremium = effectiveStatus === 'premium' || effectiveStatus === 'trial';
  const canAccessLiveAI = isInTrial || isPremium;
  const isDemo = !isInTrial && !isPremium;

  const refresh = async () => {
    setLoading(true);
    try {
      const status = await SubscriptionManager.checkSubscriptionStatus();
      setMembershipStatus(status);
      const days = await SubscriptionManager.getTrialDaysRemaining();
      setTrialDaysRemaining(days);
      const usedTrial = await SubscriptionManager.hasUserUsedTrial();
      setHasUsedTrial(usedTrial);
    } finally {
      setLoading(false);
    }
  };

  // User can start trial only if they haven't used it before and are in demo mode
  const canStartTrial = !hasUsedTrial && isDemo;

  return {
    loading,
    membershipStatus,
    trialDaysRemaining,
    hasUsedTrial,
    canStartTrial,
    canAccessLiveAI,
    isInTrial,
    isPremium,
    isDemo,
    refresh,
  } as const;
};

export default useFeatureAccess;
