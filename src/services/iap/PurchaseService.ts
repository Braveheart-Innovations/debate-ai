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
import { ErrorService } from '@/services/errors/ErrorService';

/** User-friendly error messages for common IAP error codes */
const IAP_ERROR_MESSAGES: Record<string, string> = {
  E_DEVELOPER_ERROR: 'This product is not available yet. Please try again later.',
  E_ITEM_UNAVAILABLE: 'This subscription is currently unavailable.',
  E_NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  E_SERVICE_ERROR: 'Store service error. Please try again later.',
  E_BILLING_UNAVAILABLE: 'Billing is not available on this device.',
  E_USER_CANCELLED: 'Purchase was cancelled.',
  E_ALREADY_OWNED: 'You already own this subscription. Try "Restore Purchases" below.',
  E_NOT_PREPARED: 'Store connection not ready. Please restart the app.',
};

/** User-friendly messages for Firebase validation errors */
const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  'unauthenticated': 'Please sign in to complete your purchase.',
  'invalid-argument': 'Invalid purchase data. Please try again.',
  'not-found': 'Purchase not found. Please contact support if charged.',
  'failed-precondition': 'Unable to process this purchase. Please try a different option.',
  'internal': 'Server error. Please try again in a few moments.',
};

/** Extract user-friendly message from Firebase function error */
function extractFirebaseErrorMessage(error: unknown): string {
  // Check if it's a Firebase HttpsError with a message
  const firebaseError = error as { code?: string; message?: string; details?: unknown };

  // If the error has a specific message from our backend, use it
  if (firebaseError.message && !firebaseError.message.includes('INTERNAL')) {
    // Clean up common prefixes
    let message = firebaseError.message;
    if (message.startsWith('functions/')) {
      message = message.replace(/^functions\/[^:]+:\s*/, '');
    }
    return message;
  }

  // Fall back to code-based message
  if (firebaseError.code) {
    const code = firebaseError.code.replace('functions/', '');
    return VALIDATION_ERROR_MESSAGES[code] || 'Purchase validation failed. Please try again.';
  }

  return 'Purchase validation failed. Please try again.';
}

// Event system for surfacing background errors to UI
type PurchaseErrorListener = (error: { message: string; isRecoverable: boolean }) => void;
const errorListeners: Set<PurchaseErrorListener> = new Set();

export class PurchaseService {
  private static purchaseUpdateSub: { remove: () => void } | null = null;
  private static purchaseErrorSub: { remove: () => void } | null = null;

  /**
   * Register a listener for background purchase errors (e.g., validation failures).
   * Returns an unsubscribe function.
   */
  static onPurchaseError(listener: PurchaseErrorListener): () => void {
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  }

  private static notifyError(message: string, isRecoverable: boolean = true) {
    errorListeners.forEach(listener => {
      try {
        listener({ message, isRecoverable });
      } catch (e) {
        console.warn('Error in purchase error listener', e);
      }
    });
  }

  static async initialize() {
    try {
      await initConnection();
      this.setupListeners();
      return { success: true };
    } catch (error) {
      // Log via ErrorService but don't show toast (initialization is background)
      ErrorService.handleSilent(error, { action: 'iap_initialize' });
      return { success: false, error } as const;
    }
  }

  private static setupListeners() {
    if (!this.purchaseUpdateSub) {
      this.purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
        try {
          await this.handlePurchaseUpdate(purchase);
        } catch (e) {
          ErrorService.handleSilent(e, { action: 'iap_purchase_update', productId: purchase.productId });
        }
      });
    }
    if (!this.purchaseErrorSub) {
      this.purchaseErrorSub = purchaseErrorListener((error: unknown) => {
        ErrorService.handleSilent(error, { action: 'iap_purchase_error' });
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
      ErrorService.handleSilent(error, { action: 'iap_check_products' });
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
      // Log via ErrorService for centralized tracking
      ErrorService.handleError(error, {
        feature: 'purchase',
        showToast: false, // UI handles displaying error
        context: { action: 'purchaseSubscription', plan, errorCode },
      });
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
      // Log via ErrorService for centralized tracking
      ErrorService.handleError(error, {
        feature: 'purchase',
        showToast: false,
        context: { action: 'purchaseLifetime', errorCode },
      });
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
      // Log via ErrorService for centralized tracking
      ErrorService.handleError(e, {
        feature: 'purchase',
        showToast: false,
        context: { action: 'handlePurchaseUpdate', productId: purchase.productId },
      });
      // Extract user-friendly message and notify listeners
      const message = extractFirebaseErrorMessage(e);
      this.notifyError(message, true);
      // Do not finish transaction if validation failed - allows retry
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
          isPremium: true, // Both trial and premium users have premium access
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
      // Log but don't handle here - let caller decide how to handle
      ErrorService.handleSilent(e, { action: 'validateAndSavePurchase', productId: purchase.productId });
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
      const errorCode = (error as { code?: string })?.code || 'UNKNOWN';
      // Log via ErrorService for centralized tracking
      ErrorService.handleError(error, {
        feature: 'purchase',
        showToast: false,
        context: { action: 'restorePurchases', errorCode },
      });
      // Try Firebase error extraction first, then IAP error messages
      const userMessage = extractFirebaseErrorMessage(error) !== 'Purchase validation failed. Please try again.'
        ? extractFirebaseErrorMessage(error)
        : IAP_ERROR_MESSAGES[errorCode] || 'Failed to restore purchases. Please try again.';
      return { success: false, error, errorCode, userMessage } as const;
    }
  }
}

export default PurchaseService;
