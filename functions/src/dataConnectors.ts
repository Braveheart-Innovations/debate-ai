/**
 * Data Connector Key Management
 *
 * Manages encrypted API keys for data connectors used by the fetch_api tool.
 * Follows the same encryption pattern as apiKeys.ts (AES-256-GCM).
 *
 * Firestore path: users/{uid}/dataServiceKeys/{connectorId}
 *
 * Three callable functions:
 * - saveDataServiceKey: Encrypt and store a user's API key for a data connector
 * - deleteDataServiceKey: Remove a stored key
 * - getConfiguredDataServices: List which connectors have keys (no actual keys returned)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { encrypt, getDecryptedDataServiceKey, encryptionKey } from './dataConnectorCrypto';

// Managed API keys for Symposium-provided connectors
const fredApiKey = defineSecret('FRED_API_KEY');
const socrataAppToken = defineSecret('SOCRATA_APP_TOKEN');
const nasaApiKey = defineSecret('NASA_API_KEY');
const usCensusApiKey = defineSecret('US_CENSUS_API_KEY');
const blsRegistrationKey = defineSecret('BLS_REGISTRATION_KEY');
const fbiCrimeApiKey = defineSecret('FBI_CRIME_API_KEY');
const stackExchangeApiKey = defineSecret('STACK_EXCHANGE_API_KEY');
const librariesIoApiKey = defineSecret('LIBRARIES_IO_API_KEY');
// UN Population Division Data Portal bearer token (issued for one year; renew before it lapses).
const unPopulationApiToken = defineSecret('UN_POPULATION_API_TOKEN');

// Valid data connector IDs (must match client-side data-connectors.ts)
const VALID_CONNECTOR_IDS = [
  // Symposium-managed
  'weather_gov',
  'fred',
  'usgs_earthquake',
  'arxiv',
  'wikipedia',
  'wikidata',
  'crossref',
  'openalex',
  'clinicaltrials_gov',
  'openfda',
  'us_census',
  'bls',
  'nasa',
  'epa_envirofacts',
  'fbi_crime',
  'oecd',
  'imf',
  'eurostat',
  'un_population',
  'npm_registry',
  'hacker_news',
  'pypi',
  'stack_exchange',
  'libraries_io',
  'open_library',
  'dictionary_api',
  'who_gho',
  'sec_edgar',
  'yahoo_finance',
  'semantic_scholar',
  'world_bank',
  'socrata',
  'pubmed',
  'overpass_osm',
  'google_sheets_csv',
  // BYOK
  'openweathermap',
  'newsapi',
  'github',
];

// Connector auth configuration (server-side source of truth for key injection)
export interface ConnectorAuthConfig {
  authType: 'query_param' | 'header' | 'bearer' | 'none';
  authKeyName?: string;
  /** For Symposium-managed connectors: function returning the platform key */
  getManagedKey?: () => string | undefined;
}

export const CONNECTOR_AUTH_CONFIG: Record<string, ConnectorAuthConfig> = {
  weather_gov: { authType: 'none' },
  fred: { authType: 'query_param', authKeyName: 'api_key', getManagedKey: () => fredApiKey.value() || undefined },
  usgs_earthquake: { authType: 'none' },
  arxiv: { authType: 'none' },
  wikipedia: { authType: 'none' },
  wikidata: { authType: 'none' },
  crossref: { authType: 'none' },
  openalex: { authType: 'none' },
  clinicaltrials_gov: { authType: 'none' },
  openfda: { authType: 'none' },
  us_census: { authType: 'query_param', authKeyName: 'key', getManagedKey: () => usCensusApiKey.value() || undefined },
  bls: { authType: 'query_param', authKeyName: 'registrationkey', getManagedKey: () => blsRegistrationKey.value() || undefined },
  nasa: { authType: 'query_param', authKeyName: 'api_key', getManagedKey: () => nasaApiKey.value() || undefined },
  epa_envirofacts: { authType: 'none' },
  fbi_crime: { authType: 'query_param', authKeyName: 'API_KEY', getManagedKey: () => fbiCrimeApiKey.value() || undefined },
  oecd: { authType: 'none' },
  imf: { authType: 'none' },
  eurostat: { authType: 'none' },
  un_population: { authType: 'bearer', getManagedKey: () => unPopulationApiToken.value() || undefined },
  npm_registry: { authType: 'none' },
  hacker_news: { authType: 'none' },
  pypi: { authType: 'none' },
  stack_exchange: { authType: 'query_param', authKeyName: 'key', getManagedKey: () => stackExchangeApiKey.value() || undefined },
  libraries_io: { authType: 'query_param', authKeyName: 'api_key', getManagedKey: () => librariesIoApiKey.value() || undefined },
  open_library: { authType: 'none' },
  dictionary_api: { authType: 'none' },
  who_gho: { authType: 'none' },
  sec_edgar: { authType: 'none' },
  yahoo_finance: { authType: 'none' },
  openweathermap: { authType: 'query_param', authKeyName: 'appid' },
  newsapi: { authType: 'header', authKeyName: 'X-Api-Key' },
  semantic_scholar: { authType: 'none' },
  world_bank: { authType: 'none' },
  socrata: { authType: 'query_param', authKeyName: '$$app_token', getManagedKey: () => socrataAppToken.value() || undefined },
  pubmed: { authType: 'none' },
  overpass_osm: { authType: 'none' },
  github: { authType: 'bearer' },
  google_sheets_csv: { authType: 'none' },
};

