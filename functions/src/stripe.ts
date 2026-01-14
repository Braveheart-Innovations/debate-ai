import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// Define secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// Stripe price IDs from Stripe dashboard (TEST MODE)
const PRICE_IDS = {
  monthly: 'price_1SijFzRNwNAQVjH8rIKnNVJZ',
  annual: 'price_1SijHHRNwNAQVjH8iJPNBAwl',
};

// Trial period in days
const TRIAL_PERIOD_DAYS = 7;

type SubscriptionPlan = 'monthly' | 'annual';
type SubscriptionStatus = 'free' | 'trialing' | 'active' | 'canceled' | 'past_due';

function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

/**
 * Create a Stripe Checkout session for subscription
 */
export const createStripeCheckoutSession = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const secretKey = stripeSecretKey.value();
    if (!secretKey) {
      throw new HttpsError('internal', 'Stripe not configured');
    }

    const { plan, trial } = request.data as { plan: SubscriptionPlan; trial: boolean };

    if (!plan || !['monthly', 'annual'].includes(plan)) {
      throw new HttpsError('invalid-argument', 'Invalid plan');
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const db = getFirestore();
    const stripe = getStripe(secretKey);

    try {
      // Check if user already has a Stripe customer
      const billingDoc = await db.collection('users').doc(uid).collection('billing').doc('subscription').get();
      let customerId = billingDoc.data()?.stripeCustomerId;

      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { firebaseUID: uid },
        });
        customerId = customer.id;
      }

      // Get the appropriate price ID
      const priceId = PRICE_IDS[plan];

      // Create checkout session
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${process.env.GCLOUD_PROJECT === 'symposiumai-prod'
          ? 'https://app.symposiumai.app'
          : 'http://localhost:3000'}/profile?success=true`,
        cancel_url: `${process.env.GCLOUD_PROJECT === 'symposiumai-prod'
          ? 'https://app.symposiumai.app'
          : 'http://localhost:3000'}/profile?canceled=true`,
        metadata: { firebaseUID: uid, plan },
        allow_promotion_codes: true,
      };

      // Add trial if requested (only for monthly, first time users)
      if (trial && plan === 'monthly' && !billingDoc.data()?.hasUsedTrial) {
        sessionParams.subscription_data = {
          trial_period_days: TRIAL_PERIOD_DAYS,
          metadata: { firebaseUID: uid, plan },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return { url: session.url };
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw new HttpsError('internal', 'Failed to create checkout session');
    }
  }
);

/**
 * Create a Stripe Billing Portal session
 */
export const createStripeBillingPortal = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const secretKey = stripeSecretKey.value();
    if (!secretKey) {
      throw new HttpsError('internal', 'Stripe not configured');
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const stripe = getStripe(secretKey);

    try {
      const billingDoc = await db.collection('users').doc(uid).collection('billing').doc('subscription').get();
      const customerId = billingDoc.data()?.stripeCustomerId;

      if (!customerId) {
        throw new HttpsError('failed-precondition', 'No subscription found');
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.GCLOUD_PROJECT === 'symposiumai-prod'
          ? 'https://app.symposiumai.app'
          : 'http://localhost:3000'}/profile`,
      });

      return { url: portalSession.url };
    } catch (error) {
      console.error('Error creating billing portal:', error);
      throw new HttpsError('internal', 'Failed to open billing portal');
    }
  }
);

/**
 * Cancel subscription
 */
