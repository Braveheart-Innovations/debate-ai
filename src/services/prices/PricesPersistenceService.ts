/**
 * PricesPersistenceService - Persist store prices to AsyncStorage with 24h TTL
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ProductSubscriptionAndroid, ProductSubscriptionIOS } from 'react-native-iap';
import { SUBSCRIPTION_PRODUCTS } from '@/services/iap/products';
import { isAndroidEmulatorStoreUnavailable } from '@/services/iap/environment';
import { getIapModule } from '@/services/iap/nativeModule';

export interface TrialInfo {
  /** Human-readable trial duration (e.g., "1 week", "7 days", "3 days") */
  durationText: string;
  /** Number of days in the trial */
  durationDays: number;
  /** Whether this plan has a free trial */
  hasTrial: boolean;
}

/** Discounted price charged for a fixed number of billing cycles after the trial, before the base price */
export interface IntroPriceInfo {
  /** Localized intro price per billing period (e.g., "$2.99") */
  localizedPrice: string;
  /** Human-readable intro duration (e.g., "6 months") */
  durationText: string;
}

export interface PriceInfo {
  /** Base (regular) recurring price - what the subscription renews at once any offer ends */
  localizedPrice: string;
  price: string;
  currency: string;
  /** Trial information if the subscription has a free trial offer */
  trial?: TrialInfo;
  /** Introductory price phase of the trial offer, if any - must be disclosed alongside the trial */
  intro?: IntroPriceInfo;
}

interface PersistedPrices {
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
  fetchedAt: number;
}

