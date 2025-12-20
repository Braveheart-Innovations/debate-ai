import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { google } from 'googleapis';

// Initialize Admin if not already
try { admin.app(); } catch { admin.initializeApp(); }

// Define secret for Apple shared secret (stored in Firebase Secret Manager)
const appleSharedSecret = defineSecret('APPLE_SHARED_SECRET');

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const PACKAGE_NAME_ANDROID = 'com.braveheartinnovations.debateai';

type ValidateRequest = {
  receipt?: string; // iOS base64 receipt
  platform: 'ios' | 'android';
  productId: string; // subscription or product id
  purchaseToken?: string; // Android purchase token
};

// Lifetime product IDs
const LIFETIME_PRODUCT_IDS = [
  'com.braveheartinnovations.debateai.premium.lifetime', // iOS
  'premium_lifetime', // Android
];

/**
 * Callable Function: validatePurchase
 * Validates App Store/Play Store receipts and returns authoritative subscription state.
 * Expected: { receipt (iOS), purchaseToken (Android), platform, productId }
 */
export const validatePurchase = onCall({ secrets: [appleSharedSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const data = request.data as ValidateRequest;
  const { receipt, platform, productId, purchaseToken } = data;
  if (!platform || !productId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const isLifetime = LIFETIME_PRODUCT_IDS.includes(productId);
    let expiresAt: Date | null = null;
    let inTrial = false;
    let trialStart: Date | null = null;
    let trialEnd: Date | null = null;
    let autoRenewing = !isLifetime; // Lifetime never auto-renews

    if (isLifetime) {
      // Handle lifetime (one-time) purchase validation
      if (platform === 'ios') {
        if (!receipt) throw new HttpsError('invalid-argument', 'Missing iOS receipt');
        const sharedSecret = appleSharedSecret.value();
        if (!sharedSecret) {
          throw new HttpsError('failed-precondition', 'Apple shared secret not configured');
        }

        const ios = await validateAppleReceipt(receipt, sharedSecret);
        // For non-consumables, check receipt.in_app array
        const inAppPurchases = ios.receipt?.in_app || [];
        const lifetimePurchase = inAppPurchases.find((item: any) => item.product_id === productId);
        if (!lifetimePurchase) {
          throw new HttpsError('not-found', 'No matching lifetime purchase found in receipt');
        }
        // Lifetime purchases have no expiry
        expiresAt = null;
      } else {
        // Android: Validate one-time product purchase
        if (!purchaseToken) throw new HttpsError('invalid-argument', 'Missing Android purchase token');
        const android = await validateAndroidProduct(PACKAGE_NAME_ANDROID, productId, purchaseToken);
        if (!android || android.purchaseState !== 0) {
          throw new HttpsError('invalid-argument', 'Invalid Android product purchase state');
        }
        // Lifetime purchases have no expiry
        expiresAt = null;
      }
    } else {
      // Handle subscription validation (existing logic)
      if (platform === 'ios') {
        if (!receipt) throw new HttpsError('invalid-argument', 'Missing iOS receipt');
        const sharedSecret = appleSharedSecret.value();
        if (!sharedSecret) {
          throw new HttpsError('failed-precondition', 'Apple shared secret not configured');
        }

        const ios = await validateAppleReceipt(receipt, sharedSecret);
        // Filter to subscription entries matching productId
        const items = (ios.latest_receipt_info || []).filter((it: any) => it.product_id === productId);
        const target = items.length
          ? items.reduce((a: any, b: any) => (parseInt(a.expires_date_ms) > parseInt(b.expires_date_ms) ? a : b))
          : null;
        if (!target) {
          throw new HttpsError('not-found', 'No matching subscription found in receipt');
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
        if (!purchaseToken) throw new HttpsError('invalid-argument', 'Missing Android purchase token');
        const android = await validateAndroidSubscription(PACKAGE_NAME_ANDROID, productId, purchaseToken);
        if (!android || !android.expiryTimeMillis) {
          throw new HttpsError('invalid-argument', 'Invalid Android subscription state');
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
    }

    // Determine product type for storage
    let resolvedProductId: 'monthly' | 'annual' | 'lifetime' = 'monthly';
    if (isLifetime) {
      resolvedProductId = 'lifetime';
    } else if (productId.includes('annual')) {
      resolvedProductId = 'annual';
    }

    // Persist authoritative state
    // If starting a trial, mark hasUsedTrial = true so they can't retry later
    const updateData: Record<string, any> = {
      membershipStatus: inTrial ? 'trial' : 'premium',
      subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      productId: resolvedProductId,
      autoRenewing,
      isLifetime,
      lastValidated: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Mark hasUsedTrial = true if they're starting a trial
    if (inTrial) {
      updateData.hasUsedTrial = true;
    }

    await admin.firestore().collection('users').doc(userId).set(updateData, { merge: true });

    return {
      valid: true,
      membershipStatus: inTrial ? 'trial' : 'premium',
      expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      autoRenewing,
      productId: resolvedProductId,
      hasUsedTrial: inTrial,
      isLifetime,
    };
  } catch (err) {
    console.error('validatePurchase error', err);
    throw new HttpsError('internal', 'Validation failed');
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
  google.options({ auth: authClient as any });
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
  google.options({ auth: authClient as any });
  const publisher = google.androidpublisher('v3');
  const res = await publisher.purchases.subscriptionsv2.get({
    packageName,
    token,
  } as any);
  return res.data as { lineItems?: Array<{ offerDetails?: { offerTags?: string[] } }> };
}

async function validateAndroidProduct(packageName: string, productId: string, token: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  google.options({ auth: authClient as any });
  const publisher = google.androidpublisher('v3');
  const res = await publisher.purchases.products.get({
    packageName,
    productId,
    token,
  });
  // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
  return res.data as { purchaseState?: number; consumptionState?: number; purchaseTimeMillis?: string };
}
