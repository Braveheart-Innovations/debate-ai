import { SubscriptionManager } from '../SubscriptionManager';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore, collection, doc, getDoc } from '@react-native-firebase/firestore';

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

  // Helper to create a mock authenticated user
  const mockAuthUser = (uid: string | null = mockUserId) => {
    getAuthMock.mockReturnValue({
      currentUser: uid ? { uid } : null,
    } as ReturnType<typeof getAuth>);
  };

  // Helper to create a mock Firestore snapshot
  const mockFirestoreSnapshot = (data: { hasUsedTrial?: boolean } | null) => {
    getDocMock.mockResolvedValue({
      data: () => data,
    } as unknown as ReturnType<typeof getDoc>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getFirestoreMock.mockReturnValue(mockFirestore as ReturnType<typeof getFirestore>);
    collectionMock.mockReturnValue(mockCollection as ReturnType<typeof collection>);
    docMock.mockReturnValue(mockDoc as ReturnType<typeof doc>);
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
      mockFirestoreSnapshot({});

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(false);
    });

    it('should return false when hasUsedTrial is explicitly false', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({ hasUsedTrial: false });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(false);
    });

    it('should return true when hasUsedTrial is true', async () => {
      mockAuthUser();
      mockFirestoreSnapshot({ hasUsedTrial: true });

      const hasUsed = await SubscriptionManager.hasUserUsedTrial();

      expect(hasUsed).toBe(true);
    });
  });
});
