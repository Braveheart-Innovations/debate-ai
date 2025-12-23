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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePlayStoreNotification = void 0;
const pubsub_1 = require("firebase-functions/v2/pubsub");
const admin = __importStar(require("firebase-admin"));
const googleapis_1 = require("googleapis");
const PACKAGE_NAME_ANDROID = 'com.braveheartinnovations.debateai';
exports.handlePlayStoreNotification = (0, pubsub_1.onMessagePublished)('play-store-notifications', async (event) => {
    const message = event.data;
    try {
        const data = JSON.parse(Buffer.from(message.message.data || '', 'base64').toString());
        const subtype = data?.subscriptionNotification?.notificationType;
        const purchaseToken = data?.subscriptionNotification?.purchaseToken;
        const subscriptionId = data?.subscriptionNotification?.subscriptionId;
        if (!purchaseToken || !subscriptionId)
            return;
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
        const isActive = !!(expiresAt && expiresAt.getTime() > Date.now());
        await admin.firestore().collection('users').doc(userId).set({
            membershipStatus: isActive ? 'premium' : 'demo',
            isPremium: isActive,
            subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
            autoRenewing,
            productId: subscriptionId.includes('annual') ? 'annual' : 'monthly',
            lastValidated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    catch (e) {
        console.error('handlePlayStoreNotification error', e);
    }
});
async function findUserByPurchaseToken(token) {
    const snap = await admin.firestore()
        .collection('users')
        .where('androidPurchaseToken', '==', token)
        .limit(1)
        .get();
    if (!snap.empty)
        return snap.docs[0].id;
    return null;
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
