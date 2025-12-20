import { Platform } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import {
  initConnection,
  endConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getSubscriptions,
  getProducts,
  requestSubscription,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  type Purchase,
  type SubscriptionAndroid,
  type SubscriptionOfferAndroid,
  type PricingPhaseAndroid,
} from 'react-native-iap';
import { SUBSCRIPTION_PRODUCTS, type PlanType } from '@/services/iap/products';
import * as Crypto from 'expo-crypto';

/** User-friendly error messages for common IAP error codes */
const IAP_ERROR_MESSAGES: Record<string, string> = {
  E_DEVELOPER_ERROR: 'This product is not available yet. Please try again later.',
  E_ITEM_UNAVAILABLE: 'This subscription is currently unavailable.',
  E_NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  E_SERVICE_ERROR: 'Store service error. Please try again later.',
  E_BILLING_UNAVAILABLE: 'Billing is not available on this device.',
  E_USER_CANCELLED: 'Purchase was cancelled.',
  E_ALREADY_OWNED: 'You already own this subscription.',
  E_NOT_PREPARED: 'Store connection not ready. Please restart the app.',
};

export class PurchaseService {
  private static purchaseUpdateSub: { remove: () => void } | null = null;
  private static purchaseErrorSub: { remove: () => void } | null = null;

  static async initialize() {
    try {
      await initConnection();
      this.setupListeners();
      return { success: true };
    } catch (error) {
      console.error('IAP init failed', error);
      return { success: false, error } as const;
    }
  }

