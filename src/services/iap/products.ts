import { Platform } from 'react-native';

// Customer-facing name is "Symposium AI".
// Bundle/package IDs remain DebateAI.
export const SUBSCRIPTION_PRODUCTS = {
  monthly: Platform.select({
    ios: 'com.braveheartinnovations.debateai.premium.monthly.v2',
    android: 'premium_monthly',
  })!,
  annual: Platform.select({
    ios: 'com.braveheartinnovations.debateai.premium.annual.v2',
    android: 'premium_annual',
  })!,
  lifetime: Platform.select({
    ios: 'com.braveheartinnovations.debateai.premium.lifetime.v2',
    android: 'premium_lifetime',
  })!,
} as const;

export const PRODUCT_DETAILS = {
  monthly: {
    id: SUBSCRIPTION_PRODUCTS.monthly,
    price: '$5.99',
    period: 'month',
    title: 'Symposium AI Premium',
    description: 'Full access to all AI features',
  },
  annual: {
    id: SUBSCRIPTION_PRODUCTS.annual,
    price: '$49.99',
    period: 'year',
    title: 'Symposium AI Premium (Annual)',
    description: 'Full access - Save $22/year',
    savings: '$22',
    percentSaved: '30%',
  },
  lifetime: {
    id: SUBSCRIPTION_PRODUCTS.lifetime,
    price: '$129.99',
    period: 'lifetime',
    title: 'Symposium AI Premium (Lifetime)',
    description: 'One-time purchase, own forever',
  },
} as const;

export type PlanType = 'monthly' | 'annual' | 'lifetime';

