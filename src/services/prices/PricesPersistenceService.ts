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

export interface PriceInfo {
  localizedPrice: string;
  price: string;
  currency: string;
}

interface PersistedPrices {
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
  fetchedAt: number;
}

const STORAGE_KEY = '@store_prices';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback prices (USD)
export const FALLBACK_PRICES: Record<'monthly' | 'annual' | 'lifetime', PriceInfo> = {
  monthly: { localizedPrice: '$5.99', price: '5.99', currency: 'USD' },
  annual: { localizedPrice: '$49.99', price: '49.99', currency: 'USD' },
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

function extractAndroidPrice(sub: SubscriptionAndroid): PriceInfo | null {
  const offer = sub.subscriptionOfferDetails?.[0];
  if (!offer) return null;

  const phases = offer.pricingPhases.pricingPhaseList;
  const recurringPhase = phases.find((p) => p.priceAmountMicros !== '0');
  if (!recurringPhase) return null;

  return {
    localizedPrice: recurringPhase.formattedPrice,
    price: (parseInt(recurringPhase.priceAmountMicros, 10) / 1000000).toFixed(2),
    currency: recurringPhase.priceCurrencyCode,
  };
}

function extractIOSPrice(sub: SubscriptionIOS): PriceInfo | null {
  if (!sub.localizedPrice) return null;
  return {
    localizedPrice: sub.localizedPrice,
    price: sub.price,
    currency: sub.currency,
  };
}
