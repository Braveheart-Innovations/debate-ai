import { CrashlyticsService } from '@/services/crashlytics';

// Mock Crashlytics instance
const mockCrashlyticsInstance = {};

// Mock modular API functions
const mockGetCrashlytics = jest.fn(() => mockCrashlyticsInstance);
const mockSetCrashlyticsCollectionEnabled = jest.fn().mockResolvedValue(undefined);
const mockLog = jest.fn();
const mockRecordError = jest.fn();
const mockSetUserId = jest.fn();
const mockSetAttribute = jest.fn();
const mockSetAttributes = jest.fn();
const mockCrash = jest.fn();

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: () => mockGetCrashlytics(),
  setCrashlyticsCollectionEnabled: (instance: unknown, enabled: boolean) =>
    mockSetCrashlyticsCollectionEnabled(instance, enabled),
  log: (instance: unknown, message: string) => mockLog(instance, message),
  recordError: (instance: unknown, error: Error) => mockRecordError(instance, error),
  setUserId: (instance: unknown, userId: string) => mockSetUserId(instance, userId),
  setAttribute: (instance: unknown, key: string, value: string) =>
    mockSetAttribute(instance, key, value),
  setAttributes: (instance: unknown, attributes: Record<string, string>) =>
    mockSetAttributes(instance, attributes),
  crash: (instance: unknown) => mockCrash(instance),
}));

describe('CrashlyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the initialized state by accessing private property
    (CrashlyticsService as any).initialized = false;
  });

  describe('initialize', () => {
    it('enables Crashlytics collection', async () => {
      await CrashlyticsService.initialize();

      expect(mockSetCrashlyticsCollectionEnabled).toHaveBeenCalledWith(
        mockCrashlyticsInstance,
        true
      );
    });

    it('only initializes once', async () => {
      await CrashlyticsService.initialize();
      await CrashlyticsService.initialize();

      expect(mockSetCrashlyticsCollectionEnabled).toHaveBeenCalledTimes(1);
    });

    it('sets initialized to true after successful init', async () => {
      await CrashlyticsService.initialize();

      expect(CrashlyticsService.isInitialized()).toBe(true);
    });
  });

  describe('log', () => {
    it('logs a message to Crashlytics', async () => {
      await CrashlyticsService.initialize();
      CrashlyticsService.log('Test message');

      expect(mockLog).toHaveBeenCalledWith(mockCrashlyticsInstance, 'Test message');
    });

    it('does nothing when not initialized', () => {
      CrashlyticsService.log('Test message');

      expect(mockLog).not.toHaveBeenCalled();
    });
  });

  describe('recordError', () => {
    it('records an error to Crashlytics', async () => {
      await CrashlyticsService.initialize();
      const error = new Error('Test error');

      CrashlyticsService.recordError(error);

      expect(mockRecordError).toHaveBeenCalledWith(mockCrashlyticsInstance, error);
    });

    it('sets context attributes before recording', async () => {
      await CrashlyticsService.initialize();
      const error = new Error('Test error');
      const context = { screen: 'HomeScreen', action: 'submit' };

      CrashlyticsService.recordError(error, context);

      expect(mockSetAttribute).toHaveBeenCalledWith(
        mockCrashlyticsInstance,
        'screen',
        'HomeScreen'
      );
      expect(mockSetAttribute).toHaveBeenCalledWith(
        mockCrashlyticsInstance,
        'action',
        'submit'
      );
      expect(mockRecordError).toHaveBeenCalledWith(mockCrashlyticsInstance, error);
    });

    it('does nothing when not initialized', () => {
      const error = new Error('Test error');

      CrashlyticsService.recordError(error);

      expect(mockRecordError).not.toHaveBeenCalled();
    });
  });

  describe('setUserId', () => {
    it('sets user ID when provided', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setUserId('user123');

      expect(mockSetUserId).toHaveBeenCalledWith(mockCrashlyticsInstance, 'user123');
    });

    it('clears user ID when null is provided', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setUserId(null);

      expect(mockSetUserId).toHaveBeenCalledWith(mockCrashlyticsInstance, '');
    });
  });

  describe('setAttributes', () => {
    it('sets multiple attributes', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setAttributes({
        membershipStatus: 'premium',
        appVersion: '1.0.0',
      });

      expect(mockSetAttributes).toHaveBeenCalledWith(mockCrashlyticsInstance, {
        membershipStatus: 'premium',
        appVersion: '1.0.0',
      });
    });
  });

  describe('setAttribute', () => {
    it('sets a single attribute', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setAttribute('screen', 'DebateScreen');

      expect(mockSetAttribute).toHaveBeenCalledWith(
        mockCrashlyticsInstance,
        'screen',
        'DebateScreen'
      );
    });
  });
});
