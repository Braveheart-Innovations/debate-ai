import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import 'firebase-admin/firestore';

export const deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to delete an account.');
  }

  const uid = request.auth.uid;
  const firestore = admin.firestore();

  try {
    const userDocRef = firestore.collection('users').doc(uid);

    try {
      await firestore.recursiveDelete(userDocRef);
    } catch (recursiveError) {
      console.warn('recursiveDelete unavailable, falling back to manual cleanup', recursiveError);
      const subCollections = await userDocRef.listCollections();
      for (const subCollection of subCollections) {
        const snapshot = await subCollection.get();
        const batch = firestore.batch();
        snapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
      await userDocRef.delete();
    }

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