// v2: PriceInfo.localizedPrice is now the base price and intro phases are captured separately
const STORAGE_KEY = '@store_prices_v2';
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
  if (isAndroidEmulatorStoreUnavailable()) {
    return FALLBACK_PRICES;
  }

  try {
    const { fetchProducts, isEligibleForIntroOfferIOS } = await getIapModule();
    const subscriptionSkus = [SUBSCRIPTION_PRODUCTS.monthly, SUBSCRIPTION_PRODUCTS.annual];
    const productSkus = [SUBSCRIPTION_PRODUCTS.lifetime];

    // Fetch sequentially - react-native-iap can't handle concurrent calls
    const subscriptions = await fetchProducts({ skus: subscriptionSkus, type: 'subs' });
    const products = await fetchProducts({ skus: productSkus, type: 'in-app' });

    const prices = {
      monthly: FALLBACK_PRICES.monthly,
      annual: FALLBACK_PRICES.annual,
      lifetime: FALLBACK_PRICES.lifetime,
    };

    // Extract subscription prices
    for (const sub of (subscriptions ?? [])) {
      let priceInfo: PriceInfo | null = null;

      if (Platform.OS === 'android') {
        priceInfo = extractAndroidPrice(sub as ProductSubscriptionAndroid);
      } else {
        priceInfo = extractIOSPrice(sub as ProductSubscriptionIOS);
        // StoreKit lists the introductory offer whether or not this Apple ID can still
        // redeem it; drop the trial so the app never advertises one the purchase sheet won't show.
        const groupId = (sub as ProductSubscriptionIOS).subscriptionInfoIOS?.subscriptionGroupId;
        if (priceInfo?.trial && groupId) {
          try {
            if (!(await isEligibleForIntroOfferIOS(groupId))) {
              priceInfo = { ...priceInfo, trial: undefined };
            }
          } catch (e) {
            console.warn('Intro offer eligibility check failed:', e);
          }
        }
      }

      if (priceInfo) {
        if (sub.id === SUBSCRIPTION_PRODUCTS.monthly) {
          prices.monthly = priceInfo;
        } else if (sub.id === SUBSCRIPTION_PRODUCTS.annual) {
          prices.annual = priceInfo;
        }
      }
    }

    // Extract lifetime price
    for (const prod of (products ?? [])) {
      if (prod.id === SUBSCRIPTION_PRODUCTS.lifetime && prod.displayPrice) {
        prices.lifetime = {
          localizedPrice: prod.displayPrice,
          price: String(prod.price ?? 0),
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

// Play Billing PricingPhase.recurrenceMode
const RECURRENCE_INFINITE = 1;
const RECURRENCE_FINITE = 2;

const PERIOD_UNITS = [
  { pattern: /P(\d+)Y/, singular: 'year', days: 365 },
  { pattern: /P(\d+)M/, singular: 'month', days: 30 },
  { pattern: /P(\d+)W/, singular: 'week', days: 7 },
  { pattern: /P(\d+)D/, singular: 'day', days: 1 },
] as const;

/**
 * Parse an ISO 8601 period, optionally repeated `cycles` times, to human-readable text and days
 * Examples: P1W = 1 week (7 days), P3D = 3 days, P1M x 6 = 6 months (180 days)
 */
function parseBillingPeriod(billingPeriod: string, cycles = 1): { durationText: string; durationDays: number } {
  for (const unit of PERIOD_UNITS) {
    const match = billingPeriod.match(unit.pattern);
    if (match) {
      const count = parseInt(match[1], 10) * Math.max(cycles, 1);
      return {
        durationText: count === 1 ? `1 ${unit.singular}` : `${count} ${unit.singular}s`,
        durationDays: count * unit.days,
      };
    }
  }

  // Default fallback
  return { durationText: '1 week', durationDays: 7 };
}

function extractAndroidPrice(sub: ProductSubscriptionAndroid): PriceInfo | null {
  // Find the offer with a free trial first, or fall back to first offer
  const offerWithTrial = sub.subscriptionOfferDetailsAndroid?.find((o) =>
    o.pricingPhases.pricingPhaseList.some((p) => p.priceAmountMicros === '0')
  );
  const offer = offerWithTrial || sub.subscriptionOfferDetailsAndroid?.[0];
  if (!offer) return null;

  const phases = offer.pricingPhases.pricingPhaseList;
  const trialPhase = phases.find((p) => p.priceAmountMicros === '0');
  // The base price is the phase that recurs forever. An offer can sit a discounted
  // finite phase between the trial and the base price (trial -> intro -> base); the
  // first paid phase is NOT necessarily what the subscription renews at.
  const paidPhases = phases.filter((p) => p.priceAmountMicros !== '0');
  const basePhase = paidPhases.find((p) => p.recurrenceMode === RECURRENCE_INFINITE)
    ?? paidPhases[paidPhases.length - 1];
  if (!basePhase) return null;
  const introPhase = paidPhases.find((p) => p !== basePhase && p.recurrenceMode === RECURRENCE_FINITE);

  // Extract trial info if available
  let trial: TrialInfo | undefined;
  if (trialPhase) {
    const { durationText, durationDays } = parseBillingPeriod(trialPhase.billingPeriod);
    trial = {
      durationText,
      durationDays,
      hasTrial: true,
    };
  }

  return {
    localizedPrice: basePhase.formattedPrice,
    price: (parseInt(basePhase.priceAmountMicros, 10) / 1000000).toFixed(2),
    currency: basePhase.priceCurrencyCode,
    trial,
    ...(introPhase && {
      intro: {
        localizedPrice: introPhase.formattedPrice,
        durationText: parseBillingPeriod(introPhase.billingPeriod, introPhase.billingCycleCount).durationText,
      },
    }),
  };
}

function extractIOSPrice(sub: ProductSubscriptionIOS): PriceInfo | null {
  if (!sub.displayPrice) return null;

  // Extract trial info from subscription offers
  let trial: TrialInfo | undefined;

  // In v14, trial info comes from subscriptionOffers
  const offers = sub.subscriptionOffers ?? [];
  const trialOffer = offers.find(o => o.paymentMode === 'free-trial');
  if (trialOffer?.period) {
    const period = trialOffer.period;
    let durationText = '1 week';
    let durationDays = 7;

    if (period.unit === 'week') {
      durationText = period.value === 1 ? '1 week' : `${period.value} weeks`;
      durationDays = period.value * 7;
    } else if (period.unit === 'day') {
      durationText = period.value === 1 ? '1 day' : `${period.value} days`;
      durationDays = period.value;
    } else if (period.unit === 'month') {
      durationText = period.value === 1 ? '1 month' : `${period.value} months`;
      durationDays = period.value * 30;
    }

    trial = { durationText, durationDays, hasTrial: true };
  }

  return {
    localizedPrice: sub.displayPrice,
    price: String(sub.price ?? 0),
    currency: sub.currency,
    trial,
  };
}
