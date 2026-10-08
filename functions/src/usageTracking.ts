import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';

// ============================================================================
// Types
// ============================================================================

interface ProviderBalance {
  providerId: string;
  available: number;
  granted?: number;
  used?: number;
  currency: string;
  status: 'available' | 'unavailable' | 'error';
  lastUpdated: number;
  errorMessage?: string;
}

export type SessionType = 'chat' | 'debate' | 'comparison' | 'analyze';

const SESSION_TYPES: SessionType[] = ['chat', 'debate', 'comparison', 'analyze'];

interface UsageRecord {
  messageId: string;
  sessionId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionType: SessionType;
  timestamp: number;
}

interface ModeUsageStats {
  tokens: number;
  requests: number;
}

interface ImageGenerationRecord {
  providerId: string;
  modelId: string;
  imageCount: number;
  dimensions: string;
  quality?: string;
  timestamp: number;
}

interface MediaGenerationRecord {
  providerId: string;
  modelId: string;
  mediaType: 'video' | 'audio';
  operation: string;
  timestamp: number;
}

interface DailyProviderUsage {
  providerId: string;
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
}

interface ImageGenerationStats {
  totalImages: number;
  byDimensions: Record<string, number>;
  byQuality: Record<string, number>;
}

interface MediaGenerationStats {
  totalGenerations: number;
  byMediaType: Record<string, number>;
  byOperation: Record<string, number>;
}

interface ModelUsageStats {
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  lastUsed: number;
}

interface UsageSummary {
  updatedAt: number;
  totalTokensAllTime: number;
  totalRequestsAllTime: number;
  totalImagesAllTime: number;
  totalMediaAllTime?: number;
  currentMonthTokens: number;
  currentMonthRequests: number;
  currentMonthImages: number;
  currentMonthMedia?: number;
  currentMonth: string;
  byProvider: Record<string, {
    tokens: number;
    requests: number;
    lastUsed: number;
    images?: ImageGenerationStats;
    media?: MediaGenerationStats;
  }>;
  byModel: Record<string, ModelUsageStats>;
  byMode?: Record<string, ModeUsageStats>;
}

type FreeTierInteractionType = 'debate' | 'compare' | 'chat' | 'analyze';

type FreeTierUsageField =
  | 'freeDebatesRemaining'
  | 'freeComparesRemaining'
  | 'freeChatsRemaining'
  | 'freeAnalyzesRemaining';

interface FreeTierUsageState {
  freeDebatesRemaining: number;
  freeComparesRemaining: number;
  freeChatsRemaining: number;
  freeAnalyzesRemaining: number;
}

const FREE_TIER_LIMITS: FreeTierUsageState = {
  freeDebatesRemaining: 5,
  freeComparesRemaining: 5,
  freeChatsRemaining: 5,
  freeAnalyzesRemaining: 5,
};

const FREE_TIER_FIELD_BY_TYPE: Record<FreeTierInteractionType, FreeTierUsageField> = {
  debate: 'freeDebatesRemaining',
  compare: 'freeComparesRemaining',
  chat: 'freeChatsRemaining',
  analyze: 'freeAnalyzesRemaining',
};

// ============================================================================
// Get Provider Balances
// ============================================================================

/**
 * Fetch real balances from providers that support it (DeepSeek, OpenAI)
 */
