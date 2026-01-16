import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, doc, getDoc } from '@react-native-firebase/firestore';

/**
 * Minimal subscription utility class.
 *
 * NOTE: Most subscription logic has moved to:
 * - Server: validatePurchase Cloud Function handles all status transitions
 * - Client: useFeatureAccess hook reads directly from Firestore snapshot
 *
 * This class only provides one-time utility checks, NOT continuous monitoring.
 */
export class SubscriptionManager {
  /**
   * One-time check if user has already used their trial.
   * Use this ONLY for pre-purchase validation, not for UI state.
   * For UI state, use the useFeatureAccess hook instead.
   */
  static async hasUserUsedTrial(): Promise<boolean> {
    const user = getAuth().currentUser;
    if (!user) return false;

    const db = getFirestore();
    const snap = await getDoc(doc(collection(db, 'users'), user.uid));
    const data = snap.data() as { hasUsedTrial?: boolean } | undefined;
    return data?.hasUsedTrial === true;
  }
}

export default SubscriptionManager;
