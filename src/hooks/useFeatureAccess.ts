import { useEffect, useState, useMemo, useCallback } from 'react';
import { getFirestore, collection, doc, onSnapshot, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { onAuthStateChanged } from '@/services/firebase/auth';
import type { MembershipStatus } from '@/types/subscription';

/**
 * Simplified subscription hook that reads directly from Firestore snapshot.
 *
 * Key principles:
 * 1. Single source of truth: Firestore user document
 * 2. No redundant getDoc() calls - use snapshot data directly
 * 3. Server (validatePurchase Cloud Function) handles all business logic
 * 4. Client only reads and displays
 */

interface SubscriptionData {
  membershipStatus: MembershipStatus;
  trialEndDate: FirebaseFirestoreTypes.Timestamp | null;
  hasUsedTrial: boolean;
}

export const useFeatureAccess = () => {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubFirestore: (() => void) | undefined;

    // Listen to auth state changes
    const unsubAuth = onAuthStateChanged((user) => {
      // Clean up previous Firestore listener when auth changes
      if (unsubFirestore) {
        try { unsubFirestore(); } catch (_e) { void _e; }
        unsubFirestore = undefined;
      }

      // Always reset state when auth changes to prevent data leaking between users
      setData(null);

      if (!user) {
        // Signed out: reset to demo state
        setLoading(false);
        return;
      }

      // User is logging in - show loading while we wait for Firestore snapshot
      setLoading(true);

      // Set up Firestore listener for this user
      const db = getFirestore();
      const userDocRef = doc(collection(db, 'users'), user.uid);

      unsubFirestore = onSnapshot(
        userDocRef,
        (snap) => {
          // USE THE SNAPSHOT DATA DIRECTLY - no extra getDoc() calls
          const docData = snap.data();
          if (docData) {
            setData({
              membershipStatus: (docData.membershipStatus as MembershipStatus) || 'demo',
              trialEndDate: docData.trialEndDate || null,
              hasUsedTrial: docData.hasUsedTrial === true,
            });
          } else {
            // Document doesn't exist yet (new user)
            setData({
              membershipStatus: 'demo',
              trialEndDate: null,
              hasUsedTrial: false,
            });
          }
          setLoading(false);
        },
        (err: unknown) => {
          const code = (err as { code?: string } | undefined)?.code;
          if (code === 'firestore/permission-denied') {
            // Signed out or no access - reset to demo
            setData(null);
            setLoading(false);
            return;
          }
          console.error('useFeatureAccess onSnapshot error:', err);
          setData(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  // Derive all values from the single source of truth
  const membershipStatus: MembershipStatus = data?.membershipStatus || 'demo';
  const hasUsedTrial = data?.hasUsedTrial || false;

  const isInTrial = membershipStatus === 'trial';
  // isPremium includes both 'premium' AND 'trial' users (trial = premium access)
  const isPremium = membershipStatus === 'premium' || membershipStatus === 'trial';
  const isDemo = !isPremium;
  const canAccessLiveAI = isPremium;
  const canStartTrial = !hasUsedTrial && isDemo;

  // Calculate trial days remaining from trialEndDate
  const trialDaysRemaining = useMemo(() => {
    if (!isInTrial || !data?.trialEndDate) return null;
    try {
      const endMs = typeof data.trialEndDate.toMillis === 'function'
        ? data.trialEndDate.toMillis()
        : (data.trialEndDate as unknown as number);
      // Guard against NaN or invalid dates
      if (typeof endMs !== 'number' || isNaN(endMs)) {
        console.warn('useFeatureAccess: Invalid trialEndDate, returning null');
        return null;
      }
      const days = Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24));
      return Math.max(0, days);
    } catch (err) {
      console.warn('useFeatureAccess: Failed to calculate trial days remaining', err);
      return null;
    }
  }, [isInTrial, data?.trialEndDate]);

  // Refresh is now a no-op - Firestore listener handles all updates automatically
  const refresh = useCallback(async () => {
    // No-op: onSnapshot already keeps data in sync
    // This method is kept for API compatibility with existing components
  }, []);

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
