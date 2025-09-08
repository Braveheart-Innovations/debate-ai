import { Platform } from 'react-native';

// Customer-facing name is "Symposium AI".
// Bundle/package IDs remain DebateAI.
export const SUBSCRIPTION_PRODUCTS = {
  monthly: Platform.select({
    ios: 'com.braveheartinnovations.debateai.premium.monthly',
    android: 'premium_monthly',
  })!,
  annual: Platform.select({
    ios: 'com.braveheartinnovations.debateai.premium.annual',
    android: 'premium_annual',
  })!,
} as const;

export const PRODUCT_DETAILS = {
  monthly: {
    id: SUBSCRIPTION_PRODUCTS.monthly,
    price: '$7.99',
    period: 'month',
    title: 'Symposium AI Premium',
    description: 'Full access to all AI features',
  },
  annual: {
    id: SUBSCRIPTION_PRODUCTS.annual,
    price: '$59.99',
    period: 'year',
    title: 'Symposium AI Premium (Annual)',
    description: 'Full access - Save $36/year',
    savings: '$36',
    percentSaved: '37%',
  },
} as const;

export type PlanType = 'monthly' | 'annual';

