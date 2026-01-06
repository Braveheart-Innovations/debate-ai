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

interface UsageRecord {
  messageId: string;
  sessionId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionType: 'chat' | 'debate' | 'comparison';
  timestamp: number;
}

interface ImageGenerationRecord {
  providerId: string;
  modelId: string;
  imageCount: number;
  dimensions: string;
  quality?: string;
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
  currentMonthTokens: number;
  currentMonthRequests: number;
  currentMonthImages: number;
  currentMonth: string;
  byProvider: Record<string, {
    tokens: number;
    requests: number;
    lastUsed: number;
    images?: ImageGenerationStats;
  }>;
  byModel: Record<string, ModelUsageStats>;
}

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
    const noApiProviders = ['claude', 'google', 'perplexity', 'mistral', 'cohere', 'together', 'grok'];
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

/**
 * Record usage for a message - called by proxyAIRequest after successful response
 */
export async function recordUsageInternal(
  uid: string,
  record: UsageRecord
): Promise<void> {
  console.log('recordUsageInternal called:', { uid, providerId: record.providerId, modelId: record.modelId, totalTokens: record.totalTokens });

  const db = getFirestore();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const monthStr = dateStr.slice(0, 7); // YYYY-MM

  console.log('Writing usage for date:', dateStr, 'month:', monthStr);

  const batch = db.batch();

  // 1. Update daily usage (provider-level)
  const dailyRef = db.collection('users').doc(uid)
    .collection('usage').doc('daily')
    .collection('days').doc(dateStr);

  // Get current daily doc to merge properly (unflatten to handle legacy flat-key data)
  const dailyDoc = await dailyRef.get();
  const dailyData = dailyDoc.exists ? unflattenObject(dailyDoc.data() || {}) : {};

  // Build nested structure properly
  const currentProviders = (dailyData.providers || {}) as Record<string, { totalInputTokens?: number; totalOutputTokens?: number; totalTokens?: number; requestCount?: number }>;
  const currentProvider = currentProviders[record.providerId] || {};

  const currentByModel = (dailyData.byModel || {}) as Record<string, { inputTokens?: number; outputTokens?: number; requests?: number }>;
  const currentModel = currentByModel[record.modelId] || {};

  batch.set(dailyRef, {
    date: dateStr,
    providers: {
      ...currentProviders,
      [record.providerId]: {
        totalInputTokens: (currentProvider.totalInputTokens || 0) + record.inputTokens,
        totalOutputTokens: (currentProvider.totalOutputTokens || 0) + record.outputTokens,
        totalTokens: (currentProvider.totalTokens || 0) + record.totalTokens,
        requestCount: (currentProvider.requestCount || 0) + 1,
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
    totalTokens: ((dailyData.totalTokens as number) || 0) + record.totalTokens,
    totalRequests: ((dailyData.totalRequests as number) || 0) + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 2. Update summary
  const summaryRef = db.collection('users').doc(uid).collection('usage').doc('summary');

  // Get current summary to merge properly (unflatten to handle legacy flat-key data)
  const summaryDoc = await summaryRef.get();
  const summaryData = summaryDoc.exists ? unflattenObject(summaryDoc.data() || {}) as unknown as UsageSummary : null;
  const isNewMonth = !summaryData?.currentMonth || summaryData.currentMonth !== monthStr;

  // Build nested structures properly
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

  const updatedSummary = {
    updatedAt: Date.now(),
    totalTokensAllTime: (summaryData?.totalTokensAllTime || 0) + record.totalTokens,
    totalRequestsAllTime: (summaryData?.totalRequestsAllTime || 0) + 1,
    totalImagesAllTime: summaryData?.totalImagesAllTime || 0,
    currentMonthTokens: isNewMonth ? record.totalTokens : (summaryData?.currentMonthTokens || 0) + record.totalTokens,
    currentMonthRequests: isNewMonth ? 1 : (summaryData?.currentMonthRequests || 0) + 1,
    currentMonthImages: isNewMonth ? 0 : (summaryData?.currentMonthImages || 0),
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
  };

  batch.set(summaryRef, updatedSummary);

  await batch.commit();
  console.log('Usage batch committed successfully for:', { uid, dateStr, providerId: record.providerId });
}

// ============================================================================
// Record Image Generation (internal function)
// ============================================================================

/**
 * Record image generation usage - called after successful image generation
 */
export async function recordImageGenerationInternal(
  uid: string,
  record: ImageGenerationRecord
): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const monthStr = dateStr.slice(0, 7); // YYYY-MM

  const batch = db.batch();

  // 1. Update daily usage
  const dailyRef = db.collection('users').doc(uid)
    .collection('usage').doc('daily')
    .collection('days').doc(dateStr);

  // Get current daily doc to merge properly (unflatten to handle legacy flat-key data)
  const dailyDoc = await dailyRef.get();
  const dailyData = dailyDoc.exists ? unflattenObject(dailyDoc.data() || {}) : {};

  // Build nested structure properly
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

  batch.set(dailyRef, {
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
  });

  // 2. Update summary
  const summaryRef = db.collection('users').doc(uid).collection('usage').doc('summary');

  // Get current summary to merge properly (unflatten to handle legacy flat-key data)
  const summaryDoc = await summaryRef.get();
  const summaryData = summaryDoc.exists ? unflattenObject(summaryDoc.data() || {}) as unknown as UsageSummary : null;
  const isNewMonth = !summaryData?.currentMonth || summaryData.currentMonth !== monthStr;

  // Build nested structure properly
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

  const updatedSummary = {
    updatedAt: Date.now(),
    totalTokensAllTime: summaryData?.totalTokensAllTime || 0,
    totalRequestsAllTime: summaryData?.totalRequestsAllTime || 0,
    totalImagesAllTime: (summaryData?.totalImagesAllTime || 0) + record.imageCount,
    currentMonthTokens: isNewMonth ? 0 : (summaryData?.currentMonthTokens || 0),
    currentMonthRequests: isNewMonth ? 0 : (summaryData?.currentMonthRequests || 0),
    currentMonthImages: isNewMonth ? record.imageCount : (summaryData?.currentMonthImages || 0) + record.imageCount,
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

  batch.set(summaryRef, updatedSummary);

  await batch.commit();
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

