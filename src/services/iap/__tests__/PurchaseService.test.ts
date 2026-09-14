import { Platform } from 'react-native';
import type { Purchase, ProductSubscriptionAndroid } from 'react-native-iap';

// Mock implementations
const mockInitConnection = jest.fn();
const mockEndConnection = jest.fn();
const mockPurchaseUpdatedListener = jest.fn();
const mockPurchaseErrorListener = jest.fn();
const mockFetchProducts = jest.fn();
const mockRequestPurchase = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockFinishTransaction = jest.fn();

const mockDigestStringAsync = jest.fn();

const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockAddDoc = jest.fn();

const mockHttpsCallable = jest.fn();
const mockGetFunctions = jest.fn();
const mockValidatePurchaseCallable = jest.fn();

const mockAuthInstance: { currentUser: { uid: string } | null } = {
  currentUser: { uid: 'test-user-123' },
};

// Mock modules
jest.mock('react-native-iap', () => ({
  initConnection: (...args: unknown[]) => mockInitConnection(...args),
  endConnection: (...args: unknown[]) => mockEndConnection(...args),
  purchaseUpdatedListener: (...args: unknown[]) => mockPurchaseUpdatedListener(...args),
  purchaseErrorListener: (...args: unknown[]) => mockPurchaseErrorListener(...args),
  fetchProducts: (...args: unknown[]) => mockFetchProducts(...args),
  requestPurchase: (...args: unknown[]) => mockRequestPurchase(...args),
  getAvailablePurchases: (...args: unknown[]) => mockGetAvailablePurchases(...args),
  finishTransaction: (...args: unknown[]) => mockFinishTransaction(...args),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => mockAuthInstance,
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
}));

jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: (...args: unknown[]) => mockGetFunctions(...args),
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: (...args: unknown[]) => mockDigestStringAsync(...args),
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256',
  },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

// Import after mocks
import { PurchaseService } from '../PurchaseService';
import { SUBSCRIPTION_PRODUCTS } from '../products';
import { ErrorService } from '../../errors/ErrorService';

