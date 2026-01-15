import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import {
  initConnection,
  getSubscriptions,
  getProducts,
  type Product,
  type SubscriptionAndroid,
  type SubscriptionIOS,
} from 'react-native-iap';
import { SUBSCRIPTION_PRODUCTS } from '@/services/iap/products';
import { ErrorService } from '@/services/errors/ErrorService';

export interface PriceInfo {
  localizedPrice: string;
  price: string;
  currency: string;
}

export interface StorePricesResult {
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

// Module-level cache with 24-hour TTL
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cachedPrices: {
  monthly: PriceInfo | null;
  annual: PriceInfo | null;
  lifetime: PriceInfo | null;
  fetchedAt: number;
} | null = null;

// Module-level fetch lock to prevent concurrent IAP requests
let fetchInProgress: Promise<void> | null = null;

function isCacheValid(): boolean {
  if (!cachedPrices) return false;
  return Date.now() - cachedPrices.fetchedAt < CACHE_TTL_MS;
}

// Export for testing only - resets module-level cache
export function __resetCacheForTesting(): void {
  cachedPrices = null;
  fetchInProgress = null;
}

// Fallback prices (USD) used when store fetch fails
const FALLBACK_PRICES: Record<'monthly' | 'annual' | 'lifetime', PriceInfo> = {
  monthly: { localizedPrice: '$5.99', price: '5.99', currency: 'USD' },
  annual: { localizedPrice: '$49.99', price: '49.99', currency: 'USD' },
  lifetime: { localizedPrice: '$129.99', price: '129.99', currency: 'USD' },
};

/**
 * Extract price info from Android subscription.
 * Android uses nested subscriptionOfferDetails with pricingPhases.
 */
function extractPriceFromAndroidSubscription(
  subscription: SubscriptionAndroid
): PriceInfo | null {
  const offer = subscription.subscriptionOfferDetails?.[0];
  if (!offer) return null;

  // Find the recurring price phase (not free trial - priceAmountMicros !== '0')
  const phases = offer.pricingPhases.pricingPhaseList;
  const recurringPhase = phases.find(
    (phase) => phase.priceAmountMicros !== '0'
  );

  if (!recurringPhase) return null;

  return {
    localizedPrice: recurringPhase.formattedPrice,
    price: (parseInt(recurringPhase.priceAmountMicros, 10) / 1000000).toFixed(2),
    currency: recurringPhase.priceCurrencyCode,
  };
}

/**
 * Extract price info from iOS subscription.
 * iOS has localizedPrice directly on the subscription object.
 */
function extractPriceFromIOSSubscription(
  subscription: SubscriptionIOS
): PriceInfo | null {
  if (!subscription.localizedPrice) return null;

  return {
    localizedPrice: subscription.localizedPrice,
    price: subscription.price,
    currency: subscription.currency,
  };
}

/**
 * Extract price info from a one-time product (lifetime).
 */
function extractPriceFromProduct(product: Product): PriceInfo | null {
  if (!product.localizedPrice) return null;

  return {
    localizedPrice: product.localizedPrice,
    price: product.price,
    currency: product.currency,
  };
}

/**
 * Hook to fetch and cache localized prices from the App Store / Play Store.
 * Returns fallback USD prices if store fetch fails.
 */
export function useStorePrices(): StorePricesResult {
  const [prices, setPrices] = useState<{
    monthly: PriceInfo | null;
    annual: PriceInfo | null;
    lifetime: PriceInfo | null;
  }>({
    monthly: isCacheValid() ? cachedPrices!.monthly : null,
    annual: isCacheValid() ? cachedPrices!.annual : null,
    lifetime: isCacheValid() ? cachedPrices!.lifetime : null,
  });
  const [loading, setLoading] = useState(!isCacheValid());
  const [error, setError] = useState<Error | null>(null);

  const fetchPrices = useCallback(async () => {
    // If fetch already in progress, wait for it instead of starting a new one
    if (fetchInProgress) {
      try {
        await fetchInProgress;
        // After waiting, use the cached prices
        if (cachedPrices) {
          setPrices(cachedPrices);
        }
      } catch {
        // Ignore - the original fetch handles errors
      } finally {
        setLoading(false);
      }
      return;
    }

    const doFetch = async () => {
      try {
        setLoading(true);
        setError(null);

        // Ensure IAP connection is established before fetching prices
        await initConnection();

        const subscriptionSkus = [
          SUBSCRIPTION_PRODUCTS.monthly,
          SUBSCRIPTION_PRODUCTS.annual,
        ];
        const productSkus = [SUBSCRIPTION_PRODUCTS.lifetime];

        const [subscriptions, products] = await Promise.all([
          getSubscriptions({ skus: subscriptionSkus }),
          getProducts({ skus: productSkus }),
        ]);

        const newPrices: {
          monthly: PriceInfo | null;
          annual: PriceInfo | null;
          lifetime: PriceInfo | null;
        } = {
          monthly: null,
          annual: null,
          lifetime: null,
        };

        // Process subscriptions
        for (const sub of subscriptions) {
          const productId = sub.productId;
          let priceInfo: PriceInfo | null = null;

          if (Platform.OS === 'android') {
            priceInfo = extractPriceFromAndroidSubscription(sub as SubscriptionAndroid);
          } else {
            priceInfo = extractPriceFromIOSSubscription(sub as SubscriptionIOS);
          }

          if (productId === SUBSCRIPTION_PRODUCTS.monthly) {
            newPrices.monthly = priceInfo;
          } else if (productId === SUBSCRIPTION_PRODUCTS.annual) {
            newPrices.annual = priceInfo;
          }
        }

        // Process lifetime product
        for (const prod of products) {
          if (prod.productId === SUBSCRIPTION_PRODUCTS.lifetime) {
            newPrices.lifetime = extractPriceFromProduct(prod);
          }
        }

        cachedPrices = { ...newPrices, fetchedAt: Date.now() };
        setPrices(newPrices);
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Failed to fetch prices');
        setError(err);
        ErrorService.handleSilent(e, { action: 'fetch_store_prices' });
      } finally {
        setLoading(false);
        fetchInProgress = null;
      }
    };

    fetchInProgress = doFetch();
    await fetchInProgress;
  }, []);

  useEffect(() => {
    if (!isCacheValid()) {
      fetchPrices();
    }
  }, [fetchPrices]);

  // Return fallback prices when store prices unavailable
  return {
    monthly: prices.monthly ?? FALLBACK_PRICES.monthly,
    annual: prices.annual ?? FALLBACK_PRICES.annual,
    lifetime: prices.lifetime ?? FALLBACK_PRICES.lifetime,
    loading,
    error,
    refresh: fetchPrices,
  };
}

export default useStorePrices;
