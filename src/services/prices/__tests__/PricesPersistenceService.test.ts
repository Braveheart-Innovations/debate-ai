import { Platform } from 'react-native';
import type { ProductSubscriptionAndroid, ProductSubscriptionIOS, ProductSubscriptionAndroidOfferDetails } from 'react-native-iap';

// Mock implementations
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockFetchProducts = jest.fn();

// Mock modules
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

jest.mock('react-native-iap', () => ({
  fetchProducts: (...args: unknown[]) => mockFetchProducts(...args),
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('@/services/iap/products', () => ({
  SUBSCRIPTION_PRODUCTS: {
    monthly: 'symposiumai_monthly',
    annual: 'symposiumai_annual',
    lifetime: 'symposiumai_lifetime',
  },
}));

// Import after mocks
import {
  loadPersistedPrices,
  fetchAndPersistPrices,
  FALLBACK_PRICES,
} from '../PricesPersistenceService';

// Helper to create properly typed subscription offer details
function createOffer(
  offerToken: string,
  pricingPhaseList: Array<{
    priceAmountMicros: string;
    billingPeriod: string;
    formattedPrice: string;
    priceCurrencyCode: string;
    recurrenceMode: number;
    billingCycleCount: number;
  }>
): ProductSubscriptionAndroidOfferDetails {
  return {
    offerToken,
    basePlanId: 'base-plan',
    offerId: 'offer-id',
    offerTags: [],
    pricingPhases: { pricingPhaseList },
  } as ProductSubscriptionAndroidOfferDetails;
}

describe('PricesPersistenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockFetchProducts.mockResolvedValue([]);
  });

  describe('FALLBACK_PRICES', () => {
    it('should have trial info for monthly subscription', () => {
      expect(FALLBACK_PRICES.monthly.trial).toBeDefined();
      expect(FALLBACK_PRICES.monthly.trial?.hasTrial).toBe(true);
      expect(FALLBACK_PRICES.monthly.trial?.durationText).toBe('1 week');
      expect(FALLBACK_PRICES.monthly.trial?.durationDays).toBe(7);
    });

    it('should have trial info for annual subscription', () => {
      expect(FALLBACK_PRICES.annual.trial).toBeDefined();
      expect(FALLBACK_PRICES.annual.trial?.hasTrial).toBe(true);
      expect(FALLBACK_PRICES.annual.trial?.durationText).toBe('1 week');
      expect(FALLBACK_PRICES.annual.trial?.durationDays).toBe(7);
    });

    it('should not have trial info for lifetime product', () => {
      expect(FALLBACK_PRICES.lifetime.trial).toBeUndefined();
    });
  });

  describe('loadPersistedPrices()', () => {
    it('should return null when no persisted data exists', async () => {
      mockGetItem.mockResolvedValue(null);

      const result = await loadPersistedPrices();

      expect(result).toBeNull();
    });

    it('should return persisted data when valid and fresh', async () => {
      const persistedData = {
        monthly: { localizedPrice: '$5.99', price: '5.99', currency: 'USD', trial: { durationText: '1 week', durationDays: 7, hasTrial: true } },
        annual: { localizedPrice: '$49.99', price: '49.99', currency: 'USD', trial: { durationText: '1 week', durationDays: 7, hasTrial: true } },
        lifetime: { localizedPrice: '$129.99', price: '129.99', currency: 'USD' },
        fetchedAt: Date.now() - 1000, // 1 second ago
      };
      mockGetItem.mockResolvedValue(JSON.stringify(persistedData));

      const result = await loadPersistedPrices();

      expect(result).toEqual(persistedData);
    });

    it('should return null when data is stale (>24 hours)', async () => {
      const persistedData = {
        monthly: { localizedPrice: '$5.99', price: '5.99', currency: 'USD' },
        annual: { localizedPrice: '$49.99', price: '49.99', currency: 'USD' },
        lifetime: { localizedPrice: '$129.99', price: '129.99', currency: 'USD' },
        fetchedAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
      };
      mockGetItem.mockResolvedValue(JSON.stringify(persistedData));

      const result = await loadPersistedPrices();

      expect(result).toBeNull();
    });

    it('should return null on JSON parse error', async () => {
      mockGetItem.mockResolvedValue('invalid-json');

      const result = await loadPersistedPrices();

      expect(result).toBeNull();
    });
  });

  describe('fetchAndPersistPrices()', () => {
    describe('Android trial extraction', () => {
      beforeEach(() => {
        Platform.OS = 'android';
      });

      it('should extract 1-week trial from Android subscription', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_monthly',
          subscriptionOfferDetailsAndroid: [
            createOffer('trial-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P1W',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeDefined();
        expect(result.monthly.trial?.durationText).toBe('1 week');
        expect(result.monthly.trial?.durationDays).toBe(7);
        expect(result.monthly.trial?.hasTrial).toBe(true);
      });

      it('should extract 3-day trial from Android subscription', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_monthly',
          subscriptionOfferDetailsAndroid: [
            createOffer('trial-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P3D',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial?.durationText).toBe('3 days');
        expect(result.monthly.trial?.durationDays).toBe(3);
      });

      it('should extract 7-day trial from Android subscription', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_monthly',
          subscriptionOfferDetailsAndroid: [
            createOffer('trial-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P7D',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial?.durationText).toBe('7 days');
        expect(result.monthly.trial?.durationDays).toBe(7);
      });

      it('should extract 1-month trial from Android subscription', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_annual',
          subscriptionOfferDetailsAndroid: [
            createOffer('trial-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P1M',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '49990000',
                billingPeriod: 'P1Y',
                formattedPrice: '$49.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.annual.trial?.durationText).toBe('1 month');
        expect(result.annual.trial?.durationDays).toBe(30);
      });

      it('should prefer offer with free trial over regular offer', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_monthly',
          subscriptionOfferDetailsAndroid: [
            createOffer('regular-offer', [
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
            createOffer('trial-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P1W',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeDefined();
        expect(result.monthly.trial?.hasTrial).toBe(true);
      });

      it('should not set trial when subscription has no free trial', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_monthly',
          subscriptionOfferDetailsAndroid: [
            createOffer('regular-offer', [
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeUndefined();
      });

      it('should report the base price, not the intro price, for a trial -> intro -> base offer', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_monthly',
          subscriptionOfferDetailsAndroid: [
            createOffer('trial-intro-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P1W',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 2,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '2990000',
                billingPeriod: 'P1M',
                formattedPrice: '$2.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 2,
                billingCycleCount: 6,
              },
              {
                priceAmountMicros: '5990000',
                billingPeriod: 'P1M',
                formattedPrice: '$5.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.localizedPrice).toBe('$5.99');
        expect(result.monthly.price).toBe('5.99');
        expect(result.monthly.intro).toEqual({ localizedPrice: '$2.99', durationText: '6 months' });
        expect(result.monthly.trial?.durationText).toBe('1 week');
      });

      it('should not set intro when the trial goes straight to the base price', async () => {
        const mockSubscription: Partial<ProductSubscriptionAndroid> = {
          id: 'symposiumai_annual',
          subscriptionOfferDetailsAndroid: [
            createOffer('trial-offer', [
              {
                priceAmountMicros: '0',
                billingPeriod: 'P1W',
                formattedPrice: 'Free',
                priceCurrencyCode: 'USD',
                recurrenceMode: 2,
                billingCycleCount: 1,
              },
              {
                priceAmountMicros: '49990000',
                billingPeriod: 'P1Y',
                formattedPrice: '$49.99',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
                billingCycleCount: 0,
              },
            ]),
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.annual.localizedPrice).toBe('$49.99');
        expect(result.annual.intro).toBeUndefined();
      });
    });

    describe('iOS trial extraction', () => {
      beforeEach(() => {
        Platform.OS = 'ios';
      });

      it('should extract trial from iOS subscription with subscriptionOffers', async () => {
        const mockSubscription: Partial<ProductSubscriptionIOS> = {
          id: 'symposiumai_monthly',
          displayPrice: '$5.99',
          price: 5.99,
          currency: 'USD',
          subscriptionOffers: [
            {
              id: 'intro-offer',
              type: 'introductory',
              price: 0,
              displayPrice: 'Free',
              paymentMode: 'free-trial',
              period: { unit: 'week', value: 1 },
              periodCount: 1,
            },
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeDefined();
        expect(result.monthly.trial?.durationText).toBe('1 week');
        expect(result.monthly.trial?.durationDays).toBe(7);
        expect(result.monthly.trial?.hasTrial).toBe(true);
      });

      it('should extract day-based trial from iOS subscription', async () => {
        const mockSubscription: Partial<ProductSubscriptionIOS> = {
          id: 'symposiumai_monthly',
          displayPrice: '$5.99',
          price: 5.99,
          currency: 'USD',
          subscriptionOffers: [
            {
              id: 'intro-offer',
              type: 'introductory',
              price: 0,
              displayPrice: 'Free',
              paymentMode: 'free-trial',
              period: { unit: 'day', value: 3 },
              periodCount: 1,
            },
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial?.durationText).toBe('3 days');
        expect(result.monthly.trial?.durationDays).toBe(3);
      });

      it('should not set trial when iOS subscription has no free trial offer', async () => {
        const mockSubscription: Partial<ProductSubscriptionIOS> = {
          id: 'symposiumai_monthly',
          displayPrice: '$5.99',
          price: 5.99,
          currency: 'USD',
          subscriptionOffers: [
            {
              id: 'promo-offer',
              type: 'introductory',
              price: 2.99,
              displayPrice: '$2.99',
              paymentMode: 'pay-as-you-go',
              period: { unit: 'week', value: 1 },
              periodCount: 1,
            },
          ],
        };

        mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
          if (type === 'subs') return Promise.resolve([mockSubscription]);
          return Promise.resolve([]);
        });

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeUndefined();
      });
    });

    it('should persist prices to AsyncStorage', async () => {
      Platform.OS = 'android';
      const mockSubscription: Partial<ProductSubscriptionAndroid> = {
        id: 'symposiumai_monthly',
        subscriptionOfferDetailsAndroid: [
          createOffer('offer', [
            {
              priceAmountMicros: '5990000',
              billingPeriod: 'P1M',
              formattedPrice: '$5.99',
              priceCurrencyCode: 'USD',
              recurrenceMode: 1,
              billingCycleCount: 0,
            },
          ]),
        ],
      };

      mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
        if (type === 'subs') return Promise.resolve([mockSubscription]);
        return Promise.resolve([]);
      });

      await fetchAndPersistPrices();

      expect(mockSetItem).toHaveBeenCalledWith(
        '@store_prices_v2',
        expect.any(String)
      );

      // Verify the persisted data includes fetchedAt timestamp
      const persistedData = JSON.parse(mockSetItem.mock.calls[0][1]);
      expect(persistedData.fetchedAt).toBeDefined();
      expect(typeof persistedData.fetchedAt).toBe('number');
    });

    it('should return fallback prices on error', async () => {
      mockFetchProducts.mockRejectedValue(new Error('Network error'));

      const result = await fetchAndPersistPrices();

      expect(result).toEqual(FALLBACK_PRICES);
    });
  });
});
