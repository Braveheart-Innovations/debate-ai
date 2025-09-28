import { Platform } from 'react-native';
import PurchaseService from '@/services/iap/PurchaseService';
import { SUBSCRIPTION_PRODUCTS } from '@/services/iap/products';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import {
  initConnection,
  endConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  requestSubscription,
  getSubscriptions,
  getAvailablePurchases,
  finishTransaction,
} from 'react-native-iap';
import * as Crypto from 'expo-crypto';

type Mocked<T> = jest.Mocked<T>;

const getAuthMock = getAuth as jest.MockedFunction<typeof getAuth>;
const getFirestoreMock = getFirestore as jest.MockedFunction<typeof getFirestore>;
const collectionMock = collection as jest.MockedFunction<typeof collection>;
const docMock = doc as jest.MockedFunction<typeof doc>;
const getDocMock = getDoc as jest.MockedFunction<typeof getDoc>;
const setDocMock = setDoc as jest.MockedFunction<typeof setDoc>;
const getFunctionsMock = getFunctions as jest.MockedFunction<typeof getFunctions>;
const httpsCallableMock = httpsCallable as jest.MockedFunction<typeof httpsCallable>;
const initConnectionMock = initConnection as jest.MockedFunction<typeof initConnection>;
const purchaseUpdatedListenerMock = purchaseUpdatedListener as jest.MockedFunction<typeof purchaseUpdatedListener>;
const purchaseErrorListenerMock = purchaseErrorListener as jest.MockedFunction<typeof purchaseErrorListener>;
const requestSubscriptionMock = requestSubscription as jest.MockedFunction<typeof requestSubscription>;
const getSubscriptionsMock = getSubscriptions as jest.MockedFunction<typeof getSubscriptions>;
const getAvailablePurchasesMock = getAvailablePurchases as jest.MockedFunction<typeof getAvailablePurchases>;
const finishTransactionMock = finishTransaction as jest.MockedFunction<typeof finishTransaction>;
const endConnectionMock = endConnection as jest.MockedFunction<typeof endConnection>;
const digestMock = Crypto.digestStringAsync as jest.MockedFunction<typeof Crypto.digestStringAsync>;

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
};

const createPurchase = (overrides: Partial<Parameters<typeof finishTransaction>[0]['purchase']> = {}) => ({
  transactionReceipt: 'receipt',
  transactionId: 'txn-1',
  productId: SUBSCRIPTION_PRODUCTS.monthly,
  ...overrides,
}) as unknown as Parameters<typeof finishTransaction>[0]['purchase'];

