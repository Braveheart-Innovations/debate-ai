import { Platform } from 'react-native';
import { getAuth, getIdToken, reload } from '@react-native-firebase/auth';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getFirestore, collection, doc, getDoc, addDoc } from '@react-native-firebase/firestore';
import type {
  Purchase,
  ProductSubscriptionAndroid,
  ProductSubscriptionAndroidOfferDetails,
  PricingPhaseAndroid,
  SubscriptionOffer,
  SubscriptionProductReplacementParamsAndroid,
} from 'react-native-iap';
import { SUBSCRIPTION_PRODUCTS, type PlanType } from '@/services/iap/products';
import { isStorePurchaseUnavailableInCurrentEnvironment } from '@/services/iap/environment';
import { getIapModule, getLoadedIapModule } from '@/services/iap/nativeModule';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { ErrorService } from '@/services/errors/ErrorService';
import { Logger } from '@/services/logging';

type InitializeResult = { success: true } | { success: false; error?: unknown; skipped?: boolean };
type PurchaseSubscriptionOptions = {
  includeTrialOffer?: boolean;
};
type AndroidOfferCandidate = {
  token: string;
  hasFreeTrial: boolean;
  source: 'legacy' | 'standardized';
  basePlanId?: string | null;
  offerId?: string | null;
  phaseCount?: number;
};
type PendingPurchaseContext = {
  sku: string;
  plan?: PlanType;
  includeTrialOffer?: boolean;
  requestedTrialOffer?: boolean;
  hasUsedTrial?: boolean;
  selectedOffer?: Omit<AndroidOfferCandidate, 'token'>;
  legacyOfferCount?: number;
  standardizedOfferCount?: number;
  productStatusAndroid?: string | null;
  replacementProductId?: string | null;
  foreignStoreItemCount?: number;
  unverifiedStoreItemCount?: number;
};

type StorePurchaseSummary = {
  productId: string | null;
  ids?: string[];
  state?: string | null;
  currentPlanId?: string | null;
  autoRenewingAndroid?: boolean | null;
  acknowledgedAndroid?: boolean | null;
  suspendedAndroid?: boolean | null;
  hasObfuscatedAccountIdAndroid?: boolean;
  hasStoreCredential: boolean;
  hasTxnId: boolean;
  hasPendingStoreUpdate?: boolean;
};

type AndroidStoreOwnershipContext = {
  expectedObfuscatedAccountId: string;
  storedPurchaseTokens: Set<string>;
  hasUsedTrial: boolean;
};

type AndroidStorePurchaseOwnershipStatus = 'owned' | 'foreign' | 'unverified';

const ANDROID_SUBSCRIPTION_REPLACEMENT_MODE = 'without-proration' as const;
const STORE_ACCOUNT_MISMATCH_MESSAGE =
  'Google Play is returning a purchase linked to a different app account on this device. Open Play Store with the Google account you want to use, clear the Play Store cache, then restart the app and try again.';
const IOS_SIMULATOR_STORE_UNAVAILABLE_MESSAGE =
  'In-app purchases are not available in this iOS Simulator build. Test purchases on a physical TestFlight/App Store build or configure StoreKit testing.';

/** Timeout helper for promises */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
}

function getTimestampMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const timestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate().getTime();
    }
    if (typeof timestamp.seconds === 'number') {
      return timestamp.seconds * 1000;
    }
    if (typeof timestamp._seconds === 'number') {
      return timestamp._seconds * 1000;
    }
  }
  return null;
}

async function emailPasswordUserNeedsVerification(user: ReturnType<typeof getAuth>['currentUser']): Promise<boolean> {
  if (!user) return true;
  const isEmailPasswordUser = user.providerData?.some((provider) => provider.providerId === 'password') === true;
  if (!isEmailPasswordUser) return false;

  await reload(user);
  if (!user.emailVerified) return true;

  await getIdToken(user, true);
  return false;
}

/**
 * Log purchase errors to Firestore for debugging Google Play review rejections.
 * This allows us to see exactly what error occurred during review.
 */
async function logPurchaseError(
  action: string,
  errorCode: string,
  errorMessage: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const db = getFirestore();
    const user = getAuth().currentUser;
    const userIdHash = user?.uid
      ? await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, user.uid)
      : null;
    const docData = {
      timestamp: Date.now(),
      timestampISO: new Date().toISOString(),
      action,
      errorCode,
      errorMessage,
      userIdHash: userIdHash ? userIdHash.slice(0, 16) : 'anonymous',
      userAuthenticated: Boolean(user),
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      details: JSON.stringify(Logger.redactValue('details', details)),
    };
    console.warn('[IAP] Logging purchase error to Firestore:', Logger.redactContext({
      action,
      errorCode,
      errorMessage,
      details,
    }));
    const docRef = await addDoc(collection(db, 'purchase_errors'), docData);
    console.warn('[IAP] Successfully logged error to Firestore, docId:', docRef.id);
  } catch (e) {
    // Log the actual Firestore error
    const firebaseError = e as { code?: string; message?: string };
    console.warn('[IAP] FAILED to log error to Firestore:', firebaseError?.code, firebaseError?.message, e);
  }
}

/** Store error codes that mean the user dismissed the purchase sheet (iOS + Android + Play responseCode). */
const IAP_USER_CANCELLED_CODES = ['E_USER_CANCELLED', 'USER_CANCELED', 'user-cancelled', '1'];

