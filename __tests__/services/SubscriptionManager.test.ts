import { SubscriptionManager } from '@/services/subscription/SubscriptionManager';
import { getAuth } from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
} from '@react-native-firebase/firestore';

describe('SubscriptionManager', () => {
  const getAuthMock = getAuth as jest.MockedFunction<typeof getAuth>;
  const getFirestoreMock = getFirestore as jest.MockedFunction<typeof getFirestore>;
  const collectionMock = collection as jest.MockedFunction<typeof collection>;
  const docMock = doc as jest.MockedFunction<typeof doc>;
  const getDocMock = getDoc as jest.MockedFunction<typeof getDoc>;
  const setDocMock = setDoc as jest.MockedFunction<typeof setDoc>;

  beforeEach(() => {
    jest.clearAllMocks();
    getFirestoreMock.mockReturnValue({} as any);
    collectionMock.mockReturnValue('usersCollection' as any);
    docMock.mockReturnValue('userDoc' as any);
  });

  it('returns "demo" when there is no authenticated user', async () => {
    const authInstance = { currentUser: null } as any;
    getAuthMock.mockReturnValue(authInstance);

    const status = await SubscriptionManager.checkSubscriptionStatus();

    expect(status).toBe('demo');
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('returns trial when trial is active', async () => {
    const authInstance = { currentUser: { uid: 'user-123' } } as any;
    getAuthMock.mockReturnValue(authInstance);

    const future = Date.now() + 3 * 24 * 60 * 60 * 1000 + 1000;
    getDocMock.mockResolvedValue({
      data: () => ({
        membershipStatus: 'trial',
        trialEndDate: { toMillis: () => future },
      }),
    } as any);

    const status = await SubscriptionManager.checkSubscriptionStatus();

    expect(status).toBe('trial');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('downgrades expired trial to demo', async () => {
    const authInstance = { currentUser: { uid: 'user-123' } } as any;
    getAuthMock.mockReturnValue(authInstance);

    const past = Date.now() - 60 * 1000;
    getDocMock.mockResolvedValue({
      data: () => ({
        membershipStatus: 'trial',
        trialEndDate: { toMillis: () => past },
      }),
    } as any);

    setDocMock.mockResolvedValue(undefined as any);

    const status = await SubscriptionManager.checkSubscriptionStatus();

    expect(status).toBe('demo');
    expect(setDocMock).toHaveBeenCalledWith(
      'userDoc',
      { membershipStatus: 'demo' },
      { merge: true }
    );
  });

  it('returns premium while subscription is valid or auto-renewing', async () => {
    const authInstance = { currentUser: { uid: 'user-123' } } as any;
    getAuthMock.mockReturnValue(authInstance);

    const future = Date.now() + 60 * 60 * 1000;
    getDocMock.mockResolvedValue({
      data: () => ({
        membershipStatus: 'premium',
        subscriptionExpiryDate: { toMillis: () => future },
        autoRenewing: true,
      }),
    } as any);

    const statusActive = await SubscriptionManager.checkSubscriptionStatus();

    expect(statusActive).toBe('premium');
    expect(setDocMock).not.toHaveBeenCalled();

    // Expired but autoRenewing should still return premium
    const now = Date.now();
    getDocMock.mockResolvedValue({
      data: () => ({
        membershipStatus: 'premium',
        subscriptionExpiryDate: { toMillis: () => now - 5000 },
        autoRenewing: true,
      }),
    } as any);

    const statusAutoRenew = await SubscriptionManager.checkSubscriptionStatus();
    expect(statusAutoRenew).toBe('premium');
  });

  it('downgrades expired non-renewing premium subscription', async () => {
    const authInstance = { currentUser: { uid: 'user-123' } } as any;
    getAuthMock.mockReturnValue(authInstance);

    const past = Date.now() - 10_000;
    getDocMock.mockResolvedValue({
      data: () => ({
        membershipStatus: 'premium',
        subscriptionExpiryDate: { toMillis: () => past },
        autoRenewing: false,
      }),
    } as any);

    const status = await SubscriptionManager.checkSubscriptionStatus();

    expect(status).toBe('demo');
    expect(setDocMock).toHaveBeenCalledWith(
      'userDoc',
      { membershipStatus: 'demo' },
      { merge: true }
    );
  });

  it('computes remaining trial days', async () => {
    const authInstance = { currentUser: { uid: 'user-123' } } as any;
    getAuthMock.mockReturnValue(authInstance);

    const remainingDays = 4;
    const trialEnd = Date.now() + remainingDays * 24 * 60 * 60 * 1000 + 1000;
    getDocMock.mockResolvedValue({
      data: () => ({
        membershipStatus: 'trial',
        trialEndDate: { toMillis: () => trialEnd },
      }),
    } as any);

    const days = await SubscriptionManager.getTrialDaysRemaining();

    expect(days).not.toBeNull();
    expect(days ?? 0).toBeGreaterThanOrEqual(remainingDays);
    expect(days ?? 0).toBeLessThanOrEqual(remainingDays + 1);
  });

  it('returns null for trial days when user missing or not in trial', async () => {
    getAuthMock.mockReturnValue({ currentUser: null } as any);

    await expect(SubscriptionManager.getTrialDaysRemaining()).resolves.toBeNull();

    const authInstance = { currentUser: { uid: 'user-123' } } as any;
    getAuthMock.mockReturnValue(authInstance);
    getDocMock.mockResolvedValue({ data: () => ({ membershipStatus: 'premium' }) } as any);

    await expect(SubscriptionManager.getTrialDaysRemaining()).resolves.toBeNull();
  });
});
