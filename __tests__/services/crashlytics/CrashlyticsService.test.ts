import { CrashlyticsService } from '@/services/crashlytics';

// Mock @react-native-firebase/crashlytics
const mockCrashlytics = {
  setCrashlyticsCollectionEnabled: jest.fn().mockResolvedValue(undefined),
  log: jest.fn(),
  recordError: jest.fn(),
  setUserId: jest.fn(),
  setAttribute: jest.fn(),
  setAttributes: jest.fn(),
  crash: jest.fn(),
};

jest.mock('@react-native-firebase/crashlytics', () => () => mockCrashlytics);

describe('CrashlyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the initialized state by accessing private property
    (CrashlyticsService as any).initialized = false;
  });

  describe('initialize', () => {
    it('enables Crashlytics collection', async () => {
      await CrashlyticsService.initialize();

      expect(mockCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(true);
    });

    it('only initializes once', async () => {
      await CrashlyticsService.initialize();
      await CrashlyticsService.initialize();

      expect(mockCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledTimes(1);
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

      expect(mockCrashlytics.log).toHaveBeenCalledWith('Test message');
    });

    it('does nothing when not initialized', () => {
      CrashlyticsService.log('Test message');

      expect(mockCrashlytics.log).not.toHaveBeenCalled();
    });
  });

  describe('recordError', () => {
    it('records an error to Crashlytics', async () => {
      await CrashlyticsService.initialize();
      const error = new Error('Test error');

      CrashlyticsService.recordError(error);

      expect(mockCrashlytics.recordError).toHaveBeenCalledWith(error);
    });

    it('sets context attributes before recording', async () => {
      await CrashlyticsService.initialize();
      const error = new Error('Test error');
      const context = { screen: 'HomeScreen', action: 'submit' };

      CrashlyticsService.recordError(error, context);

      expect(mockCrashlytics.setAttribute).toHaveBeenCalledWith('screen', 'HomeScreen');
      expect(mockCrashlytics.setAttribute).toHaveBeenCalledWith('action', 'submit');
      expect(mockCrashlytics.recordError).toHaveBeenCalledWith(error);
    });

    it('does nothing when not initialized', () => {
      const error = new Error('Test error');

      CrashlyticsService.recordError(error);

      expect(mockCrashlytics.recordError).not.toHaveBeenCalled();
    });
  });

  describe('setUserId', () => {
    it('sets user ID when provided', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setUserId('user123');

      expect(mockCrashlytics.setUserId).toHaveBeenCalledWith('user123');
    });

    it('clears user ID when null is provided', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setUserId(null);

      expect(mockCrashlytics.setUserId).toHaveBeenCalledWith('');
    });
  });

  describe('setAttributes', () => {
    it('sets multiple attributes', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setAttributes({
        membershipStatus: 'premium',
        appVersion: '1.0.0',
      });

      expect(mockCrashlytics.setAttributes).toHaveBeenCalledWith({
        membershipStatus: 'premium',
        appVersion: '1.0.0',
      });
    });
  });

  describe('setAttribute', () => {
    it('sets a single attribute', async () => {
      await CrashlyticsService.initialize();

      CrashlyticsService.setAttribute('screen', 'DebateScreen');

      expect(mockCrashlytics.setAttribute).toHaveBeenCalledWith('screen', 'DebateScreen');
    });
  });
});
