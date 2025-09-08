import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';

const PACKAGE_NAME_ANDROID = 'com.braveheartinnovations.debateai';

export const handlePlayStoreNotification = functions.pubsub
  .topic('play-store-notifications')
  .onPublish(async (message) => {
    try {
      const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
      const subtype = data?.subscriptionNotification?.notificationType;
      const purchaseToken = data?.subscriptionNotification?.purchaseToken as string | undefined;
      const subscriptionId = data?.subscriptionNotification?.subscriptionId as string | undefined;
      if (!purchaseToken || !subscriptionId) return;

      const userId = await findUserByPurchaseToken(purchaseToken);
      if (!userId) {
        console.warn('RTDN: No user found for token', purchaseToken);
        return;
      }

      // Refresh status via Google API
      const state = await validateAndroidSubscription(PACKAGE_NAME_ANDROID, subscriptionId, purchaseToken);
      const expiresAt = state?.expiryTimeMillis ? new Date(parseInt(state.expiryTimeMillis, 10)) : null;
      const autoRenewing = !!state?.autoRenewing;

      // Update user doc
      await admin.firestore().collection('users').doc(userId).set({
        membershipStatus: expiresAt && expiresAt.getTime() > Date.now() ? 'premium' : 'demo',
        subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
        autoRenewing,
        productId: subscriptionId.includes('annual') ? 'annual' : 'monthly',
        lastValidated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('handlePlayStoreNotification error', e);
    }
  });

async function findUserByPurchaseToken(token: string): Promise<string | null> {
  const snap = await admin.firestore()
    .collection('users')
    .where('androidPurchaseToken', '==', token)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

async function validateAndroidSubscription(packageName: string, subscriptionId: string, token: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  google.options({ auth: authClient });
  const publisher = google.androidpublisher('v3');
  const res = await publisher.purchases.subscriptions.get({
    packageName,
    subscriptionId,
    token,
  });
  return res.data as { expiryTimeMillis?: string; autoRenewing?: boolean };
}

