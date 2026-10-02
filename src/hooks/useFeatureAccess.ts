import { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { MembershipStatus } from '@/types/subscription';

/**
 * Subscription hook that reads from Redux (populated by App.tsx Firestore listener).
 *
 * This avoids the race condition where each component mounting would create its own
 * Firestore listener and briefly return isDemo=true while loading.
 *
 * Redux auth state is populated at app startup and stays in sync via App.tsx.
 */
export const useFeatureAccess = () => {
  const authUser = useSelector((state: RootState) => state.auth.user);
  const userProfile = useSelector((state: RootState) => state.auth.userProfile);
  const isPremiumFromRedux = useSelector((state: RootState) => state.auth.isPremium);
  const authLoading = useSelector((state: RootState) => state.auth.authLoading);
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  // The store decides trial eligibility per Google account / Apple ID: Play only returns
  // offers the account qualifies for, and iOS prices drop the trial when StoreKit says
  // the intro offer is used. Without this, a new app account on a store account that
  // already subscribed would be promised a trial the purchase sheet doesn't offer.
  const storeOffersTrial = useSelector((state: RootState) => state.prices.monthly.trial?.hasTrial === true);
  const profileResolved = !authLoading && (!isAuthenticated || userProfile !== null);

  // Derive all values from Redux state
  // Map 'free', 'canceled', 'past_due' to 'demo' for simplicity
  const rawStatus = userProfile?.membershipStatus || 'demo';
  const membershipStatus: MembershipStatus =
    rawStatus === 'premium' ? 'premium' :
    rawStatus === 'trial' ? 'trial' : 'demo';
  const hasUsedTrial = userProfile?.hasUsedTrial === true;
  const isEmailPasswordUser =
    authUser?.providerId === 'password' || userProfile?.authProvider === 'email';
  const isEmailVerified = !isEmailPasswordUser
    || authUser?.emailVerified === true
    || userProfile?.emailVerified === true;
  const requiresEmailVerification = Boolean(
    isAuthenticated && isEmailPasswordUser && !isEmailVerified
  );

  const isInTrial = membershipStatus === 'trial';
  const isPremium = profileResolved && isPremiumFromRedux;
  const isDemo = profileResolved && !isPremium;
  const canAccessLiveAI = isPremium;
  const canStartTrial = !requiresEmailVerification && !hasUsedTrial && isDemo && storeOffersTrial;

  // Calculate trial days remaining from trialEndDate in Redux
  const trialDaysRemaining = useMemo(() => {
    if (!isInTrial || !userProfile?.trialEndDate) return null;
    try {
      const endMs = userProfile.trialEndDate;
      if (typeof endMs !== 'number' || isNaN(endMs)) return null;
      const days = Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24));
      return Math.max(0, days);
    } catch {
      return null;
    }
  }, [isInTrial, userProfile?.trialEndDate]);

  // Refresh is a no-op - Redux is kept in sync by App.tsx
  const refresh = useCallback(async () => {}, []);

  return {
    loading: authLoading,
    membershipStatus,
    trialDaysRemaining,
    hasUsedTrial,
    canStartTrial,
    canAccessLiveAI,
    isEmailVerified,
    requiresEmailVerification,
    isInTrial,
    isPremium,
    isDemo,
    refresh,
  } as const;
};

export default useFeatureAccess;
