import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Apple ASN v2 JWKS
const APPLE_JWKS_URL = new URL('https://api.storekit.itunes.apple.com/inApps/v1/keys');
const JWKS = createRemoteJWKSet(APPLE_JWKS_URL);

export const handleAppStoreNotification = functions.https.onRequest(async (req, res) => {
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
    const { payload } = await jwtVerify(signedPayload, JWKS, {
      algorithms: ['ES256'],
    });
    const obj = payload as any;
    const notificationType = obj?.notificationType as string | undefined;
    const subtype = obj?.subtype as string | undefined;
    const data = obj?.data;
    const signedTransactionInfo = data?.signedTransactionInfo as string | undefined;

    // Parse transaction for expiry, user linkage TBD
    if (signedTransactionInfo) {
      try {
        const tr = await jwtVerify(signedTransactionInfo, JWKS, { algorithms: ['ES256'] });
        const t = tr.payload as any;
        const productId = t?.productId as string | undefined;
        const expiresMs = t?.expiresDate as string | undefined;
        const appAccountToken = t?.appAccountToken as string | undefined;

        if (appAccountToken) {
          const userId = await findUserByAppAccountToken(appAccountToken);
          if (userId) {
            const expiresAt = expiresMs ? new Date(parseInt(expiresMs, 10)) : null;
            await admin.firestore().collection('users').doc(userId).set({
              membershipStatus: expiresAt && expiresAt.getTime() > Date.now() ? 'premium' : 'demo',
              subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
              productId: productId && productId.includes('annual') ? 'annual' : 'monthly',
              lastValidated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }
      } catch (e) {
        console.warn('Failed to verify signedTransactionInfo', e);
      }
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('handleAppStoreNotification error', e);
    res.status(500).send('Error');
  }
});

async function findUserByAppAccountToken(token: string): Promise<string | null> {
  const snap = await admin.firestore()
    .collection('users')
    .where('appAccountToken', '==', token)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;
  return null;
}