export const getProviderBalances = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [encryptionKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const uid = request.auth.uid;
    const balances: ProviderBalance[] = [];

    // DeepSeek - has official balance API
    try {
      console.log('Getting DeepSeek API key for user:', uid);
      const deepseekKey = await getDecryptedApiKey(uid, 'deepseek', keyValue);
      console.log('DeepSeek key found:', !!deepseekKey);
      if (deepseekKey) {
        const balance = await fetchDeepSeekBalance(deepseekKey);
        balances.push(balance);
      } else {
        balances.push({
          providerId: 'deepseek',
          available: 0,
          currency: 'USD',
          status: 'unavailable',
          lastUpdated: Date.now(),
          errorMessage: 'No API key configured',
        });
      }
    } catch (error: any) {
      console.error('DeepSeek balance error:', error);
      balances.push({
        providerId: 'deepseek',
        available: 0,
        currency: 'USD',
        status: 'error',
        lastUpdated: Date.now(),
        errorMessage: error.message || 'Failed to fetch balance',
      });
    }

    // OpenAI - their billing API requires browser session auth, not API keys
    // So we can't fetch balances server-side
    balances.push({
      providerId: 'openai',
      available: 0,
      currency: 'USD',
      status: 'unavailable',
      lastUpdated: Date.now(),
      errorMessage: 'OpenAI requires browser login to view balance',
    });

    // Other providers - no balance API
    const noApiProviders = ['claude', 'google', 'perplexity', 'mistral', 'cohere', 'grok'];
    for (const providerId of noApiProviders) {
      balances.push({
        providerId,
        available: 0,
        currency: 'USD',
        status: 'unavailable',
        lastUpdated: Date.now(),
      });
    }

    return { balances };
  }
);