/** User-friendly error messages for common IAP error codes */
const IAP_ERROR_MESSAGES: Record<string, string> = {
  E_DEVELOPER_ERROR: 'Unable to connect to the store. Please ensure you have the latest version of the app from the Play Store and try again.',
  E_ITEM_UNAVAILABLE: 'This subscription is currently unavailable. Please try again later.',
  E_NETWORK_ERROR: 'Network error. Please check your internet connection and try again.',
  E_SERVICE_ERROR: 'The app store service is temporarily unavailable. Please try again in a few moments.',
  E_BILLING_UNAVAILABLE: 'In-app purchases are not available on this device. Please check your device settings.',
  E_USER_CANCELLED: 'Purchase was cancelled.',
  E_ALREADY_OWNED: 'You already have an active subscription. Tap "Restore Purchases" below to restore it.',
  E_NOT_PREPARED: 'Unable to connect to the store. Please close and reopen the app, then try again.',
  E_UNKNOWN: 'Unable to complete purchase. Please ensure you have a valid payment method and try again.',
  // Google Play specific string error codes
  BILLING_UNAVAILABLE: 'Google Play billing is not available. Please ensure Google Play services are up to date.',
  ITEM_UNAVAILABLE: 'This subscription is not available for purchase at this time.',
  ITEM_NOT_OWNED: 'You do not own this item.',
  ITEM_ALREADY_OWNED: 'You already have an active subscription. Tap "Restore Purchases" below to restore it.',
  USER_CANCELED: 'Purchase was cancelled.',
  ERROR: 'A purchase error occurred. Please check your payment method and try again.',
  SERVICE_DISCONNECTED: 'Connection to the store was lost. Please try again.',
  SERVICE_UNAVAILABLE: 'The store service is temporarily unavailable. Please try again later.',
  FEATURE_NOT_SUPPORTED: 'This feature is not supported on your device.',
  // Google Play NUMERIC response codes (BillingResponseCode)
  '0': 'Purchase completed successfully.',  // OK
  '1': 'Purchase was cancelled.',  // USER_CANCELED
  '2': 'The store service is temporarily unavailable. Please try again later.',  // SERVICE_UNAVAILABLE
  '3': 'Google Play billing is not available. Please ensure Google Play services are up to date.',  // BILLING_UNAVAILABLE
  '4': 'This subscription is not available for purchase at this time.',  // ITEM_UNAVAILABLE
  '5': 'Unable to connect to the store. Please ensure you have the latest version of the app.',  // DEVELOPER_ERROR
  '6': 'A purchase error occurred. Please check your payment method and try again.',  // ERROR
  '7': 'You already have an active subscription. Tap "Restore Purchases" below to restore it.',  // ITEM_ALREADY_OWNED
  '8': 'You do not own this item.',  // ITEM_NOT_OWNED
  '-1': 'Connection to the store was lost. Please try again.',  // SERVICE_DISCONNECTED
  '-2': 'This feature is not supported on your device.',  // FEATURE_NOT_SUPPORTED
  '-3': 'Network error. Please check your internet connection and try again.',  // NETWORK_ERROR
  // react-native-iap/OpenIAP string error codes
  'service-error': 'Google Play could not complete the purchase. Please check your Play Store sign-in and payment setup, then try again.',
  'service-disconnected': 'Connection to Google Play was lost. Please try again.',
  'network-error': 'Network error. Please check your internet connection and try again.',
  'billing-unavailable': 'Google Play billing is not available. Please ensure Google Play services are up to date.',
  'iap-not-available': 'Google Play billing is not available. Please ensure Google Play services are up to date.',
  'item-unavailable': 'This subscription is not available for purchase at this time.',
  'item-already-owned': 'You already have an active subscription. Tap "Restore Purchases" below to restore it.',
  'item-not-owned': 'You do not own this item.',
  'user-cancelled': 'Purchase was cancelled.',
  'purchase-error': 'Google Play could not complete the purchase. Please check your Play Store sign-in and payment setup, then try again.',
};

function getStoreUnavailableUserMessage(): string {
  return Platform.OS === 'ios'
    ? IOS_SIMULATOR_STORE_UNAVAILABLE_MESSAGE
    : IAP_ERROR_MESSAGES.E_BILLING_UNAVAILABLE;
}

/** User-friendly messages for Firebase validation errors */
const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  'unauthenticated': 'Please sign in to complete your purchase.',
  'invalid-argument': 'Invalid purchase data. Please try again.',
  'not-found': 'Purchase not found. Please contact support if charged.',
  'failed-precondition': 'Unable to process this purchase. Please try a different option.',
  'internal': 'Server error. Please try again in a few moments.',
};

function isStandardizedSubscriptionOffer(
  offer: ProductSubscriptionAndroidOfferDetails | SubscriptionOffer
): offer is SubscriptionOffer {
  return 'offerTokenAndroid' in offer || 'pricingPhasesAndroid' in offer || 'paymentMode' in offer;
}

function hasFreeTrialPhase(offer: ProductSubscriptionAndroidOfferDetails | SubscriptionOffer): boolean {
  const hasZeroPricePhase = (phases?: PricingPhaseAndroid[] | null) =>
    phases?.some((p) => String(p.priceAmountMicros) === '0') === true;

  if (isStandardizedSubscriptionOffer(offer)) {
    return offer.paymentMode === 'free-trial'
      || hasZeroPricePhase(offer.pricingPhasesAndroid?.pricingPhaseList);
  }

  return hasZeroPricePhase(offer.pricingPhases.pricingPhaseList);
}

function getAndroidSubscriptionOffer(
  product: ProductSubscriptionAndroid,
  includeTrialOffer: boolean
): AndroidOfferCandidate | null {
  const legacyCandidates = (product.subscriptionOfferDetailsAndroid ?? [])
    .filter((offer) => Boolean(offer.offerToken))
    .map((offer) => ({
      token: offer.offerToken,
      hasFreeTrial: hasFreeTrialPhase(offer),
      source: 'legacy' as const,
      basePlanId: offer.basePlanId,
      offerId: offer.offerId,
      phaseCount: offer.pricingPhases.pricingPhaseList.length,
    }));
  const standardizedCandidates = [
    ...(product.subscriptionOffers ?? [])
      .filter((offer) => Boolean(offer.offerTokenAndroid))
      .map((offer) => ({
        token: offer.offerTokenAndroid as string,
        hasFreeTrial: hasFreeTrialPhase(offer),
        source: 'standardized' as const,
        basePlanId: offer.basePlanIdAndroid,
        offerId: offer.id,
        phaseCount: offer.pricingPhasesAndroid?.pricingPhaseList?.length ?? undefined,
      })),
  ];
  // Prefer the legacy Android BillingClient offer details. The standardized list is
  // a derived compatibility surface, while subscriptionOfferDetailsAndroid is the
  // native offer-token source used by Google Play Billing.
  const candidates = [...legacyCandidates, ...standardizedCandidates];

  if (includeTrialOffer) {
    return candidates.find((offer) => offer.hasFreeTrial) ?? candidates[0] ?? null;
  }

  return candidates.find((offer) => !offer.hasFreeTrial) ?? null;
}

function redactOfferToken(candidate: AndroidOfferCandidate): Omit<AndroidOfferCandidate, 'token'> {
  return {
    hasFreeTrial: candidate.hasFreeTrial,
    source: candidate.source,
    basePlanId: candidate.basePlanId,
    offerId: candidate.offerId,
    phaseCount: candidate.phaseCount,
  };
}

