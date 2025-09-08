import { Platform } from 'react-native';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import {
  initConnection,
  endConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  finishTransaction,
  type Purchase,
  type SubscriptionAndroid,
  type SubscriptionOfferAndroid,
  type PricingPhaseAndroid,
} from 'react-native-iap';
import { SUBSCRIPTION_PRODUCTS, type PlanType } from '@/services/iap/products';
import * as Crypto from 'expo-crypto';

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

  static async purchaseSubscription(plan: PlanType) {
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
      const err = error as { code?: string };
      if (err?.code === 'E_USER_CANCELLED') {
        return { success: false, cancelled: true } as const;
      }
      console.error('IAP purchaseSubscription failed', error);
      return { success: false, error } as const;
    }
  }

  private static async getOrCreateAppAccountToken(uid: string): Promise<string> {
    const ref = getFirestore().collection('users').doc(uid);
    const snap = await ref.get();
    const existing = (snap.data() as { appAccountToken?: string } | undefined)?.appAccountToken;
    if (existing && typeof existing === 'string') return existing;
    const token = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uid);
    await ref.set({ appAccountToken: token }, { merge: true });
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
        productId?: 'monthly' | 'annual';
        hasUsedTrial?: boolean;
        androidPurchaseToken?: string;
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
        await getFirestore().collection('users').doc(user.uid).set(update, { merge: true });
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
      const active = purchases.find((p) => ids.includes(p.productId));
      if (active) {
        await this.validateAndSavePurchase(active);
        return { success: true, restored: true } as const;
      }
      return { success: true, restored: false } as const;
    } catch (error) {
      console.error('IAP restorePurchases failed', error);
      return { success: false, error } as const;
    }
  }
}

export default PurchaseService;
