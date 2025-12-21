import { Logger, LogLevel, LogEntry } from '@/services/logging';

// Mock CrashlyticsService
const mockRecordError = jest.fn();
const mockLog = jest.fn();
jest.mock('@/services/crashlytics', () => ({
  CrashlyticsService: {
    recordError: (...args: unknown[]) => mockRecordError(...args),
    log: (...args: unknown[]) => mockLog(...args),
  },
}));

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a fresh Logger instance for each test
    // Access the private constructor via getInstance pattern reset
    (Logger as any).instance = undefined;
    logger = Logger.getInstance();
    // Enable console output for testing
    logger.setConsoleOutput(false); // Disable to prevent noise in tests
  });

  describe('getInstance', () => {
    it('returns the same instance (singleton)', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('log levels', () => {
    beforeEach(() => {
      logger.setMinLevel(LogLevel.DEBUG);
    });

    it('logs debug messages', () => {
      logger.debug('Debug message');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.DEBUG);
      expect(buffer[0].message).toBe('Debug message');
    });

    it('logs info messages', () => {
      logger.info('Info message');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.INFO);
    });

    it('logs warn messages', () => {
      logger.warn('Warning message');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.WARN);
    });

    it('logs error messages', () => {
      logger.error('Error message');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe(LogLevel.ERROR);
    });
  });

  describe('log filtering', () => {
    it('filters logs below minimum level', () => {
      logger.setMinLevel(LogLevel.WARN);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(2);
      expect(buffer[0].level).toBe(LogLevel.WARN);
      expect(buffer[1].level).toBe(LogLevel.ERROR);
    });

    it('getBufferByLevel filters entries', () => {
      logger.setMinLevel(LogLevel.DEBUG);

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warning');
      logger.error('Error');

      const errors = logger.getBufferByLevel(LogLevel.ERROR);
      expect(errors).toHaveLength(1);
      expect(errors[0].level).toBe(LogLevel.ERROR);

      const warnsAndAbove = logger.getBufferByLevel(LogLevel.WARN);
      expect(warnsAndAbove).toHaveLength(2);
    });
  });

  describe('context', () => {
    it('includes context in log entries', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      logger.info('User action', { userId: '123', action: 'click' });

      const buffer = logger.getBuffer();
      expect(buffer[0].context).toEqual({ userId: '123', action: 'click' });
    });
  });

  describe('error logging', () => {
    it('includes error details in context', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      const error = new Error('Something broke');

      logger.error('Operation failed', error);

      const buffer = logger.getBuffer();
      expect(buffer[0].context).toMatchObject({
        errorName: 'Error',
        errorMessage: 'Something broke',
      });
    });

    it('sends errors to Crashlytics', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      const error = new Error('Crash error');

      logger.error('Crash happened', error, { screen: 'Home' });

      expect(mockRecordError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          logMessage: 'Crash happened',
          screen: 'Home',
        })
      );
    });
  });

  describe('buffer management', () => {
    it('limits buffer size', () => {
      logger.setMinLevel(LogLevel.DEBUG);

      // Log more than buffer size (default 500)
      for (let i = 0; i < 550; i++) {
        logger.debug(`Message ${i}`);
      }

      const buffer = logger.getBuffer();
      expect(buffer.length).toBeLessThanOrEqual(500);
      // Oldest messages should be dropped
      expect(buffer[buffer.length - 1].message).toBe('Message 549');
    });

    it('clears buffer', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      logger.debug('Message 1');
      logger.debug('Message 2');

      logger.clearBuffer();

      expect(logger.getBuffer()).toHaveLength(0);
    });
  });

  describe('listeners', () => {
    it('notifies listeners on new log entries', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      const listener = jest.fn();

      logger.addListener(listener);
      logger.info('Test message');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'Test message',
        })
      );
    });

    it('allows removing listeners', () => {
      logger.setMinLevel(LogLevel.DEBUG);
      const listener = jest.fn();

      const unsubscribe = logger.addListener(listener);
      unsubscribe();
      logger.info('Test message');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Crashlytics breadcrumbs', () => {
    it('logs INFO level messages as breadcrumbs', () => {
      logger.setMinLevel(LogLevel.DEBUG);

      logger.info('Navigation event');

      expect(mockLog).toHaveBeenCalledWith('[INFO] Navigation event');
    });

    it('does not log DEBUG level as breadcrumbs', () => {
      logger.setMinLevel(LogLevel.DEBUG);

      logger.debug('Debug event');

      expect(mockLog).not.toHaveBeenCalled();
    });

    it('logs WARN level as breadcrumbs', () => {
      logger.setMinLevel(LogLevel.DEBUG);

      logger.warn('Warning event');

      expect(mockLog).toHaveBeenCalledWith('[WARN] Warning event');
    });
  });
});
