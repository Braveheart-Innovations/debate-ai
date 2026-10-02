import { createInvoker, createOnCallMock, MockHttpsError, registeredHandlersOf } from '@test-utils/functionsHarness';
// Harness for the Firebase Functions v2 `onCall` (mirroring
// __tests__/functions/authRateLimiting.test.ts: the mocked `onCall` hands each
// handler back so tests invoke it directly).
import { getExpectedAndroidObfuscatedAccountId } from '../../functions/src/purchaseOwnership';

/**
 * The request fields validatePurchase reads. The real `CallableRequest` also
 * demands a full Express `rawRequest`, which the handler never touches.
 */
type TestCallableRequest = {
  data: {
    platform: 'ios' | 'android';
    productId: string;
    receipt?: string;
    purchaseToken?: string;
  };
  auth?: { uid: string; token?: { email?: string } };
};

type MockSnapshot = { exists: boolean; data: () => Record<string, unknown> | undefined };
type MockQuerySnapshot = { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
type MockDocRef = { path: string; get: () => Promise<MockSnapshot>; set: typeof mockSetDoc };

const mockOnCall = createOnCallMock<TestCallableRequest>();
const mockSecretValue = jest.fn((): string => 'shared-secret');

const mockSetDoc = jest.fn(
  async (_data: Record<string, unknown>, _options?: { merge: boolean }): Promise<void> => undefined
);
const mockDocGet = jest.fn(async (): Promise<MockSnapshot> => ({ exists: false, data: () => undefined }));
const mockQueryGet = jest.fn(async (): Promise<MockQuerySnapshot> => ({ empty: true, docs: [] }));
const mockDoc = jest.fn((collectionName: string, id: string): MockDocRef => ({
  path: `${collectionName}/${id}`,
  get: mockDocGet,
  set: mockSetDoc,
}));
const mockCollection = jest.fn((name: string) => {
  const query = {
    where: (_field: string, _op: string, _value: unknown) => query,
    limit: (_count: number) => query,
    get: mockQueryGet,
  };
  return { doc: (id: string) => mockDoc(name, id), where: query.where };
});
const mockBatchSet = jest.fn(
  (_ref: MockDocRef, _data: Record<string, unknown>, _options?: { merge: boolean }) => undefined
);
const mockBatchCommit = jest.fn(async (): Promise<void> => undefined);
const mockFirestoreInstance = {
  collection: mockCollection,
  batch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
};
const mockFirestore = Object.assign(jest.fn(() => mockFirestoreInstance), {
  FieldValue: { serverTimestamp: jest.fn(() => 'serverTimestamp') },
  Timestamp: { fromDate: jest.fn((date: Date) => ({ toDate: () => date })) },
});

const mockAxiosPost = jest.fn();

type SubscriptionV2Params = { packageName: string; token: string };
type SubscriptionV2Response = {
  data: {
    subscriptionState?: string;
    startTime?: string;
    linkedPurchaseToken?: string;
    externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
    lineItems: Array<{
      productId?: string;
      expiryTime?: string;
      autoRenewingPlan?: { autoRenewEnabled?: boolean };
    }>;
  };
};
const mockSubscriptionsV2Get = jest.fn(
  async (_params: SubscriptionV2Params): Promise<SubscriptionV2Response> => ({ data: { lineItems: [] } })
);
const mockProductPurchaseV2Get = jest.fn();
const mockGoogleOptions = jest.fn((_options: { auth: unknown }) => undefined);
const mockGoogleAuthInstance = { getClient: jest.fn(async () => ({})) };

jest.mock('firebase-functions/v2/https', () => ({
  onCall: mockOnCall,
  HttpsError: MockHttpsError,
}), { virtual: true });

jest.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ name, value: () => mockSecretValue() }),
}), { virtual: true });

jest.mock('firebase-admin', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  firestore: mockFirestore,
}), { virtual: true });

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: mockAxiosPost,
  },
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn(() => mockGoogleAuthInstance),
    },
    options: mockGoogleOptions,
    androidpublisher: jest.fn(() => ({
      purchases: {
        subscriptionsv2: { get: mockSubscriptionsV2Get },
        productsv2: { getproductpurchasev2: mockProductPurchaseV2Get },
      },
    })),
  },
}), { virtual: true });

const { validatePurchase } = require('../../functions/src/validatePurchase') as typeof import('../../functions/src/validatePurchase');

