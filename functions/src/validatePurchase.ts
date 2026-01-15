import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
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
  'com.braveheartinnovations.debateai.premium.lifetime.v2', // iOS
  'premium_lifetime', // Android
];

/**
 * Hash email for privacy-preserving trial tracking
 */
const hashEmail = (email: string): string => {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
};

/**
 * Check if user has already used a trial (survives account deletion)
 * Returns: { used: boolean, sameAccount: boolean }
 * - used: true if they've used a trial before (by UID or email)
 * - sameAccount: true if the match was by UID (re-validating current trial is OK)
 */
const checkTrialHistory = async (uid: string, email: string | undefined): Promise<{ used: boolean; sameAccount: boolean }> => {
  const firestore = admin.firestore();

  // Check by UID first - same account re-validating
  const uidDoc = await firestore.collection('trialHistory').doc(uid).get();
  if (uidDoc.exists) {
    return { used: true, sameAccount: true };
  }

  // Check by email hash - different account, potential fraud
  if (email) {
    const emailHash = hashEmail(email);
    const emailQuery = await firestore
      .collection('trialHistory')
      .where('emailHash', '==', emailHash)
      .limit(1)
      .get();
    if (!emailQuery.empty) {
      return { used: true, sameAccount: false };
    }
  }

  return { used: false, sameAccount: false };
};

/**
 * Record trial usage to prevent future abuse after account deletion
 */
const recordTrialUsage = async (uid: string, email: string | undefined): Promise<void> => {
  const firestore = admin.firestore();
  await firestore.collection('trialHistory').doc(uid).set({
    uid,
    emailHash: email ? hashEmail(email) : null,
    firstTrialDate: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

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
  const userEmail = request.auth.token?.email;
  const data = request.data as ValidateRequest;
  const { receipt, platform, productId, purchaseToken } = data;
  if (!platform || !productId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  // ALWAYS validate receipt with Apple/Google - no caching
  // Caching causes bugs: trial->premium conversion missed, cancellations missed
  // Only exception: lifetime purchases (one-time, never expire)
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (userData?.isLifetime === true) {
    console.log(`User ${userId} is lifetime - returning cached state`);
    return {
      valid: true,
      membershipStatus: 'premium',
      expiryDate: null,
      trialStartDate: userData.trialStartDate || null,
      trialEndDate: userData.trialEndDate || null,
      autoRenewing: false,
      productId: 'lifetime',
      hasUsedTrial: userData.hasUsedTrial ?? false,
      isLifetime: true,
    };
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
        // Trial detection via paymentState (2 = Free trial)
        // This is more reliable than offerTags which indicates offer TYPE, not user's current state
        inTrial = android.paymentState === 2;
        if (inTrial) {
          trialStart = android.startTimeMillis
            ? new Date(parseInt(android.startTimeMillis, 10))
            : new Date();
          trialEnd = expiresAt;
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
      isPremium: true, // Both trial and premium users have premium access
      subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      productId: resolvedProductId,
      autoRenewing,
      isLifetime,
      lastValidated: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Check and record trial usage to prevent abuse after account deletion
    if (inTrial) {
      // Check persistent trial history (survives account deletion)
      const trialCheck = await checkTrialHistory(userId, userEmail);

      if (trialCheck.used && !trialCheck.sameAccount) {
        // FRAUD ATTEMPT: Different account but same email - they already used a trial
        // Block them completely - set to demo and reject
        console.log(`User ${userId} attempted trial fraud (email already used trial) - blocking`);
        throw new HttpsError(
          'failed-precondition',
          'You have already used your free trial. Please subscribe to continue using premium features.'
        );
      } else if (trialCheck.used && trialCheck.sameAccount) {
        // Same account re-validating their current trial - this is fine
        // Keep them on trial status (already set in updateData)
        console.log(`User ${userId} re-validating existing trial - keeping trial status`);
        updateData.hasUsedTrial = true;
      } else {
        // First time using trial - record it for future tracking
        console.log(`User ${userId} starting first trial - recording usage`);
        await recordTrialUsage(userId, userEmail);
        updateData.hasUsedTrial = true;
      }
    }

    await admin.firestore().collection('users').doc(userId).set(updateData, { merge: true });

    return {
      valid: true,
      membershipStatus: updateData.membershipStatus, // Use the actual status we saved
      expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      autoRenewing,
      productId: resolvedProductId,
      hasUsedTrial: updateData.hasUsedTrial ?? false,
      isLifetime,
    };
  } catch (err) {
    console.error('validatePurchase error', err);
    // Re-throw HttpsError as-is (e.g., "Trial already used" message)
    if (err instanceof HttpsError) {
      throw err;
    }
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
  // paymentState: 0 = Payment pending, 1 = Payment received, 2 = Free trial, 3 = Pending deferred upgrade/downgrade
  return res.data as { expiryTimeMillis?: string; startTimeMillis?: string; autoRenewing?: boolean; paymentState?: number };
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
