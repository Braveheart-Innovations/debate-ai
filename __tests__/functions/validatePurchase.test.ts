import axios from 'axios';
import { validatePurchase } from '../../functions/src/validatePurchase';

const mockSetDoc = jest.fn();
const mockDoc = jest.fn(() => ({ set: mockSetDoc }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
const mockFirestoreInstance = { collection: mockCollection } as const;
const mockFirestore = Object.assign(jest.fn(() => mockFirestoreInstance), {
  FieldValue: { serverTimestamp: jest.fn(() => 'serverTimestamp') },
  Timestamp: { fromDate: jest.fn((date: Date) => ({ toDate: () => date })) },
});

const mockFunctionsConfig = jest.fn(() => ({ apple: { shared_secret: 'shared-secret' } }));

const mockSubscriptionsGet = jest.fn();
const mockSubscriptionsV2Get = jest.fn();
const mockGoogleOptions = jest.fn();
const mockGoogleAuthInstance = { getClient: jest.fn().mockResolvedValue({}) };

jest.mock('firebase-functions', () => {
  class MockHttpsError extends Error {
    public code: string;

    constructor(mockCode: string, message: string) {
      super(message);
      this.code = mockCode;
    }
  }

  return {
    __esModule: true,
    https: {
      onCall: (handler: unknown) => handler,
      HttpsError: MockHttpsError,
    },
    config: mockFunctionsConfig,
  };
}, { virtual: true });

jest.mock('firebase-admin', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  firestore: mockFirestore,
}), { virtual: true });

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
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
        subscriptions: { get: mockSubscriptionsGet },
        subscriptionsv2: { get: mockSubscriptionsV2Get },
      },
    })),
  },
}), { virtual: true });

const functionsModule = jest.requireMock('firebase-functions') as {
  config: typeof mockFunctionsConfig;
};

const googleModule = jest.requireMock('googleapis') as {
  google: {
    options: typeof mockGoogleOptions;
  };
};

const adminModule = jest.requireMock('firebase-admin') as {
  firestore: typeof mockFirestore;
};

describe('validatePurchase (Firebase callable)', () => {
  const axiosPostMock = axios.post as unknown as jest.Mock;
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    axiosPostMock.mockReset();
    consoleErrorSpy.mockReset();
    mockFunctionsConfig.mockReset();
    mockGoogleOptions.mockReset();
    mockGoogleAuthInstance.getClient.mockReset();
    mockCollection.mockReset();
    mockDoc.mockReset();
    mockSetDoc.mockReset();
    mockSubscriptionsGet.mockReset();
    mockSubscriptionsV2Get.mockReset();

    consoleErrorSpy.mockImplementation(() => {});
    mockFunctionsConfig.mockReturnValue({ apple: { shared_secret: 'shared-secret' } });
    mockGoogleOptions.mockImplementation(() => {});
    mockGoogleAuthInstance.getClient.mockResolvedValue({});
    functionsModule.config = mockFunctionsConfig;
    googleModule.google.options = mockGoogleOptions;
    adminModule.firestore = mockFirestore;
    mockCollection.mockReturnValue({ doc: mockDoc } as any);
    mockDoc.mockReturnValue({ set: mockSetDoc } as any);
    mockSetDoc.mockResolvedValue(undefined as any);
    mockSubscriptionsGet.mockResolvedValue({
      data: { expiryTimeMillis: `${Date.now() + 60_000}`, autoRenewing: true },
    });
    mockSubscriptionsV2Get.mockResolvedValue({ data: { lineItems: [] } });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      validatePurchase({ platform: 'ios', productId: 'sub.monthly' } as any, {} as any)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('requires an iOS receipt for iOS validations', async () => {
    await expect(
      validatePurchase(
        { platform: 'ios', productId: 'sub.monthly' } as any,
        { auth: { uid: 'user-1' } } as any
      )
    ).rejects.toMatchObject({ code: 'internal' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'validatePurchase error',
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('validates iOS receipts, persists subscription data, and returns trial metadata', async () => {
    const now = Date.now();
    axiosPostMock
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

    const response = await validatePurchase(
      { platform: 'ios', productId: 'sub.monthly', receipt: 'abc123' },
      { auth: { uid: 'user-42' } } as any
    );

    expect(response.valid).toBe(true);
    expect(response.membershipStatus).toBe('trial');
    expect(response.productId).toBe('monthly');
    expect(response.autoRenewing).toBe(true);
    expect(response.trialStartDate).not.toBeNull();
    expect(response.trialEndDate).not.toBeNull();

    expect(axiosPostMock).toHaveBeenCalledTimes(2);
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipStatus: 'trial',
        productId: 'monthly',
        autoRenewing: true,
      }),
      { merge: true }
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('validates Android purchases via Google APIs and stores premium status', async () => {
    mockSubscriptionsGet.mockResolvedValueOnce({
      data: {
        expiryTimeMillis: `${Date.now() + 3600_000}`,
        autoRenewing: false,
      },
    });

    const response = await validatePurchase(
      { platform: 'android', productId: 'sub.annual', purchaseToken: 'token-123' },
      { auth: { uid: 'user-99' } } as any
    );

    expect(response.valid).toBe(true);
    expect(response.membershipStatus).toBe('premium');
    expect(response.productId).toBe('annual');
    expect(response.autoRenewing).toBe(false);

    expect(mockSubscriptionsGet).toHaveBeenCalledWith({
      packageName: 'com.braveheartinnovations.debateai',
      subscriptionId: 'sub.annual',
      token: 'token-123',
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ membershipStatus: 'premium', productId: 'annual' }),
      { merge: true }
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