// Captured at load: resetting the mock wipes `mock.results`.
const registeredHandlers = registeredHandlersOf(mockOnCall);

/** Runs the handler the mocked `onCall` registered for `callable`. */
const invoke = createInvoker(registeredHandlers);

describe('validatePurchase (Firebase callable)', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // The handler logs trial and Android state on every call.
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    mockAxiosPost.mockReset();
    consoleErrorSpy.mockReset();
    mockSecretValue.mockReset();
    mockGoogleOptions.mockReset();
    mockGoogleAuthInstance.getClient.mockReset();
    mockCollection.mockClear();
    mockDoc.mockClear();
    mockDocGet.mockReset();
    mockQueryGet.mockReset();
    mockSetDoc.mockReset();
    mockBatchSet.mockReset();
    mockBatchCommit.mockReset();
    mockSubscriptionsV2Get.mockReset();

    consoleErrorSpy.mockImplementation(() => {});
    mockSecretValue.mockReturnValue('shared-secret');
    mockGoogleOptions.mockImplementation(() => undefined);
    mockGoogleAuthInstance.getClient.mockResolvedValue({});
    mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mockSetDoc.mockResolvedValue(undefined);
    mockBatchCommit.mockResolvedValue(undefined);
    mockSubscriptionsV2Get.mockResolvedValue({
      data: {
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [
          {
            productId: 'sub.monthly',
            expiryTime: new Date(Date.now() + 60_000).toISOString(),
            autoRenewingPlan: { autoRenewEnabled: true },
          },
        ],
      },
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      invoke(validatePurchase, { data: { platform: 'ios', productId: 'sub.monthly' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('requires an iOS receipt for iOS validations', async () => {
    // The v2 handler re-throws HttpsErrors as-is (v1 wrapped them as `internal`).
    await expect(
      invoke(validatePurchase, {
        data: { platform: 'ios', productId: 'sub.monthly' },
        auth: { uid: 'user-1' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'validatePurchase error',
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('validates iOS receipts, persists subscription data, and returns trial metadata', async () => {
    const now = Date.now();
    mockAxiosPost
      .mockResolvedValueOnce({ data: { status: 21007 } })
      .mockResolvedValueOnce({
        data: {
          status: 0,
          latest_receipt_info: [
            {
              product_id: 'sub.monthly',
              expires_date_ms: `${now + 120_000}`,
              purchase_date_ms: `${now - 60_000}`,
              is_trial_period: 'true',
              is_in_intro_offer_period: 'false',
            },
          ],
          pending_renewal_info: [
            { product_id: 'sub.monthly', auto_renew_status: '1' },
          ],
        },
      });

    const response = await invoke(validatePurchase, {
      data: { platform: 'ios', productId: 'sub.monthly', receipt: 'abc123' },
      auth: { uid: 'user-42' },
    });

    expect(response).toMatchObject({
      valid: true,
      membershipStatus: 'trial',
      productId: 'monthly',
      autoRenewing: true,
    });
    expect(response).toHaveProperty('trialStartDate', expect.anything());
    expect(response).toHaveProperty('trialEndDate', expect.anything());

    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    // A first trial is written in a batch alongside its trial-history record.
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-42' }),
      expect.objectContaining({
        membershipStatus: 'trial',
        productId: 'monthly',
        autoRenewing: true,
      }),
      { merge: true }
    );
    expect(mockBatchCommit).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('validates Android purchases via Google APIs and stores premium status', async () => {
    mockSubscriptionsV2Get.mockResolvedValueOnce({
      data: {
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: getExpectedAndroidObfuscatedAccountId('user-99'),
        },
        lineItems: [
          {
            productId: 'sub.annual',
            expiryTime: new Date(Date.now() + 3600_000).toISOString(),
            autoRenewingPlan: { autoRenewEnabled: false },
          },
        ],
      },
    });

    const response = await invoke(validatePurchase, {
      data: { platform: 'android', productId: 'sub.annual', purchaseToken: 'token-123' },
      auth: { uid: 'user-99' },
    });

    expect(response).toMatchObject({
      valid: true,
      membershipStatus: 'premium',
      productId: 'annual',
      autoRenewing: false,
    });

    expect(mockSubscriptionsV2Get).toHaveBeenCalledWith({
      packageName: 'com.braveheartinnovations.debateai',
      token: 'token-123',
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ membershipStatus: 'premium', productId: 'annual' }),
      { merge: true }
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
