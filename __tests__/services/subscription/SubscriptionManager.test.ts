jest.mock('@react-native-firebase/auth', () => {
  const authState = { currentUser: null as { uid: string } | null };
  const getAuth = () => authState;
  return {
    __esModule: true,
    default: getAuth,
    getAuth,
    __authState: authState,
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const mocks = {
    collection: jest.fn((db, name) => ({ db, name })),
    doc: jest.fn((col, id) => ({ col, id })),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    onSnapshot: jest.fn(),
  };
  return {
    __esModule: true,
    default: () => ({}),
    getFirestore: () => ({}),
    FirebaseFirestoreTypes: { Timestamp: class {} },
    ...mocks,
    __mocks: mocks,
  };
});

import SubscriptionManager from '@/services/subscription/SubscriptionManager';
import type { MembershipStatus } from '@/types/subscription';

const authModule = jest.requireMock('@react-native-firebase/auth') as { __authState: { currentUser: { uid: string } | null } };
const firestoreModule = jest.requireMock('@react-native-firebase/firestore') as {
  __mocks: {
    collection: jest.Mock;
    doc: jest.Mock;
    getDoc: jest.Mock;
    setDoc: jest.Mock;
    onSnapshot: jest.Mock;
  };
};

const authState = authModule.__authState;
const { collection, doc, getDoc, setDoc, onSnapshot } = firestoreModule.__mocks;

const futureTs = (days: number) => ({ toMillis: () => Date.now() + days * 24 * 60 * 60 * 1000 });
const pastTs = (days: number) => ({ toMillis: () => Date.now() - days * 24 * 60 * 60 * 1000 });

const setUser = (uid: string | null) => {
  authState.currentUser = uid ? { uid } : null;
};

const setDocData = (data?: Partial<Record<string, unknown>>) => {
  getDoc.mockResolvedValue({ data: () => (data ?? undefined) });
};

describe('SubscriptionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUser(null);
    setDocData();
  });

  it('returns demo when user is not authenticated or doc missing', async () => {
    setUser(null);
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'demo'>('demo');

    setUser('user');
    setDocData(undefined);
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'demo'>('demo');
  });

  it('handles active and expired trials', async () => {
    setUser('user');

    setDocData({ membershipStatus: 'trial', trialEndDate: futureTs(2) });
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'trial'>('trial');

    setDocData({ membershipStatus: 'trial', trialEndDate: pastTs(1) });
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'demo'>('demo');
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { membershipStatus: 'demo' }, { merge: true });
  });

  it('handles premium expirations based on autoRenewing flag', async () => {
    setUser('user');

    setDocData({ membershipStatus: 'premium', subscriptionExpiryDate: futureTs(5), autoRenewing: false });
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'premium'>('premium');

    setDocData({ membershipStatus: 'premium', subscriptionExpiryDate: pastTs(2), autoRenewing: false });
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'demo'>('demo');
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { membershipStatus: 'demo' }, { merge: true });

    setDoc.mockClear();
    setDocData({ membershipStatus: 'premium', subscriptionExpiryDate: pastTs(2), autoRenewing: true });
    await expect(SubscriptionManager.checkSubscriptionStatus()).resolves.toBe<'premium'>('premium');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('computes trial days remaining or returns null when unavailable', async () => {
    setUser(null);
    await expect(SubscriptionManager.getTrialDaysRemaining()).resolves.toBeNull();

    setUser('user');
    setDocData({ membershipStatus: 'premium' });
    await expect(SubscriptionManager.getTrialDaysRemaining()).resolves.toBeNull();

    setDocData({ membershipStatus: 'trial', trialEndDate: futureTs(3) });
    await expect(SubscriptionManager.getTrialDaysRemaining()).resolves.toBe(3);
  });

  it('invokes callback with demo when not authenticated', () => {
    setUser(null);
    const callback = jest.fn();
    const unsubscribe = SubscriptionManager.onSubscriptionChange(callback);
    expect(callback).toHaveBeenCalledWith<'demo'>('demo');
    expect(typeof unsubscribe).toBe('function');
  });

  it('subscribes to Firestore updates and emits status', async () => {
    setUser('user');
    const callback = jest.fn();

    setDocData({ membershipStatus: 'premium', subscriptionExpiryDate: futureTs(1), autoRenewing: true });
    onSnapshot.mockImplementation((ref, next) => {
      next({ data: () => ({ membershipStatus: 'premium' }) });
      return jest.fn();
    });

    SubscriptionManager.onSubscriptionChange(callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(onSnapshot).toHaveBeenCalled();
    expect(callback).toHaveBeenLastCalledWith<MembershipStatus>('premium');
  });
});