describe('PurchaseService', () => {
  const authInstance = {
    currentUser: { uid: 'user-123' },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('ios');
    authInstance.currentUser = { uid: 'user-123' };
    getAuthMock.mockReturnValue(authInstance);
    getFirestoreMock.mockReturnValue({} as any);
    collectionMock.mockReturnValue({} as any);
    docMock.mockReturnValue({} as any);
    getDocMock.mockResolvedValue({ data: () => ({ appAccountToken: 'existing-token' }) } as any);
    setDocMock.mockResolvedValue(undefined as any);
    getFunctionsMock.mockReturnValue({} as any);
    httpsCallableMock.mockReturnValue(jest.fn());
    digestMock.mockResolvedValue('hashed-token');
    purchaseUpdatedListenerMock.mockReturnValue({ remove: jest.fn() } as any);
    purchaseErrorListenerMock.mockReturnValue({ remove: jest.fn() } as any);
    endConnectionMock.mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    PurchaseService.cleanup();
  });

  it('initializes connection and listeners', async () => {
    initConnectionMock.mockResolvedValue();

    const result = await PurchaseService.initialize();

    expect(result).toEqual({ success: true });
    expect(initConnectionMock).toHaveBeenCalled();
    expect(purchaseUpdatedListenerMock).toHaveBeenCalledTimes(1);
    expect(purchaseErrorListenerMock).toHaveBeenCalledTimes(1);
  });

  it('returns failure when initialization throws', async () => {
    const error = new Error('init failed');
    initConnectionMock.mockRejectedValue(error);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await PurchaseService.initialize();

    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error', error);
    consoleError.mockRestore();
  });

  it('requests iOS subscription with existing account token', async () => {
    setPlatform('ios');
    requestSubscriptionMock.mockResolvedValue();

    const result = await PurchaseService.purchaseSubscription('monthly');

    expect(result).toEqual({ success: true });
    expect(requestSubscriptionMock).toHaveBeenCalledWith({
      sku: SUBSCRIPTION_PRODUCTS.monthly,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
      appAccountToken: 'existing-token',
    });
    expect(digestMock).not.toHaveBeenCalled();
  });

  it('creates account token when none exists', async () => {
    setPlatform('ios');
    getDocMock.mockResolvedValueOnce({ data: () => ({}) } as any);
    requestSubscriptionMock.mockResolvedValue();

    const result = await PurchaseService.purchaseSubscription('monthly');

    expect(result.success).toBe(true);
    expect(digestMock).toHaveBeenCalledWith(Crypto.CryptoDigestAlgorithm.SHA256, 'user-123');
    expect(setDocMock).toHaveBeenCalled();
    expect(requestSubscriptionMock).toHaveBeenCalledWith({
      sku: SUBSCRIPTION_PRODUCTS.monthly,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
      appAccountToken: 'hashed-token',
    });
  });

  it('requests Android subscription with introductory offer when available', async () => {
    setPlatform('android');
    const offerToken = 'offer-token';
    getSubscriptionsMock.mockResolvedValueOnce([
      {
        subscriptionOfferDetails: [
          {
            offerToken,
            pricingPhases: {
              pricingPhaseList: [{ priceAmountMicros: '0' }],
            },
          },
        ],
      } as any,
    ]);
    requestSubscriptionMock.mockResolvedValue();

    const result = await PurchaseService.purchaseSubscription('monthly');

    expect(result.success).toBe(true);
    expect(requestSubscriptionMock).toHaveBeenCalledWith({
      sku: SUBSCRIPTION_PRODUCTS.monthly,
      subscriptionOffers: [{ sku: SUBSCRIPTION_PRODUCTS.monthly, offerToken }],
    });
  });

  it('handles user cancellation gracefully', async () => {
    setPlatform('ios');
    requestSubscriptionMock.mockRejectedValueOnce({ code: 'E_USER_CANCELLED' });

    const result = await PurchaseService.purchaseSubscription('monthly');

    expect(result).toEqual({ success: false, cancelled: true });
  });

  it('returns error when purchase fails for other reasons', async () => {
    setPlatform('ios');
    const error = new Error('iap failure');
    requestSubscriptionMock.mockRejectedValueOnce(error);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await PurchaseService.purchaseSubscription('monthly');

    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error', error);
    consoleError.mockRestore();
  });

  it('fails purchase when user is not authenticated', async () => {
    authInstance.currentUser = null;

    const result = await PurchaseService.purchaseSubscription('monthly');

    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error');
    authInstance.currentUser = { uid: 'user-123' };
  });

  it('restores purchases when a subscription exists', async () => {
    const purchase = createPurchase();
    getAvailablePurchasesMock.mockResolvedValueOnce([purchase as any]);
    const validateSpy = jest
      .spyOn(PurchaseService as unknown as { validateAndSavePurchase: (p: any) => Promise<void> }, 'validateAndSavePurchase')
      .mockResolvedValue(undefined);

    const result = await PurchaseService.restorePurchases();

    expect(result).toEqual({ success: true, restored: true });
    expect(validateSpy).toHaveBeenCalledWith(purchase);
    validateSpy.mockRestore();
  });

  it('returns not restored when no purchases found', async () => {
    getAvailablePurchasesMock.mockResolvedValueOnce([]);

    const result = await PurchaseService.restorePurchases();

    expect(result).toEqual({ success: true, restored: false });
  });

  it('handles purchase updates by finishing transactions', async () => {
    const purchase = createPurchase();
    const validateSpy = jest
      .spyOn(PurchaseService as unknown as { validateAndSavePurchase: (p: any) => Promise<void> }, 'validateAndSavePurchase')
      .mockResolvedValue(undefined);

    await (PurchaseService as unknown as { handlePurchaseUpdate: (p: any) => Promise<void> }).handlePurchaseUpdate(purchase);

    expect(validateSpy).toHaveBeenCalledWith(purchase);
    expect(finishTransactionMock).toHaveBeenCalledWith({ purchase, isConsumable: false });
    validateSpy.mockRestore();
  });
});