  private static setupListeners() {
    if (!this.purchaseUpdateSub) {
      this.purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
        try {
          await this.handlePurchaseUpdate(purchase);
        } catch (e) {
          console.error('IAP purchase update handling failed', e);
        }
      });
    }
    if (!this.purchaseErrorSub) {
      this.purchaseErrorSub = purchaseErrorListener((error: unknown) => {
        console.warn('IAP purchase error', error);
      });
    }
  }

  static cleanup() {
    try {
      this.purchaseUpdateSub?.remove();
      this.purchaseErrorSub?.remove();
    } catch (_e) {
      void _e; // noop
    }
    this.purchaseUpdateSub = null;
    this.purchaseErrorSub = null;
    endConnection().catch(() => {});
  }

  /**
   * Check if IAP products are available in the store.
   * Useful for diagnosing configuration issues.
   */
  static async checkProductsAvailable(): Promise<{
    available: boolean;
    products: string[];
    unavailable: string[];
  }> {
    try {
      const allSkus = Object.values(SUBSCRIPTION_PRODUCTS);
      const subscriptionSkus = [SUBSCRIPTION_PRODUCTS.monthly, SUBSCRIPTION_PRODUCTS.annual];
      const productSkus = [SUBSCRIPTION_PRODUCTS.lifetime];

      const [subs, prods] = await Promise.all([
        getSubscriptions({ skus: subscriptionSkus }),
        getProducts({ skus: productSkus }),
      ]);

      const foundIds = [...subs, ...prods].map((p) => p.productId);
      const unavailable = allSkus.filter((sku) => !foundIds.includes(sku));

      return {
        available: unavailable.length === 0,
        products: foundIds,
        unavailable,
      };
    } catch (error) {
      console.error('IAP checkProductsAvailable failed', error);
      return { available: false, products: [], unavailable: Object.values(SUBSCRIPTION_PRODUCTS) };
    }
  }

  /**
   * Diagnose IAP setup for debugging store configuration issues.
   */
  static async diagnoseIAPSetup(): Promise<{
    connectionOk: boolean;
    productsAvailable: string[];
    productsMissing: string[];
    platform: string;
  }> {
    const connectionOk = await initConnection()
      .then(() => true)
      .catch(() => false);
    const { products, unavailable } = await this.checkProductsAvailable();

    return {
      connectionOk,
      productsAvailable: products,
      productsMissing: unavailable,
      platform: Platform.OS,
    };
  }

  static async purchaseSubscription(plan: PlanType) {
    // Route lifetime purchases to the dedicated method
    if (plan === 'lifetime') {
      return this.purchaseLifetime();
    }

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('User must be authenticated');

      const sku = SUBSCRIPTION_PRODUCTS[plan];

      if (Platform.OS === 'ios') {
        const appAccountToken = await this.getOrCreateAppAccountToken(user.uid);
        await requestSubscription({ sku, andDangerouslyFinishTransactionAutomaticallyIOS: false, appAccountToken });
      } else {
        const subs = await getSubscriptions({ skus: [sku] });
        const product = subs?.[0] as SubscriptionAndroid | undefined;
        const offerToken = product?.subscriptionOfferDetails?.find((o: SubscriptionOfferAndroid) =>
          o.pricingPhases.pricingPhaseList.some((p: PricingPhaseAndroid) => p.priceAmountMicros === '0')
        )?.offerToken || product?.subscriptionOfferDetails?.[0]?.offerToken;

        await requestSubscription({ sku, subscriptionOffers: offerToken ? [{ sku, offerToken }] : undefined });
      }

      return { success: true } as const;
    } catch (error: unknown) {
      const errorCode = (error as { code?: string })?.code || 'UNKNOWN';
      if (errorCode === 'E_USER_CANCELLED') {
        return { success: false, cancelled: true, errorCode, userMessage: IAP_ERROR_MESSAGES[errorCode] } as const;
      }
      console.error('IAP purchaseSubscription failed', error);
      const userMessage = IAP_ERROR_MESSAGES[errorCode] || 'Purchase failed. Please try again.';
      return { success: false, error, errorCode, userMessage } as const;
    }
  }

  static async purchaseLifetime() {
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('User must be authenticated');

      const sku = SUBSCRIPTION_PRODUCTS.lifetime;

      if (Platform.OS === 'ios') {
        const appAccountToken = await this.getOrCreateAppAccountToken(user.uid);
        await requestPurchase({ sku, andDangerouslyFinishTransactionAutomaticallyIOS: false, appAccountToken });
      } else {
        // For Android, verify the product exists before requesting purchase
        await getProducts({ skus: [sku] });
        await requestPurchase({ sku });
      }

      return { success: true } as const;
    } catch (error: unknown) {
      const errorCode = (error as { code?: string })?.code || 'UNKNOWN';
      if (errorCode === 'E_USER_CANCELLED') {
        return { success: false, cancelled: true, errorCode, userMessage: IAP_ERROR_MESSAGES[errorCode] } as const;
      }
      console.error('IAP purchaseLifetime failed', error);
      const userMessage = IAP_ERROR_MESSAGES[errorCode] || 'Purchase failed. Please try again.';
      return { success: false, error, errorCode, userMessage } as const;
    }
  }

  private static async getOrCreateAppAccountToken(uid: string): Promise<string> {
    const db = getFirestore();
    const ref = doc(collection(db, 'users'), uid);
    const snap = await getDoc(ref);
    const existing = (snap.data() as { appAccountToken?: string } | undefined)?.appAccountToken;
    if (existing && typeof existing === 'string') return existing;
    const token = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uid);
    await setDoc(ref, { appAccountToken: token }, { merge: true });
    return token;
  }

  private static async handlePurchaseUpdate(purchase: Purchase) {
    if (!purchase.transactionReceipt) return;
    try {
      await this.validateAndSavePurchase(purchase);
      await finishTransaction({ purchase, isConsumable: false });
    } catch (e) {
      console.error('IAP validate/save or finishTransaction failed', e);
      // Do not finish transaction if validation failed
    }
  }

  private static async validateAndSavePurchase(purchase: Purchase) {
    const user = getAuth().currentUser;
    if (!user) throw new Error('User not authenticated');

    try {
      // Lazy import to avoid bundling errors if functions isn’t installed yet
      const functionsModule = await import('@react-native-firebase/functions');
      const functions = functionsModule.getFunctions();
      const validatePurchase = functionsModule.httpsCallable(functions, 'validatePurchase');

      const result = await validatePurchase({
        receipt: purchase.transactionReceipt,
        platform: Platform.OS,
        productId: purchase.productId,
        purchaseToken: (purchase as Purchase & { purchaseToken?: string }).purchaseToken,
      });

      const data = (result?.data || {}) as Partial<{
        valid: boolean;
        membershipStatus: 'trial' | 'premium';
        expiryDate: unknown;
        trialStartDate?: unknown;
        trialEndDate?: unknown;
        autoRenewing?: boolean;
        productId?: 'monthly' | 'annual' | 'lifetime';
        hasUsedTrial?: boolean;
        androidPurchaseToken?: string;
        isLifetime?: boolean;
      }>;
      if (data.valid) {
        const update: Record<string, unknown> = {
          membershipStatus: data.membershipStatus, // 'trial' | 'premium'
          subscriptionId: purchase.transactionId,
          subscriptionExpiryDate: data.expiryDate ?? null,
          trialStartDate: data.trialStartDate ?? null,
          trialEndDate: data.trialEndDate ?? null,
          autoRenewing: !!data.autoRenewing,
          lastReceiptData: purchase.transactionReceipt,
          paymentPlatform: Platform.OS,
          productId: data.productId,
          hasUsedTrial: data.hasUsedTrial ?? true,
        };
        if (Platform.OS === 'android') {
          const androidToken = (purchase as Purchase & { purchaseToken?: string }).purchaseToken || data.androidPurchaseToken || null;
          (update as { androidPurchaseToken?: string | null }).androidPurchaseToken = androidToken;
        }
        const db = getFirestore();
        await setDoc(doc(collection(db, 'users'), user.uid), update, { merge: true });
      } else {
        throw new Error('Invalid receipt');
      }
    } catch (e) {
      console.error('IAP validateAndSavePurchase error', e);
      throw e;
    }
  }

  static async restorePurchases() {
    try {
      const purchases = await getAvailablePurchases();
      const ids = Object.values(SUBSCRIPTION_PRODUCTS) as string[];

      // Prioritize lifetime purchases if found
      const lifetimePurchase = purchases.find((p) => p.productId === SUBSCRIPTION_PRODUCTS.lifetime);
      if (lifetimePurchase) {
        await this.validateAndSavePurchase(lifetimePurchase);
        return { success: true, restored: true, isLifetime: true } as const;
      }

      // Otherwise look for active subscription
      const active = purchases.find((p) => ids.includes(p.productId));
      if (active) {
        await this.validateAndSavePurchase(active);
        return { success: true, restored: true, isLifetime: false } as const;
      }
      return { success: true, restored: false } as const;
    } catch (error) {
      console.error('IAP restorePurchases failed', error);
      const errorCode = (error as { code?: string })?.code || 'UNKNOWN';
      const userMessage = IAP_ERROR_MESSAGES[errorCode] || 'Failed to restore purchases. Please try again.';
      return { success: false, error, errorCode, userMessage } as const;
    }
  }
}

export default PurchaseService;
