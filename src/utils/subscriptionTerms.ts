/**
 * Subscription offer wording shared by every trial CTA.
 *
 * Google Play requires the in-app terms to match the Play payment cart: when the
 * trial offer has an introductory price phase (trial -> intro -> base), the app must
 * state both the intro price and duration and the price it renews at afterwards.
 */

import type { PriceInfo } from '@/services/prices/PricesPersistenceService';

export type BillingInterval = 'month' | 'year';

const RENEWAL_ADVERB: Record<BillingInterval, string> = {
  month: 'monthly',
  year: 'annually',
};

/** "$5.99/month", or "$2.99/month for 6 months, then $5.99/month" when there is an intro phase */
export function describePostTrialPricing(price: PriceInfo, interval: BillingInterval): string {
  const base = `${price.localizedPrice}/${interval}`;
  if (!price.intro) return base;
  return `${price.intro.localizedPrice}/${interval} for ${price.intro.durationText}, then ${base}`;
}

/** The amount charged when the trial ends */
export function firstChargePrice(price: PriceInfo): string {
  return price.intro?.localizedPrice ?? price.localizedPrice;
}

/** Renewal bullet, naming the base price the subscription settles at */
export function describeRenewal(price: PriceInfo, interval: BillingInterval): string {
  const adverb = RENEWAL_ADVERB[interval];
  if (!price.intro) return `Subscription auto-renews ${adverb} at ${price.localizedPrice}`;
  return `Subscription auto-renews ${adverb} at ${price.intro.localizedPrice} for ${price.intro.durationText}, then at ${price.localizedPrice} until canceled`;
}

/** Long-form date the trial ends if started today */
export function formatTrialEndDate(trialDays: number, now: Date = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + trialDays);
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