async function fetchDeepSeekBalance(apiKey: string): Promise<ProviderBalance> {
  console.log('Fetching DeepSeek balance...');
  const response = await fetch('https://api.deepseek.com/user/balance', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('DeepSeek response status:', response.status);

  if (!response.ok) {
    const error = await response.text();
    console.error('DeepSeek API error:', response.status, error);
    throw new Error(`DeepSeek API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  // DeepSeek returns balance_infos array with currency-specific balances
  const balanceInfo = data.balance_infos?.[0];
  const totalBalance = parseFloat(balanceInfo?.total_balance || '0');
  const grantedBalance = parseFloat(balanceInfo?.granted_balance || '0');

  return {
    providerId: 'deepseek',
    available: totalBalance,
    granted: grantedBalance,
    currency: balanceInfo?.currency || 'CNY',
    status: data.is_available ? 'available' : 'error',
    lastUpdated: Date.now(),
  };
}

async function fetchOpenAIBalance(apiKey: string): Promise<ProviderBalance> {
  // Note: This is an undocumented endpoint that may change
  console.log('Fetching OpenAI balance...');
  const response = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('OpenAI response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    // If the endpoint doesn't work, return unavailable instead of error
    // since this is an undocumented endpoint
    return {
      providerId: 'openai',
      available: 0,
      currency: 'USD',
      status: 'unavailable',
      lastUpdated: Date.now(),
      errorMessage: `Balance API not available (${response.status})`,
    };
  }

  const data = await response.json();

  return {
    providerId: 'openai',
    available: data.total_available || 0,
    used: data.total_used || 0,
    granted: data.total_granted || 0,
    currency: 'USD',
    status: 'available',
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// Record Usage (internal function)
// ============================================================================

interface UsageDocsMutation {
  daily: Record<string, unknown>;
  summary: Record<string, unknown>;
}

/**
 * Clamp a client-supplied session type to the known set. Unknown values fall
 * back to 'chat' so byMode keys stay bounded.
 */
export function normalizeSessionType(value: unknown): SessionType {
  return SESSION_TYPES.includes(value as SessionType) ? (value as SessionType) : 'chat';
}

/**
 * Monthly counters carried into a new summary write, reset together when the
 * month rolls over. Every recorder must use this so a rollover triggered by
 * one usage type also resets the others.
 */
export function monthlyCountersAfterRollover(
  summaryData: UsageSummary | null,
  monthStr: string
): {
  isNewMonth: boolean;
  currentMonthTokens: number;
  currentMonthRequests: number;
  currentMonthImages: number;
  currentMonthMedia: number;
} {
  const isNewMonth = !summaryData?.currentMonth || summaryData.currentMonth !== monthStr;
  return {
    isNewMonth,
    currentMonthTokens: isNewMonth ? 0 : summaryData?.currentMonthTokens || 0,
    currentMonthRequests: isNewMonth ? 0 : summaryData?.currentMonthRequests || 0,
    currentMonthImages: isNewMonth ? 0 : summaryData?.currentMonthImages || 0,
    currentMonthMedia: isNewMonth ? 0 : summaryData?.currentMonthMedia || 0,
  };
}

/**
 * Read both usage docs, apply a pure mutation, and write the results — all
 * inside a transaction. The previous read-then-batch.set pattern lost updates
 * when concurrent requests (multi-AI chat, debate, compare) interleaved.
 *
 * Mutators receive unflattened data (legacy docs were written with
 * dot-notation keys) and must spread the current doc into their result so one
 * usage type never erases another's fields.
 */
async function runUsageMutation(
  uid: string,
  dateStr: string,
  mutate: (
    dailyData: Record<string, unknown>,
    summaryData: UsageSummary | null
  ) => UsageDocsMutation
): Promise<void> {
  const db = getFirestore();
  const dailyRef = db.collection('users').doc(uid)
    .collection('usage').doc('daily')
    .collection('days').doc(dateStr);
  const summaryRef = db.collection('users').doc(uid).collection('usage').doc('summary');

  await db.runTransaction(async (txn) => {
    const [dailySnap, summarySnap] = await txn.getAll(dailyRef, summaryRef);
    const dailyData = dailySnap.exists ? unflattenObject(dailySnap.data() || {}) : {};
    const summaryData = summarySnap.exists
      ? (unflattenObject(summarySnap.data() || {}) as unknown as UsageSummary)
      : null;

    const { daily, summary } = mutate(dailyData, summaryData);
    txn.set(dailyRef, daily);
    txn.set(summaryRef, summary);
  });
}

/**
 * Pure mutation for a token usage record. Exported for tests.
 */
export function buildTokenUsageMutation(
  dailyData: Record<string, unknown>,
  summaryData: UsageSummary | null,
  record: UsageRecord,
  dateStr: string,
  monthStr: string
): UsageDocsMutation {
  const sessionType = normalizeSessionType(record.sessionType);

  // Daily doc
  const currentProviders = (dailyData.providers || {}) as Record<string, Record<string, unknown>>;
  const currentProvider = currentProviders[record.providerId] || {};

  const currentByModel = (dailyData.byModel || {}) as Record<string, { inputTokens?: number; outputTokens?: number; requests?: number }>;
  const currentModel = currentByModel[record.modelId] || {};

  const currentByMode = (dailyData.byMode || {}) as Record<string, ModeUsageStats>;
  const currentMode = currentByMode[sessionType] || { tokens: 0, requests: 0 };

  const daily: Record<string, unknown> = {
    ...dailyData,
    date: dateStr,
    providers: {
      ...currentProviders,
      [record.providerId]: {
        // Preserve images/media stats recorded for this provider today
        ...currentProvider,
        totalInputTokens: ((currentProvider.totalInputTokens as number) || 0) + record.inputTokens,
        totalOutputTokens: ((currentProvider.totalOutputTokens as number) || 0) + record.outputTokens,
        totalTokens: ((currentProvider.totalTokens as number) || 0) + record.totalTokens,
        requestCount: ((currentProvider.requestCount as number) || 0) + 1,
      },
    },
    byModel: {
      ...currentByModel,
      [record.modelId]: {
        inputTokens: (currentModel.inputTokens || 0) + record.inputTokens,
        outputTokens: (currentModel.outputTokens || 0) + record.outputTokens,
        requests: (currentModel.requests || 0) + 1,
      },
    },
    byMode: {
      ...currentByMode,
      [sessionType]: {
        tokens: (currentMode.tokens || 0) + record.totalTokens,
        requests: (currentMode.requests || 0) + 1,
      },
    },
    totalTokens: ((dailyData.totalTokens as number) || 0) + record.totalTokens,
    totalRequests: ((dailyData.totalRequests as number) || 0) + 1,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Summary doc
  const counters = monthlyCountersAfterRollover(summaryData, monthStr);

  const summaryByProvider = summaryData?.byProvider || {};
  const summaryProviderStats = summaryByProvider[record.providerId] || {
    tokens: 0,
    requests: 0,
    lastUsed: 0,
  };

  const summaryByModel = summaryData?.byModel || {};
  const summaryModelStats = summaryByModel[record.modelId] || {
    providerId: record.providerId,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requests: 0,
    lastUsed: 0,
  };

  const summaryByMode = summaryData?.byMode || {};
  const summaryModeStats = summaryByMode[sessionType] || { tokens: 0, requests: 0 };

  const summary: Record<string, unknown> = {
    ...(summaryData ?? {}),
    updatedAt: Date.now(),
    totalTokensAllTime: (summaryData?.totalTokensAllTime || 0) + record.totalTokens,
    totalRequestsAllTime: (summaryData?.totalRequestsAllTime || 0) + 1,
    totalImagesAllTime: summaryData?.totalImagesAllTime || 0,
    totalMediaAllTime: summaryData?.totalMediaAllTime || 0,
    currentMonthTokens: counters.currentMonthTokens + record.totalTokens,
    currentMonthRequests: counters.currentMonthRequests + 1,
    currentMonthImages: counters.currentMonthImages,
    currentMonthMedia: counters.currentMonthMedia,
    currentMonth: monthStr,
    byProvider: {
      ...summaryByProvider,
      [record.providerId]: {
        ...summaryProviderStats,
        tokens: (summaryProviderStats.tokens || 0) + record.totalTokens,
        requests: (summaryProviderStats.requests || 0) + 1,
        lastUsed: Date.now(),
      },
    },
    byModel: {
      ...summaryByModel,
      [record.modelId]: {
        providerId: record.providerId,
        inputTokens: (summaryModelStats.inputTokens || 0) + record.inputTokens,
        outputTokens: (summaryModelStats.outputTokens || 0) + record.outputTokens,
        totalTokens: (summaryModelStats.totalTokens || 0) + record.totalTokens,
        requests: (summaryModelStats.requests || 0) + 1,
        lastUsed: Date.now(),
      },
    },
    byMode: {
      ...summaryByMode,
      [sessionType]: {
        tokens: (summaryModeStats.tokens || 0) + record.totalTokens,
        requests: (summaryModeStats.requests || 0) + 1,
      },
    },
  };

  return { daily, summary };
}

/**
 * Record usage for a message - called by proxyAIRequest after successful response
 */
export async function recordUsageInternal(
  uid: string,
  record: UsageRecord
): Promise<void> {
  console.log('recordUsageInternal called:', { uid, providerId: record.providerId, modelId: record.modelId, totalTokens: record.totalTokens, sessionType: record.sessionType });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const monthStr = dateStr.slice(0, 7); // YYYY-MM

  await runUsageMutation(uid, dateStr, (dailyData, summaryData) =>
    buildTokenUsageMutation(dailyData, summaryData, record, dateStr, monthStr)
  );

  console.log('Usage transaction committed for:', { uid, dateStr, providerId: record.providerId });
}

function normalizeFreeTierUsage(data: FirebaseFirestore.DocumentData | undefined): FreeTierUsageState {
  return {
    freeDebatesRemaining: typeof data?.freeDebatesRemaining === 'number'
      ? data.freeDebatesRemaining
      : FREE_TIER_LIMITS.freeDebatesRemaining,
    freeComparesRemaining: typeof data?.freeComparesRemaining === 'number'
      ? data.freeComparesRemaining
      : FREE_TIER_LIMITS.freeComparesRemaining,
    freeChatsRemaining: typeof data?.freeChatsRemaining === 'number'
      ? data.freeChatsRemaining
      : FREE_TIER_LIMITS.freeChatsRemaining,
    freeAnalyzesRemaining: typeof data?.freeAnalyzesRemaining === 'number'
      ? data.freeAnalyzesRemaining
      : FREE_TIER_LIMITS.freeAnalyzesRemaining,
  };
}

function isActiveServerOwnedPremium(
  userData: FirebaseFirestore.DocumentData | undefined,
  billingData: FirebaseFirestore.DocumentData | undefined
): boolean {
  return billingData?.status === 'active'
    || billingData?.status === 'trialing'
    || userData?.isPremium === true;
}

// ============================================================================
// Record Free Tier Interaction
// ============================================================================

export const recordFreeTierInteraction = onCall(
  {
    timeoutSeconds: 10,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { type } = request.data || {};
    if (!type || !Object.prototype.hasOwnProperty.call(FREE_TIER_FIELD_BY_TYPE, type)) {
      throw new HttpsError('invalid-argument', 'Invalid interaction type');
    }

    const interactionType = type as FreeTierInteractionType;
    const usageField = FREE_TIER_FIELD_BY_TYPE[interactionType];
    const uid = request.auth.uid;
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    const billingRef = userRef.collection('billing').doc('subscription');

    return db.runTransaction(async (transaction) => {
      const [userDoc, billingDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(billingRef),
      ]);
      const userData = userDoc.data();
      const billingData = billingDoc.data();
      const usage = normalizeFreeTierUsage(userData);

      if (isActiveServerOwnedPremium(userData, billingData)) {
        return {
          success: true,
          premium: true,
          exhausted: false,
          usage,
        };
      }

      const currentRemaining = usage[usageField];
      if (currentRemaining <= 0) {
        return {
          success: false,
          exhausted: true,
          remaining: 0,
          usage,
        };
      }

      const remaining = currentRemaining - 1;
      const updatedUsage: FreeTierUsageState = {
        ...usage,
        [usageField]: remaining,
      };

      transaction.set(userRef, {
        [usageField]: remaining,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        success: true,
        exhausted: remaining <= 0,
        remaining,
        usage: updatedUsage,
      };
    });
  }
);

// ============================================================================
// Server-authoritative free-tier enforcement for the AI proxies
// ============================================================================

// The client's sessionType uses 'comparison'; the free-tier counters use 'compare'.
const FREE_TIER_TYPE_BY_SESSION_TYPE: Record<string, FreeTierInteractionType> = {
  chat: 'chat',
  debate: 'debate',
  compare: 'compare',
  comparison: 'compare',
  analyze: 'analyze',
};

export interface FreeTierGateResult {
  allowed: boolean;
  reason: 'not-metered' | 'skipped' | 'premium' | 'counted' | 'decremented' | 'exhausted';
  remaining?: number;
}

/**
 * Idempotent, server-authoritative free-tier gate for the AI proxies.
 *
 * The web free tier grants a fixed number of interactions per type. Historically
 * this was enforced only in the web client (which called recordFreeTierInteraction
 * as an advisory decrement), so a caller hitting the proxy directly — or blocking
 * that decrement — got unlimited free usage. This makes the proxy authoritative.
 *
 * Metering is keyed on a client-supplied `interactionId` so one interaction
 * (a debate's many turns, a multi-AI compare's parallel calls) counts exactly
 * once; the marker doc also makes the check idempotent across retries. Counted
 * markers are bounded (<= the per-type free limits) per non-paying user.
 *
 * Backward-compatible & rollout-safe: current web clients do NOT send an
 * interactionId (they still meter via recordFreeTierInteraction), so their calls
 * return { allowed: true, reason: 'skipped' } and are unaffected. Enforcement
 * activates only for clients that send interactionId AND stop calling
 * recordFreeTierInteraction — so there is no double-count window.
 */
export function mapSessionTypeToFreeTier(sessionType: string | undefined): FreeTierInteractionType | undefined {
  return sessionType ? FREE_TIER_TYPE_BY_SESSION_TYPE[sessionType] : undefined;
}

/**
 * Pure decision table for the free-tier gate — no I/O, exported for tests.
 * `decrementTo` (when present) is the new counter value the caller must persist,
 * paired with writing the interaction marker.
 */
export function computeFreeTierGate(params: {
  mappedType: FreeTierInteractionType | undefined;
  interactionId: string | undefined;
  isPremium: boolean;
  markerExists: boolean;
  usage: FreeTierUsageState;
}): { result: FreeTierGateResult; decrementTo?: number } {
  const { mappedType, interactionId, isPremium, markerExists, usage } = params;
  if (!mappedType) return { result: { allowed: true, reason: 'not-metered' } };
  if (!interactionId) return { result: { allowed: true, reason: 'skipped' } };
  if (isPremium) return { result: { allowed: true, reason: 'premium' } };
  if (markerExists) {
    // Same interaction already counted (later debate turn / parallel AI call).
    return { result: { allowed: true, reason: 'counted' } };
  }
  const currentRemaining = usage[FREE_TIER_FIELD_BY_TYPE[mappedType]];
  if (currentRemaining <= 0) {
    return { result: { allowed: false, reason: 'exhausted', remaining: 0 } };
  }
  const remaining = currentRemaining - 1;
  return { result: { allowed: true, reason: 'decremented', remaining }, decrementTo: remaining };
}

export async function enforceFreeTierForInteraction(
  uid: string,
  sessionType: string | undefined,
  interactionId: string | undefined
): Promise<FreeTierGateResult> {
  const mappedType = mapSessionTypeToFreeTier(sessionType);
  // Fast paths that need no read: unknown type, or old clients without an id.
  if (!mappedType) return { allowed: true, reason: 'not-metered' };
  if (!interactionId) return { allowed: true, reason: 'skipped' };

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const billingRef = userRef.collection('billing').doc('subscription');
  const markerRef = userRef.collection('freeTierInteractions').doc(interactionId);
  const usageField = FREE_TIER_FIELD_BY_TYPE[mappedType];

  return db.runTransaction<FreeTierGateResult>(async (transaction) => {
    const [userDoc, billingDoc, markerDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(billingRef),
      transaction.get(markerRef),
    ]);

    const { result, decrementTo } = computeFreeTierGate({
      mappedType,
      interactionId,
      isPremium: isActiveServerOwnedPremium(userDoc.data(), billingDoc.data()),
      markerExists: markerDoc.exists,
      usage: normalizeFreeTierUsage(userDoc.data()),
    });

    if (typeof decrementTo === 'number') {
      transaction.set(userRef, {
        [usageField]: decrementTo,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(markerRef, {
        type: mappedType,
        sessionType,
        countedAt: FieldValue.serverTimestamp(),
      });
    }
    return result;
  });
}

// ============================================================================
// Record Image Generation (internal function)
// ============================================================================

/**
 * Pure mutation for an image generation record. Exported for tests.
 */
export function buildImageGenerationMutation(
  dailyData: Record<string, unknown>,
  summaryData: UsageSummary | null,
  record: ImageGenerationRecord,
  dateStr: string,
  monthStr: string
): UsageDocsMutation {
  // Daily doc
  const currentProviders = (dailyData.providers || {}) as Record<string, Record<string, unknown>>;
  const currentProvider = currentProviders[record.providerId] || {};
  const currentImages = (currentProvider.images as ImageGenerationStats) || {
    totalImages: 0,
    byDimensions: {},
    byQuality: {},
  };

  const updatedImages: ImageGenerationStats = {
    totalImages: (currentImages.totalImages || 0) + record.imageCount,
    byDimensions: {
      ...currentImages.byDimensions,
      [record.dimensions]: (currentImages.byDimensions?.[record.dimensions] || 0) + record.imageCount,
    },
    byQuality: {
      ...currentImages.byQuality,
      ...(record.quality && {
        [record.quality]: (currentImages.byQuality?.[record.quality] || 0) + record.imageCount,
      }),
    },
  };

  const daily: Record<string, unknown> = {
    // Preserve token fields (byModel, byMode, totalTokens, totalRequests, …)
    ...dailyData,
    date: dateStr,
    totalImages: ((dailyData.totalImages as number) || 0) + record.imageCount,
    providers: {
      ...currentProviders,
      [record.providerId]: {
        ...currentProvider,
        images: updatedImages,
      },
    },
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Summary doc
  const counters = monthlyCountersAfterRollover(summaryData, monthStr);

  const currentByProvider = summaryData?.byProvider || {};
  const currentProviderStats = currentByProvider[record.providerId] || {
    tokens: 0,
    requests: 0,
    lastUsed: 0,
  };
  const currentProviderImages = currentProviderStats.images || {
    totalImages: 0,
    byDimensions: {},
    byQuality: {},
  };

  const updatedProviderImages: ImageGenerationStats = {
    totalImages: (currentProviderImages.totalImages || 0) + record.imageCount,
    byDimensions: {
      ...currentProviderImages.byDimensions,
      [record.dimensions]: (currentProviderImages.byDimensions?.[record.dimensions] || 0) + record.imageCount,
    },
    byQuality: {
      ...currentProviderImages.byQuality,
      ...(record.quality && {
        [record.quality]: (currentProviderImages.byQuality?.[record.quality] || 0) + record.imageCount,
      }),
    },
  };

  const summary: Record<string, unknown> = {
    ...(summaryData ?? {}),
    updatedAt: Date.now(),
    totalTokensAllTime: summaryData?.totalTokensAllTime || 0,
    totalRequestsAllTime: summaryData?.totalRequestsAllTime || 0,
    totalImagesAllTime: (summaryData?.totalImagesAllTime || 0) + record.imageCount,
    totalMediaAllTime: summaryData?.totalMediaAllTime || 0,
    currentMonthTokens: counters.currentMonthTokens,
    currentMonthRequests: counters.currentMonthRequests,
    currentMonthImages: counters.currentMonthImages + record.imageCount,
    currentMonthMedia: counters.currentMonthMedia,
    currentMonth: monthStr,
    byProvider: {
      ...currentByProvider,
      [record.providerId]: {
        ...currentProviderStats,
        lastUsed: Date.now(),
        images: updatedProviderImages,
      },
    },
    byModel: summaryData?.byModel || {},
  };

  return { daily, summary };
}

/**
 * Record image generation usage - called after successful image generation
 */
export async function recordImageGenerationInternal(
  uid: string,
  record: ImageGenerationRecord
): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const monthStr = dateStr.slice(0, 7); // YYYY-MM

  await runUsageMutation(uid, dateStr, (dailyData, summaryData) =>
    buildImageGenerationMutation(dailyData, summaryData, record, dateStr, monthStr)
  );
}

/**
 * Callable function for recording image generation from client
 */
export const recordImageGeneration = onCall(
  {
    timeoutSeconds: 10,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { providerId, modelId, imageCount, dimensions, quality } = request.data || {};

    if (!providerId || !modelId || !imageCount || !dimensions) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    await recordImageGenerationInternal(request.auth.uid, {
      providerId,
      modelId,
      imageCount,
      dimensions,
      quality,
      timestamp: Date.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// Record Media Generation (internal function)
// ============================================================================

/**
 * Record media generation usage by provider/media type only.
 * Cost estimates are intentionally excluded because usage is BYOK.
 */
/**
 * Pure mutation for a media generation record. Exported for tests.
 */
export function buildMediaGenerationMutation(
  dailyData: Record<string, unknown>,
  summaryData: UsageSummary | null,
  record: MediaGenerationRecord,
  dateStr: string,
  monthStr: string
): UsageDocsMutation {
  // Daily doc
  const currentProviders = (dailyData.providers || {}) as Record<string, Record<string, unknown>>;
  const currentProvider = currentProviders[record.providerId] || {};
  const currentMedia = (currentProvider.media as MediaGenerationStats) || {
    totalGenerations: 0,
    byMediaType: {},
    byOperation: {},
  };

  const updatedMedia: MediaGenerationStats = {
    totalGenerations: (currentMedia.totalGenerations || 0) + 1,
    byMediaType: {
      ...currentMedia.byMediaType,
      [record.mediaType]: (currentMedia.byMediaType?.[record.mediaType] || 0) + 1,
    },
    byOperation: {
      ...currentMedia.byOperation,
      [record.operation]: (currentMedia.byOperation?.[record.operation] || 0) + 1,
    },
  };

  const daily: Record<string, unknown> = {
    // Preserve token fields (byModel, byMode, totalTokens, totalRequests, …)
    ...dailyData,
    date: dateStr,
    totalMedia: ((dailyData.totalMedia as number) || 0) + 1,
    providers: {
      ...currentProviders,
      [record.providerId]: {
        ...currentProvider,
        media: updatedMedia,
      },
    },
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Summary doc
  const counters = monthlyCountersAfterRollover(summaryData, monthStr);

  const currentByProvider = summaryData?.byProvider || {};
  const currentProviderStats = currentByProvider[record.providerId] || {
    tokens: 0,
    requests: 0,
    lastUsed: 0,
  };
  const currentProviderMedia = currentProviderStats.media || {
    totalGenerations: 0,
    byMediaType: {},
    byOperation: {},
  };

  const updatedProviderMedia: MediaGenerationStats = {
    totalGenerations: (currentProviderMedia.totalGenerations || 0) + 1,
    byMediaType: {
      ...currentProviderMedia.byMediaType,
      [record.mediaType]: (currentProviderMedia.byMediaType?.[record.mediaType] || 0) + 1,
    },
    byOperation: {
      ...currentProviderMedia.byOperation,
      [record.operation]: (currentProviderMedia.byOperation?.[record.operation] || 0) + 1,
    },
  };

  const summary: Record<string, unknown> = {
    ...(summaryData ?? {}),
    updatedAt: Date.now(),
    totalTokensAllTime: summaryData?.totalTokensAllTime || 0,
    totalRequestsAllTime: summaryData?.totalRequestsAllTime || 0,
    totalImagesAllTime: summaryData?.totalImagesAllTime || 0,
    totalMediaAllTime: (summaryData?.totalMediaAllTime || 0) + 1,
    currentMonthTokens: counters.currentMonthTokens,
    currentMonthRequests: counters.currentMonthRequests,
    currentMonthImages: counters.currentMonthImages,
    currentMonthMedia: counters.currentMonthMedia + 1,
    currentMonth: monthStr,
    byProvider: {
      ...currentByProvider,
      [record.providerId]: {
        ...currentProviderStats,
        lastUsed: Date.now(),
        media: updatedProviderMedia,
      },
    },
    byModel: summaryData?.byModel || {},
  };

  return { daily, summary };
}

export async function recordMediaGenerationInternal(
  uid: string,
  record: MediaGenerationRecord
): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const monthStr = dateStr.slice(0, 7);

  await runUsageMutation(uid, dateStr, (dailyData, summaryData) =>
    buildMediaGenerationMutation(dailyData, summaryData, record, dateStr, monthStr)
  );
}

export const recordMediaGeneration = onCall(
  {
    timeoutSeconds: 10,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { providerId, mediaType, operation, modelId } = request.data || {};
    if (!providerId || !mediaType || !operation || !modelId) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (!['runway', 'elevenlabs'].includes(providerId)) {
      throw new HttpsError('invalid-argument', 'Invalid media provider');
    }

    if (!['video', 'audio'].includes(mediaType)) {
      throw new HttpsError('invalid-argument', 'Invalid media type');
    }

    await recordMediaGenerationInternal(request.auth.uid, {
      providerId,
      mediaType,
      operation,
      modelId,
      timestamp: Date.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// Get Usage Stats
// ============================================================================

/**
 * Get usage statistics for the dashboard
 */
export const getUsageStats = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const uid = request.auth.uid;
    const { period = '30d' } = request.data || {};
    const db = getFirestore();

    // Get summary
    const summaryDoc = await db.collection('users').doc(uid)
      .collection('usage').doc('summary').get();

    const summary = summaryDoc.exists ? unflattenObject(summaryDoc.data() || {}) as unknown as UsageSummary : null;
    console.log('getUsageStats: summary exists?', summaryDoc.exists, 'summary:', JSON.stringify(summary));

    // Calculate start date based on period
    const startDate = getStartDateForPeriod(period);

    // Get daily usage for the period
    console.log('getUsageStats: fetching daily data for period:', period, 'startDate:', startDate);

    const dailySnapshot = await db.collection('users').doc(uid)
      .collection('usage').doc('daily')
      .collection('days')
      .where('date', '>=', startDate)
      .orderBy('date', 'desc')
      .get();

    const daily = dailySnapshot.docs.map(doc => unflattenObject(doc.data()));
    console.log('getUsageStats: found', daily.length, 'daily documents');

    return { summary, daily };
  }
);

// Unflatten dot-notation keys into nested objects
// e.g., { "providers.claude.totalTokens": 100 } -> { providers: { claude: { totalTokens: 100 } } }
function unflattenObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (key.includes('.')) {
      const parts = key.split('.');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      current[parts[parts.length - 1]] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

function getStartDateForPeriod(period: string): string {
  const now = new Date();
  let daysBack: number;

  switch (period) {
    case '7d':
      daysBack = 7;
      break;
    case '30d':
      daysBack = 30;
      break;
    case '90d':
      daysBack = 90;
      break;
    case '1y':
      daysBack = 365;
      break;
    default:
      daysBack = 30;
  }

  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  return startDate.toISOString().split('T')[0];
}
