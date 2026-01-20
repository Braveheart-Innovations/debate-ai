/**
 * useStorePrices - Read store prices from Redux
 *
 * Prices are loaded ONCE at app startup in App.tsx and stored in Redux.
 * This hook simply reads from Redux - no fetching, no caching logic.
 */

import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import type { PriceInfo, TrialInfo } from '@/services/prices/PricesPersistenceService';

// Re-export types for consumers
export type { PriceInfo, TrialInfo };

export interface StorePricesResult {
  monthly: PriceInfo;
  annual: PriceInfo;
  lifetime: PriceInfo;
  loading: boolean;
}

export function useStorePrices(): StorePricesResult {
  const prices = useSelector((state: RootState) => state.prices);

  return {
    monthly: prices.monthly,
    annual: prices.annual,
    lifetime: prices.lifetime,
    loading: !prices.loaded,
  };
}

export default useStorePrices;
