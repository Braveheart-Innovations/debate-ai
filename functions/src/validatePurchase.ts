import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import axios from 'axios';
// The per-API package (~3 MB loaded) instead of `googleapis` (~84 MB): every
// function loads the whole index, so the umbrella package pushed 256 MiB
// functions over their memory limit.
import { androidpublisher, androidpublisher_v3, auth as googleAuth } from '@googleapis/androidpublisher';
import {
  getAndroidPurchaseOwnershipDecision,
  sha256,
  type AndroidPurchaseOwnershipInput,
} from './purchaseOwnership';

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

type AndroidSubscriptionState = {
  expiryTimeMillis?: string;
  startTimeMillis?: string;
  autoRenewing?: boolean;
  paymentState?: number;
  trialSignal?: 'offer_phase' | 'none';
  productId?: string;
  basePlanId?: string;
  linkedPurchaseToken?: string | null;
  obfuscatedExternalAccountId?: string | null;
  obfuscatedExternalProfileId?: string | null;
};

type AndroidProductState = {
  purchaseState?: number;
  productId?: string;
  obfuscatedExternalAccountId?: string | null;
  obfuscatedExternalProfileId?: string | null;
};

type ErrorSummary = {
  name?: string;
  message?: string;
  code?: unknown;
  status?: number;
  googleStatus?: string;
  googleMessage?: string;
};

type CallableAuthToken = {
  email_verified?: boolean;
  firebase?: {
    sign_in_provider?: string;
  };
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
  return sha256(email.toLowerCase().trim());
};

const getTimestampMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (typeof value === 'object') {
    const timestampLike = value as {
      toMillis?: () => number;
      toDate?: () => Date;
    };
    if (typeof timestampLike.toMillis === 'function') return timestampLike.toMillis();
    if (typeof timestampLike.toDate === 'function') return timestampLike.toDate().getTime();
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Check if user has already used a trial (survives account deletion)
 * Returns: { used: boolean, sameAccount: boolean, firstTrialMs: number | null }
 * - used: true if they've used a trial before (by UID or email)
 * - sameAccount: true if the match was by UID (re-validating current trial is OK)
 */
const checkTrialHistory = async (
  uid: string,
  email: string | undefined
): Promise<{ used: boolean; sameAccount: boolean; firstTrialMs: number | null }> => {
  const firestore = admin.firestore();

  // Check by UID first - same account re-validating
  const uidDoc = await firestore.collection('trialHistory').doc(uid).get();
  if (uidDoc.exists) {
    return {
      used: true,
      sameAccount: true,
      firstTrialMs: getTimestampMillis(uidDoc.data()?.firstTrialDate),
    };
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
      return {
        used: true,
        sameAccount: false,
        firstTrialMs: getTimestampMillis(emailQuery.docs[0].data()?.firstTrialDate),
      };
    }
  }

  return { used: false, sameAccount: false, firstTrialMs: null };
};

