const mockSecureStorage = {
  clearApiKeys: jest.fn(),
};
const mockVerificationPersistence = {
  clearVerificationData: jest.fn(),
};
const mockSettingsService = {
  clearSettings: jest.fn(),
};
const mockMultiRemove = jest.fn();
const mockSignOut = jest.fn();
const mockCallable = jest.fn();
const mockStorageService = {
  clearAllSessions: jest.fn(),
};

const mockAuthInstance = {
  currentUser: { uid: 'user-123' } as { uid: string } | null,
};

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  getAuth: () => mockAuthInstance,
  signOut: mockSignOut,
}));

jest.mock('@react-native-firebase/functions', () => ({
  __esModule: true,
  getFunctions: () => ({}),
  httpsCallable: () => mockCallable,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    multiRemove: mockMultiRemove,
  },
}));

jest.mock('@/services/chat/StorageService', () => ({
  StorageService: mockStorageService,
}));

jest.mock('@/services/secureStorage', () => ({
  __esModule: true,
  default: mockSecureStorage,
}));

jest.mock('@/services/VerificationPersistenceService', () => ({
  __esModule: true,
  default: mockVerificationPersistence,
}));

jest.mock('@/services/settings/SettingsService', () => ({
  __esModule: true,
  default: mockSettingsService,
}));

let deleteAccount: typeof import('@/services/firebase/accountDeletion').deleteAccount;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  deleteAccount = require('@/services/firebase/accountDeletion').deleteAccount;
});

describe('deleteAccount service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureStorage.clearApiKeys.mockReset();
    mockVerificationPersistence.clearVerificationData.mockReset();
    mockSettingsService.clearSettings.mockReset();
    mockStorageService.clearAllSessions.mockReset();
    mockAuthInstance.currentUser = { uid: 'user-123' };
    mockCallable.mockResolvedValue({ data: { success: true } });
  });

  it('returns error when user not authenticated', async () => {
    mockAuthInstance.currentUser = null;

    const result = await deleteAccount();

    expect(result).toEqual({
      success: false,
      message: 'You need to be signed in to delete your account.',
    });
    expect(mockCallable).not.toHaveBeenCalled();
  });

  it('invokes callable, clears caches, and signs out on success', async () => {
    const result = await deleteAccount();

    expect(result).toEqual({ success: true });
    expect(mockCallable).toHaveBeenCalledWith();
    expect(mockStorageService.clearAllSessions).toHaveBeenCalledTimes(1);
    expect(mockSecureStorage.clearApiKeys).toHaveBeenCalledTimes(1);
    expect(mockVerificationPersistence.clearVerificationData).toHaveBeenCalledTimes(1);
    expect(mockSettingsService.clearSettings).toHaveBeenCalledTimes(1);
    expect(mockMultiRemove).toHaveBeenCalledWith(expect.arrayContaining(['@settings', '@subscription_status']));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('propagates server failure response', async () => {
    mockCallable.mockResolvedValue({ data: { success: false } });

    const result = await deleteAccount();

    expect(result).toEqual({
      success: false,
      message: 'Account deletion was not confirmed by the server.',
    });
    expect(mockStorageService.clearAllSessions).not.toHaveBeenCalled();
  });

  it('flags reauth requirement when backend demands it', async () => {
    mockCallable.mockRejectedValue({ code: 'failed-precondition', details: 'reauth-required' });

    const result = await deleteAccount();

    expect(result).toEqual({
      success: false,
      requiresRecentLogin: true,
      message: 'Please sign in again before deleting your account.',
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('maps permission-denied errors to auth message', async () => {
    mockCallable.mockRejectedValue({ code: 'permission-denied' });

    const result = await deleteAccount();

    expect(result).toEqual({
      success: false,
      message: 'You need to be signed in to delete your account.',
    });
  });

  it('returns generic failure details for other errors', async () => {
    mockCallable.mockRejectedValue(new Error('network down'));

    const result = await deleteAccount();

    expect(result).toEqual({
      success: false,
      message: 'network down',
    });
  });
});
