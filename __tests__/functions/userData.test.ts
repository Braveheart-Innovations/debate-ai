import { createInvoker, createOnCallMock, MockHttpsError, registeredHandlersOf } from '@test-utils/functionsHarness';
/**
 * userData Cloud Function Tests
 *
 * Harness for the Firebase Functions v2 `onCall` (mirroring
 * __tests__/functions/authRateLimiting.test.ts: the mocked `onCall` hands each
 * handler back so tests invoke it directly). These tests focus on the function
 * logic rather than the full Firebase integration.
 */

/**
 * The request fields exportUserData reads. The real `CallableRequest` also
 * demands a full Express `rawRequest`, which the handler never touches.
 */
type TestCallableRequest = {
  data: Record<string, unknown>;
  auth?: { uid: string };
};

type MockAuthUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  emailVerified: boolean;
  metadata: { creationTime: string; lastSignInTime: string };
};
type MockDocSnapshot = { exists: boolean; data: () => Record<string, unknown> | null | undefined };
type MockQuerySnapshot = { docs: Array<{ id: string; data?: () => Record<string, unknown> }> };
type MockSubcollection = {
  doc: (id: string) => { get: () => Promise<MockDocSnapshot> };
  get: () => Promise<MockQuerySnapshot>;
};
type MockUsersCollection = {
  doc: (uid: string) => {
    get: () => Promise<MockDocSnapshot>;
    collection: (name: string) => MockSubcollection;
  };
};

const missingDoc: MockDocSnapshot = { exists: false, data: () => null };

/** Builds the `users/{uid}` Firestore chain exportUserData walks. */
function buildUsersCollection({
  userDoc = missingDoc,
  subscriptionDoc = missingDoc,
  apiKeys = { docs: [] },
}: {
  userDoc?: MockDocSnapshot;
  subscriptionDoc?: MockDocSnapshot;
  apiKeys?: MockQuerySnapshot;
}): MockUsersCollection {
  return {
    doc: jest.fn((_uid: string) => ({
      get: jest.fn(async () => userDoc),
      collection: jest.fn((_name: string) => ({
        doc: jest.fn((_id: string) => ({
          get: jest.fn(async () => subscriptionDoc),
        })),
        get: jest.fn(async () => apiKeys),
      })),
    })),
  };
}

const mockGetUser = jest.fn(async (_uid: string): Promise<MockAuthUser> => {
  throw new Error('mockGetUser: no user configured');
});
const mockCollection = jest.fn((_name: string): MockUsersCollection => buildUsersCollection({}));

jest.mock('firebase-admin', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  auth: jest.fn(() => ({
    getUser: mockGetUser,
  })),
}), { virtual: true });

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
}), { virtual: true });

const mockOnCall = createOnCallMock<TestCallableRequest>();

jest.mock('firebase-functions/v2/https', () => ({
  onCall: mockOnCall,
  HttpsError: MockHttpsError,
}), { virtual: true });

const { exportUserData } = require('../../functions/src/userData') as typeof import('../../functions/src/userData');

// Captured at load: `jest.clearAllMocks()` in beforeEach wipes `mock.results`.
const registeredHandlers = registeredHandlersOf(mockOnCall);

const invoke = createInvoker(registeredHandlers);

const buildAuthUser = (overrides: Partial<MockAuthUser> = {}): MockAuthUser => ({
  uid: 'test-user',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  emailVerified: true,
  metadata: {
    creationTime: '2025-01-01T00:00:00Z',
    lastSignInTime: '2026-01-03T10:00:00Z',
  },
  ...overrides,
});

