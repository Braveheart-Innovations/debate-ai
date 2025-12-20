"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePurchase = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const googleapis_1 = require("googleapis");
// Initialize Admin if not already
try {
    admin.app();
}
catch {
    admin.initializeApp();
}
// Define secret for Apple shared secret (stored in Firebase Secret Manager)
const appleSharedSecret = (0, params_1.defineSecret)('APPLE_SHARED_SECRET');
const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const PACKAGE_NAME_ANDROID = 'com.braveheartinnovations.debateai';
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
exports.validatePurchase = (0, https_1.onCall)({ secrets: [appleSharedSecret] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = request.auth.uid;
    const data = request.data;
    const { receipt, platform, productId, purchaseToken } = data;
    if (!platform || !productId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields');
    }
    try {
        const isLifetime = LIFETIME_PRODUCT_IDS.includes(productId);
        let expiresAt = null;
        let inTrial = false;
        let trialStart = null;
        let trialEnd = null;
        let autoRenewing = !isLifetime; // Lifetime never auto-renews
        if (isLifetime) {
            // Handle lifetime (one-time) purchase validation
            if (platform === 'ios') {
                if (!receipt)
                    throw new https_1.HttpsError('invalid-argument', 'Missing iOS receipt');
                const sharedSecret = appleSharedSecret.value();
                if (!sharedSecret) {
                    throw new https_1.HttpsError('failed-precondition', 'Apple shared secret not configured');
                }
                const ios = await validateAppleReceipt(receipt, sharedSecret);
                // For non-consumables, check receipt.in_app array
                const inAppPurchases = ios.receipt?.in_app || [];
                const lifetimePurchase = inAppPurchases.find((item) => item.product_id === productId);
                if (!lifetimePurchase) {
                    throw new https_1.HttpsError('not-found', 'No matching lifetime purchase found in receipt');
                }
                // Lifetime purchases have no expiry
                expiresAt = null;
            }
            else {
                // Android: Validate one-time product purchase
                if (!purchaseToken)
                    throw new https_1.HttpsError('invalid-argument', 'Missing Android purchase token');
                const android = await validateAndroidProduct(PACKAGE_NAME_ANDROID, productId, purchaseToken);
                if (!android || android.purchaseState !== 0) {
                    throw new https_1.HttpsError('invalid-argument', 'Invalid Android product purchase state');
                }
                // Lifetime purchases have no expiry
                expiresAt = null;
            }
        }
        else {
            // Handle subscription validation (existing logic)
            if (platform === 'ios') {
                if (!receipt)
                    throw new https_1.HttpsError('invalid-argument', 'Missing iOS receipt');
                const sharedSecret = appleSharedSecret.value();
                if (!sharedSecret) {
                    throw new https_1.HttpsError('failed-precondition', 'Apple shared secret not configured');
                }
                const ios = await validateAppleReceipt(receipt, sharedSecret);
                // Filter to subscription entries matching productId
                const items = (ios.latest_receipt_info || []).filter((it) => it.product_id === productId);
                const target = items.length
                    ? items.reduce((a, b) => (parseInt(a.expires_date_ms) > parseInt(b.expires_date_ms) ? a : b))
                    : null;
                if (!target) {
                    throw new https_1.HttpsError('not-found', 'No matching subscription found in receipt');
                }
                expiresAt = new Date(parseInt(target.expires_date_ms, 10));
                inTrial = target.is_trial_period === 'true' || target.is_in_intro_offer_period === 'true';
                if (inTrial) {
                    // Approximate trial window from purchase to expiry
                    trialStart = new Date(parseInt(target.purchase_date_ms, 10));
                    trialEnd = new Date(parseInt(target.expires_date_ms, 10));
                }
                // Determine auto-renew from pending_renewal_info
                const pending = ios.pending_renewal_info?.find((p) => p.product_id === productId);
                autoRenewing = pending ? pending.auto_renew_status === '1' : true;
            }
            else {
                // Android validation via Google Play Developer API
                if (!purchaseToken)
                    throw new https_1.HttpsError('invalid-argument', 'Missing Android purchase token');
                const android = await validateAndroidSubscription(PACKAGE_NAME_ANDROID, productId, purchaseToken);
                if (!android || !android.expiryTimeMillis) {
                    throw new https_1.HttpsError('invalid-argument', 'Invalid Android subscription state');
                }
                expiresAt = new Date(parseInt(android.expiryTimeMillis, 10));
                autoRenewing = !!android.autoRenewing;
                // Attempt trial detection via subscriptionsv2 offerTags (requires offers tagged with 'trial')
                try {
                    const v2 = await validateAndroidSubscriptionV2(PACKAGE_NAME_ANDROID, productId, purchaseToken);
                    const lineItems = (v2?.lineItems || []);
                    inTrial = lineItems.some((li) => (li.offerDetails?.offerTags || []).includes('trial'));
                }
                catch (e) {
                    console.warn('subscriptionsv2 trial detection failed', e);
                }
            }
        }
        // Determine product type for storage
        let resolvedProductId = 'monthly';
        if (isLifetime) {
            resolvedProductId = 'lifetime';
        }
        else if (productId.includes('annual')) {
            resolvedProductId = 'annual';
        }
        // Persist authoritative state
        // If starting a trial, mark hasUsedTrial = true so they can't retry later
        const updateData = {
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
    }
    catch (err) {
        console.error('validatePurchase error', err);
        throw new https_1.HttpsError('internal', 'Validation failed');
    }
});
async function validateAppleReceipt(receiptData, sharedSecret) {
    // Try production first
    let response = await axios_1.default.post(APPLE_PRODUCTION_URL, {
        'receipt-data': receiptData,
        password: sharedSecret,
        'exclude-old-transactions': true,
    });
    let data = response.data;
    if (data?.status === 21007) {
        // Retry sandbox
        response = await axios_1.default.post(APPLE_SANDBOX_URL, {
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
async function validateAndroidSubscription(packageName, subscriptionId, token) {
    const auth = new googleapis_1.google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const authClient = await auth.getClient();
    googleapis_1.google.options({ auth: authClient });
    const publisher = googleapis_1.google.androidpublisher('v3');
    const res = await publisher.purchases.subscriptions.get({
        packageName,
        subscriptionId,
        token,
    });
    return res.data;
}
async function validateAndroidSubscriptionV2(packageName, productId, token) {
    const auth = new googleapis_1.google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const authClient = await auth.getClient();
    googleapis_1.google.options({ auth: authClient });
    const publisher = googleapis_1.google.androidpublisher('v3');
    const res = await publisher.purchases.subscriptionsv2.get({
        packageName,
        token,
    });
    return res.data;
}
async function validateAndroidProduct(packageName, productId, token) {
    const auth = new googleapis_1.google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const authClient = await auth.getClient();
    googleapis_1.google.options({ auth: authClient });
    const publisher = googleapis_1.google.androidpublisher('v3');
    const res = await publisher.purchases.products.get({
        packageName,
        productId,
        token,
    });
    // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
    return res.data;
}
