/**
 * PricesPersistenceService - Persist store prices to AsyncStorage with 24h TTL
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  getSubscriptions,
  getProducts,
  type SubscriptionAndroid,
  type SubscriptionIOS,
} from 'react-native-iap';
import { SUBSCRIPTION_PRODUCTS } from '@/services/iap/products';

export interface TrialInfo {
  /** Human-readable trial duration (e.g., "1 week", "7 days", "3 days") */
  durationText: string;
  /** Number of days in the trial */
  durationDays: number;
  /** Whether this plan has a free trial */
  hasTrial: boolean;
}

export interface PriceInfo {
  localizedPrice: string;
  price: string;
  currency: string;
  /** Trial information if the subscription has a free trial offer */
  trial?: TrialInfo;
}

interface PersistedPrices {
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
  fetchedAt: number;
}

const STORAGE_KEY = '@store_prices';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback prices (USD) - trial defaults to 1 week to match Google Play Console config
export const FALLBACK_PRICES: Record<'monthly' | 'annual' | 'lifetime', PriceInfo> = {
  monthly: {
    localizedPrice: '$5.99',
    price: '5.99',
    currency: 'USD',
    trial: { durationText: '1 week', durationDays: 7, hasTrial: true },
  },
  annual: {
    localizedPrice: '$49.99',
    price: '49.99',
    currency: 'USD',
    trial: { durationText: '1 week', durationDays: 7, hasTrial: true },
  },
  lifetime: { localizedPrice: '$129.99', price: '129.99', currency: 'USD' },
};

/**
 * Load prices from AsyncStorage. Returns null if missing or stale (>24h).
 */
export async function loadPersistedPrices(): Promise<PersistedPrices | null> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return null;

    const data = JSON.parse(json) as PersistedPrices;
    const age = Date.now() - data.fetchedAt;

    if (age > TTL_MS) {
      console.warn('Persisted prices are stale, will refresh');
      return null;
    }

    return data;
  } catch (e) {
    console.warn('Failed to load persisted prices:', e);
    return null;
  }
}

/**
 * Fetch prices from App Store / Play Store and persist to AsyncStorage.
 * Call this ONLY if loadPersistedPrices() returns null.
 */
export async function fetchAndPersistPrices(): Promise<{
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
}> {
  try {
    const subscriptionSkus = [SUBSCRIPTION_PRODUCTS.monthly, SUBSCRIPTION_PRODUCTS.annual];
    const productSkus = [SUBSCRIPTION_PRODUCTS.lifetime];

    // Fetch sequentially - react-native-iap can't handle concurrent calls
    const subscriptions = await getSubscriptions({ skus: subscriptionSkus });
    const products = await getProducts({ skus: productSkus });

    const prices = {
      monthly: FALLBACK_PRICES.monthly,
      annual: FALLBACK_PRICES.annual,
      lifetime: FALLBACK_PRICES.lifetime,
    };

    // Extract subscription prices
    for (const sub of subscriptions) {
      let priceInfo: PriceInfo | null = null;

      if (Platform.OS === 'android') {
        priceInfo = extractAndroidPrice(sub as SubscriptionAndroid);
      } else {
        priceInfo = extractIOSPrice(sub as SubscriptionIOS);
      }

      if (priceInfo) {
        if (sub.productId === SUBSCRIPTION_PRODUCTS.monthly) {
          prices.monthly = priceInfo;
        } else if (sub.productId === SUBSCRIPTION_PRODUCTS.annual) {
          prices.annual = priceInfo;
        }
      }
    }

    // Extract lifetime price
    for (const prod of products) {
      if (prod.productId === SUBSCRIPTION_PRODUCTS.lifetime && prod.localizedPrice) {
        prices.lifetime = {
          localizedPrice: prod.localizedPrice,
          price: prod.price,
          currency: prod.currency,
        };
      }
    }

    // Persist to AsyncStorage
    const toSave: PersistedPrices = { ...prices, fetchedAt: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    console.warn('Prices fetched and persisted');

    return prices;
  } catch (e) {
    console.warn('Failed to fetch store prices:', e);
    return FALLBACK_PRICES;
  }
}

/**
 * Parse ISO 8601 duration string to human-readable text and days
 * Examples: P1W = 1 week (7 days), P3D = 3 days, P1M = 1 month (30 days)
 */
function parseTrialDuration(billingPeriod: string): { durationText: string; durationDays: number } {
  // Match patterns like P1W, P7D, P3D, P1M
  const weekMatch = billingPeriod.match(/P(\d+)W/);
  const dayMatch = billingPeriod.match(/P(\d+)D/);
  const monthMatch = billingPeriod.match(/P(\d+)M/);

  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    return {
      durationText: weeks === 1 ? '1 week' : `${weeks} weeks`,
      durationDays: weeks * 7,
    };
  }
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return {
      durationText: days === 1 ? '1 day' : `${days} days`,
      durationDays: days,
    };
  }
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    return {
      durationText: months === 1 ? '1 month' : `${months} months`,
      durationDays: months * 30,
    };
  }

  // Default fallback
  return { durationText: '1 week', durationDays: 7 };
}