describe('PurchaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    mockAuthInstance.currentUser = { uid: 'test-user-123' };
    mockHttpsCallable.mockReset();
    mockValidatePurchaseCallable.mockReset();

    // Default successful responses
    mockInitConnection.mockResolvedValue(true);
    mockEndConnection.mockResolvedValue(undefined);
    mockPurchaseUpdatedListener.mockReturnValue({ remove: jest.fn() });
    mockPurchaseErrorListener.mockReturnValue({ remove: jest.fn() });
    mockFetchProducts.mockResolvedValue([]);
    mockRequestPurchase.mockResolvedValue(undefined);
    mockGetAvailablePurchases.mockResolvedValue([]);
    mockFinishTransaction.mockResolvedValue(undefined);
    mockDigestStringAsync.mockResolvedValue('hashed-token-123');
    mockGetDoc.mockResolvedValue({ data: () => ({}), exists: () => false });
    mockSetDoc.mockResolvedValue(undefined);
    mockAddDoc.mockResolvedValue({ id: 'purchase-error-doc' });
    mockDoc.mockReturnValue('doc-ref');
    mockCollection.mockReturnValue('collection-ref');
    mockGetFunctions.mockReturnValue({});
    mockValidatePurchaseCallable.mockResolvedValue({ data: { valid: false } });
    mockHttpsCallable.mockReturnValue(mockValidatePurchaseCallable);
  });

  afterEach(() => {
    // Cleanup listeners after each test
    PurchaseService.cleanup();
  });

  describe('initialize()', () => {
    it('should successfully initialize connection and setup listeners', async () => {
      const result = await PurchaseService.initialize();

      expect(result).toEqual({ success: true });
      expect(mockInitConnection).toHaveBeenCalledTimes(1);
      expect(mockPurchaseUpdatedListener).toHaveBeenCalledTimes(1);
      expect(mockPurchaseErrorListener).toHaveBeenCalledTimes(1);
    });

    it('should setup purchase update listener with handler', async () => {
      await PurchaseService.initialize();

      expect(mockPurchaseUpdatedListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should setup purchase error listener with handler', async () => {
      await PurchaseService.initialize();

      expect(mockPurchaseErrorListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return error when initConnection fails', async () => {
      const error = new Error('Connection failed');
      mockInitConnection.mockRejectedValue(error);

      const result = await PurchaseService.initialize();

      expect(result).toEqual({ success: false, error });
    });

    it('should not setup duplicate listeners on multiple initializations', async () => {
      await PurchaseService.initialize();
      await PurchaseService.initialize();

      // Listeners should only be set up once
      expect(mockPurchaseUpdatedListener).toHaveBeenCalledTimes(1);
      expect(mockPurchaseErrorListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup()', () => {
    it('should remove listeners and end connection', async () => {
      const removePurchaseUpdate = jest.fn();
      const removePurchaseError = jest.fn();

      mockPurchaseUpdatedListener.mockReturnValue({ remove: removePurchaseUpdate });
      mockPurchaseErrorListener.mockReturnValue({ remove: removePurchaseError });

      await PurchaseService.initialize();
      PurchaseService.cleanup();

      expect(removePurchaseUpdate).toHaveBeenCalledTimes(1);
      expect(removePurchaseError).toHaveBeenCalledTimes(1);
      expect(mockEndConnection).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup when listeners are null', () => {
      expect(() => PurchaseService.cleanup()).not.toThrow();
    });

    it('should handle errors during cleanup gracefully', async () => {
      const removePurchaseUpdate = jest.fn(() => { throw new Error('Remove failed'); });
      mockPurchaseUpdatedListener.mockReturnValue({ remove: removePurchaseUpdate });

      await PurchaseService.initialize();

      expect(() => PurchaseService.cleanup()).not.toThrow();
    });

    it('should handle endConnection errors gracefully', async () => {
      mockEndConnection.mockRejectedValue(new Error('End connection failed'));

      await PurchaseService.initialize();

      expect(() => PurchaseService.cleanup()).not.toThrow();
    });
  });

  describe('checkProductsAvailable()', () => {
    it('should return all products as available when found', async () => {
      mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
        if (type === 'subs') return Promise.resolve([
          { id: SUBSCRIPTION_PRODUCTS.monthly },
          { id: SUBSCRIPTION_PRODUCTS.annual },
        ]);
        return Promise.resolve([
          { id: SUBSCRIPTION_PRODUCTS.lifetime },
        ]);
      });

      const result = await PurchaseService.checkProductsAvailable();

      expect(result).toEqual({
        available: true,
        products: [SUBSCRIPTION_PRODUCTS.monthly, SUBSCRIPTION_PRODUCTS.annual, SUBSCRIPTION_PRODUCTS.lifetime],
        unavailable: [],
      });
    });

    it('should identify unavailable products', async () => {
      mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
        if (type === 'subs') return Promise.resolve([
          { id: SUBSCRIPTION_PRODUCTS.monthly },
        ]);
        return Promise.resolve([]);
      });

      const result = await PurchaseService.checkProductsAvailable();

      expect(result.available).toBe(false);
      expect(result.products).toEqual([SUBSCRIPTION_PRODUCTS.monthly]);
      expect(result.unavailable).toContain(SUBSCRIPTION_PRODUCTS.annual);
      expect(result.unavailable).toContain(SUBSCRIPTION_PRODUCTS.lifetime);
    });

    it('should call fetchProducts with subscription type for subscription SKUs', async () => {
      await PurchaseService.checkProductsAvailable();

      expect(mockFetchProducts).toHaveBeenCalledWith({
        skus: [SUBSCRIPTION_PRODUCTS.monthly, SUBSCRIPTION_PRODUCTS.annual],
        type: 'subs',
      });
    });

    it('should call fetchProducts with in-app type for lifetime SKU', async () => {
      await PurchaseService.checkProductsAvailable();

      expect(mockFetchProducts).toHaveBeenCalledWith({
        skus: [SUBSCRIPTION_PRODUCTS.lifetime],
        type: 'in-app',
      });
    });

    it('should handle errors and return all products as unavailable', async () => {
      mockFetchProducts.mockRejectedValue(new Error('Store connection failed'));

      const result = await PurchaseService.checkProductsAvailable();

      expect(result).toEqual({
        available: false,
        products: [],
        unavailable: Object.values(SUBSCRIPTION_PRODUCTS),
      });
    });
  });

  describe('diagnoseIAPSetup()', () => {
    it('should return diagnosis with all products available', async () => {
      mockInitConnection.mockResolvedValue(true);
      mockFetchProducts.mockImplementation(({ type }: { skus: string[]; type: string }) => {
        if (type === 'subs') return Promise.resolve([
          { id: SUBSCRIPTION_PRODUCTS.monthly },
          { id: SUBSCRIPTION_PRODUCTS.annual },
        ]);
        return Promise.resolve([
          { id: SUBSCRIPTION_PRODUCTS.lifetime },
        ]);
      });

      const result = await PurchaseService.diagnoseIAPSetup();

      expect(result.connectionOk).toBe(true);
      expect(result.productsAvailable).toHaveLength(3);
      expect(result.productsMissing).toHaveLength(0);
      expect(result.platform).toBe(Platform.OS);
    });

    it('should detect connection failure', async () => {
      mockInitConnection.mockRejectedValue(new Error('Connection failed'));

      const result = await PurchaseService.diagnoseIAPSetup();

      expect(result.connectionOk).toBe(false);
    });
  });

  describe('purchaseSubscription()', () => {
    it('should route lifetime plan to purchaseLifetime', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

      const result = await PurchaseService.purchaseSubscription('lifetime');

      expect(mockRequestPurchase).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw error when user is not authenticated', async () => {
      mockAuthInstance.currentUser = null;

      const result = await PurchaseService.purchaseSubscription('monthly');

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });

    describe('iOS', () => {
      beforeEach(() => {
        Platform.OS = 'ios';
      });

      it('should fetch subscriptions and request purchase on iOS', async () => {
        mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);

        await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });

        expect(mockFetchProducts).toHaveBeenCalledWith({ skus: [SUBSCRIPTION_PRODUCTS.monthly], type: 'subs' });
        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: { apple: { sku: SUBSCRIPTION_PRODUCTS.monthly, appAccountToken: 'hashed-token-123' } },
        });
      });

      it('should fetch subscriptions before requesting', async () => {
        mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.annual }]);

        await PurchaseService.purchaseSubscription('annual');

        expect(mockFetchProducts).toHaveBeenCalledWith({ skus: [SUBSCRIPTION_PRODUCTS.annual], type: 'subs' });
        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: { apple: { sku: SUBSCRIPTION_PRODUCTS.annual, appAccountToken: 'hashed-token-123' } },
        });
      });
    });

    describe('Android', () => {
      beforeEach(() => {
        Platform.OS = 'android';
      });

      it('should request subscription with trial offer on Android if available', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'trial-offer-token',
              basePlanId: 'base-plan',
              offerId: 'offer-id',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '0',
                    billingPeriod: 'P7D',
                    recurrenceMode: 1,
                    billingCycleCount: 1,
                    formattedPrice: 'Free',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
            {
              offerToken: 'regular-offer-token',
              basePlanId: 'base-plan',
              offerId: 'offer-id-2',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '5990000',
                    billingPeriod: 'P1M',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$5.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.monthly],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.monthly, offerToken: 'trial-offer-token' }],
            },
          },
        });
      });

      it('should request a paid offer on Android when trial is not included', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'trial-offer-token',
              basePlanId: 'base-plan',
              offerId: 'offer-id',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '0',
                    billingPeriod: 'P7D',
                    recurrenceMode: 1,
                    billingCycleCount: 1,
                    formattedPrice: 'Free',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
            {
              offerToken: 'regular-offer-token',
              basePlanId: 'base-plan',
              offerId: 'offer-id-2',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '5990000',
                    billingPeriod: 'P1M',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$5.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('monthly');

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.monthly],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.monthly, offerToken: 'regular-offer-token' }],
            },
          },
        });
      });

      it('should request a paid offer on Android when the user already used a trial', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.annual,
          productId: SUBSCRIPTION_PRODUCTS.annual,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'annual-trial-token',
              basePlanId: 'annual-base',
              offerId: 'trial-week',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '0',
                    billingPeriod: 'P7D',
                    recurrenceMode: 1,
                    billingCycleCount: 1,
                    formattedPrice: 'Free',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
            {
              offerToken: 'annual-paid-token',
              basePlanId: 'annual-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '49990000',
                    billingPeriod: 'P1Y',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$49.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockGetDoc.mockResolvedValue({ data: () => ({ hasUsedTrial: true }) });
        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('annual', { includeTrialOffer: true });

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.annual],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.annual, offerToken: 'annual-paid-token' }],
            },
          },
        });
      });

      it('should request a paid offer on Android when trial history exists', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.annual,
          productId: SUBSCRIPTION_PRODUCTS.annual,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'annual-trial-token',
              basePlanId: 'annual-base',
              offerId: 'trial-week',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '0',
                    billingPeriod: 'P7D',
                    recurrenceMode: 1,
                    billingCycleCount: 1,
                    formattedPrice: 'Free',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
            {
              offerToken: 'annual-paid-token',
              basePlanId: 'annual-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '49990000',
                    billingPeriod: 'P1Y',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$49.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockGetDoc
          .mockResolvedValueOnce({ data: () => ({ hasUsedTrial: false }), exists: () => true })
          .mockResolvedValueOnce({ data: () => ({}), exists: () => true });
        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('annual', { includeTrialOffer: true });

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.annual],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.annual, offerToken: 'annual-paid-token' }],
            },
          },
        });
      });

      it('should retry annual purchase with the paid offer when Google rejects trial offer arguments', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.annual,
          productId: SUBSCRIPTION_PRODUCTS.annual,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'annual-trial-token',
              basePlanId: 'annual-base',
              offerId: 'trial-week',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '0',
                    billingPeriod: 'P7D',
                    recurrenceMode: 1,
                    billingCycleCount: 1,
                    formattedPrice: 'Free',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
            {
              offerToken: 'annual-paid-token',
              basePlanId: 'annual-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '49990000',
                    billingPeriod: 'P1Y',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$49.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);
        mockRequestPurchase
          .mockRejectedValueOnce({ code: 'developer-error', message: 'Invalid arguments provided to the API' })
          .mockResolvedValueOnce(undefined);

        const result = await PurchaseService.purchaseSubscription('annual', { includeTrialOffer: true });

        expect(result).toEqual({ success: true, pending: true });
        expect(mockRequestPurchase).toHaveBeenNthCalledWith(1, {
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.annual],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.annual, offerToken: 'annual-trial-token' }],
            },
          },
        });
        expect(mockRequestPurchase).toHaveBeenNthCalledWith(2, {
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.annual],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.annual, offerToken: 'annual-paid-token' }],
            },
          },
        });
      });

      it('should fallback to first offer if no trial available', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.annual,
          productId: SUBSCRIPTION_PRODUCTS.annual,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'regular-offer-token',
              basePlanId: 'base-plan',
              offerId: 'offer-id',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '49990000',
                    billingPeriod: 'P1Y',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$49.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('annual');

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.annual],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.annual, offerToken: 'regular-offer-token' }],
            },
          },
        });
      });

      it('should pass Android replacement params when switching subscription products', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.annual,
          productId: SUBSCRIPTION_PRODUCTS.annual,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'annual-offer-token',
              basePlanId: 'annual-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '49990000',
                    billingPeriod: 'P1Y',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$49.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);
        mockGetAvailablePurchases.mockResolvedValue([
          {
            productId: SUBSCRIPTION_PRODUCTS.monthly,
            purchaseToken: 'existing-monthly-token',
            obfuscatedAccountIdAndroid: 'hashed-token-123',
          },
        ]);

        await PurchaseService.purchaseSubscription('annual');

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.annual],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.annual, offerToken: 'annual-offer-token' }],
              subscriptionProductReplacementParams: {
                oldProductId: SUBSCRIPTION_PRODUCTS.monthly,
                replacementMode: 'without-proration',
              },
            },
          },
        });
      });

      it('should restore an existing same-SKU Android subscription instead of launching duplicate purchase', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.annual,
          productId: SUBSCRIPTION_PRODUCTS.annual,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'annual-offer-token',
              basePlanId: 'annual-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '49990000',
                    billingPeriod: 'P1Y',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$49.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);
        mockGetAvailablePurchases.mockResolvedValue([
          {
            productId: SUBSCRIPTION_PRODUCTS.annual,
            purchaseToken: 'existing-annual-token',
            transactionId: 'existing-annual-tx',
            purchaseState: 'purchased',
            obfuscatedAccountIdAndroid: 'hashed-token-123',
          },
        ]);
        mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });

        const result = await PurchaseService.purchaseSubscription('annual');

        expect(result).toEqual({
          success: true,
          restored: true,
          userMessage: 'Your existing Google Play subscription has been restored.',
        });
        expect(mockRequestPurchase).not.toHaveBeenCalled();
        expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
          receipt: 'existing-annual-token',
          platform: 'android',
          productId: SUBSCRIPTION_PRODUCTS.annual,
          purchaseToken: 'existing-annual-token',
        });
      });

      it('should ignore Android purchases linked to another app account when starting a new purchase', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'monthly-offer-token',
              basePlanId: 'monthly-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '5990000',
                    billingPeriod: 'P1M',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$5.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);
        mockGetAvailablePurchases.mockResolvedValue([
          {
            productId: SUBSCRIPTION_PRODUCTS.annual,
            purchaseToken: 'foreign-annual-token',
            obfuscatedAccountIdAndroid: 'different-user-hash',
          },
        ]);

        const result = await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });

        expect(result).toEqual({ success: true, pending: true });
        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.monthly],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.monthly, offerToken: 'monthly-offer-token' }],
            },
          },
        });
        expect(mockValidatePurchaseCallable).not.toHaveBeenCalled();
      });

      it('should prefer legacy Android offer details over standardized offers', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          productStatusAndroid: 'ok',
          subscriptionOffers: [
            {
              id: 'standard-trial-offer',
              displayPrice: 'Free',
              price: 0,
              type: 'introductory',
              paymentMode: 'free-trial',
              offerTokenAndroid: 'standard-trial-token',
            },
          ],
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'legacy-offer-token',
              basePlanId: 'base-plan',
              offerId: 'legacy-offer',
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '5990000',
                    billingPeriod: 'P1M',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$5.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('monthly');

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.monthly],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.monthly, offerToken: 'legacy-offer-token' }],
            },
          },
        });
      });

      it('should fall back to standardized Android subscription offers when legacy details are unavailable', async () => {
        const mockProduct = {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          productStatusAndroid: 'ok',
          subscriptionOffers: [
            {
              id: 'standard-trial-offer',
              displayPrice: 'Free',
              price: 0,
              type: 'introductory',
              paymentMode: 'free-trial',
              offerTokenAndroid: 'standard-trial-token',
            },
          ],
          subscriptionOfferDetailsAndroid: [],
        } as Partial<ProductSubscriptionAndroid>;

        mockFetchProducts.mockResolvedValue([mockProduct]);

        await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });

        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'subs',
          request: {
            google: {
              skus: [SUBSCRIPTION_PRODUCTS.monthly],
              obfuscatedAccountId: 'hashed-token-123',
              subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.monthly, offerToken: 'standard-trial-token' }],
            },
          },
        });
      });

      it('should return E_DEVELOPER_ERROR when no offer token available', async () => {
        mockFetchProducts.mockResolvedValue([{
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          subscriptionOfferDetailsAndroid: [], // No offers
        }]);

        const result = await PurchaseService.purchaseSubscription('monthly');

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('E_DEVELOPER_ERROR');
        // Error message comes from either the thrown error or the IAP_ERROR_MESSAGES map
        expect(result.userMessage).toBeDefined();
      });

      it('should return E_ITEM_UNAVAILABLE when subscription not found', async () => {
        mockFetchProducts.mockResolvedValue([]);

        const result = await PurchaseService.purchaseSubscription('monthly');

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('E_ITEM_UNAVAILABLE');
      });
    });

    it('should return pending when purchase flow launches (iOS)', async () => {
      Platform.OS = 'ios';
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);

      const result = await PurchaseService.purchaseSubscription('monthly');

      expect(result).toEqual({ success: true, pending: true });
    });

    it('should handle user cancellation gracefully (iOS)', async () => {
      Platform.OS = 'ios';
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      const error = { code: 'E_USER_CANCELLED' };
      mockRequestPurchase.mockRejectedValue(error);

      const result = await PurchaseService.purchaseSubscription('monthly');

      expect(result).toEqual({
        success: false,
        cancelled: true,
        errorCode: 'E_USER_CANCELLED',
        userMessage: 'Purchase was cancelled.',
      });
    });

    it('should map known error codes to user-friendly messages (iOS)', async () => {
      Platform.OS = 'ios';
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.annual }]);
      const error = { code: 'E_NETWORK_ERROR' };
      mockRequestPurchase.mockRejectedValue(error);

      const result = await PurchaseService.purchaseSubscription('annual');

      expect(result).toEqual({
        success: false,
        error,
        errorCode: 'E_NETWORK_ERROR',
        userMessage: 'Network error. Please check your internet connection and try again.',
      });
    });

    it('should provide generic message for unknown errors (iOS)', async () => {
      Platform.OS = 'ios';
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      // Error with no message and unknown code
      const error = { code: 'E_UNKNOWN_FAILURE' };
      mockRequestPurchase.mockRejectedValue(error);

      const result = await PurchaseService.purchaseSubscription('monthly');

      expect(result.success).toBe(false);
      // New behavior: Shows actual error message when available, falls back to generic
      expect(result.userMessage).toBeDefined();
    });
  });

  describe('purchaseLifetime()', () => {
    it('should throw error when user is not authenticated', async () => {
      mockAuthInstance.currentUser = null;

      const result = await PurchaseService.purchaseLifetime();

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });

    describe('iOS', () => {
      beforeEach(() => {
        Platform.OS = 'ios';
      });

      it('should fetch products and use requestPurchase on iOS', async () => {
        mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

        await PurchaseService.purchaseLifetime();

        expect(mockFetchProducts).toHaveBeenCalledWith({ skus: [SUBSCRIPTION_PRODUCTS.lifetime], type: 'in-app' });
        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'in-app',
          request: { apple: { sku: SUBSCRIPTION_PRODUCTS.lifetime, andDangerouslyFinishTransactionAutomatically: false, appAccountToken: 'hashed-token-123' } },
        });
      });

      it('should derive app account token without client Firestore writes', async () => {
        mockDigestStringAsync.mockResolvedValue('new-token-hash');
        mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

        await PurchaseService.purchaseLifetime();

        expect(mockFetchProducts).toHaveBeenCalledWith({ skus: [SUBSCRIPTION_PRODUCTS.lifetime], type: 'in-app' });
        expect(mockDigestStringAsync).toHaveBeenCalledWith('SHA-256', 'test-user-123');
        expect(mockSetDoc).not.toHaveBeenCalled();
        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'in-app',
          request: { apple: { sku: SUBSCRIPTION_PRODUCTS.lifetime, andDangerouslyFinishTransactionAutomatically: false, appAccountToken: 'new-token-hash' } },
        });
      });
    });

    describe('Android', () => {
      beforeEach(() => {
        Platform.OS = 'android';
      });

      it('should verify product exists before purchase on Android', async () => {
        mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

        await PurchaseService.purchaseLifetime();

        expect(mockFetchProducts).toHaveBeenCalledWith({ skus: [SUBSCRIPTION_PRODUCTS.lifetime], type: 'in-app' });
        expect(mockRequestPurchase).toHaveBeenCalledWith({
          type: 'in-app',
          request: { google: { skus: [SUBSCRIPTION_PRODUCTS.lifetime], obfuscatedAccountId: 'hashed-token-123' } },
        });
      });

      it('should use requestPurchase on Android', async () => {
        mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

        await PurchaseService.purchaseLifetime();

        expect(mockRequestPurchase).toHaveBeenCalled();
      });
    });

    it('should return pending when lifetime purchase flow launches', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

      const result = await PurchaseService.purchaseLifetime();

      expect(result).toEqual({ success: true, pending: true });
    });

    it('should handle user cancellation', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);
      mockRequestPurchase.mockRejectedValue({ code: 'E_USER_CANCELLED' });

      const result = await PurchaseService.purchaseLifetime();

      expect(result).toEqual({
        success: false,
        cancelled: true,
        errorCode: 'E_USER_CANCELLED',
        userMessage: 'Purchase was cancelled.',
      });
    });

    it('should map error codes to user messages', async () => {
      mockRequestPurchase.mockRejectedValue({ code: 'E_ITEM_UNAVAILABLE' });

      const result = await PurchaseService.purchaseLifetime();

      expect(result.success).toBe(false);
      expect(result.userMessage).toBe('This subscription is currently unavailable. Please try again later.');
    });
  });

  describe('restorePurchases()', () => {
    it('should prioritize lifetime purchases', async () => {
      const lifetimePurchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.lifetime,
        purchaseToken: 'lifetime-receipt',
        transactionId: 'lifetime-tx-123',
      };
      const monthlyPurchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'monthly-receipt',
        transactionId: 'monthly-tx-456',
      };

      mockGetAvailablePurchases.mockResolvedValue([monthlyPurchase, lifetimePurchase]);
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });

      const result = await PurchaseService.restorePurchases();

      expect(result).toEqual({ success: true, restored: true, isLifetime: true });
      expect(mockGetAvailablePurchases).toHaveBeenCalled();
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'validatePurchase');
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'lifetime-receipt',
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCTS.lifetime,
        purchaseToken: 'lifetime-receipt',
      });
    });

    it('should restore active subscription if no lifetime purchase', async () => {
      const monthlyPurchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'monthly-receipt',
        transactionId: 'monthly-tx-456',
      };

      mockGetAvailablePurchases.mockResolvedValue([monthlyPurchase]);
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });

      const result = await PurchaseService.restorePurchases();

      expect(result).toEqual({ success: true, restored: true, isLifetime: false });
      expect(mockGetAvailablePurchases).toHaveBeenCalled();
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'monthly-receipt',
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'monthly-receipt',
      });
    });

    it('should validate store purchases even when Firebase has stale subscription metadata', async () => {
      const annualPurchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.annual,
        purchaseToken: 'annual-receipt',
        transactionId: 'annual-tx-456',
      };

      mockGetDoc.mockResolvedValue({
        data: () => ({
          membershipStatus: 'demo',
          subscriptionExpiryDate: { seconds: Math.floor(Date.now() / 1000) - 86400 },
        }),
      });
      mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });

      const result = await PurchaseService.restorePurchases();

      expect(result).toEqual({ success: true, restored: true, isLifetime: false });
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'annual-receipt',
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCTS.annual,
        purchaseToken: 'annual-receipt',
      });
    });

    it('should return restored false when no purchases found', async () => {
      mockGetAvailablePurchases.mockResolvedValue([]);

      const result = await PurchaseService.restorePurchases();

      expect(result.success).toBe(true);
      expect(result.restored).toBe(false);
      expect(result.userMessage).toBe('No previous purchases found.');
    });

    it('should attempt to validate restored purchases', async () => {
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.annual,
        purchaseToken: 'annual-receipt',
        transactionId: 'annual-tx-789',
      };

      mockGetAvailablePurchases.mockResolvedValue([purchase]);
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });

      await PurchaseService.restorePurchases();

      expect(mockGetAvailablePurchases).toHaveBeenCalled();
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'annual-receipt',
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCTS.annual,
        purchaseToken: 'annual-receipt',
      });
    });

    it('should handle validation errors gracefully', async () => {
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'invalid-receipt',
        transactionId: 'invalid-tx',
      };

      mockGetAvailablePurchases.mockResolvedValue([purchase]);

      const result = await PurchaseService.restorePurchases();

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });

    it('should not restore Android purchases linked to another app account', async () => {
      Platform.OS = 'android';
      mockGetAvailablePurchases.mockResolvedValue([
        {
          productId: SUBSCRIPTION_PRODUCTS.annual,
          purchaseToken: 'foreign-annual-receipt',
          transactionId: 'foreign-annual-tx',
          obfuscatedAccountIdAndroid: 'different-user-hash',
        },
      ]);

      const result = await PurchaseService.restorePurchases();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('STORE_ACCOUNT_MISMATCH');
      expect(mockValidatePurchaseCallable).not.toHaveBeenCalled();
    });

    it('should restore Android purchases without account identifiers only when the token is already stored for the current user', async () => {
      Platform.OS = 'android';
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.annual,
        purchaseToken: 'stored-annual-receipt',
        transactionId: 'stored-annual-tx',
      };

      mockGetDoc.mockResolvedValue({
        data: () => ({
          androidPurchaseToken: 'stored-annual-receipt',
        }),
      });
      mockGetAvailablePurchases.mockResolvedValue([purchase]);
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });

      const result = await PurchaseService.restorePurchases();

      expect(result).toEqual({ success: true, restored: true, isLifetime: false });
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'stored-annual-receipt',
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCTS.annual,
        purchaseToken: 'stored-annual-receipt',
      });
    });

    it('should map error codes to user messages', async () => {
      mockGetAvailablePurchases.mockRejectedValue({ code: 'E_NOT_PREPARED' });

      const result = await PurchaseService.restorePurchases();

      expect(result.success).toBe(false);
      expect(result.userMessage).toBe('Unable to connect to the store. Please close and reopen the app, then try again.');
    });

    it('should extract and show actual error message when available', async () => {
      mockGetAvailablePurchases.mockRejectedValue(new Error('Network connection lost'));

      const result = await PurchaseService.restorePurchases();

      expect(result.success).toBe(false);
      // Now extracts actual error message instead of generic one
      expect(result.userMessage).toBe('Network connection lost');
    });

    it('should fall back to IAP error message when no message available', async () => {
      mockGetAvailablePurchases.mockRejectedValue({ code: 'E_SOME_UNKNOWN_CODE' });

      const result = await PurchaseService.restorePurchases();

      expect(result.success).toBe(false);
      expect(result.userMessage).toBe('Failed to restore purchases. Please try again.');
    });
  });

  describe('handlePurchaseError (via listener)', () => {
    it.each(['E_USER_CANCELLED', 'USER_CANCELED', 'user-cancelled', '1'])(
      'does not record user cancellation %s to Crashlytics',
      async (code) => {
        const handleSilent = jest.spyOn(ErrorService, 'handleSilent');
        await PurchaseService.initialize();
        const purchaseErrorHandler = mockPurchaseErrorListener.mock.calls[0][0];

        await purchaseErrorHandler({ code, message: 'User cancelled the operation' });

        expect(handleSilent).not.toHaveBeenCalled();
        handleSilent.mockRestore();
      }
    );

    it('still records real store errors', async () => {
      const handleSilent = jest.spyOn(ErrorService, 'handleSilent');
      await PurchaseService.initialize();
      const purchaseErrorHandler = mockPurchaseErrorListener.mock.calls[0][0];

      await purchaseErrorHandler({ code: 'E_SERVICE_ERROR', message: 'Store unavailable' });

      expect(handleSilent).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'E_SERVICE_ERROR' }),
        expect.objectContaining({ action: 'iap_purchase_error', errorCode: 'E_SERVICE_ERROR' })
      );
      handleSilent.mockRestore();
    });
  });

  describe('handlePurchaseUpdate (via listener)', () => {
    it('should attempt to validate and finish transaction on purchase update', async () => {
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      await PurchaseService.initialize();
      await PurchaseService.purchaseSubscription('monthly');

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx-123',
      };

      await purchaseUpdateHandler(purchase);

      // Verify purchase update listener was set up
      expect(mockPurchaseUpdatedListener).toHaveBeenCalled();
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'test-receipt',
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
      });
      expect(mockFinishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
    });

    it('should send unverified Android purchase updates to backend validation', async () => {
      Platform.OS = 'android';
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });
      mockFetchProducts.mockResolvedValue([
        {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'monthly-offer-token',
              basePlanId: 'monthly-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '5990000',
                    billingPeriod: 'P1M',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$5.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        },
      ]);

      await PurchaseService.initialize();
      await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'new-android-receipt',
        transactionId: 'new-android-tx',
      };

      await purchaseUpdateHandler(purchase);

      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'new-android-receipt',
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'new-android-receipt',
      });
      expect(mockFinishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
    });

    it('should block Android purchase updates with an explicit different app account id', async () => {
      Platform.OS = 'android';
      mockFetchProducts.mockResolvedValue([
        {
          id: SUBSCRIPTION_PRODUCTS.monthly,
          productId: SUBSCRIPTION_PRODUCTS.monthly,
          subscriptionOfferDetailsAndroid: [
            {
              offerToken: 'monthly-offer-token',
              basePlanId: 'monthly-base',
              offerId: null,
              offerTags: [],
              pricingPhases: {
                pricingPhaseList: [
                  {
                    priceAmountMicros: '5990000',
                    billingPeriod: 'P1M',
                    recurrenceMode: 1,
                    billingCycleCount: 0,
                    formattedPrice: '$5.99',
                    priceCurrencyCode: 'USD',
                  },
                ],
              },
            },
          ],
        },
      ]);

      await PurchaseService.initialize();
      await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> & { obfuscatedAccountIdAndroid: string } = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'foreign-android-receipt',
        transactionId: 'foreign-android-tx',
        obfuscatedAccountIdAndroid: 'different-user-hash',
      };

      await purchaseUpdateHandler(purchase);

      expect(mockValidatePurchaseCallable).not.toHaveBeenCalled();
      expect(mockFinishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
    });

    it('should not process purchase update without receipt', async () => {
      await PurchaseService.initialize();

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: undefined,
      };

      await purchaseUpdateHandler(purchase);

      expect(mockFinishTransaction).not.toHaveBeenCalled();
    });

    it('should handle errors during purchase update gracefully', async () => {
      await PurchaseService.initialize();

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'invalid-receipt',
        transactionId: 'invalid-tx',
      };

      // Should not throw even if validation fails
      await expect(purchaseUpdateHandler(purchase)).resolves.not.toThrow();

      // Transaction SHOULD finish even if validation fails (new behavior to prevent loops)
      expect(mockFinishTransaction).toHaveBeenCalled();
    });
  });

  describe('validateAndSavePurchase behavior', () => {
    it('should finish transaction even when validation fails due to auth', async () => {
      mockAuthInstance.currentUser = null;

      await PurchaseService.initialize();

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx',
      };

      await purchaseUpdateHandler(purchase);

      // ALWAYS finishes transaction to prevent infinite loop (new behavior)
      expect(mockFinishTransaction).toHaveBeenCalled();
    });

    it('calls the validatePurchase function and finishes the transaction on valid receipt', async () => {
      mockValidatePurchaseCallable.mockResolvedValueOnce({ data: { valid: true } });
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);

      await PurchaseService.initialize();
      await PurchaseService.purchaseSubscription('monthly');

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase: Partial<Purchase> = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx',
      };

      await purchaseUpdateHandler(purchase);

      expect(mockGetFunctions).toHaveBeenCalled();
      expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'validatePurchase');
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        receipt: 'test-receipt',
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
      });
      expect(mockFinishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
    });
  });

  describe('app account token generation (iOS - for lifetime purchases)', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    it('should derive token locally for lifetime purchases', async () => {
      mockDigestStringAsync.mockResolvedValue('derived-token-xyz');
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

      await PurchaseService.purchaseLifetime();

      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(mockRequestPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'in-app',
          request: expect.objectContaining({
            apple: expect.objectContaining({
              appAccountToken: 'derived-token-xyz',
            }),
          }),
        })
      );
    });

    it('should not write app account token from the client', async () => {
      mockDigestStringAsync.mockResolvedValue('new-hashed-token-abc');
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

      await PurchaseService.purchaseLifetime();

      expect(mockDigestStringAsync).toHaveBeenCalledWith('SHA-256', 'test-user-123');
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(mockRequestPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'in-app',
          request: expect.objectContaining({
            apple: expect.objectContaining({
              appAccountToken: 'new-hashed-token-abc',
            }),
          }),
        })
      );
    });

    it('should use SHA256 algorithm for token generation', async () => {
      mockGetDoc.mockResolvedValue({ data: () => ({}) });
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);

      await PurchaseService.purchaseLifetime();

      expect(mockDigestStringAsync).toHaveBeenCalledWith('SHA-256', expect.any(String));
    });
  });

  describe('onPurchaseError listener', () => {
    it('should register and call error listeners', async () => {
      Platform.OS = 'ios';
      const listener = jest.fn();
      const unsubscribe = PurchaseService.onPurchaseError(listener);

      await PurchaseService.initialize();

      // Must initiate a purchase first to set pendingPurchaseSku.
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      await PurchaseService.purchaseSubscription('monthly');

      // Trigger a purchase update with validation failure
      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx',
      };

      await purchaseUpdateHandler(purchase);

      // Listener should be called with error info
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.any(String),
          isRecoverable: true,
        })
      );

      unsubscribe();
    });

    it('should allow unsubscribing from error notifications', async () => {
      const listener = jest.fn();
      const unsubscribe = PurchaseService.onPurchaseError(listener);

      unsubscribe();

      await PurchaseService.initialize();

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx',
      };

      await purchaseUpdateHandler(purchase);

      // Listener should NOT be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners', async () => {
      Platform.OS = 'ios';
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      PurchaseService.onPurchaseError(listener1);
      PurchaseService.onPurchaseError(listener2);

      await PurchaseService.initialize();

      // Must initiate a purchase first to set pendingPurchaseSku
      // (otherwise the handler ignores updates to prevent cross-account issues)
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      await PurchaseService.purchaseSubscription('monthly');

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx',
      };

      await purchaseUpdateHandler(purchase);

      // Both listeners should be called (validation fails due to no Firebase user, triggering error listeners)
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      Platform.OS = 'ios';
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      PurchaseService.onPurchaseError(errorListener);
      PurchaseService.onPurchaseError(normalListener);

      await PurchaseService.initialize();

      // Must initiate a purchase first to set pendingPurchaseSku
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      await PurchaseService.purchaseSubscription('monthly');

      const purchaseUpdateHandler = mockPurchaseUpdatedListener.mock.calls[0][0];
      const purchase = {
        productId: SUBSCRIPTION_PRODUCTS.monthly,
        purchaseToken: 'test-receipt',
        transactionId: 'test-tx',
      };

      // Should not throw even if one listener errors
      await expect(purchaseUpdateHandler(purchase)).resolves.not.toThrow();

      // Second listener should still be called
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      // Use iOS for these tests since they test error mapping, not Android-specific logic
      Platform.OS = 'ios';
    });

    it('should map E_DEVELOPER_ERROR to user-friendly message', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      mockRequestPurchase.mockRejectedValue({ code: 'E_DEVELOPER_ERROR' });

      const result = await PurchaseService.purchaseSubscription('monthly');

      expect(result.userMessage).toBe('Unable to connect to the store. Please ensure you have the latest version of the app from the Play Store and try again.');
    });

    it('should map E_ALREADY_OWNED to user-friendly message with restore suggestion', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.lifetime }]);
      mockRequestPurchase.mockRejectedValue({ code: 'E_ALREADY_OWNED' });

      const result = await PurchaseService.purchaseLifetime();

      expect(result.userMessage).toBe('You already have an active subscription. Tap "Restore Purchases" below to restore it.');
    });

    it('should map E_BILLING_UNAVAILABLE to user-friendly message', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.annual }]);
      mockRequestPurchase.mockRejectedValue({ code: 'E_BILLING_UNAVAILABLE' });

      const result = await PurchaseService.purchaseSubscription('annual');

      expect(result.userMessage).toBe('In-app purchases are not available on this device. Please check your device settings.');
    });

    it('should map E_SERVICE_ERROR to user-friendly message', async () => {
      mockFetchProducts.mockResolvedValue([{ id: SUBSCRIPTION_PRODUCTS.monthly }]);
      mockRequestPurchase.mockRejectedValue({ code: 'E_SERVICE_ERROR' });

      const result = await PurchaseService.purchaseSubscription('monthly');

      expect(result.userMessage).toBe('The app store service is temporarily unavailable. Please try again in a few moments.');
    });
  });
});
