const mockGetFirestore = jest.fn();
const mockGetAuth = jest.fn(() => ({ }));
const mockConnectAuthEmulator = jest.fn();
const mockConnectFirestoreEmulator = jest.fn();
const mockTerminate = jest.fn();
const mockClearIndexedDbPersistence = jest.fn();

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  connectAuthEmulator: (...args: unknown[]) => mockConnectAuthEmulator(...args),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: (...args: unknown[]) => mockGetFirestore(...args),
  connectFirestoreEmulator: (...args: unknown[]) => mockConnectFirestoreEmulator(...args),
  terminate: (...args: unknown[]) => mockTerminate(...args),
  clearIndexedDbPersistence: (...args: unknown[]) => mockClearIndexedDbPersistence(...args),
}));

describe('initializeFirebase', () => {
  const originalEnv = { ...process.env };
  const originalDev = (global as any).__DEV__;
  const originalFetch = global.fetch;
  const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  const loadInitialize = () => {
    let init: typeof import('@/services/firebase/config').initializeFirebase;
    jest.isolateModules(() => {
      init = require('@/services/firebase/config').initializeFirebase;
    });
    return init!;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    (global as any).__DEV__ = false;
    mockGetFirestore.mockReturnValue({});
    global.fetch = jest.fn();
    (global as any).__FIREBASE_EMULATORS_CONNECTED__ = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
    (global as any).__DEV__ = originalDev;
    global.fetch = originalFetch;
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes without emulator when not in dev mode', async () => {
    const initializeFirebase = loadInitialize();
    await initializeFirebase();
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
    expect(mockConnectFirestoreEmulator).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith('Firebase initialized successfully (Auth & Firestore only)');
  });

  it('connects to emulators when available', async () => {
    (global as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = '1';
    const initializeFirebase = loadInitialize();
    mockGetFirestore.mockReturnValue({});
    mockTerminate.mockResolvedValue(undefined);
    mockClearIndexedDbPersistence.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    await initializeFirebase();
    const warnMessages = consoleWarn.mock.calls.map(call => call[0]);
    expect(warnMessages).toContain('Firebase emulators detected, connecting...');
    expect(mockConnectAuthEmulator).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('127.0.0.1:9099'));
    expect(mockConnectFirestoreEmulator).toHaveBeenCalledWith({}, '127.0.0.1', 8080);
    expect(global.__FIREBASE_EMULATORS_CONNECTED__).toBe(true);
  });

  it('falls back when emulator unavailable', async () => {
    (global as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
    const initializeFirebase = loadInitialize();
    (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('offline')));

    await initializeFirebase();
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
    const warnMessages = consoleWarn.mock.calls.map(call => call[0]);
    expect(warnMessages).toContain('Firebase emulators not available, using production Firebase');
  });
});