export const cancelStripeSubscription = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const secretKey = stripeSecretKey.value();
    if (!secretKey) {
      throw new HttpsError('internal', 'Stripe not configured');
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const stripe = getStripe(secretKey);

    try {
      const billingDoc = await db.collection('users').doc(uid).collection('billing').doc('subscription').get();
      const subscriptionId = billingDoc.data()?.stripeSubscriptionId;

      if (!subscriptionId) {
        throw new HttpsError('failed-precondition', 'No subscription found');
      }

      // Cancel at period end (user keeps access until current period ends)
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Update Firestore
      await db.collection('users').doc(uid).collection('billing').doc('subscription').update({
        canceledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new HttpsError('internal', 'Failed to cancel subscription');
    }
  }
);

/**
 * Stripe Webhook Handler
 * Handles subscription lifecycle events from Stripe
 */
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (request, response) => {
    const secretKey = stripeSecretKey.value();
    const webhookSecret = stripeWebhookSecret.value();

    if (!secretKey || !webhookSecret) {
      console.error('Stripe secrets not configured');
      response.status(500).send('Webhook Error: Server configuration error');
      return;
    }

    const stripe = getStripe(secretKey);
    const sig = request.headers['stripe-signature'];

    if (!sig) {
      response.status(400).send('Webhook Error: Missing signature');
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      response.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }

    const db = getFirestore();

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.metadata?.firebaseUID;
          const plan = session.metadata?.plan as SubscriptionPlan;

          if (!uid || !session.subscription) break;

          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

          const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
          await db.collection('users').doc(uid).collection('billing').doc('subscription').set({
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            status: subscription.status === 'trialing' ? 'trialing' : 'active',
            plan: plan || 'monthly',
            trialEndsAt: subscription.trial_end
              ? Timestamp.fromMillis(subscription.trial_end * 1000)
              : null,
            currentPeriodEnd: currentPeriodEnd
              ? Timestamp.fromMillis(currentPeriodEnd * 1000)
              : null,
            canceledAt: null,
            hasUsedTrial: subscription.status === 'trialing' ? true : undefined,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          // Sync to main user document
          await db.collection('users').doc(uid).set({
            membershipStatus: subscription.status === 'trialing' ? 'trial' : 'premium',
            isPremium: true,
            subscriptionSource: 'stripe',
            subscriptionPlan: plan || 'monthly',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const uid = subscription.metadata?.firebaseUID;

          if (!uid) {
            // Try to find user by customer ID
            const customerId = subscription.customer as string;
            const usersSnapshot = await db.collectionGroup('billing')
              .where('stripeCustomerId', '==', customerId)
              .limit(1)
              .get();

            if (usersSnapshot.empty) break;

            const userPath = usersSnapshot.docs[0].ref.parent.parent;
            if (!userPath) break;

            let status: SubscriptionStatus = 'active';
            if (subscription.status === 'trialing') status = 'trialing';
            else if (subscription.status === 'canceled') status = 'canceled';
            else if (subscription.status === 'past_due') status = 'past_due';
            else if (subscription.status === 'active') status = 'active';

            const periodEnd = subscription.items.data[0]?.current_period_end;
            await usersSnapshot.docs[0].ref.update({
              status,
              currentPeriodEnd: periodEnd
                ? Timestamp.fromMillis(periodEnd * 1000)
                : null,
              trialEndsAt: subscription.trial_end
                ? Timestamp.fromMillis(subscription.trial_end * 1000)
                : null,
              canceledAt: subscription.cancel_at_period_end
                ? Timestamp.fromMillis(subscription.canceled_at ? subscription.canceled_at * 1000 : Date.now())
                : null,
              updatedAt: FieldValue.serverTimestamp(),
            });

            // Sync to main user document
            const membershipStatus =
              status === 'active' ? 'premium' :
              status === 'trialing' ? 'trial' :
              status === 'canceled' ? 'canceled' :
              status === 'past_due' ? 'past_due' : 'free';

            await userPath.set({
              membershipStatus,
              isPremium: status === 'active' || status === 'trialing',
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            break;
          }

          const subPeriodEnd = subscription.items.data[0]?.current_period_end;
          let status: SubscriptionStatus = 'active';
          if (subscription.status === 'trialing') status = 'trialing';
          else if (subscription.status === 'canceled') status = 'canceled';
          else if (subscription.status === 'past_due') status = 'past_due';

          await db.collection('users').doc(uid).collection('billing').doc('subscription').update({
            status,
            currentPeriodEnd: subPeriodEnd
              ? Timestamp.fromMillis(subPeriodEnd * 1000)
              : null,
            trialEndsAt: subscription.trial_end
              ? Timestamp.fromMillis(subscription.trial_end * 1000)
              : null,
            canceledAt: subscription.cancel_at_period_end
              ? Timestamp.fromMillis(subscription.canceled_at ? subscription.canceled_at * 1000 : Date.now())
              : null,
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Sync to main user document
          const membershipStatus =
            status === 'active' ? 'premium' :
            status === 'trialing' ? 'trial' :
            status === 'canceled' ? 'canceled' :
            status === 'past_due' ? 'past_due' : 'free';

          await db.collection('users').doc(uid).set({
            membershipStatus,
            isPremium: status === 'active' || status === 'trialing',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;

          // Find user by customer ID
          const customerId = subscription.customer as string;
          const usersSnapshot = await db.collectionGroup('billing')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            await usersSnapshot.docs[0].ref.update({
              status: 'canceled',
              canceledAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            // Sync to main user document
            const userPath = usersSnapshot.docs[0].ref.parent.parent;
            if (userPath) {
              await userPath.set({
                membershipStatus: 'canceled',
                isPremium: false,
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          const usersSnapshot = await db.collectionGroup('billing')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            await usersSnapshot.docs[0].ref.update({
              status: 'past_due',
              updatedAt: FieldValue.serverTimestamp(),
            });

            // Sync to main user document
            const userPath = usersSnapshot.docs[0].ref.parent.parent;
            if (userPath) {
              await userPath.set({
                membershipStatus: 'past_due',
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      response.status(200).json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      response.status(500).send('Webhook processing failed');
    }
  }
);