/**
 * Whether fetch_api resolves a key for this connector (the user's, else the
 * managed one): a bearer token always goes in the Authorization header, the
 * other types need the param or header name to put it in.
 */
export function connectorTakesKey(authConfig: ConnectorAuthConfig): boolean {
  if (authConfig.authType === 'none') return false;
  return authConfig.authType === 'bearer' || Boolean(authConfig.authKeyName);
}

/**
 * Save an API key for a data connector.
 * Encrypts the key before storing in Firestore.
 */
export const saveDataServiceKey = onCall(
  { secrets: [encryptionKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to save data service keys');
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const { connectorId, apiKey } = request.data;

    // Validate inputs
    if (!connectorId || typeof connectorId !== 'string') {
      throw new HttpsError('invalid-argument', 'Connector ID is required');
    }

    if (!VALID_CONNECTOR_IDS.includes(connectorId)) {
      throw new HttpsError('invalid-argument', `Invalid connector: ${connectorId}`);
    }

    if (!apiKey || typeof apiKey !== 'string') {
      throw new HttpsError('invalid-argument', 'API key is required');
    }

    if (apiKey.length < 5 || apiKey.length > 500) {
      throw new HttpsError('invalid-argument', 'API key has invalid length');
    }

    const uid = request.auth.uid;
    const db = getFirestore();

    try {
      const { encrypted, iv, tag } = encrypt(apiKey.trim(), keyValue);

      await db.collection('users').doc(uid).collection('dataServiceKeys').doc(connectorId).set({
        encrypted,
        iv,
        tag,
        connectorId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true, connectorId };
    } catch (error) {
      console.error('Error saving data service key:', error);
      throw new HttpsError('internal', 'Failed to save data service key');
    }
  }
);

/**
 * Delete an API key for a data connector.
 */
export const deleteDataServiceKey = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { connectorId } = request.data;

  if (!connectorId || !VALID_CONNECTOR_IDS.includes(connectorId)) {
    throw new HttpsError('invalid-argument', 'Invalid connector ID');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  try {
    await db.collection('users').doc(uid).collection('dataServiceKeys').doc(connectorId).delete();
    return { success: true, connectorId };
  } catch (error) {
    console.error('Error deleting data service key:', error);
    throw new HttpsError('internal', 'Failed to delete data service key');
  }
});

/**
 * Get list of configured data services (not the actual keys).
 * Returns connector IDs and timestamps for connectors that have stored keys.
 */
export const getConfiguredDataServices = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  try {
    const snapshot = await db.collection('users').doc(uid).collection('dataServiceKeys').get();

    const services = snapshot.docs.map(doc => ({
      connectorId: doc.id,
      configuredAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return { services };
  } catch (error) {
    console.error('Error getting configured data services:', error);
    throw new HttpsError('internal', 'Failed to get configured data services');
  }
});

// Re-export for use by tools.ts
export {
  getDecryptedDataServiceKey,
  VALID_CONNECTOR_IDS,
  fredApiKey,
  socrataAppToken,
  nasaApiKey,
  usCensusApiKey,
  blsRegistrationKey,
  fbiCrimeApiKey,
  stackExchangeApiKey,
  librariesIoApiKey,
  unPopulationApiToken,
};