const buildTrialUsageData = (uid: string, email: string | undefined): Record<string, unknown> => ({
  uid,
  emailHash: email ? hashEmail(email) : null,
  firstTrialDate: admin.firestore.FieldValue.serverTimestamp(),
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

const userHasUnexpiredTrialWindow = (userData: admin.firestore.DocumentData | undefined): boolean => {
  const trialEndMs = getTimestampMillis(userData?.trialEndDate) ?? getTimestampMillis(userData?.trialEndsAt);
  return trialEndMs !== null && trialEndMs > Date.now();
};

const userHasActiveTrial = (userData: admin.firestore.DocumentData | undefined): boolean => {
  return userData?.membershipStatus === 'trial' && userHasUnexpiredTrialWindow(userData);
};

const emailPasswordUserNeedsVerificationForTrial = (token: CallableAuthToken | undefined): boolean => {
  return token?.firebase?.sign_in_provider === 'password' && token.email_verified !== true;
};

const toStatusCode = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const summarizeError = (error: unknown): ErrorSummary => {
  const err = error as {
    name?: string;
    message?: string;
    code?: unknown;
    status?: unknown;
    response?: {
      status?: unknown;
      data?: {
        error?: {
          status?: string;
          message?: string;
        };
      };
    };
  };

  return {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    status: toStatusCode(err?.status) ?? toStatusCode(err?.response?.status),
    googleStatus: err?.response?.data?.error?.status,
    googleMessage: err?.response?.data?.error?.message,
  };
};

const isGoogleInvalidValueError = (summary: ErrorSummary): boolean => {
  if (summary.status !== 400) return false;
  return summary.message === 'Invalid Value'
    || summary.googleMessage === 'Invalid Value'
    || summary.googleStatus === 'INVALID_ARGUMENT';
};

async function getAndroidPurchaseTokenOwnerStatus(
  userId: string,
  purchaseTokens: Array<string | null | undefined>
): Promise<{ hasCurrentUserOwner: boolean; conflictingUserId: string | null }> {
  const uniqueTokens = Array.from(new Set(
    purchaseTokens.filter((token): token is string => Boolean(token))
  ));
  if (uniqueTokens.length === 0) {
    return { hasCurrentUserOwner: false, conflictingUserId: null };
  }

  const firestore = admin.firestore();
  let hasCurrentUserOwner = false;
  const fields = ['androidPurchaseToken', 'lastReceiptData'];

  for (const token of uniqueTokens) {
    for (const field of fields) {
      const snapshot = await firestore
        .collection('users')
        .where(field, '==', token)
        .limit(3)
        .get();

      for (const doc of snapshot.docs) {
        if (doc.id === userId) {
          hasCurrentUserOwner = true;
        } else {
          return { hasCurrentUserOwner, conflictingUserId: doc.id };
        }
      }
    }
  }

  return { hasCurrentUserOwner, conflictingUserId: null };
}

async function assertAndroidPurchaseBelongsToUser(
  userId: string,
  purchaseToken: string | undefined,
  purchase: AndroidPurchaseOwnershipInput & { linkedPurchaseToken?: string | null }
): Promise<void> {
  const ownership = getAndroidPurchaseOwnershipDecision(userId, purchase);
  if (ownership.hasAccountIdentifier && !ownership.matchesCurrentUser) {
    throw new HttpsError(
      'failed-precondition',
      'This Google Play purchase is linked to a different app account. Please switch to the correct Play Store account and try again.'
    );
  }

  const tokenOwner = await getAndroidPurchaseTokenOwnerStatus(userId, [
    purchaseToken,
    purchase.linkedPurchaseToken,
  ]);
  if (tokenOwner.conflictingUserId) {
    throw new HttpsError(
      'failed-precondition',
      'This Google Play purchase has already been restored to a different app account.'
    );
  }

  if (!ownership.hasAccountIdentifier && !tokenOwner.hasCurrentUserOwner) {
    throw new HttpsError(
      'failed-precondition',
      'This Google Play purchase cannot be verified for the current app account. Please sign in with the original app account or contact support.'
    );
  }
}

/**
 * iOS replay/ownership binding — the App Store analogue of
 * assertAndroidPurchaseBelongsToUser. Without this, one paid (or sandbox)
 * Apple receipt could be replayed to grant premium on unlimited accounts.
 * A subscription's original_transaction_id is stable across renewals, so we
 * bind it to the first Firebase account that validates it and reject any other
 * account that later presents the same transaction.
 */
async function assertAppleReceiptBelongsToUser(
  userId: string,
  originalTransactionId: string | null | undefined
): Promise<void> {
  if (!originalTransactionId) return;
  const snapshot = await admin.firestore()
    .collection('users')
    .where('appleOriginalTransactionId', '==', originalTransactionId)
    .limit(3)
    .get();
  for (const doc of snapshot.docs) {
    if (doc.id !== userId) {
      throw new HttpsError(
        'failed-precondition',
        'This App Store purchase has already been restored to a different app account.'
      );
    }
  }
}

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
    let appleOriginalTransactionId: string | null = null;

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
        // Bind this receipt to the current account to block replay/sharing.
        appleOriginalTransactionId = lifetimePurchase.original_transaction_id
          ?? ios.receipt?.original_transaction_id ?? null;
        await assertAppleReceiptBelongsToUser(userId, appleOriginalTransactionId);
        // Lifetime purchases have no expiry
        expiresAt = null;
      } else {
        // Android: Validate one-time product purchase
        if (!purchaseToken) throw new HttpsError('invalid-argument', 'Missing Android purchase token');
        const android = await validateAndroidProduct(PACKAGE_NAME_ANDROID, productId, purchaseToken);
        if (!android || android.purchaseState !== 0 || android.productId !== productId) {
          throw new HttpsError('invalid-argument', 'Invalid Android product purchase state');
        }
        await assertAndroidPurchaseBelongsToUser(userId, purchaseToken, android);
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
        // Bind this receipt to the current account to block replay/sharing.
        appleOriginalTransactionId = target.original_transaction_id
          ?? ios.latest_receipt_info?.[0]?.original_transaction_id ?? null;
        await assertAppleReceiptBelongsToUser(userId, appleOriginalTransactionId);
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
        if (android.productId && android.productId !== productId) {
          throw new HttpsError('not-found', 'No matching Android subscription found');
        }
        await assertAndroidPurchaseBelongsToUser(userId, purchaseToken, android);
        expiresAt = new Date(parseInt(android.expiryTimeMillis, 10));
        autoRenewing = !!android.autoRenewing;
        // Trial detection must come from Google's explicit current offer phase.
        // Do not infer trial from short entitlement windows; Google test
        // renewals and paid periods can also be short.
        inTrial = android.paymentState === 2;
        if (inTrial) {
          trialStart = android.startTimeMillis
            ? new Date(parseInt(android.startTimeMillis, 10))
            : new Date();
          trialEnd = expiresAt;
        }
        console.log(
          `Android subscription state for user ${userId}: productId=${productId}, ` +
          `trialSignal=${android.trialSignal ?? 'none'}, inTrial=${inTrial}, ` +
          `start=${android.startTimeMillis ?? 'none'}, expiry=${android.expiryTimeMillis}`
        );
      }
    }

    // Determine product type for storage
    let resolvedProductId: 'monthly' | 'annual' | 'lifetime' = 'monthly';
    if (isLifetime) {
      resolvedProductId = 'lifetime';
    } else if (productId.includes('annual')) {
      resolvedProductId = 'annual';
    }

    const isActiveEntitlement = isLifetime || !expiresAt || expiresAt.getTime() > Date.now();
    const isActiveTrial = isActiveEntitlement && inTrial;

    if (isActiveTrial && emailPasswordUserNeedsVerificationForTrial(request.auth.token as CallableAuthToken)) {
      throw new HttpsError(
        'failed-precondition',
        'Verify your email before starting a free trial.'
      );
    }

    // Persist authoritative state
    // If starting a trial, mark hasUsedTrial = true so they can't retry later
    const updateData: Record<string, any> = {
      membershipStatus: isActiveEntitlement ? (isActiveTrial ? 'trial' : 'premium') : 'demo',
      isPremium: isActiveEntitlement, // Both active trial and paid users have premium access
      subscriptionSource: platform === 'ios' ? 'apple_iap' : 'google_play',
      subscriptionId: productId,
      subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      productId: resolvedProductId,
      autoRenewing,
      isLifetime,
      lastValidated: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (platform === 'ios') {
      updateData.appAccountToken = sha256(userId);
      updateData.lastReceiptData = receipt ?? null;
      updateData.appleOriginalTransactionId = appleOriginalTransactionId;
    }

    if (platform === 'android') {
      updateData.androidPurchaseToken = purchaseToken ?? null;
      updateData.lastReceiptData = purchaseToken ?? null;
    }

    // Check and record trial usage to prevent abuse after account deletion
    let shouldRecordTrialUsage = false;
    let trialCheck: Awaited<ReturnType<typeof checkTrialHistory>> | null = null;
    const getTrialCheck = async () => {
      if (!trialCheck) {
        trialCheck = await checkTrialHistory(userId, userEmail);
      }
      return trialCheck;
    };

    if (inTrial) {
      // Check persistent trial history (survives account deletion)
      const trialCheck = await getTrialCheck();

      const hasPriorTrialOnCurrentUser = userData?.hasUsedTrial === true;
      const hasPriorTrial = trialCheck.used || hasPriorTrialOnCurrentUser;
      const isSameAccountTrial = trialCheck.sameAccount || hasPriorTrialOnCurrentUser;

      if (hasPriorTrial && !isSameAccountTrial) {
        // FRAUD ATTEMPT: Different account but same email - they already used a trial
        // Block them completely - set to demo and reject
        console.log(`User ${userId} attempted trial fraud (email already used trial) - blocking`);
        throw new HttpsError(
          'failed-precondition',
          'You have already used your free trial. Please subscribe to continue using premium features.'
        );
      } else if (hasPriorTrial && isSameAccountTrial) {
        // Same Firebase account with a store-confirmed active trial. Google is
        // authoritative for the current token phase; keep trial state until the
        // store reports paid or expired instead of rejecting the purchase.
        const statusLabel = userHasActiveTrial(userData) ? 'existing' : 'store-confirmed';
        console.log(`User ${userId} validating ${statusLabel} trial - keeping trial status`);
        updateData.hasUsedTrial = true;
      } else {
        // First time using trial - record it for future tracking
        console.log(`User ${userId} starting first trial - recording usage`);
        shouldRecordTrialUsage = true;
        updateData.hasUsedTrial = true;
      }
    } else if (userData?.hasUsedTrial === true || (await getTrialCheck()).used) {
      updateData.hasUsedTrial = true;
    }

    const firestore = admin.firestore();
    const userRef = firestore.collection('users').doc(userId);
    if (shouldRecordTrialUsage) {
      const batch = firestore.batch();
      batch.set(userRef, updateData, { merge: true });
      batch.set(firestore.collection('trialHistory').doc(userId), buildTrialUsageData(userId, userEmail), { merge: true });
      await batch.commit();
    } else {
      await userRef.set(updateData, { merge: true });
    }

    return {
      valid: isActiveEntitlement,
      membershipStatus: updateData.membershipStatus, // Use the actual status we saved
      expiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      trialStartDate: trialStart ? admin.firestore.Timestamp.fromDate(trialStart) : null,
      trialEndDate: trialEnd ? admin.firestore.Timestamp.fromDate(trialEnd) : null,
      autoRenewing,
      productId: resolvedProductId,
      hasUsedTrial: updateData.hasUsedTrial ?? userData?.hasUsedTrial ?? false,
      isLifetime,
    };
  } catch (err) {
    const errorSummary = summarizeError(err);
    console.error('validatePurchase error', errorSummary);
    // Re-throw HttpsError as-is (e.g., "Trial already used" message)
    if (err instanceof HttpsError) {
      throw err;
    }
    if (platform === 'android' && isGoogleInvalidValueError(errorSummary)) {
      throw new HttpsError(
        'invalid-argument',
        'Google Play rejected this purchase token. Please restore purchases or contact support if you were charged.'
      );
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
  // Sandbox receipts return status 0 from the sandbox endpoint. Accepting them
  // in production lets anyone mint free "purchases" from a sandbox Apple ID.
  // Gated OFF by default: Apple's App Review validates real submissions against
  // the SANDBOX environment, so hard-rejecting would fail review. Set
  // APPLE_REJECT_SANDBOX=1 in the deploy env once the app is live to close it.
  if (data.environment === 'Sandbox' && process.env.APPLE_REJECT_SANDBOX === '1') {
    throw new HttpsError(
      'failed-precondition',
      'Sandbox App Store purchases are not accepted in production.'
    );
  }
  return data;
}

function getAndroidPublisherClient(): Promise<androidpublisher_v3.Androidpublisher> {
  const auth = new googleAuth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return Promise.resolve(androidpublisher({ version: 'v3', auth }));
}

function parseAndroidTimestampMillis(value?: string | null): string | undefined {
  if (!value) return undefined;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? String(millis) : undefined;
}

function isValidAndroidSubscriptionState(state?: string | null): boolean {
  return state === 'SUBSCRIPTION_STATE_ACTIVE'
    || state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
    || state === 'SUBSCRIPTION_STATE_CANCELED';
}

function getLatestSubscriptionLineItem(
  lineItems: androidpublisher_v3.Schema$SubscriptionPurchaseLineItem[] | undefined,
  productId: string
): androidpublisher_v3.Schema$SubscriptionPurchaseLineItem | undefined {
  const matching = (lineItems ?? []).filter((item) => item.productId === productId);
  const candidates = matching.length > 0 ? matching : (lineItems ?? []);
  return candidates.reduce<androidpublisher_v3.Schema$SubscriptionPurchaseLineItem | undefined>((latest, item) => {
    if (!latest) return item;
    const latestExpiry = Date.parse(latest.expiryTime ?? '');
    const itemExpiry = Date.parse(item.expiryTime ?? '');
    return itemExpiry > latestExpiry ? item : latest;
  }, undefined);
}

async function validateAndroidSubscription(
  packageName: string,
  productId: string,
  token: string
): Promise<AndroidSubscriptionState> {
  const publisher = await getAndroidPublisherClient();
  const res = await publisher.purchases.subscriptionsv2.get({
    packageName,
    token,
  } as any);
  const purchase = res.data as androidpublisher_v3.Schema$SubscriptionPurchaseV2;
  const lineItem = getLatestSubscriptionLineItem(purchase.lineItems, productId);

  if (!isValidAndroidSubscriptionState(purchase.subscriptionState) || !lineItem?.expiryTime) {
    return {};
  }

  const expiryTimeMillis = parseAndroidTimestampMillis(lineItem.expiryTime);
  const startTimeMillis = parseAndroidTimestampMillis(purchase.startTime);
  const hasFreeTrialPhase = lineItem.offerPhase?.freeTrial !== undefined;

  return {
    expiryTimeMillis,
    startTimeMillis,
    autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    paymentState: hasFreeTrialPhase ? 2 : 1,
    trialSignal: hasFreeTrialPhase ? 'offer_phase' : 'none',
    productId: lineItem.productId ?? undefined,
    basePlanId: lineItem.offerDetails?.basePlanId ?? undefined,
    linkedPurchaseToken: purchase.linkedPurchaseToken ?? null,
    obfuscatedExternalAccountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    obfuscatedExternalProfileId: purchase.externalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
  };
}

async function validateAndroidProduct(
  packageName: string,
  productId: string,
  token: string
): Promise<AndroidProductState> {
  const publisher = await getAndroidPublisherClient();

  const v2 = await publisher.purchases.productsv2.getproductpurchasev2({
    packageName,
    token,
  });
  const data = v2.data as androidpublisher_v3.Schema$ProductPurchaseV2;
  const lineItem = data.productLineItem?.find((item) => item.productId === productId);

  return {
    // Legacy code expects 0 = purchased.
    purchaseState: data.purchaseStateContext?.purchaseState === 'PURCHASED' ? 0 : 1,
    productId: lineItem?.productId ?? data.productLineItem?.[0]?.productId ?? undefined,
    obfuscatedExternalAccountId: data.obfuscatedExternalAccountId ?? null,
    obfuscatedExternalProfileId: data.obfuscatedExternalProfileId ?? null,
  };
}
