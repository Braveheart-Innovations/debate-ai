import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

// Define the secret - will be accessed at runtime
const encryptionKey = defineSecret('ENCRYPTION_KEY');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKeyBuffer(keyValue: string): Buffer {
  // Ensure key is 32 bytes for AES-256
  return crypto.scryptSync(keyValue, 'symposium-salt', 32);
}

function encrypt(text: string, keyValue: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKeyBuffer(keyValue);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decrypt(encrypted: string, iv: string, tag: string, keyValue: string): string {
  const key = getEncryptionKeyBuffer(keyValue);
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Valid provider IDs
const VALID_PROVIDERS = [
  'claude', 'openai', 'google', 'perplexity', 'mistral',
  'cohere', 'together', 'deepseek', 'grok'
];

/**
 * Save an API key for a provider
 * Encrypts the key before storing in Firestore
 */
export const saveApiKey = onCall(
  { secrets: [encryptionKey] },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to save API keys');
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const { providerId, apiKey } = request.data;

    // Validate inputs
    if (!providerId || typeof providerId !== 'string') {
      throw new HttpsError('invalid-argument', 'Provider ID is required');
    }

    if (!VALID_PROVIDERS.includes(providerId)) {
      throw new HttpsError('invalid-argument', `Invalid provider: ${providerId}`);
    }

    if (!apiKey || typeof apiKey !== 'string') {
      throw new HttpsError('invalid-argument', 'API key is required');
    }

    if (apiKey.length < 10 || apiKey.length > 500) {
      throw new HttpsError('invalid-argument', 'API key has invalid length');
    }

    const uid = request.auth.uid;
    const db = getFirestore();

    try {
      // Encrypt the API key
      const { encrypted, iv, tag } = encrypt(apiKey.trim(), keyValue);

      // Store in Firestore
      await db.collection('users').doc(uid).collection('apiKeys').doc(providerId).set({
        encrypted,
        iv,
        tag,
        providerId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true, providerId };
    } catch (error) {
      console.error('Error saving API key:', error);
      throw new HttpsError('internal', 'Failed to save API key');
    }
  }
);

/**
 * Delete an API key for a provider
 */
export const deleteApiKey = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { providerId } = request.data;

  if (!providerId || !VALID_PROVIDERS.includes(providerId)) {
    throw new HttpsError('invalid-argument', 'Invalid provider ID');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  try {
    await db.collection('users').doc(uid).collection('apiKeys').doc(providerId).delete();
    return { success: true, providerId };
  } catch (error) {
    console.error('Error deleting API key:', error);
    throw new HttpsError('internal', 'Failed to delete API key');
  }
});

/**
 * Get list of configured providers (not the actual keys)
 */
export const getConfiguredProviders = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  try {
    const snapshot = await db.collection('users').doc(uid).collection('apiKeys').get();

    const providers = snapshot.docs.map(doc => ({
      providerId: doc.id,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return { providers };
  } catch (error) {
    console.error('Error getting configured providers:', error);
    throw new HttpsError('internal', 'Failed to get providers');
  }
});

/**
 * Internal function to get decrypted API key
 * Used by the AI proxy function
 */
export async function getDecryptedApiKey(uid: string, providerId: string, keyValue: string): Promise<string | null> {
  const db = getFirestore();

  try {
    const doc = await db.collection('users').doc(uid).collection('apiKeys').doc(providerId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data?.encrypted || !data?.iv || !data?.tag) {
      return null;
    }

    return decrypt(data.encrypted, data.iv, data.tag, keyValue);
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
}

// Export the secret for use by other functions
export { encryptionKey };
