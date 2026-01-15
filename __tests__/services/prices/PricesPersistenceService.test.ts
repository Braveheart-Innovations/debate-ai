import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPersistedPrices,
  fetchAndPersistPrices,
  FALLBACK_PRICES,
} from '@/services/prices/PricesPersistenceService';
import { getSubscriptions, getProducts } from 'react-native-iap';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('react-native-iap', () => ({
  getSubscriptions: jest.fn(),
  getProducts: jest.fn(),
}));

jest.mock('@/services/iap/products', () => ({
  SUBSCRIPTION_PRODUCTS: {
    monthly: 'com.test.monthly',
    annual: 'com.test.annual',
    lifetime: 'com.test.lifetime',
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockGetSubscriptions = getSubscriptions as jest.MockedFunction<typeof getSubscriptions>;
const mockGetProducts = getProducts as jest.MockedFunction<typeof getProducts>;

describe('PricesPersistenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadPersistedPrices', () => {
    it('returns null when no cached data', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await loadPersistedPrices();

      expect(result).toBeNull();
    });

    it('returns null when cached data is stale (>24h)', async () => {
      const staleData = {
        monthly: FALLBACK_PRICES.monthly,
        annual: FALLBACK_PRICES.annual,
        lifetime: FALLBACK_PRICES.lifetime,
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(staleData));

      const result = await loadPersistedPrices();

      expect(result).toBeNull();
    });

    it('returns cached data when fresh (<24h)', async () => {
      const freshData = {
        monthly: { localizedPrice: '€4.99', price: '4.99', currency: 'EUR' },
        annual: { localizedPrice: '€39.99', price: '39.99', currency: 'EUR' },
        lifetime: { localizedPrice: '€99.99', price: '99.99', currency: 'EUR' },
        fetchedAt: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
      };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(freshData));

      const result = await loadPersistedPrices();

      expect(result).toEqual(freshData);
    });
  });

  describe('fetchAndPersistPrices', () => {
    it('fetches prices and persists to AsyncStorage', async () => {
      mockGetSubscriptions.mockResolvedValue([
        { productId: 'com.test.monthly', localizedPrice: '$5.99', price: '5.99', currency: 'USD' },
        { productId: 'com.test.annual', localizedPrice: '$49.99', price: '49.99', currency: 'USD' },
      ] as never);
      mockGetProducts.mockResolvedValue([
        { productId: 'com.test.lifetime', localizedPrice: '$129.99', price: '129.99', currency: 'USD' },
      ] as never);

      const result = await fetchAndPersistPrices();

      expect(result.monthly.localizedPrice).toBe('$5.99');
      expect(result.annual.localizedPrice).toBe('$49.99');
      expect(result.lifetime.localizedPrice).toBe('$129.99');
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });

    it('returns fallback prices on error', async () => {
      mockGetSubscriptions.mockRejectedValue(new Error('Network error'));

      const result = await fetchAndPersistPrices();

      expect(result).toEqual(FALLBACK_PRICES);
    });
  });
});
