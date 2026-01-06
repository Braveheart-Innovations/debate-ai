import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

// Initialize Admin if not already
try { admin.app(); } catch { admin.initializeApp(); }

interface UserDataExport {
  profile: {
    uid: string;
    email: string | undefined;
    displayName: string | undefined;
    photoURL: string | undefined;
    emailVerified: boolean;
    createdAt: string | undefined;
    lastSignIn: string | undefined;
  };
  subscription: Record<string, unknown> | null;
  syncSettings: Record<string, unknown> | null;
  configuredProviders: string[];
  exportedAt: string;
}

/**
 * Export all user data for GDPR compliance
 * Returns profile, subscription info, sync settings, and list of configured providers
 * Does NOT include API keys (user's responsibility to manage those separately)
 */
export const exportUserData = onCall(async (request): Promise<UserDataExport> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to export data');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  try {
    // Get Firebase Auth user data
    const authUser = await admin.auth().getUser(uid);

    // Get subscription data
    const subscriptionDoc = await db
      .collection('users')
      .doc(uid)
      .collection('billing')
      .doc('subscription')
      .get();

    // Get sync settings
    const syncDoc = await db.collection('users').doc(uid).get();
    const syncSettings = syncDoc.exists ? syncDoc.data()?.syncSettings || null : null;

    // Get list of configured providers (not the actual keys)
    const apiKeysSnapshot = await db.collection('users').doc(uid).collection('apiKeys').get();
    const configuredProviders = apiKeysSnapshot.docs.map(doc => doc.id);

    const exportData: UserDataExport = {
      profile: {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
        photoURL: authUser.photoURL,
        emailVerified: authUser.emailVerified,
        createdAt: authUser.metadata.creationTime,
        lastSignIn: authUser.metadata.lastSignInTime,
      },
      subscription: subscriptionDoc.exists
        ? {
            status: subscriptionDoc.data()?.status,
            plan: subscriptionDoc.data()?.plan,
            currentPeriodEnd: subscriptionDoc.data()?.currentPeriodEnd?.toDate?.()?.toISOString(),
            trialEndsAt: subscriptionDoc.data()?.trialEndsAt?.toDate?.()?.toISOString(),
            canceledAt: subscriptionDoc.data()?.canceledAt?.toDate?.()?.toISOString(),
            createdAt: subscriptionDoc.data()?.createdAt?.toDate?.()?.toISOString(),
          }
        : null,
      syncSettings,
      configuredProviders,
      exportedAt: new Date().toISOString(),
    };

    return exportData;
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw new HttpsError('internal', 'Failed to export user data');
  }
});
