import { SubscriptionManager } from '../SubscriptionManager';
import { getAuth } from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from '@react-native-firebase/firestore';
import type { MembershipStatus, UserSubscriptionDoc } from '@/types/subscription';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// Type alias for cleaner test code
type Timestamp = FirebaseFirestoreTypes.Timestamp;

// Mock Firebase modules
jest.mock('@react-native-firebase/auth');
jest.mock('@react-native-firebase/firestore');

describe('SubscriptionManager', () => {
  const mockUserId = 'test-user-123';
  const mockFirestore = {} as unknown;
  const mockCollection = 'usersCollection' as unknown;
  const mockDoc = 'userDoc' as unknown;

  const getAuthMock = getAuth as jest.MockedFunction<typeof getAuth>;
  const getFirestoreMock = getFirestore as jest.MockedFunction<typeof getFirestore>;
  const collectionMock = collection as jest.MockedFunction<typeof collection>;
  const docMock = doc as jest.MockedFunction<typeof doc>;
  const getDocMock = getDoc as jest.MockedFunction<typeof getDoc>;
  const setDocMock = setDoc as jest.MockedFunction<typeof setDoc>;
  const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;

  // Helper to create a mock authenticated user
  const mockAuthUser = (uid: string | null = mockUserId) => {
    getAuthMock.mockReturnValue({
      currentUser: uid ? { uid } : null,
    } as ReturnType<typeof getAuth>);
  };

  // Helper to create a mock Firestore snapshot
  const mockFirestoreSnapshot = (data: Partial<UserSubscriptionDoc> | null) => {
    getDocMock.mockResolvedValue({
      data: () => data,
    } as unknown as ReturnType<typeof getDoc>);
  };

  // Helper to create a proper Firestore Timestamp mock
  const createTimestamp = (milliseconds: number): Timestamp => ({
    toMillis: jest.fn(() => milliseconds),
    _seconds: Math.floor(milliseconds / 1000),
    _nanoseconds: (milliseconds % 1000) * 1000000,
  } as unknown as Timestamp);

  beforeEach(() => {
    jest.clearAllMocks();
    getFirestoreMock.mockReturnValue(mockFirestore as ReturnType<typeof getFirestore>);
    collectionMock.mockReturnValue(mockCollection as ReturnType<typeof collection>);
    docMock.mockReturnValue(mockDoc as ReturnType<typeof doc>);
    setDocMock.mockResolvedValue(undefined as unknown as ReturnType<typeof setDoc>);
  });

  describe('toMillis helper', () => {
    it('should handle Firestore Timestamp objects with toMillis method', () => {
      // Access the private method via type assertion for testing
      const SubscriptionManagerWithPrivate = SubscriptionManager as unknown as {
        toMillis: (ts?: Timestamp | null) => number | undefined;
      };
      const timestamp = createTimestamp(1234567890000);

      const result = SubscriptionManagerWithPrivate.toMillis(timestamp as Timestamp);

      expect(result).toBe(1234567890000);
      expect(timestamp.toMillis).toHaveBeenCalled();
    });

    it('should return undefined for null timestamp', () => {
      const SubscriptionManagerWithPrivate = SubscriptionManager as unknown as {
        toMillis: (ts?: Timestamp | null) => number | undefined;
      };

      const result = SubscriptionManagerWithPrivate.toMillis(null);

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined timestamp', () => {
      const SubscriptionManagerWithPrivate = SubscriptionManager as unknown as {
        toMillis: (ts?: Timestamp | null) => number | undefined;
      };

      const result = SubscriptionManagerWithPrivate.toMillis(undefined);

      expect(result).toBeUndefined();
    });

    it('should handle edge case with zero milliseconds', () => {
      const SubscriptionManagerWithPrivate = SubscriptionManager as unknown as {
        toMillis: (ts?: Timestamp | null) => number | undefined;
      };
      const timestamp = createTimestamp(0);

      const result = SubscriptionManagerWithPrivate.toMillis(timestamp as Timestamp);

      expect(result).toBe(0);
    });
  });

  describe('checkSubscriptionStatus', () => {
    describe('when no authenticated user', () => {
      it('should return "demo" status', async () => {
        mockAuthUser(null);

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
        expect(getDocMock).not.toHaveBeenCalled();
      });
    });

    describe('when no user data in Firestore', () => {
      it('should return "demo" status', async () => {
        mockAuthUser();
        mockFirestoreSnapshot(null);

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
        expect(getDocMock).toHaveBeenCalledWith(mockDoc);
      });
    });

    describe('when user has demo status', () => {
      it('should return "demo" status', async () => {
        mockAuthUser();
        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'demo',
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
        expect(setDocMock).not.toHaveBeenCalled();
      });
    });

    describe('trial status scenarios', () => {
      it('should return "trial" when trial period is still active', async () => {
        mockAuthUser();
        const futureDate = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days from now
        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'trial',
          trialEndDate: createTimestamp(futureDate) as Timestamp,
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('trial');
        expect(setDocMock).not.toHaveBeenCalled();
      });

      it('should convert trial to "demo" when trial ended', async () => {
        mockAuthUser();
        const pastTrialEnd = Date.now() - 1000; // Trial ended 1 second ago

        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'trial',
          trialEndDate: createTimestamp(pastTrialEnd) as Timestamp,
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
        expect(setDocMock).toHaveBeenCalledWith(
          mockDoc,
          { membershipStatus: 'demo' },
          { merge: true }
        );
      });

      it('should handle missing trialEndDate gracefully', async () => {
        mockAuthUser();
        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'trial',
          // No trialEndDate provided
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        // Without trial end date, should just return trial (can't determine expiry)
        expect(status).toBe('trial');
        expect(setDocMock).not.toHaveBeenCalled();
      });
    });

    describe('premium status scenarios', () => {
      it('should return "premium" when subscription is still active', async () => {
        mockAuthUser();
        const futureExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now

        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'premium',
          subscriptionExpiryDate: createTimestamp(futureExpiry) as Timestamp,
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('premium');
        expect(setDocMock).not.toHaveBeenCalled();
      });

      it('should return "premium" when subscription just started (edge case)', async () => {
        mockAuthUser();
        const justStarted = Date.now() + 1; // 1ms in the future

        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'premium',
          subscriptionExpiryDate: createTimestamp(justStarted) as Timestamp,
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('premium');
        expect(setDocMock).not.toHaveBeenCalled();
      });

      it('should convert premium to "demo" when subscription expired and not auto-renewing', async () => {
        mockAuthUser();
        const pastExpiry = Date.now() - 1000; // Expired 1 second ago

        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'premium',
          subscriptionExpiryDate: createTimestamp(pastExpiry) as Timestamp,
          autoRenewing: false,
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
        expect(setDocMock).toHaveBeenCalledWith(
          mockDoc,
          { membershipStatus: 'demo' },
          { merge: true }
        );
      });

      it('should keep premium status when expired but auto-renewing is true', async () => {
        mockAuthUser();
        const pastExpiry = Date.now() - 5 * 24 * 60 * 60 * 1000; // Expired 5 days ago

        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'premium',
          subscriptionExpiryDate: createTimestamp(pastExpiry) as Timestamp,
          autoRenewing: true, // Subscription is auto-renewing
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('premium');
        expect(setDocMock).not.toHaveBeenCalled();
      });

      it('should handle premium with no expiry date gracefully', async () => {
        mockAuthUser();
        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'premium',
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        // Without expiry date, can't determine if expired, so returns premium
        expect(status).toBe('premium');
        expect(setDocMock).not.toHaveBeenCalled();
      });

      it('should convert premium to "demo" when autoRenewing is undefined and subscription expired', async () => {
        mockAuthUser();
        const pastExpiry = Date.now() - 1000;

        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'premium',
          subscriptionExpiryDate: createTimestamp(pastExpiry) as Timestamp,
          // autoRenewing is undefined, !undefined === true, so it will downgrade
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        // Should downgrade because !undefined is truthy in the condition
        expect(status).toBe('demo');
        expect(setDocMock).toHaveBeenCalledWith(
          mockDoc,
          { membershipStatus: 'demo' },
          { merge: true }
        );
      });
    });

    describe('edge cases and error handling', () => {
      it('should handle invalid membershipStatus by returning it or defaulting to "demo"', async () => {
        mockAuthUser();
        mockFirestoreSnapshot({
          uid: mockUserId,
          membershipStatus: 'invalid-status' as MembershipStatus,
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('invalid-status' as MembershipStatus);
      });

      it('should return "demo" when membershipStatus is undefined', async () => {
        mockAuthUser();
        mockFirestoreSnapshot({
          uid: mockUserId,
          // No membershipStatus
        });

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
      });

      it('should handle empty data object', async () => {
        mockAuthUser();
        mockFirestoreSnapshot({});

        const status = await SubscriptionManager.checkSubscriptionStatus();

        expect(status).toBe('demo');
      });
    });
  });

  describe('getTrialDaysRemaining', () => {
    it('should return null when no authenticated user', async () => {
      mockAuthUser(null);

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBeNull();
      expect(getDocMock).not.toHaveBeenCalled();
    });

    it('should return null when no user data in Firestore', async () => {
      mockAuthUser();
      mockFirestoreSnapshot(null);

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBeNull();
    });

    it('should return null when user is not on trial', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'premium',
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBeNull();
    });

    it('should return null when user is on demo', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'demo',
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBeNull();
    });

    it('should return null when trial has no end date', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        // No trialEndDate
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBeNull();
    });

    it('should return correct days remaining when trial is active', async () => {
      mockAuthUser();
      const daysRemaining = 5;
      const trialEnd = Date.now() + daysRemaining * 24 * 60 * 60 * 1000;

      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        trialEndDate: createTimestamp(trialEnd) as Timestamp,
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).not.toBeNull();
      expect(days).toBeGreaterThanOrEqual(daysRemaining - 1); // Allow for timing variance
      expect(days).toBeLessThanOrEqual(daysRemaining + 1);
    });

    it('should return 0 when trial has just expired', async () => {
      mockAuthUser();
      const trialEnd = Date.now() - 1000; // Expired 1 second ago

      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        trialEndDate: createTimestamp(trialEnd) as Timestamp,
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBe(0);
    });

    it('should return 1 when trial ends in less than 24 hours', async () => {
      mockAuthUser();
      const trialEnd = Date.now() + 12 * 60 * 60 * 1000; // 12 hours from now

      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        trialEndDate: createTimestamp(trialEnd) as Timestamp,
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBe(1); // Math.ceil should round up
    });

    it('should return correct days for trial ending in exactly 7 days', async () => {
      mockAuthUser();
      const exactlySevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;

      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        trialEndDate: createTimestamp(exactlySevenDays) as Timestamp,
      });

      const days = await SubscriptionManager.getTrialDaysRemaining();

      expect(days).toBeGreaterThanOrEqual(7);
      expect(days).toBeLessThanOrEqual(8); // Allow for rounding
    });
  });

  describe('hasUserUsedTrial', () => {
    it('should return false when no authenticated user', async () => {
      mockAuthUser(null);

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(false);
      expect(getDocMock).not.toHaveBeenCalled();
    });

    it('should return false when no user data in Firestore', async () => {
      mockAuthUser();
      mockFirestoreSnapshot(null);

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(false);
    });

    it('should return false when hasUsedTrial is undefined', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'demo',
      });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(false);
    });

    it('should return false when hasUsedTrial is explicitly false', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'demo',
        hasUsedTrial: false,
      });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(false);
    });

    it('should return true when hasUsedTrial is true', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'premium',
        hasUsedTrial: true,
      });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(true);
    });

    it('should return true for user currently on trial', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        hasUsedTrial: true,
      });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(true);
    });

    it('should return true for user who completed trial and is now premium', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'premium',
        hasUsedTrial: true,
      });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(true);
    });

    it('should return true for user who completed trial and downgraded to demo', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'demo',
        hasUsedTrial: true,
      });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(true);
    });
  });

  describe('onSubscriptionChange', () => {
    it('should immediately call callback with "demo" when no authenticated user', () => {
      mockAuthUser(null);
      const callback = jest.fn();

      const unsubscribe = SubscriptionManager.onSubscriptionChange(callback);

      expect(callback).toHaveBeenCalledWith('demo');
      expect(onSnapshotMock).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should set up snapshot listener when user is authenticated', () => {
      mockAuthUser();
      const callback = jest.fn();
      const mockUnsubscribe = jest.fn();
      onSnapshotMock.mockReturnValue(mockUnsubscribe);

      const unsubscribe = SubscriptionManager.onSubscriptionChange(callback);

      expect(onSnapshotMock).toHaveBeenCalledWith(
        mockDoc,
        expect.any(Function),
        expect.any(Function)
      );
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it('should call callback with "demo" when snapshot has no data', async () => {
      mockAuthUser();
      const callback = jest.fn();
      let snapshotCallback: (snap: unknown) => void = () => {};

      /* eslint-disable @typescript-eslint/no-explicit-any */
      onSnapshotMock.mockImplementation(((_ref: any, onNext: any, _onError: any) => {
        snapshotCallback = onNext as (snap: unknown) => void;
        return jest.fn();
      }) as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      SubscriptionManager.onSubscriptionChange(callback);

      // Simulate snapshot with no data
      await snapshotCallback({ data: () => null } as unknown);

      expect(callback).toHaveBeenCalledWith('demo');
    });

    it('should call callback with updated status when snapshot changes', async () => {
      mockAuthUser();
      const callback = jest.fn();
      let snapshotCallback: (snap: unknown) => void = () => {};

      /* eslint-disable @typescript-eslint/no-explicit-any */
      onSnapshotMock.mockImplementation(((_ref: any, onNext: any, _onError: any) => {
        snapshotCallback = onNext as (snap: unknown) => void;
        return jest.fn();
      }) as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Mock checkSubscriptionStatus to return trial
      mockFirestoreSnapshot({
        uid: mockUserId,
        membershipStatus: 'trial',
        trialEndDate: createTimestamp(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      SubscriptionManager.onSubscriptionChange(callback);

      // Simulate snapshot change
      await snapshotCallback({
        data: () => ({
          uid: mockUserId,
          membershipStatus: 'trial',
        }),
      } as unknown);

      // Wait for async checkSubscriptionStatus to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(callback).toHaveBeenCalled();
    });

    it('should handle snapshot errors gracefully', () => {
      mockAuthUser();
      const callback = jest.fn();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      let errorCallback: (error: Error) => void = () => {};

      /* eslint-disable @typescript-eslint/no-explicit-any */
      onSnapshotMock.mockImplementation(((_ref: any, _onNext: any, onError: any) => {
        errorCallback = onError as (error: Error) => void;
        return jest.fn();
      }) as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      SubscriptionManager.onSubscriptionChange(callback);

      // Simulate snapshot error
      const testError = new Error('Snapshot error');
      errorCallback(testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Subscription onSnapshot error', testError);

      consoleErrorSpy.mockRestore();
    });

    it('should return working unsubscribe function', () => {
      mockAuthUser();
      const callback = jest.fn();
      const mockUnsubscribe = jest.fn();
      onSnapshotMock.mockReturnValue(mockUnsubscribe);

      const unsubscribe = SubscriptionManager.onSubscriptionChange(callback);
      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
