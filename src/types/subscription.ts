// Subscription types for the three-tier model

import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type MembershipStatus = 'demo' | 'trial' | 'premium';

export interface UserSubscriptionDoc {
  uid: string;
  membershipStatus: MembershipStatus;
  productId?: 'monthly' | 'annual';
  subscriptionId?: string;
  paymentPlatform?: 'ios' | 'android';
  autoRenewing?: boolean;
  hasUsedTrial?: boolean;
  androidPurchaseToken?: string | null;
  appAccountToken?: string | null;
  trialStartDate?: FirebaseFirestoreTypes.Timestamp | null;
  trialEndDate?: FirebaseFirestoreTypes.Timestamp | null;
  subscriptionExpiryDate?: FirebaseFirestoreTypes.Timestamp | null;
}
