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
exports.deleteAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// Initialize Admin if not already
try {
    admin.app();
}
catch {
    admin.initializeApp();
}
exports.deleteAccount = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated to delete an account.');
    }
    const uid = request.auth.uid;
    const firestore = admin.firestore();
    try {
        // NOTE: The /trialHistory/{uid} collection is intentionally NOT deleted here.
        // This prevents trial abuse where users delete their account and re-register
        // to get unlimited free trials. The trialHistory collection tracks email hashes
        // and UIDs that have used trials, surviving account deletion.
        // Delete Firestore user data
        const userDocRef = firestore.collection('users').doc(uid);
        // Get and delete subcollections manually
        const subCollections = await userDocRef.listCollections();
        for (const subCollection of subCollections) {
            const snapshot = await subCollection.get();
            const batch = firestore.batch();
            snapshot.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
        // Delete the user document
        await userDocRef.delete();
        // Delete the Auth user
        try {
            await admin.auth().deleteUser(uid);
        }
        catch (authError) {
            const code = authError.code;
            if (code && code !== 'auth/user-not-found') {
                throw authError;
            }
        }
        return { success: true };
    }
    catch (error) {
        console.error(`Account deletion failed for user ${uid}`, error);
        throw new https_1.HttpsError('internal', 'Failed to delete account');
    }
});
