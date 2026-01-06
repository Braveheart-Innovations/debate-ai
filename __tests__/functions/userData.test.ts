/**
 * userData Cloud Function Tests
 *
 * NOTE: Firebase Functions v2 with secrets requires the internal
 * Firebase infrastructure. These tests focus on the function logic
 * rather than the full integration.
 */

// Mock firebase-admin before importing the function
const mockGetUser = jest.fn();
const mockGetDoc = jest.fn();
const mockCollection = jest.fn();

jest.mock('firebase-admin', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  auth: jest.fn(() => ({
    getUser: mockGetUser,
  })),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

// Mock firebase-functions/v2/https
const mockOnCall = jest.fn((handler) => handler);

jest.mock('firebase-functions/v2/https', () => ({
  onCall: mockOnCall,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  },
}));

describe('exportUserData Cloud Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('should require authentication', async () => {
      // Import after mocks are set up
      const { exportUserData } = await import('../../functions/src/userData');

      // Call the function without auth
      await expect(
        (exportUserData as (request: { auth?: { uid: string } }) => Promise<unknown>)({ auth: undefined })
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
      mockGetUser.mockResolvedValue({
        uid: mockUid,
        email: mockEmail,
        displayName: mockDisplayName,
        photoURL: null,
        emailVerified: true,
        metadata: {
          creationTime: mockCreationTime,
          lastSignInTime: mockLastSignInTime,
        },
      });

      // Setup Firestore mocks
      const mockSubscriptionDoc = {
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

      const mockUserDoc = {
        exists: true,
        data: () => ({
          syncSettings: { global: 'all', modes: { chat: true, debate: true } },
        }),
      };

      const mockApiKeysSnapshot = {
        docs: [
          { id: 'openai' },
          { id: 'claude' },
        ],
      };

      // Mock Firestore collection chain
      mockCollection.mockImplementation((collectionName: string) => {
        if (collectionName === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockUserDoc),
              collection: jest.fn((subCollection: string) => {
                if (subCollection === 'billing') {
                  return {
                    doc: jest.fn(() => ({
                      get: jest.fn().mockResolvedValue(mockSubscriptionDoc),
                    })),
                  };
                }
                if (subCollection === 'apiKeys') {
                  return {
                    get: jest.fn().mockResolvedValue(mockApiKeysSnapshot),
                  };
                }
              }),
            })),
          };
        }
      });

      const { exportUserData } = await import('../../functions/src/userData');

      const result = await (exportUserData as (request: { auth: { uid: string } }) => Promise<{
        profile: { uid: string; email: string; displayName: string };
        subscription: { status: string; plan: string } | null;
        syncSettings: { global: string } | null;
        configuredProviders: string[];
        exportedAt: string;
      }>)({
        auth: { uid: mockUid },
      });

      // Verify profile data
      expect(result.profile).toBeDefined();
      expect(result.profile.uid).toBe(mockUid);
      expect(result.profile.email).toBe(mockEmail);
      expect(result.profile.displayName).toBe(mockDisplayName);

      // Verify subscription data
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.status).toBe('active');
      expect(result.subscription?.plan).toBe('annual');

      // Verify sync settings
      expect(result.syncSettings).toBeDefined();
      expect(result.syncSettings?.global).toBe('all');

      // Verify configured providers (not the actual keys)
      expect(result.configuredProviders).toEqual(['openai', 'claude']);

      // Verify export timestamp
      expect(result.exportedAt).toBeDefined();
      expect(new Date(result.exportedAt).getTime()).toBeGreaterThan(0);
    });

    it('should handle missing subscription data', async () => {
      const mockUid = 'test-user-456';

      mockGetUser.mockResolvedValue({
        uid: mockUid,
        email: 'nosubscription@example.com',
        displayName: 'No Sub User',
        photoURL: null,
        emailVerified: true,
        metadata: {
          creationTime: '2025-01-01T00:00:00Z',
          lastSignInTime: '2026-01-03T10:00:00Z',
        },
      });

      // Mock no subscription
      mockCollection.mockImplementation(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          })),
        })),
      }));

      const { exportUserData } = await import('../../functions/src/userData');

      const result = await (exportUserData as (request: { auth: { uid: string } }) => Promise<{
        subscription: unknown;
        syncSettings: unknown;
        configuredProviders: string[];
      }>)({
        auth: { uid: mockUid },
      });

      expect(result.subscription).toBeNull();
      expect(result.configuredProviders).toEqual([]);
    });
  });

  describe('GDPR compliance', () => {
    it('should NOT include actual API keys in export', async () => {
      const mockUid = 'gdpr-test-user';

      mockGetUser.mockResolvedValue({
        uid: mockUid,
        email: 'gdpr@example.com',
        displayName: 'GDPR User',
        photoURL: null,
        emailVerified: true,
        metadata: {
          creationTime: '2025-01-01T00:00:00Z',
          lastSignInTime: '2026-01-03T10:00:00Z',
        },
      });

      // Mock API keys with actual encrypted data
      const mockApiKeysSnapshot = {
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

      mockCollection.mockImplementation(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          collection: jest.fn((subCollection: string) => {
            if (subCollection === 'apiKeys') {
              return {
                get: jest.fn().mockResolvedValue(mockApiKeysSnapshot),
              };
            }
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ exists: false }),
              })),
            };
          }),
        })),
      }));

      const { exportUserData } = await import('../../functions/src/userData');

      const result = await (exportUserData as (request: { auth: { uid: string } }) => Promise<Record<string, unknown>>)({
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
      expect(result.configuredProviders).toEqual(['openai']);
    });
  });
});