function getPurchaseProductIds(purchase: Purchase): string[] {
  const ids = [
    purchase.productId,
    ...((purchase as Purchase & { ids?: string[] | null }).ids ?? []),
  ].filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

function getPurchaseProductId(purchase: Purchase): string | null {
  return getPurchaseProductIds(purchase)[0] ?? null;
}

function getPurchaseToken(purchase: Purchase): string | null {
  return (purchase as Purchase & { purchaseToken?: string | null }).purchaseToken ?? null;
}

function purchaseMatchesSku(purchase: Purchase, sku: string): boolean {
  return getPurchaseProductIds(purchase).includes(sku);
}

function summarizeStorePurchase(purchase: Purchase): StorePurchaseSummary {
  const androidPurchase = purchase as Purchase & {
    autoRenewingAndroid?: boolean | null;
    isAcknowledgedAndroid?: boolean | null;
    isSuspendedAndroid?: boolean | null;
    pendingPurchaseUpdateAndroid?: unknown;
    transactionId?: string | null;
  };
  const ids = getPurchaseProductIds(purchase);

  return {
    productId: getPurchaseProductId(purchase),
    ids: ids.length > 1 ? ids : undefined,
    state: purchase.purchaseState ?? null,
    currentPlanId: purchase.currentPlanId ?? null,
    autoRenewingAndroid: androidPurchase.autoRenewingAndroid ?? null,
    acknowledgedAndroid: androidPurchase.isAcknowledgedAndroid ?? null,
    suspendedAndroid: androidPurchase.isSuspendedAndroid ?? null,
    hasObfuscatedAccountIdAndroid: Boolean(
      (androidPurchase as Purchase & { obfuscatedAccountIdAndroid?: string | null }).obfuscatedAccountIdAndroid
    ),
    hasStoreCredential: Boolean(purchase.purchaseToken),
    hasTxnId: Boolean(androidPurchase.transactionId),
    hasPendingStoreUpdate: Boolean(androidPurchase.pendingPurchaseUpdateAndroid),
  };
}

function summarizeStorePurchases(purchases: Purchase[]): StorePurchaseSummary[] {
  return purchases.map(summarizeStorePurchase);
}

function getAndroidSubscriptionReplacementParams(
  purchases: Purchase[],
  targetSku: string
): SubscriptionProductReplacementParamsAndroid | null {
  const subscriptionSkus = new Set<string>([
    SUBSCRIPTION_PRODUCTS.monthly,
    SUBSCRIPTION_PRODUCTS.annual,
  ]);

  const existingSubscription = purchases.find((purchase) => {
    const productId = getPurchaseProductId(purchase);
    return Boolean(productId && !purchaseMatchesSku(purchase, targetSku) && subscriptionSkus.has(productId));
  });
  const oldProductId = existingSubscription ? getPurchaseProductId(existingSubscription) : null;

  if (!oldProductId) {
    return null;
  }

  return {
    oldProductId,
    replacementMode: ANDROID_SUBSCRIPTION_REPLACEMENT_MODE,
  };
}

function getAndroidPurchaseObfuscatedAccountId(purchase: Purchase): string | null {
  return (purchase as Purchase & { obfuscatedAccountIdAndroid?: string | null }).obfuscatedAccountIdAndroid ?? null;
}

function getAndroidStorePurchaseOwnershipStatus(
  purchase: Purchase,
  ownership: AndroidStoreOwnershipContext
): AndroidStorePurchaseOwnershipStatus {
  const purchaseAccountId = getAndroidPurchaseObfuscatedAccountId(purchase);
  if (purchaseAccountId) {
    return purchaseAccountId === ownership.expectedObfuscatedAccountId ? 'owned' : 'foreign';
  }

  const purchaseToken = getPurchaseToken(purchase);
  if (purchaseToken && ownership.storedPurchaseTokens.has(purchaseToken)) {
    return 'owned';
  }

  return 'unverified';
}

function filterAndroidStorePurchasesForCurrentUser(
  purchases: Purchase[],
  ownership: AndroidStoreOwnershipContext
): {
  ownedPurchases: Purchase[];
  rejectedPurchases: Array<{ purchase: Purchase; status: AndroidStorePurchaseOwnershipStatus }>;
} {
  const ownedPurchases: Purchase[] = [];
  const rejectedPurchases: Array<{ purchase: Purchase; status: AndroidStorePurchaseOwnershipStatus }> = [];

  purchases.forEach((purchase) => {
    const status = getAndroidStorePurchaseOwnershipStatus(purchase, ownership);
    if (status === 'owned') {
      ownedPurchases.push(purchase);
    } else {
      rejectedPurchases.push({ purchase, status });
    }
  });

  return { ownedPurchases, rejectedPurchases };
}

function summarizeUnknownError(error: unknown): {
  errorCode: string;
  errorMessage: string;
  responseCode?: number;
  debugMessage?: string;
  name?: string;
  productId?: string | null;
  stackPresent?: boolean;
} {
  const errorObj = error as {
    code?: string;
    message?: string;
    debugMessage?: string;
    responseCode?: number;
    name?: string;
    productId?: string | null;
    stack?: string;
  };

  return {
    errorCode: errorObj?.code || (errorObj?.responseCode !== undefined ? String(errorObj.responseCode) : 'UNKNOWN'),
    errorMessage: errorObj?.message || errorObj?.debugMessage || String(error),
    responseCode: errorObj?.responseCode,
    debugMessage: errorObj?.debugMessage,
    name: errorObj?.name,
    productId: errorObj?.productId,
    stackPresent: Boolean(errorObj?.stack),
  };
}

function isInvalidPurchaseArgumentsError(error: unknown): boolean {
  const summary = summarizeUnknownError(error);
  const normalizedCode = summary.errorCode.toLowerCase();
  const normalizedMessage = summary.errorMessage.toLowerCase();

  return normalizedCode === 'developer-error'
    || normalizedCode === 'e_developer_error'
    || normalizedCode === '5'
    || normalizedMessage.includes('invalid arguments provided to the api')
    || normalizedMessage.includes('invalid arguments');
}

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
  private static isInitialized = false;
  private static initializationInProgress: Promise<InitializeResult> | null = null;

  // Track when we're expecting a purchase - only process listener events when true
  // This prevents assigning purchases from a different Google account to the current Firebase user
  private static pendingPurchaseSku: string | null = null;
  private static pendingPurchaseContext: PendingPurchaseContext | null = null;

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

  static async initialize(): Promise<InitializeResult> {
    // Already initialized - return immediately
    if (this.isInitialized) {
      return { success: true };
    }

    if (isStorePurchaseUnavailableInCurrentEnvironment()) {
      return { success: false, skipped: true };
    }

    // Initialization already in progress - wait for it
    if (this.initializationInProgress) {
      return this.initializationInProgress;
    }

    // Start initialization with lock
    this.initializationInProgress = (async () => {
      try {
        const { initConnection } = await getIapModule();
        await initConnection();
        await this.setupListeners();
        this.isInitialized = true;
        return { success: true };
      } catch (error) {
        // Log via ErrorService but don't show toast (initialization is background)
        ErrorService.handleSilent(error, { action: 'iap_initialize' });
        this.isInitialized = false;
        return { success: false, error } as const;
      } finally {
        this.initializationInProgress = null;
      }
    })();

    return this.initializationInProgress;
  }

  /**
   * Ensure IAP is initialized before making purchases.
   * Re-initializes if needed (e.g., after hot reload).
   */
  private static async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      const result = await this.initialize();
      if (!result.success) {
        throw { code: 'E_NOT_PREPARED', message: 'Failed to connect to store. Please restart the app.' };
      }
    }
  }

  private static async setupListeners() {
    const { purchaseUpdatedListener, purchaseErrorListener } = await getIapModule();

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
        void this.handlePurchaseError(error);
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
    this.isInitialized = false;
    this.initializationInProgress = null;
    this.pendingPurchaseSku = null;
    this.pendingPurchaseContext = null;
    errorListeners.clear();
    const iapModule = getLoadedIapModule();
    if (iapModule) {
      iapModule.endConnection().catch(() => {});
    }
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
    if (isStorePurchaseUnavailableInCurrentEnvironment()) {
      return { available: false, products: [], unavailable: Object.values(SUBSCRIPTION_PRODUCTS) };
    }

    try {
      const { fetchProducts } = await getIapModule();
      const allSkus = Object.values(SUBSCRIPTION_PRODUCTS);
      const subscriptionSkus = [SUBSCRIPTION_PRODUCTS.monthly, SUBSCRIPTION_PRODUCTS.annual];
      const productSkus = [SUBSCRIPTION_PRODUCTS.lifetime];

      // Serialize IAP calls - react-native-iap can't handle concurrent requests
      const subs = await fetchProducts({ skus: subscriptionSkus, type: 'subs' });
      const prods = await fetchProducts({ skus: productSkus, type: 'in-app' });

      const foundIds = [...(subs ?? []), ...(prods ?? [])].map((p) => p.id);
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
    if (isStorePurchaseUnavailableInCurrentEnvironment()) {
      return {
        connectionOk: false,
        productsAvailable: [],
        productsMissing: Object.values(SUBSCRIPTION_PRODUCTS),
        platform: Platform.OS,
      };
    }

    const { initConnection } = await getIapModule();
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

  static async purchaseSubscription(plan: PlanType, options: PurchaseSubscriptionOptions = {}) {
    // Route lifetime purchases to the dedicated method
    if (plan === 'lifetime') {
      return this.purchaseLifetime();
    }

    const includeTrialOffer = options.includeTrialOffer === true;

    if (isStorePurchaseUnavailableInCurrentEnvironment()) {
      return {
        success: false,
        errorCode: 'E_BILLING_UNAVAILABLE',
        userMessage: getStoreUnavailableUserMessage(),
      } as const;
    }

    try {
      const { fetchProducts, getAvailablePurchases, requestPurchase } = await getIapModule();
      console.warn('[IAP] purchaseSubscription starting for plan:', plan);

      // Ensure IAP is initialized (handles hot reload scenarios)
      console.warn('[IAP] Ensuring initialized...');
      await withTimeout(this.ensureInitialized(), 5000, 'IAP initialization timed out');
      console.warn('[IAP] Initialized OK');

      const user = getAuth().currentUser;
      if (!user) throw new Error('User must be authenticated');
      console.warn('[IAP] User authenticated');

      if (includeTrialOffer && await emailPasswordUserNeedsVerification(user)) {
        return {
          success: false,
          errorCode: 'EMAIL_NOT_VERIFIED',
          userMessage: 'Verify your email before starting a free trial. Then return to the app and try again.',
        } as const;
      }

      const sku = SUBSCRIPTION_PRODUCTS[plan];
      console.warn('[IAP] SKU:', sku);

      if (Platform.OS === 'ios') {
        // Fetch subscription info (with timeout)
        console.warn('[IAP] Fetching subscriptions...');
        const subs = await withTimeout(
          fetchProducts({ skus: [sku], type: 'subs' }),
          10000,
          'Store connection timed out. Please try again.'
        );
        console.warn('[IAP] Got subscriptions:', subs?.length);
        if (!subs || subs.length === 0) {
          throw { code: 'E_ITEM_UNAVAILABLE', message: 'Subscription not found in store' };
        }
        // Generate appAccountToken so Apple can link this user in server notifications.
        // The validatePurchase callable persists the token after store validation succeeds.
        const appAccountToken = await this.deriveAppAccountToken(user.uid);
        console.warn('[IAP] Requesting subscription with appAccountToken...');
        this.pendingPurchaseSku = sku; // Mark that we're expecting this purchase
        await requestPurchase({ type: 'subs', request: { apple: { sku, appAccountToken } } });
        console.warn('[IAP] requestSubscription returned');
      } else {
        // Android: Fetch and validate subscription exists
        console.warn('[IAP] Android: Fetching subscriptions for SKU:', sku);
        const subs = await withTimeout(
          fetchProducts({ skus: [sku], type: 'subs' }),
          10000,
          'Store connection timed out. Please try again.'
        );
        console.warn('[IAP] Android: Got subscriptions:', subs?.length, 'for', sku);

        if (!subs || subs.length === 0) {
          // Log this critical error to Firestore
          await logPurchaseError('getSubscriptions', 'NO_PRODUCTS', `No subscription found for SKU: ${sku}`, {
            plan,
            sku,
            subsLength: 0,
          });
          throw { code: 'E_ITEM_UNAVAILABLE', message: 'Subscription not found in store. Please ensure you have the latest app version.' };
        }

        // CRITICAL: Find the product that matches our requested SKU
        // getSubscriptions may return cached/wrong data, so we must verify
        const product = subs?.find(s => s.id === sku) as ProductSubscriptionAndroid | undefined;

        if (!product) {
          console.warn('[IAP] Android: Product mismatch! Requested:', sku, 'Got:', subs?.map(s => s.id));
          await logPurchaseError('productMismatch', 'E_ITEM_UNAVAILABLE', `Product ${sku} not found in response`, {
            plan,
            sku,
            returnedProducts: subs?.map(s => s.id) ?? [],
          });
          throw { code: 'E_ITEM_UNAVAILABLE', message: 'Subscription not found. Please try again.' };
        }

        const offerCount = product?.subscriptionOfferDetailsAndroid?.length || 0;
        console.warn('[IAP] Android: Product', sku, 'matched, has', offerCount, 'offers');

        const isUnavailableProductStatus = product.productStatusAndroid === 'not-found'
          || product.productStatusAndroid === 'no-offers-available';
        if (isUnavailableProductStatus) {
          await logPurchaseError('productUnavailable', 'E_ITEM_UNAVAILABLE', `Product ${sku} status: ${product.productStatusAndroid}`, {
            plan,
            sku,
            productStatusAndroid: product.productStatusAndroid,
          });
          throw { code: 'E_ITEM_UNAVAILABLE', message: 'This subscription is not available for purchase at this time.' };
        }

        // Log all offers for debugging
        product?.subscriptionOfferDetailsAndroid?.forEach((offer: ProductSubscriptionAndroidOfferDetails, idx: number) => {
          const phases = offer.pricingPhases.pricingPhaseList;
          const hasFreeTrial = phases.some((p: PricingPhaseAndroid) => p.priceAmountMicros === '0');
          console.warn(`[IAP] Android: Legacy offer ${idx}: hasFreeTrial=${hasFreeTrial}, phases=${phases.length}`);
        });
        product?.subscriptionOffers?.forEach((offer: SubscriptionOffer, idx: number) => {
          const hasFreeTrial = hasFreeTrialPhase(offer);
          console.warn(`[IAP] Android: Offer ${idx}: hasFreeTrial=${hasFreeTrial}, token=${offer.offerTokenAndroid ? 'present' : 'MISSING'}`);
        });

        const obfuscatedAccountId = await this.deriveAppAccountToken(user.uid);
        const storeOwnership = await this.getAndroidStoreOwnershipContext(user.uid, obfuscatedAccountId);
        const shouldIncludeTrialOffer = includeTrialOffer && !storeOwnership.hasUsedTrial;

        const hasTrialOffer = [
          ...(product.subscriptionOffers ?? []),
          ...(product.subscriptionOfferDetailsAndroid ?? []),
        ].some(hasFreeTrialPhase);
        const selectedOffer = getAndroidSubscriptionOffer(product, shouldIncludeTrialOffer);

        console.warn('[IAP] Android: Selected offer for', sku, '- includeTrialOffer:', shouldIncludeTrialOffer, 'requestedTrialOffer:', includeTrialOffer, 'hasUsedTrial:', storeOwnership.hasUsedTrial, 'hasTrialOffer:', hasTrialOffer, 'offerSource:', selectedOffer?.source ?? 'MISSING', 'hasFreeTrial:', selectedOffer?.hasFreeTrial ?? 'MISSING', 'offerToken:', selectedOffer ? 'present' : 'MISSING');

        if (!selectedOffer) {
          // Log this critical error to Firestore
          await logPurchaseError('noOfferToken', 'E_DEVELOPER_ERROR', `No offer token for SKU: ${sku}`, {
            plan,
            sku,
            offerCount,
            productDetails: JSON.stringify(product),
          });
          throw { code: 'E_DEVELOPER_ERROR', message: 'No subscription offers available. Please try again later.' };
        }

        console.warn('[IAP] Android: Calling requestSubscription for', sku);
        const availablePurchases = await getAvailablePurchases().catch((purchaseLookupError: unknown) => {
          ErrorService.handleSilent(purchaseLookupError, {
            action: 'iap_get_available_purchases_for_replacement',
            productId: sku,
          });
          return [] as Purchase[];
        });
        const {
          ownedPurchases: availablePurchasesForCurrentUser,
          rejectedPurchases,
        } = filterAndroidStorePurchasesForCurrentUser(availablePurchases, storeOwnership);
        await this.logRejectedAndroidStorePurchases(
          'purchaseSubscriptionStoreAccountMismatch',
          sku,
          storeOwnership,
          rejectedPurchases,
          {
            plan,
            sku,
            includeTrialOffer: shouldIncludeTrialOffer,
            requestedTrialOffer: includeTrialOffer,
            hasUsedTrial: storeOwnership.hasUsedTrial,
            selectedOffer: redactOfferToken(selectedOffer),
            storeItems: summarizeStorePurchases(availablePurchases),
          }
        );

        const sameSkuPurchase = availablePurchasesForCurrentUser.find((purchase) => purchaseMatchesSku(purchase, sku));
        if (sameSkuPurchase) {
          const sameSkuContext = {
            sku,
            plan,
            includeTrialOffer: shouldIncludeTrialOffer,
            requestedTrialOffer: includeTrialOffer,
            hasUsedTrial: storeOwnership.hasUsedTrial,
            selectedOffer: redactOfferToken(selectedOffer),
            legacyOfferCount: product.subscriptionOfferDetailsAndroid?.length ?? 0,
            standardizedOfferCount: product.subscriptionOffers?.length ?? 0,
            productStatusAndroid: product.productStatusAndroid,
            sameStoreItem: summarizeStorePurchase(sameSkuPurchase),
            storeItems: summarizeStorePurchases(availablePurchasesForCurrentUser),
          };
          await logPurchaseError(
            'sameSkuAlreadyOwned',
            'ITEM_ALREADY_OWNED',
            `Google Play already has an active or unexpired subscription for SKU: ${sku}`,
            sameSkuContext
          );

          if (sameSkuPurchase.purchaseToken) {
            try {
              await this.validateAndSavePurchase(sameSkuPurchase);
              return {
                success: true,
                restored: true,
                userMessage: 'Your existing Google Play subscription has been restored.',
              } as const;
            } catch (restoreError: unknown) {
              const restoreSummary = summarizeUnknownError(restoreError);
              await logPurchaseError(
                'sameSkuRestoreFailed',
                restoreSummary.errorCode,
                restoreSummary.errorMessage,
                {
                  sku,
                  plan,
                  errorSummary: restoreSummary,
                  sameStoreItem: summarizeStorePurchase(sameSkuPurchase),
                }
              );
              return {
                success: false,
                error: restoreError,
                errorCode: 'ITEM_ALREADY_OWNED',
                userMessage: 'Google Play already has this subscription on your account. Tap Restore Purchases, or manage the subscription in Google Play.',
              } as const;
            }
          }

          return {
            success: false,
            errorCode: 'ITEM_ALREADY_OWNED',
            userMessage: 'Google Play already has this subscription on your account. Tap Restore Purchases, or manage the subscription in Google Play.',
          } as const;
        }
        const replacementParams = getAndroidSubscriptionReplacementParams(availablePurchasesForCurrentUser, sku);
        if (replacementParams) {
          console.warn('[IAP] Android: Adding subscription replacement params for', sku, 'from', replacementParams.oldProductId);
        }
        const foreignStoreItemCount = rejectedPurchases.filter(({ status }) => status === 'foreign').length;
        const unverifiedStoreItemCount = rejectedPurchases.filter(({ status }) => status === 'unverified').length;
        this.pendingPurchaseSku = sku; // Mark that we're expecting this purchase
        this.pendingPurchaseContext = {
          sku,
          plan,
          includeTrialOffer: shouldIncludeTrialOffer,
          requestedTrialOffer: includeTrialOffer,
          hasUsedTrial: storeOwnership.hasUsedTrial,
          selectedOffer: redactOfferToken(selectedOffer),
          legacyOfferCount: product.subscriptionOfferDetailsAndroid?.length ?? 0,
          standardizedOfferCount: product.subscriptionOffers?.length ?? 0,
          productStatusAndroid: product.productStatusAndroid,
          replacementProductId: replacementParams?.oldProductId ?? null,
          foreignStoreItemCount,
          unverifiedStoreItemCount,
        };
        // For Android, subscriptionOffers contains the sku and offerToken
        const buildAndroidSubscriptionRequest = (offer: AndroidOfferCandidate) => ({
          type: 'subs' as const,
          request: {
            google: {
              skus: [sku],
              obfuscatedAccountId,
              subscriptionOffers: [{ sku, offerToken: offer.token }],
              ...(replacementParams
                ? { subscriptionProductReplacementParams: replacementParams }
                : {}),
            },
          },
        });

        try {
          await requestPurchase(buildAndroidSubscriptionRequest(selectedOffer));
        } catch (purchaseRequestError) {
          const paidFallbackOffer = selectedOffer.hasFreeTrial
            ? getAndroidSubscriptionOffer(product, false)
            : null;
          if (
            paidFallbackOffer
            && paidFallbackOffer.token !== selectedOffer.token
            && isInvalidPurchaseArgumentsError(purchaseRequestError)
          ) {
            const fallbackSummary = summarizeUnknownError(purchaseRequestError);
            await logPurchaseError(
              'trialOfferRejectedRetryPaid',
              fallbackSummary.errorCode,
              fallbackSummary.errorMessage,
              {
                plan,
                sku,
                selectedOffer: redactOfferToken(selectedOffer),
                paidFallbackOffer: redactOfferToken(paidFallbackOffer),
                replacementProductId: replacementParams?.oldProductId ?? null,
                requestedTrialOffer: includeTrialOffer,
                hasUsedTrial: storeOwnership.hasUsedTrial,
                errorSummary: fallbackSummary,
              }
            );
            this.pendingPurchaseContext = {
              ...this.pendingPurchaseContext,
              includeTrialOffer: false,
              selectedOffer: redactOfferToken(paidFallbackOffer),
            };
            await requestPurchase(buildAndroidSubscriptionRequest(paidFallbackOffer));
          } else {
            throw purchaseRequestError;
          }
        }
        console.warn('[IAP] Android: requestSubscription returned successfully for', sku);
      }

      return { success: true, pending: true } as const;
    } catch (error: unknown) {
      // Clear pending purchase flag on error
      const pendingContext = this.pendingPurchaseContext;
      this.pendingPurchaseSku = null;
      this.pendingPurchaseContext = null;

      const errorObj = error as {
        code?: string;
        message?: string;
        debugMessage?: string;
        responseCode?: number;
        name?: string;
        stack?: string;
      };
      // Handle both react-native-iap error codes and Google Play response codes
      const errorCode = errorObj?.code || (errorObj?.responseCode !== undefined ? String(errorObj.responseCode) : 'UNKNOWN');
      const errorMessage = errorObj?.message || errorObj?.debugMessage || 'Unknown error';

      console.warn('[IAP] Purchase error:', { errorCode, errorMessage, responseCode: errorObj?.responseCode, error });

      // Log to Firestore for debugging Google Play review issues
      const sku = SUBSCRIPTION_PRODUCTS[plan];
      await logPurchaseError('purchaseSubscription', errorCode, errorMessage, {
        plan,
        sku,
        responseCode: errorObj?.responseCode,
        debugMessage: errorObj?.debugMessage,
        rawErrorCode: errorObj?.code,
        pendingContext,
        errorSummary: summarizeUnknownError(error),
      });

      if (errorCode === 'E_USER_CANCELLED' || errorCode === 'USER_CANCELED') {
        return { success: false, cancelled: true, errorCode, userMessage: IAP_ERROR_MESSAGES[errorCode] || 'Purchase was cancelled.' } as const;
      }
      // Log via ErrorService for centralized tracking
      ErrorService.handleError(error, {
        feature: 'purchase',
        showToast: false, // UI handles displaying error
        context: { action: 'purchaseSubscription', plan, errorCode, errorMessage },
      });
      // Use specific IAP message, or fall back to actual error message if available
      // Include fallback for unknown Google Play errors
      const userMessage = IAP_ERROR_MESSAGES[errorCode]
        || (errorMessage && errorMessage !== 'Unknown error' ? errorMessage : null)
        || 'Unable to complete purchase. Please ensure you have a valid payment method configured in Google Play and try again.';
      return { success: false, error, errorCode, userMessage } as const;
    }
  }

  static async purchaseLifetime() {
    if (isStorePurchaseUnavailableInCurrentEnvironment()) {
      return {
        success: false,
        errorCode: 'E_BILLING_UNAVAILABLE',
        userMessage: getStoreUnavailableUserMessage(),
      } as const;
    }

    try {
      const { fetchProducts, requestPurchase } = await getIapModule();
      // Ensure IAP is initialized (handles hot reload scenarios)
      await this.ensureInitialized();

      const user = getAuth().currentUser;
      if (!user) throw new Error('User must be authenticated');

      const sku = SUBSCRIPTION_PRODUCTS.lifetime;

      if (Platform.OS === 'ios') {
        // Must fetch product first before purchasing (with timeout)
        const prods = await withTimeout(
          fetchProducts({ skus: [sku], type: 'in-app' }),
          10000,
          'Store connection timed out. Please try again.'
        );
        if (!prods || prods.length === 0) {
          throw { code: 'E_ITEM_UNAVAILABLE', message: 'Product not found in store' };
        }
        const appAccountToken = await this.deriveAppAccountToken(user.uid);
        this.pendingPurchaseSku = sku; // Mark that we're expecting this purchase
        await requestPurchase({ type: 'in-app', request: { apple: { sku, andDangerouslyFinishTransactionAutomatically: false, appAccountToken } } });
      } else {
        // For Android, verify the product exists before requesting purchase
        const prods = await withTimeout(
          fetchProducts({ skus: [sku], type: 'in-app' }),
          10000,
          'Store connection timed out. Please try again.'
        );
        if (!prods?.some((product) => product.id === sku)) {
          await logPurchaseError('purchaseLifetime', 'E_ITEM_UNAVAILABLE', `Product ${sku} not found in store`, {
            sku,
            returnedProducts: prods?.map((product) => product.id) ?? [],
          });
          throw { code: 'E_ITEM_UNAVAILABLE', message: 'Lifetime purchase not found in store. Please ensure you have the latest app version.' };
        }
        const obfuscatedAccountId = await this.deriveAppAccountToken(user.uid);
        this.pendingPurchaseSku = sku; // Mark that we're expecting this purchase
        await requestPurchase({ type: 'in-app', request: { google: { skus: [sku], obfuscatedAccountId } } });
      }

      return { success: true, pending: true } as const;
    } catch (error: unknown) {
      // Clear pending purchase flag on error
      this.pendingPurchaseSku = null;
      this.pendingPurchaseContext = null;

      const errorObj = error as { code?: string; message?: string };
      const errorCode = errorObj?.code || 'UNKNOWN';
      const errorMessage = errorObj?.message || 'Unknown error';

      // Log to Firestore for debugging Google Play review issues
      await logPurchaseError('purchaseLifetime', errorCode, errorMessage, {
        fullError: String(error),
      });

      if (errorCode === 'E_USER_CANCELLED' || errorCode === 'USER_CANCELED') {
        return { success: false, cancelled: true, errorCode, userMessage: IAP_ERROR_MESSAGES[errorCode] || 'Purchase was cancelled.' } as const;
      }
      // Log via ErrorService for centralized tracking
      ErrorService.handleError(error, {
        feature: 'purchase',
        showToast: false,
        context: { action: 'purchaseLifetime', errorCode },
      });
      const userMessage = IAP_ERROR_MESSAGES[errorCode]
        || (errorMessage && errorMessage !== 'Unknown error' ? errorMessage : null)
        || 'Unable to complete purchase. Please ensure you have a valid payment method configured and try again.';
      return { success: false, error, errorCode, userMessage } as const;
    }
  }

  private static async deriveAppAccountToken(uid: string): Promise<string> {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uid);
  }

  private static async getAndroidStoreOwnershipContext(
    uid: string,
    expectedObfuscatedAccountId?: string
  ): Promise<AndroidStoreOwnershipContext> {
    const storedPurchaseTokens = new Set<string>();
    let hasUsedTrial = false;

    try {
      const db = getFirestore();
      const userDoc = await getDoc(doc(collection(db, 'users'), uid));
      const data = userDoc.data() as {
        androidPurchaseToken?: unknown;
        lastReceiptData?: unknown;
        hasUsedTrial?: unknown;
      } | undefined;
      hasUsedTrial = data?.hasUsedTrial === true;

      [data?.androidPurchaseToken, data?.lastReceiptData].forEach((token) => {
        if (typeof token === 'string' && token.length > 0) {
          storedPurchaseTokens.add(token);
        }
      });

      if (!hasUsedTrial) {
        try {
          const trialHistoryDoc = await getDoc(doc(collection(db, 'trialHistory'), uid));
          hasUsedTrial = trialHistoryDoc.exists();
        } catch (trialHistoryError) {
          ErrorService.handleSilent(trialHistoryError, { action: 'iap_read_trial_history' });
        }
      }
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'iap_read_android_purchase_ownership' });
    }

    return {
      expectedObfuscatedAccountId: expectedObfuscatedAccountId ?? await this.deriveAppAccountToken(uid),
      storedPurchaseTokens,
      hasUsedTrial,
    };
  }

  private static async logRejectedAndroidStorePurchases(
    action: string,
    productId: string,
    ownership: AndroidStoreOwnershipContext,
    rejectedPurchases: Array<{ purchase: Purchase; status: AndroidStorePurchaseOwnershipStatus }>,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    if (rejectedPurchases.length === 0) {
      return;
    }

    await logPurchaseError(action, 'STORE_ACCOUNT_MISMATCH', STORE_ACCOUNT_MISMATCH_MESSAGE, {
      productId,
      expectedObfuscatedAccountIdPresent: Boolean(ownership.expectedObfuscatedAccountId),
      storedCredentialCount: ownership.storedPurchaseTokens.size,
      rejectedStoreItems: rejectedPurchases.map(({ purchase, status }) => ({
        status,
        item: summarizeStorePurchase(purchase),
      })),
      ...details,
    });
  }

  private static async handlePurchaseError(error: unknown) {
    const pendingSku = this.pendingPurchaseSku;
    const pendingContext = this.pendingPurchaseContext;
    this.pendingPurchaseSku = null;
    this.pendingPurchaseContext = null;

    const errorObj = error as {
      code?: string;
      message?: string;
      debugMessage?: string;
      responseCode?: number;
      name?: string;
      stack?: string;
    };
    const errorCode = errorObj?.code || (errorObj?.responseCode !== undefined ? String(errorObj.responseCode) : 'UNKNOWN');
    const errorMessage = errorObj?.message || errorObj?.debugMessage || 'Unknown error';
    const userCancelled = IAP_USER_CANCELLED_CODES.includes(errorCode);

    // A user backing out of the store sheet is not an error; keep it out of Crashlytics.
    if (!userCancelled) {
      ErrorService.handleSilent(error, {
        action: 'iap_purchase_error',
        productId: pendingSku ?? 'unknown',
        errorCode,
        errorMessage,
      });
    }

    if (pendingSku) {
      await logPurchaseError('purchaseErrorListener', errorCode, errorMessage, {
        productId: pendingSku,
        responseCode: errorObj?.responseCode,
        debugMessage: errorObj?.debugMessage,
        rawErrorCode: errorObj?.code,
        errorName: errorObj?.name,
        errorStackPresent: Boolean(errorObj?.stack),
        pendingContext,
        errorSummary: summarizeUnknownError(error),
      });
    }

    if (userCancelled) {
      return;
    }

    const canRestore = ['E_ALREADY_OWNED', 'ITEM_ALREADY_OWNED', 'item-already-owned', '7'].includes(errorCode);
    if (canRestore && (pendingContext?.foreignStoreItemCount ?? 0) > 0) {
      this.notifyError(STORE_ACCOUNT_MISMATCH_MESSAGE, false);
      return;
    }

    const userMessage = IAP_ERROR_MESSAGES[errorCode]
      || (errorMessage && errorMessage !== 'Unknown error' ? errorMessage : null)
      || 'Purchase could not be completed. Please try again.';
    this.notifyError(userMessage, canRestore);
  }

  private static async handlePurchaseUpdate(purchase: Purchase) {
    const { finishTransaction } = await getIapModule();

    if (!purchase.purchaseToken) {
      const message = `Missing purchase token for ${purchase.productId}`;
      console.warn('[IAP] Purchase update missing token:', purchase.productId);
      this.pendingPurchaseSku = null;
      this.pendingPurchaseContext = null;
      await logPurchaseError('handlePurchaseUpdate', 'MISSING_PURCHASE_TOKEN', message, {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
      });
      this.notifyError('Purchase completed, but the receipt was missing. Please try Restore Purchases or contact support if you were charged.', true);
      return;
    }

    // CRITICAL: Only process purchases that we initiated
    // This prevents assigning purchases from a different Google Play account
    // to the currently logged-in Firebase user
    if (!this.pendingPurchaseSku) {
      console.warn('[IAP] Ignoring purchase update - no pending purchase expected:', purchase.productId);
      // Still finish the transaction to prevent it from firing repeatedly
      try {
        await finishTransaction({ purchase, isConsumable: false });
      } catch {
        // Ignore finish errors
      }
      return;
    }

    // Clear the pending purchase flag
    const expectedSku = this.pendingPurchaseSku;
    this.pendingPurchaseSku = null;
    this.pendingPurchaseContext = null;

    // Verify the purchase matches what we expected
    if (purchase.productId !== expectedSku) {
      console.warn('[IAP] Purchase product mismatch - expected:', expectedSku, 'got:', purchase.productId);
      // Log this unexpected situation
      await logPurchaseError('handlePurchaseUpdate', 'SKU_MISMATCH', `Expected ${expectedSku}, got ${purchase.productId}`, {
        expectedSku,
        actualSku: purchase.productId,
        transactionId: purchase.transactionId,
      });
    }

    if (Platform.OS === 'android') {
      const user = getAuth().currentUser;
      if (user) {
        const ownership = await this.getAndroidStoreOwnershipContext(user.uid);
        const ownershipStatus = getAndroidStorePurchaseOwnershipStatus(purchase, ownership);
        if (ownershipStatus === 'foreign') {
          await this.logRejectedAndroidStorePurchases(
            'handlePurchaseUpdateStoreAccountMismatch',
            purchase.productId,
            ownership,
            [{ purchase, status: ownershipStatus }],
            { expectedSku }
          );
          try {
            await finishTransaction({ purchase, isConsumable: false });
          } catch {
            // Ignore finish errors
          }
          this.notifyError(STORE_ACCOUNT_MISMATCH_MESSAGE, false);
          return;
        }
      }
    }

    let validationError: unknown = null;

    // Try to validate
    try {
      await this.validateAndSavePurchase(purchase);
    } catch (e) {
      validationError = e;

      // Log to Firestore for debugging Google Play review issues
      const errObj = e as { code?: string; message?: string };
      await logPurchaseError('handlePurchaseUpdate', errObj?.code || 'VALIDATION_ERROR', errObj?.message || String(e), {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        fullError: String(e),
      });

      ErrorService.handleError(e, {
        feature: 'purchase',
        showToast: false,
        context: { action: 'handlePurchaseUpdate', productId: purchase.productId },
      });
    }

    // ALWAYS finish transaction - prevents infinite loop
    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch {
      // Ignore finish errors
    }

    // Notify user of validation error after finishing
    if (validationError) {
      const message = extractFirebaseErrorMessage(validationError);
      this.notifyError(message, true);
    }
  }

  private static async validateAndSavePurchase(purchase: Purchase) {
    const user = getAuth().currentUser;
    if (!user) throw new Error('User not authenticated');

    try {
      const functions = getFunctions();
      const validatePurchase = httpsCallable(functions, 'validatePurchase');

      const result = await validatePurchase({
        receipt: purchase.purchaseToken,
        platform: Platform.OS,
        productId: purchase.productId,
        purchaseToken: (purchase as Purchase & { purchaseToken?: string }).purchaseToken,
      });

      const data = (result?.data || {}) as Partial<{
        valid: boolean;
      }>;
      if (!data.valid) {
        throw new Error('Invalid receipt');
      }
    } catch (e) {
      // Log but don't handle here - let caller decide how to handle
      ErrorService.handleSilent(e, { action: 'validateAndSavePurchase', productId: purchase.productId });
      throw e;
    }
  }

  /**
   * Check if the current Firebase user already has subscription data.
   * Used to prevent overwriting legitimate subscription data during restore.
   */
  private static async userHasExistingSubscription(): Promise<boolean> {
    try {
      const user = getAuth().currentUser;
      if (!user) return false;

      const db = getFirestore();
      const userDoc = await getDoc(doc(collection(db, 'users'), user.uid));
      const data = userDoc.data() as {
        membershipStatus?: string;
        isLifetime?: boolean;
        subscriptionExpiryDate?: unknown;
        trialEndDate?: unknown;
        trialEndsAt?: unknown;
      } | undefined;

      if (data?.isLifetime === true) {
        return true;
      }

      const now = Date.now();
      const subscriptionExpiryMs = getTimestampMillis(data?.subscriptionExpiryDate);
      const trialExpiryMs = getTimestampMillis(data?.trialEndDate) ?? getTimestampMillis(data?.trialEndsAt);

      if (data?.membershipStatus === 'trial') {
        return trialExpiryMs !== null && trialExpiryMs > now;
      }

      if (data?.membershipStatus === 'premium') {
        return subscriptionExpiryMs === null || subscriptionExpiryMs > now;
      }

      return false;
    } catch {
      return false;
    }
  }

  static async restorePurchases() {
    if (isStorePurchaseUnavailableInCurrentEnvironment()) {
      return {
        success: false,
        errorCode: 'E_BILLING_UNAVAILABLE',
        userMessage: getStoreUnavailableUserMessage(),
      } as const;
    }

    try {
      const { getAvailablePurchases } = await getIapModule();
      // Ensure IAP is initialized
      await this.ensureInitialized();

      const user = getAuth().currentUser;
      if (!user) {
        return { success: false, errorCode: 'NOT_AUTHENTICATED', userMessage: 'Please sign in to restore purchases.' } as const;
      }

      const purchases = await getAvailablePurchases();
      const storeOwnership = Platform.OS === 'android'
        ? await this.getAndroidStoreOwnershipContext(user.uid)
        : null;
      const {
        ownedPurchases,
        rejectedPurchases,
      } = storeOwnership
        ? filterAndroidStorePurchasesForCurrentUser(purchases, storeOwnership)
        : { ownedPurchases: purchases, rejectedPurchases: [] };
      if (storeOwnership) {
        await this.logRejectedAndroidStorePurchases(
          'restorePurchasesStoreAccountMismatch',
          'restore',
          storeOwnership,
          rejectedPurchases,
          { storeItems: summarizeStorePurchases(purchases) }
        );
      }
      const ids = Object.values(SUBSCRIPTION_PRODUCTS) as string[];

      // Prioritize lifetime purchases if found
      const lifetimePurchase = ownedPurchases.find((p) => purchaseMatchesSku(p, SUBSCRIPTION_PRODUCTS.lifetime));
      if (lifetimePurchase) {
        await this.validateAndSavePurchase(lifetimePurchase);
        return { success: true, restored: true, isLifetime: true } as const;
      }

      // Otherwise look for active subscription
      const active = ownedPurchases.find((p) => ids.some((id) => purchaseMatchesSku(p, id)));
      if (active) {
        await this.validateAndSavePurchase(active);
        return { success: true, restored: true, isLifetime: false } as const;
      }

      if (rejectedPurchases.length > 0) {
        return {
          success: false,
          errorCode: 'STORE_ACCOUNT_MISMATCH',
          userMessage: STORE_ACCOUNT_MISMATCH_MESSAGE,
        } as const;
      }

      const hasExisting = await this.userHasExistingSubscription();
      if (hasExisting) {
        console.warn('[IAP] User already has active subscription data');
        return { success: true, restored: false, userMessage: 'Your subscription is already active.' } as const;
      }
      return { success: true, restored: false, userMessage: 'No previous purchases found.' } as const;
    } catch (error) {
      const errorCode = (error as { code?: string })?.code || 'UNKNOWN';
      const errorMessage = (error as { message?: string })?.message || String(error);

      // Log to Firestore for debugging Google Play review issues
      await logPurchaseError('restorePurchases', errorCode, errorMessage, {
        fullError: String(error),
      });

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
