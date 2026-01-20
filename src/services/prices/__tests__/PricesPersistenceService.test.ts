import { Platform } from 'react-native';
import type { SubscriptionAndroid, SubscriptionIOS, SubscriptionOfferAndroid } from 'react-native-iap';

// Mock implementations
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockGetSubscriptions = jest.fn();
const mockGetProducts = jest.fn();

// Mock modules
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

jest.mock('react-native-iap', () => ({
  getSubscriptions: (...args: unknown[]) => mockGetSubscriptions(...args),
  getProducts: (...args: unknown[]) => mockGetProducts(...args),
}));

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
): SubscriptionOfferAndroid {
  return {
    offerToken,
    basePlanId: 'base-plan',
    offerId: 'offer-id',
    offerTags: [],
    pricingPhases: { pricingPhaseList },
  } as SubscriptionOfferAndroid;
}

describe('PricesPersistenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockGetSubscriptions.mockResolvedValue([]);
    mockGetProducts.mockResolvedValue([]);
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
        const mockSubscription: Partial<SubscriptionAndroid> = {
          productId: 'symposiumai_monthly',
          subscriptionOfferDetails: [
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

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeDefined();
        expect(result.monthly.trial?.durationText).toBe('1 week');
        expect(result.monthly.trial?.durationDays).toBe(7);
        expect(result.monthly.trial?.hasTrial).toBe(true);
      });

      it('should extract 3-day trial from Android subscription', async () => {
        const mockSubscription: Partial<SubscriptionAndroid> = {
          productId: 'symposiumai_monthly',
          subscriptionOfferDetails: [
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

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial?.durationText).toBe('3 days');
        expect(result.monthly.trial?.durationDays).toBe(3);
      });

      it('should extract 7-day trial from Android subscription', async () => {
        const mockSubscription: Partial<SubscriptionAndroid> = {
          productId: 'symposiumai_monthly',
          subscriptionOfferDetails: [
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

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial?.durationText).toBe('7 days');
        expect(result.monthly.trial?.durationDays).toBe(7);
      });

      it('should extract 1-month trial from Android subscription', async () => {
        const mockSubscription: Partial<SubscriptionAndroid> = {
          productId: 'symposiumai_annual',
          subscriptionOfferDetails: [
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

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.annual.trial?.durationText).toBe('1 month');
        expect(result.annual.trial?.durationDays).toBe(30);
      });

      it('should prefer offer with free trial over regular offer', async () => {
        const mockSubscription: Partial<SubscriptionAndroid> = {
          productId: 'symposiumai_monthly',
          subscriptionOfferDetails: [
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

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeDefined();
        expect(result.monthly.trial?.hasTrial).toBe(true);
      });

      it('should not set trial when subscription has no free trial', async () => {
        const mockSubscription: Partial<SubscriptionAndroid> = {
          productId: 'symposiumai_monthly',
          subscriptionOfferDetails: [
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

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeUndefined();
      });
    });

    describe('iOS trial extraction', () => {
      beforeEach(() => {
        Platform.OS = 'ios';
      });

      it('should extract trial from iOS subscription with introductory price', async () => {
        const mockSubscription = {
          productId: 'symposiumai_monthly',
          localizedPrice: '$5.99',
          price: '5.99',
          currency: 'USD',
          introductoryPrice: '0',
          introductoryPriceSubscriptionPeriodIOS: 'WEEK',
          introductoryPriceNumberOfPeriodsIOS: '1',
        } as SubscriptionIOS & {
          introductoryPrice?: string;
          introductoryPriceSubscriptionPeriodIOS?: string;
          introductoryPriceNumberOfPeriodsIOS?: string;
        };

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeDefined();
        expect(result.monthly.trial?.durationText).toBe('1 week');
        expect(result.monthly.trial?.durationDays).toBe(7);
        expect(result.monthly.trial?.hasTrial).toBe(true);
      });

      it('should extract day-based trial from iOS subscription', async () => {
        const mockSubscription = {
          productId: 'symposiumai_monthly',
          localizedPrice: '$5.99',
          price: '5.99',
          currency: 'USD',
          introductoryPrice: '0',
          introductoryPriceSubscriptionPeriodIOS: 'DAY',
          introductoryPriceNumberOfPeriodsIOS: '3',
        } as SubscriptionIOS & {
          introductoryPrice?: string;
          introductoryPriceSubscriptionPeriodIOS?: string;
          introductoryPriceNumberOfPeriodsIOS?: string;
        };

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial?.durationText).toBe('3 days');
        expect(result.monthly.trial?.durationDays).toBe(3);
      });

      it('should not set trial when iOS introductory price is not free', async () => {
        const mockSubscription = {
          productId: 'symposiumai_monthly',
          localizedPrice: '$5.99',
          price: '5.99',
          currency: 'USD',
          introductoryPrice: '2.99', // Paid introductory offer, not free trial
          introductoryPriceSubscriptionPeriodIOS: 'WEEK',
          introductoryPriceNumberOfPeriodsIOS: '1',
        } as SubscriptionIOS & {
          introductoryPrice?: string;
          introductoryPriceSubscriptionPeriodIOS?: string;
          introductoryPriceNumberOfPeriodsIOS?: string;
        };

        mockGetSubscriptions.mockResolvedValue([mockSubscription]);
        mockGetProducts.mockResolvedValue([]);

        const result = await fetchAndPersistPrices();

        expect(result.monthly.trial).toBeUndefined();
      });
    });

    it('should persist prices to AsyncStorage', async () => {
      Platform.OS = 'android';
      const mockSubscription: Partial<SubscriptionAndroid> = {
        productId: 'symposiumai_monthly',
        subscriptionOfferDetails: [
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

      mockGetSubscriptions.mockResolvedValue([mockSubscription]);
      mockGetProducts.mockResolvedValue([]);

      await fetchAndPersistPrices();

      expect(mockSetItem).toHaveBeenCalledWith(
        '@store_prices',
        expect.any(String)
      );

      // Verify the persisted data includes fetchedAt timestamp
      const persistedData = JSON.parse(mockSetItem.mock.calls[0][1]);
      expect(persistedData.fetchedAt).toBeDefined();
      expect(typeof persistedData.fetchedAt).toBe('number');
    });

    it('should return fallback prices on error', async () => {
      mockGetSubscriptions.mockRejectedValue(new Error('Network error'));

      const result = await fetchAndPersistPrices();

      expect(result).toEqual(FALLBACK_PRICES);
    });
  });
});
