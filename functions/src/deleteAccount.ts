import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Initialize Admin if not already
try { admin.app(); } catch { admin.initializeApp(); }

export const deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to delete an account.');
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
    } catch (authError) {
      const code = (authError as { code?: string }).code;
      if (code && code !== 'auth/user-not-found') {
        throw authError;
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Account deletion failed for user ${uid}`, error);
    throw new HttpsError('internal', 'Failed to delete account');
  }
});