describe('exportUserData Cloud Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('should require authentication', async () => {
      // Call the function without auth
      await expect(
        invoke(exportUserData, { data: {}, auth: undefined })
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });
  });

  describe('data export structure', () => {
    it('should return expected data structure', async () => {
      const mockUid = 'test-user-123';
      const mockEmail = 'test@example.com';
      const mockDisplayName = 'Test User';
      const mockCreationTime = '2025-01-01T00:00:00Z';
      const mockLastSignInTime = '2026-01-03T10:00:00Z';

      // Setup auth mock
      mockGetUser.mockResolvedValue(buildAuthUser({
        uid: mockUid,
        email: mockEmail,
        displayName: mockDisplayName,
        metadata: {
          creationTime: mockCreationTime,
          lastSignInTime: mockLastSignInTime,
        },
      }));

      // Setup Firestore mocks
      const mockSubscriptionDoc: MockDocSnapshot = {
        exists: true,
        data: () => ({
          status: 'active',
          plan: 'annual',
          currentPeriodEnd: { toDate: () => new Date('2027-01-01') },
          trialEndsAt: null,
          canceledAt: null,
          createdAt: { toDate: () => new Date('2025-01-01') },
        }),
      };

      const mockUserDoc: MockDocSnapshot = {
        exists: true,
        data: () => ({
          syncSettings: { global: 'all', modes: { chat: true, debate: true } },
        }),
      };

      const mockApiKeysSnapshot: MockQuerySnapshot = {
        docs: [
          { id: 'openai' },
          { id: 'claude' },
        ],
      };

      // Mock Firestore collection chain
      mockCollection.mockImplementation((collectionName: string) => {
        if (collectionName !== 'users') {
          throw new Error(`unexpected collection: ${collectionName}`);
        }
        return buildUsersCollection({
          userDoc: mockUserDoc,
          subscriptionDoc: mockSubscriptionDoc,
          apiKeys: mockApiKeysSnapshot,
        });
      });

      const result = await invoke(exportUserData, {
        data: {},
        auth: { uid: mockUid },
      });

      // Verify profile data
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('profile.uid', mockUid);
      expect(result).toHaveProperty('profile.email', mockEmail);
      expect(result).toHaveProperty('profile.displayName', mockDisplayName);

      // Verify subscription data
      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('subscription.status', 'active');
      expect(result).toHaveProperty('subscription.plan', 'annual');

      // Verify sync settings
      expect(result).toHaveProperty('syncSettings');
      expect(result).toHaveProperty('syncSettings.global', 'all');

      // Verify configured providers (not the actual keys)
      expect(result).toHaveProperty('configuredProviders', ['openai', 'claude']);

      // Verify export timestamp
      expect(result).toHaveProperty('exportedAt');
      const exportedAt = typeof result === 'object' && result !== null && 'exportedAt' in result
        && typeof result.exportedAt === 'string'
        ? result.exportedAt
        : '';
      expect(new Date(exportedAt).getTime()).toBeGreaterThan(0);
    });

    it('should handle missing subscription data', async () => {
      const mockUid = 'test-user-456';

      mockGetUser.mockResolvedValue(buildAuthUser({
        uid: mockUid,
        email: 'nosubscription@example.com',
        displayName: 'No Sub User',
      }));

      // Mock no subscription
      mockCollection.mockImplementation(() => buildUsersCollection({
        userDoc: missingDoc,
        subscriptionDoc: missingDoc,
        apiKeys: { docs: [] },
      }));

      const result = await invoke(exportUserData, {
        data: {},
        auth: { uid: mockUid },
      });

      expect(result).toHaveProperty('subscription', null);
      expect(result).toHaveProperty('configuredProviders', []);
    });
  });

  describe('GDPR compliance', () => {
    it('should NOT include actual API keys in export', async () => {
      const mockUid = 'gdpr-test-user';

      mockGetUser.mockResolvedValue(buildAuthUser({
        uid: mockUid,
        email: 'gdpr@example.com',
        displayName: 'GDPR User',
      }));

      // Mock API keys with actual encrypted data
      const mockApiKeysSnapshot: MockQuerySnapshot = {
        docs: [
          {
            id: 'openai',
            data: () => ({
              encrypted: 'some-encrypted-data',
              iv: 'some-iv',
              tag: 'some-tag',
            }),
          },
        ],
      };

      mockCollection.mockImplementation(() => buildUsersCollection({
        userDoc: missingDoc,
        subscriptionDoc: { exists: false, data: () => undefined },
        apiKeys: mockApiKeysSnapshot,
      }));

      const result = await invoke(exportUserData, {
        data: {},
        auth: { uid: mockUid },
      });

      // Convert result to string to check for any leaked data
      const resultString = JSON.stringify(result);

      // Ensure no encrypted data is in the result
      expect(resultString).not.toContain('encrypted');
      expect(resultString).not.toContain('some-encrypted-data');
      expect(resultString).not.toContain('some-iv');
      expect(resultString).not.toContain('some-tag');

      // Only provider IDs should be present
      expect(result).toHaveProperty('configuredProviders', ['openai']);
    });
  });
});
