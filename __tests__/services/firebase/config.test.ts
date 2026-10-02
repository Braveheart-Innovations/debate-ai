const mockGetFirestore = jest.fn<object, unknown[]>();
const mockGetAuth = jest.fn<object, unknown[]>(() => ({ }));
const mockConnectAuthEmulator = jest.fn<void, unknown[]>();
const mockConnectFirestoreEmulator = jest.fn<void, unknown[]>();
const mockTerminate = jest.fn<Promise<void>, unknown[]>();
const mockClearIndexedDbPersistence = jest.fn<Promise<void>, unknown[]>();

// `__DEV__` is declared as a read-only global; tests flip it via Reflect.
const setDev = (value: boolean): void => {
  Reflect.set(globalThis, '__DEV__', value);
};

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
  const originalDev = __DEV__;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

  const loadInitialize = () => {
    let init: typeof import('@/services/firebase/config').initializeFirebase;
    jest.isolateModules(() => {
      init = (require('@/services/firebase/config') as typeof import('@/services/firebase/config')).initializeFirebase;
    });
    return init!;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    setDev(false);
    mockGetFirestore.mockReturnValue({});
    fetchSpy = jest.spyOn(global, 'fetch');
    global.__FIREBASE_EMULATORS_CONNECTED__ = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
    setDev(originalDev);
    consoleWarn.mockRestore();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  afterEach(() => {
    jest.useRealTimers();
    fetchSpy.mockRestore();
  });

  it('initializes without emulator when not in dev mode', async () => {
    const initializeFirebase = loadInitialize();
    await initializeFirebase();
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
    expect(mockConnectFirestoreEmulator).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalledWith('Firebase initialized successfully (Auth & Firestore only)');
  });

  it('connects to emulators when available', async () => {
    setDev(true);
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = '1';
    const initializeFirebase = loadInitialize();
    mockGetFirestore.mockReturnValue({});
    mockTerminate.mockResolvedValue(undefined);
    mockClearIndexedDbPersistence.mockResolvedValue(undefined);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await initializeFirebase();
    const warnMessages = consoleWarn.mock.calls.map(call => call[0]);
    expect(warnMessages).toContain('Firebase emulators detected, connecting...');
    expect(mockConnectAuthEmulator).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('127.0.0.1:9099'));
    expect(mockConnectFirestoreEmulator).toHaveBeenCalledWith({}, '127.0.0.1', 8080);
    expect(global.__FIREBASE_EMULATORS_CONNECTED__).toBe(true);
  });

  it('falls back when emulator unavailable', async () => {
    setDev(true);
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
    const initializeFirebase = loadInitialize();
    fetchSpy.mockImplementationOnce(() => Promise.reject(new Error('offline')));

    await initializeFirebase();
    expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
    const warnMessages = consoleWarn.mock.calls.map(call => call[0]);
    expect(warnMessages).toContain('Firebase emulators not available, using production Firebase');
  });
});