function extractAndroidPrice(sub: SubscriptionAndroid): PriceInfo | null {
  // Find the offer with a free trial first, or fall back to first offer
  const offerWithTrial = sub.subscriptionOfferDetails?.find((o) =>
    o.pricingPhases.pricingPhaseList.some((p) => p.priceAmountMicros === '0')
  );
  const offer = offerWithTrial || sub.subscriptionOfferDetails?.[0];
  if (!offer) return null;

  const phases = offer.pricingPhases.pricingPhaseList;
  const trialPhase = phases.find((p) => p.priceAmountMicros === '0');
  const recurringPhase = phases.find((p) => p.priceAmountMicros !== '0');
  if (!recurringPhase) return null;

  // Extract trial info if available
  let trial: TrialInfo | undefined;
  if (trialPhase) {
    const { durationText, durationDays } = parseTrialDuration(trialPhase.billingPeriod);
    trial = {
      durationText,
      durationDays,
      hasTrial: true,
    };
  }

  return {
    localizedPrice: recurringPhase.formattedPrice,
    price: (parseInt(recurringPhase.priceAmountMicros, 10) / 1000000).toFixed(2),
    currency: recurringPhase.priceCurrencyCode,
    trial,
  };
}

function extractIOSPrice(sub: SubscriptionIOS): PriceInfo | null {
  if (!sub.localizedPrice) return null;

  // Extract trial info from introductoryPrice if available
  let trial: TrialInfo | undefined;
  const introPrice = sub as SubscriptionIOS & {
    introductoryPrice?: string;
    introductoryPriceNumberOfPeriodsIOS?: string;
    introductoryPriceSubscriptionPeriodIOS?: string;
  };

  // iOS free trial has introductoryPrice of "0" or empty and a subscription period
  if (introPrice.introductoryPriceSubscriptionPeriodIOS) {
    const period = introPrice.introductoryPriceSubscriptionPeriodIOS;
    // iOS periods: DAY, WEEK, MONTH, YEAR
    let durationText = '1 week';
    let durationDays = 7;

    if (period === 'WEEK') {
      durationText = '1 week';
      durationDays = 7;
    } else if (period === 'DAY') {
      const numPeriods = parseInt(introPrice.introductoryPriceNumberOfPeriodsIOS || '7', 10);
      durationText = numPeriods === 1 ? '1 day' : `${numPeriods} days`;
      durationDays = numPeriods;
    } else if (period === 'MONTH') {
      durationText = '1 month';
      durationDays = 30;
    }

    // Only set trial if it's actually free (price is 0 or empty)
    const introAmount = parseFloat(introPrice.introductoryPrice || '0');
    if (introAmount === 0) {
      trial = { durationText, durationDays, hasTrial: true };
    }
  }

  return {
    localizedPrice: sub.localizedPrice,
    price: sub.price,
    currency: sub.currency,
    trial,
  };
}
