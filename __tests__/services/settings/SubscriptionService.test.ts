jest.mock('@/store', () => ({
  store: {
    getState: jest.fn(() => ({ user: { currentUser: null } })),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import subscriptionService from '@/services/settings/SubscriptionService';
import { store } from '@/store';

const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
};

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T10:00:00Z'));
    storage.getItem.mockReset();
    storage.setItem.mockReset();
    storage.removeItem.mockReset();
    storage.setItem.mockResolvedValue(undefined);
    storage.removeItem.mockResolvedValue(undefined);
    (store.getState as jest.Mock).mockReturnValue({ user: { currentUser: null } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns subscription from Redux store when available', async () => {
    (store.getState as jest.Mock).mockReturnValue({ user: { currentUser: { subscription: 'pro' } } });

    const subscription = await subscriptionService.getCurrentSubscription();

    expect(subscription.plan).toBe('pro');
    expect(subscription.features).toEqual(expect.arrayContaining(['customTopics', 'expertMode']));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('loads subscription from storage and downgrades expired plans', async () => {
    const futureExpiry = new Date('2025-02-01T00:00:00Z');
    storage.getItem.mockResolvedValue(JSON.stringify({
      plan: 'pro',
      isActive: true,
      willRenew: true,
      features: [],
      expiresAt: futureExpiry.toISOString(),
    }));

    const subscription = await subscriptionService.getCurrentSubscription();
    expect(subscription.plan).toBe('pro');

    // Expired subscription downgraded to free
    storage.getItem.mockResolvedValue(JSON.stringify({
      plan: 'pro',
      isActive: true,
      willRenew: true,
      features: [],
      expiresAt: new Date('2024-12-01T00:00:00Z').toISOString(),
    }));

    const downgraded = await subscriptionService.getCurrentSubscription();
    expect(downgraded.plan).toBe('free');
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('defaults to free plan when no data is stored', async () => {
    storage.getItem.mockResolvedValue(null);
    const subscription = await subscriptionService.getCurrentSubscription();
    expect(subscription.plan).toBe('free');
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('checks premium access and feature availability', async () => {
    jest.spyOn(subscriptionService, 'getCurrentSubscription').mockResolvedValue({
      plan: 'pro',
      isActive: true,
      willRenew: true,
      features: ['customTopics'],
    } as any);

    expect(await subscriptionService.isPremiumUser()).toBe(true);
    expect(await subscriptionService.canAccessFeature('customTopics')).toBe(true);
    expect(await subscriptionService.getFeatureLimit('maxChatSessions')).toBe(50);
  });

  it('exposes plan features and handles unimplemented flows', async () => {
    expect(subscriptionService.getPlanFeatures('business').maxChatSessions).toBe(-1);

    await expect(subscriptionService.initiatePurchase('pro')).rejects.toThrow('Unable to start purchase process');
    await expect(subscriptionService.restorePurchases()).rejects.toThrow('Unable to restore purchases');
  });

  it('handles cancellation, expiry info, and status updates', async () => {
    const getCurrent = jest.spyOn(subscriptionService, 'getCurrentSubscription');
    getCurrent
      .mockResolvedValueOnce({ plan: 'pro', isActive: true, willRenew: true, features: [] } as any)
      .mockResolvedValueOnce({
        plan: 'pro',
        isActive: true,
        willRenew: true,
        features: [],
        expiresAt: new Date('2025-02-10T00:00:00Z'),
      } as any)
      .mockResolvedValue({ plan: 'pro', isActive: true, willRenew: true, features: [] } as any);

    await subscriptionService.cancelSubscription();
    expect(storage.setItem).toHaveBeenCalled();

    const expiry = await subscriptionService.getExpiryInfo();
    expect(expiry?.willExpire).toBe(false);

    await subscriptionService.updateSubscriptionStatus({ plan: 'pro', isActive: true, features: [], willRenew: true });
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('prevents cancelling free plan and handles errors', async () => {
    jest.spyOn(subscriptionService, 'getCurrentSubscription').mockResolvedValue({
      plan: 'free',
      isActive: true,
      features: [],
      willRenew: false,
    } as any);

    await expect(subscriptionService.cancelSubscription()).rejects.toThrow('Unable to cancel subscription');
  });
});
