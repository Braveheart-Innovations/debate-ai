import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import * as admin from 'firebase-admin';
import { androidpublisher, androidpublisher_v3, auth as googleAuth } from '@googleapis/androidpublisher';

const PACKAGE_NAME_ANDROID = 'com.braveheartinnovations.debateai';

type AndroidSubscriptionState = {
  expiryTimeMillis?: string;
  startTimeMillis?: string;
  autoRenewing?: boolean;
  inTrial?: boolean;
};

export const handlePlayStoreNotification = onMessagePublished(
  'play-store-notifications',
  async (event) => {
    const message = event.data;
    try {
      const data = JSON.parse(Buffer.from(message.message.data || '', 'base64').toString());
      const subtype = data?.subscriptionNotification?.notificationType;
      const purchaseToken = data?.subscriptionNotification?.purchaseToken as string | undefined;
      const subscriptionId = data?.subscriptionNotification?.subscriptionId as string | undefined;
      if (!purchaseToken || !subscriptionId) return;

      const userId = await findUserByPurchaseToken(purchaseToken);
      if (!userId) {
        console.warn('RTDN: No user found for purchase token');
        return;
      }

      // Refresh status via Google API
      const state = await validateAndroidSubscription(PACKAGE_NAME_ANDROID, subscriptionId, purchaseToken);
      const expiresAt = state?.expiryTimeMillis ? new Date(parseInt(state.expiryTimeMillis, 10)) : null;
      const autoRenewing = !!state?.autoRenewing;

      // Update user doc
      const userRef = admin.firestore().collection('users').doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data();
      const trialHistorySnap = userData?.hasUsedTrial === true
        ? null
        : await admin.firestore().collection('trialHistory').doc(userId).get();
      const hasRecordedTrialUsage = userData?.hasUsedTrial === true || trialHistorySnap?.exists === true;
      const isActive = !!(expiresAt && expiresAt.getTime() > Date.now());
      const existingTrialEndMs = getTimestampMillis(userData?.trialEndDate) ?? getTimestampMillis(userData?.trialEndsAt);
      const storeReportsTrial = state?.inTrial === true;
      const preserveActiveTrial = isActive && !storeReportsTrial && userData?.hasUsedTrial === true
        && existingTrialEndMs !== null
        && existingTrialEndMs > Date.now();
      const inTrial = isActive && (storeReportsTrial || preserveActiveTrial);
      const trialStartMs = state?.startTimeMillis
        ? parseInt(state.startTimeMillis, 10)
        : getTimestampMillis(userData?.trialStartDate);
      const trialEndMs = inTrial
        ? (storeReportsTrial && expiresAt ? expiresAt.getTime() : existingTrialEndMs)
        : null;
      const updateData: Record<string, unknown> = {
        membershipStatus: isActive ? (inTrial ? 'trial' : 'premium') : 'demo',
        isPremium: isActive,
        subscriptionSource: 'google_play',
        subscriptionExpiryDate: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
        trialStartDate: inTrial && trialStartMs
          ? admin.firestore.Timestamp.fromDate(new Date(trialStartMs))
          : null,
        trialEndDate: inTrial && trialEndMs ? admin.firestore.Timestamp.fromDate(new Date(trialEndMs)) : null,
        autoRenewing,
        productId: subscriptionId.includes('annual') ? 'annual' : 'monthly',
        lastValidated: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (inTrial || hasRecordedTrialUsage) {
        updateData.hasUsedTrial = true;
      }
      await userRef.set(updateData, { merge: true });
    } catch (e) {
      console.error('handlePlayStoreNotification error', e);
    }
  });

async function findUserByPurchaseToken(token: string): Promise<string | null> {
  const snap = await admin.firestore()
    .collection('users')
    .where('androidPurchaseToken', '==', token)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;
  return null;
}

function parseAndroidTimestampMillis(value?: string | null): string | undefined {
  if (!value) return undefined;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? String(millis) : undefined;
}

function getTimestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'object') {
    const timestampLike = value as {
      toMillis?: () => number;
      toDate?: () => Date;
    };
    if (typeof timestampLike.toMillis === 'function') return timestampLike.toMillis();
    if (typeof timestampLike.toDate === 'function') return timestampLike.toDate().getTime();
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getLatestSubscriptionLineItem(
  lineItems: androidpublisher_v3.Schema$SubscriptionPurchaseLineItem[] | undefined,
  subscriptionId: string
): androidpublisher_v3.Schema$SubscriptionPurchaseLineItem | undefined {
  const matching = (lineItems ?? []).filter((item) => item.productId === subscriptionId);
  const candidates = matching.length > 0 ? matching : (lineItems ?? []);
  return candidates.reduce<androidpublisher_v3.Schema$SubscriptionPurchaseLineItem | undefined>((latest, item) => {
    if (!latest) return item;
    const latestExpiry = Date.parse(latest.expiryTime ?? '');
    const itemExpiry = Date.parse(item.expiryTime ?? '');
    return itemExpiry > latestExpiry ? item : latest;
  }, undefined);
}

async function validateAndroidSubscription(
  packageName: string,
  subscriptionId: string,
  token: string
): Promise<AndroidSubscriptionState> {
  const auth = new googleAuth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const publisher = androidpublisher({ version: 'v3', auth });
  const res = await publisher.purchases.subscriptionsv2.get({
    packageName,
    token,
  } as any);
  const purchase = res.data as androidpublisher_v3.Schema$SubscriptionPurchaseV2;
  const lineItem = getLatestSubscriptionLineItem(purchase.lineItems, subscriptionId);
  const expiryTimeMillis = parseAndroidTimestampMillis(lineItem?.expiryTime);
  const startTimeMillis = parseAndroidTimestampMillis(purchase.startTime);
  const hasFreeTrialPhase = lineItem?.offerPhase?.freeTrial !== undefined;

  return {
    expiryTimeMillis,
    startTimeMillis,
    autoRenewing: lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false,
    inTrial: hasFreeTrialPhase,
  };
}
