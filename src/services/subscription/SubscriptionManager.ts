import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import type { MembershipStatus, UserSubscriptionDoc } from '@/types/subscription';

export class SubscriptionManager {
  static async checkSubscriptionStatus(): Promise<MembershipStatus> {
    const user = getAuth().currentUser;
    if (!user) return 'demo';

    const snap = await getFirestore().collection('users').doc(user.uid).get();
    const data = snap.data() as Partial<UserSubscriptionDoc> | undefined;
    if (!data) return 'demo';

    const now = Date.now();

    if (data.membershipStatus === 'trial') {
      const trialEndMs = this.toMillis(data.trialEndDate);
      if (trialEndMs && now > trialEndMs) {
        await getFirestore().collection('users').doc(user.uid).set({ membershipStatus: 'demo' }, { merge: true });
        return 'demo';
      }
      return 'trial';
    }

    if (data.membershipStatus === 'premium') {
      const expiryMs = this.toMillis(data.subscriptionExpiryDate);
      if (expiryMs && now > expiryMs && !data.autoRenewing) {
        await getFirestore().collection('users').doc(user.uid).set({ membershipStatus: 'demo' }, { merge: true });
        return 'demo';
      }
      return 'premium';
    }

    return (data.membershipStatus as MembershipStatus) || 'demo';
  }

  static async getTrialDaysRemaining(): Promise<number | null> {
    const user = getAuth().currentUser;
    if (!user) return null;

    const snap = await getFirestore().collection('users').doc(user.uid).get();
    const data = snap.data() as Partial<UserSubscriptionDoc> | undefined;
    if (!data || data.membershipStatus !== 'trial') return null;

    const trialEndMs = this.toMillis(data.trialEndDate);
    if (!trialEndMs) return null;
    const days = Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }

  static onSubscriptionChange(callback: (status: MembershipStatus) => void) {
    const user = getAuth().currentUser;
    if (!user) {
      callback('demo');
      return () => {};
    }
    const ref = getFirestore().collection('users').doc(user.uid);
    const unsub = ref.onSnapshot(async (doc) => {
      const data = doc.data() as Partial<UserSubscriptionDoc> | undefined;
      if (!data) return callback('demo');
      const status = await this.checkSubscriptionStatus();
      callback(status);
    }, (err) => {
      console.error('Subscription onSnapshot error', err);
    });
    return unsub;
  }

  private static toMillis(ts?: FirebaseFirestoreTypes.Timestamp | null): number | undefined {
    return ts ? ts.toMillis() : undefined;
  }
}

export default SubscriptionManager;
