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
exports.handleAppStoreNotification = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const jose_1 = require("jose");
// Apple ASN v2 JWKS
const APPLE_JWKS_URL = new URL('https://api.storekit.itunes.apple.com/inApps/v1/keys');
const JWKS = (0, jose_1.createRemoteJWKSet)(APPLE_JWKS_URL);
exports.handleAppStoreNotification = functions.https.onRequest(async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const { signedPayload } = req.body || {};
        if (!signedPayload) {
            res.status(400).send('Missing signedPayload');
            return;
        }
        // Verify JWS
        const { payload } = await (0, jose_1.jwtVerify)(signedPayload, JWKS, {
            algorithms: ['ES256'],
        });
        const obj = payload;
        const notificationType = obj?.notificationType;
        const subtype = obj?.subtype;
        const data = obj?.data;
        const signedTransactionInfo = data?.signedTransactionInfo;
        // Parse transaction for expiry, user linkage TBD
        if (signedTransactionInfo) {
            try {
                const tr = await (0, jose_1.jwtVerify)(signedTransactionInfo, JWKS, { algorithms: ['ES256'] });
                const t = tr.payload;
                const productId = t?.productId;
                const expiresMs = t?.expiresDate;
                const appAccountToken = t?.appAccountToken;
                if (appAccountToken) {
                    const userId = await findUserByAppAccountToken(appAccountToken);
                    if (userId) {
                        const expiresAt = expiresMs ? new Date(parseInt(expiresMs, 10)) : null;
                        // Only update if we have a valid expiry date
                        // Don't overwrite subscriptionExpiryDate with null - that breaks the subscription state
                        if (expiresAt) {
                            const isActive = expiresAt.getTime() > Date.now();
                            await admin.firestore().collection('users').doc(userId).set({
                                membershipStatus: isActive ? 'premium' : 'demo',
                                isPremium: isActive,
                                subscriptionExpiryDate: admin.firestore.Timestamp.fromDate(expiresAt),
                                productId: productId && productId.includes('annual') ? 'annual' : 'monthly',
                                lastValidated: admin.firestore.FieldValue.serverTimestamp(),
                            }, { merge: true });
                            console.log(`Updated user ${userId}: membershipStatus=${isActive ? 'premium' : 'demo'}, expiresAt=${expiresAt.toISOString()}`);
                        }
                        else {
                            // Log warning but don't update - missing expiresDate would corrupt the user's state
                            console.warn(`App Store notification for user ${userId} missing expiresDate - skipping update to avoid corrupting state`);
                        }
                    }
                    else {
                        console.warn(`App Store notification: no user found for appAccountToken ${appAccountToken.substring(0, 8)}...`);
                    }
                }
            }
            catch (e) {
                console.warn('Failed to verify signedTransactionInfo', e);
            }
        }
        res.status(200).send('OK');
    }
    catch (e) {
        console.error('handleAppStoreNotification error', e);
        res.status(500).send('Error');
    }
});
async function findUserByAppAccountToken(token) {
    const snap = await admin.firestore()
        .collection('users')
        .where('appAccountToken', '==', token)
        .limit(1)
        .get();
    if (!snap.empty)
        return snap.docs[0].id;
    return null;
}
