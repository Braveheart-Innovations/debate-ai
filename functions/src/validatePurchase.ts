import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { google } from 'googleapis';

// Initialize Admin if not already
try { admin.app(); } catch { admin.initializeApp(); }

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const PACKAGE_NAME_ANDROID = 'com.braveheartinnovations.debateai';

type ValidateRequest = {
  receipt?: string; // iOS base64 receipt
  platform: 'ios' | 'android';
  productId: string; // subscription id
  purchaseToken?: string; // Android purchase token
};

/**
 * Callable Function: validatePurchase
 * Validates App Store/Play Store receipts and returns authoritative subscription state.
 * Expected: { receipt (iOS), purchaseToken (Android), platform, productId }
 */
export const validatePurchase = functions.https.onCall(async (data: ValidateRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { receipt, platform, productId, purchaseToken } = data;
  if (!platform || !productId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    let expiresAt: Date | null = null;
    let inTrial = false;
    let trialStart: Date | null = null;
    let trialEnd: Date | null = null;
    let autoRenewing = true;

    if (platform === 'ios') {
      if (!receipt) throw new functions.https.HttpsError('invalid-argument', 'Missing iOS receipt');
      const sharedSecret = functions.config()?.apple?.shared_secret as string | undefined;
      if (!sharedSecret) {
        throw new functions.https.HttpsError('failed-precondition', 'Apple shared secret not configured');
      }

      const ios = await validateAppleReceipt(receipt, sharedSecret);
      // Filter to subscription entries matching productId
      const items = (ios.latest_receipt_info || []).filter((it: any) => it.product_id === productId);
      const target = items.length
        ? items.reduce((a: any, b: any) => (parseInt(a.expires_date_ms) > parseInt(b.expires_date_ms) ? a : b))
        : null;
      if (!target) {
        throw new functions.https.HttpsError('not-found', 'No matching subscription found in receipt');
      }
      expiresAt = new Date(parseInt(target.expires_date_ms, 10));
      inTrial = target.is_trial_period === 'true' || target.is_in_intro_offer_period === 'true';
      if (inTrial) {
        // Approximate trial window from purchase to expiry
        trialStart = new Date(parseInt(target.purchase_date_ms, 10));
        trialEnd = new Date(parseInt(target.expires_date_ms, 10));
      }
      // Determine auto-renew from pending_renewal_info
      const pending = ios.pending_renewal_info?.find((p: any) => p.product_id === productId);
      autoRenewing = pending ? pending.auto_renew_status === '1' : true;
    } else {
      // Android validation via Google Play Developer API
      if (!purchaseToken) throw new functions.https.HttpsError('invalid-argument', 'Missing Android purchase token');
      const android = await validateAndroidSubscription(PACKAGE_NAME_ANDROID, productId, purchaseToken);
      if (!android || !android.expiryTimeMillis) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid Android subscription state');
      }
      expiresAt = new Date(parseInt(android.expiryTimeMillis, 10));
      autoRenewing = !!android.autoRenewing;
      // Attempt trial detection via subscriptionsv2 offerTags (requires offers tagged with 'trial')
      try {
        const v2 = await validateAndroidSubscriptionV2(PACKAGE_NAME_ANDROID, productId, purchaseToken);
        const lineItems = (v2?.lineItems || []) as Array<{ offerDetails?: { offerTags?: string[] } }>;
        inTrial = lineItems.some((li) => (li.offerDetails?.offerTags || []).includes('trial'));
      } catch (e) {
        console.warn('subscriptionsv2 trial detection failed', e);
      }
    }

    const isAnnual = productId.includes('annual');

    // Persist authoritative state
    await admin.firestore().collection('users').doc(userId).set(
      {
        membershipStatus: inTrial ? 'trial' : 'premium',
        subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
        trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
        trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
        productId: isAnnual ? 'annual' : 'monthly',
        autoRenewing,
        lastValidated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      valid: true,
      membershipStatus: inTrial ? 'trial' : 'premium',
      expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      autoRenewing,
      productId: isAnnual ? 'annual' : 'monthly',
      hasUsedTrial: inTrial,
    };
  } catch (err) {
    console.error('validatePurchase error', err);
    throw new functions.https.HttpsError('internal', 'Validation failed');
  }
});

async function validateAppleReceipt(receiptData: string, sharedSecret: string) {
  // Try production first
  let response = await axios.post(APPLE_PRODUCTION_URL, {
    'receipt-data': receiptData,
    password: sharedSecret,
    'exclude-old-transactions': true,
  });
  let data = response.data;
  if (data?.status === 21007) {
    // Retry sandbox
    response = await axios.post(APPLE_SANDBOX_URL, {
      'receipt-data': receiptData,
      password: sharedSecret,
      'exclude-old-transactions': true,
    });
    data = response.data;
  }
  if (data?.status !== 0) {
    throw new Error(`Apple receipt invalid: status ${data?.status}`);
  }
  return data;
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

async function validateAndroidSubscriptionV2(packageName: string, productId: string, token: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  google.options({ auth: authClient });
  const publisher = google.androidpublisher('v3');
  const res = await publisher.purchases.subscriptionsv2.get({
    packageName,
    token,
  } as any);
  return res.data as { lineItems?: Array<{ offerDetails?: { offerTags?: string[] } }> };
}
