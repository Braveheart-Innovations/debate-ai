import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { deleteAllUserStorage } from './cloudPayloadStorage';
import { destroyUserSandboxes, e2bApiKey } from './sandbox/callables';

// Initialize Admin if not already
try { admin.app(); } catch { admin.initializeApp(); }

// 512MiB: destroying sandboxes loads the E2B SDK on top of the functions index.
export const deleteAccount = onCall({ memory: '512MiB', secrets: [e2bApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to delete an account.');
  }

  const uid = request.auth.uid;
  const firestore = admin.firestore();

  try {
    // NOTE: The /trialHistory/{uid} collection is intentionally NOT deleted here.
    // This prevents trial abuse where users delete their account and re-register
    // to get unlimited free trials. The trialHistory collection tracks email hashes
    // and UIDs that have used trials, surviving account deletion. It is a top-level
    // collection, so the recursiveDelete below (scoped to users/{uid}) never touches it.

    // Delete all Cloud Storage objects owned by the user (session payloads, exports,
    // audio) before removing the Firestore records that reference them. Best-effort:
    // a storage failure must not block account deletion, so log and continue rather
    // than leaving the account un-deletable.
    try {
      const { objects } = await deleteAllUserStorage(uid);
      console.log(`Account deletion: removed ${objects} storage object(s) for user ${uid}`);
    } catch (storageError) {
      console.error(`Account deletion: storage cleanup failed for user ${uid}`, storageError);
    }

    // Destroy the user's Analyze Python sandboxes (uploaded files live inside them).
    // Must run before the recursiveDelete below removes the uid → sandbox mapping.
    // Best-effort like storage: a sandbox failure must not block account deletion.
    try {
      const sandboxes = await destroyUserSandboxes(uid);
      console.log(`Account deletion: destroyed ${sandboxes} sandbox(es) for user ${uid}`);
    } catch (sandboxError) {
      console.error(`Account deletion: sandbox cleanup failed for user ${uid}`, sandboxError);
    }

    // Recursively delete the user document AND all nested subcollections
    // (conversations/{id}/messages, conversations/{id}/artifacts, apiKeys, billing,
    // usage, etc.). The previous one-level batch loop orphaned nested subcollections.
    const userDocRef = firestore.collection('users').doc(uid);
    await firestore.recursiveDelete(userDocRef);

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
