import type { PriceInfo } from '@/services/prices/PricesPersistenceService';
import {
  describePostTrialPricing,
  describeRenewal,
  firstChargePrice,
  formatTrialEndDate,
} from '../subscriptionTerms';

const basePrice: PriceInfo = {
  localizedPrice: '$5.99',
  price: '5.99',
  currency: 'USD',
  trial: { durationText: '1 week', durationDays: 7, hasTrial: true },
};

const introPrice: PriceInfo = {
  ...basePrice,
  intro: { localizedPrice: '$2.99', durationText: '6 months' },
};

describe('subscriptionTerms', () => {
  it('describes a trial that goes straight to the base price', () => {
    expect(describePostTrialPricing(basePrice, 'month')).toBe('$5.99/month');
    expect(firstChargePrice(basePrice)).toBe('$5.99');
    expect(describeRenewal(basePrice, 'month')).toBe('Subscription auto-renews monthly at $5.99');
  });

  it('discloses both the intro price and the base price it renews at', () => {
    expect(describePostTrialPricing(introPrice, 'month')).toBe('$2.99/month for 6 months, then $5.99/month');
    expect(firstChargePrice(introPrice)).toBe('$2.99');
    expect(describeRenewal(introPrice, 'month')).toBe(
      'Subscription auto-renews monthly at $2.99 for 6 months, then at $5.99 until canceled'
    );
  });

  it('uses the annual wording for yearly plans', () => {
    expect(describePostTrialPricing(basePrice, 'year')).toBe('$5.99/year');
    expect(describeRenewal(basePrice, 'year')).toBe('Subscription auto-renews annually at $5.99');
  });

  it('formats the trial end date from the trial length', () => {
    const expected = new Date(2026, 9, 9).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    expect(formatTrialEndDate(7, new Date(2026, 9, 2))).toBe(expected);
  });
});
