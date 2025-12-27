import {
  withRetry,
  sleep,
  shouldRetry,
  isRetryableError,
  createRetryableAction,
  calculateMaxWaitTime,
  DEFAULT_RETRY_CONFIG,
} from '../utils/RetryUtils';
import { AppError } from '../types/AppError';
import { ErrorCode } from '../codes/ErrorCodes';

describe('RetryUtils', () => {
  describe('sleep', () => {
    it('resolves after specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = withRetry(fn);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn, { maxAttempts: 3, jitter: false });

      // First attempt fails
      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      // Second attempt succeeds
      await Promise.resolve();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after max attempts exceeded', async () => {
      // Use a retryable error message (network error)
      const fn = jest.fn().mockRejectedValue(new Error('Network connection failed'));

      const resultPromise = withRetry(fn, { maxAttempts: 3, jitter: false });

      // Advance through all retries
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(10000);
      }

      await expect(resultPromise).rejects.toThrow('Network connection failed');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('calls onRetry callback on each retry', async () => {
      // Use retryable error messages (network/timeout errors)
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout 1'))
        .mockRejectedValueOnce(new Error('Network timeout 2'))
        .mockResolvedValueOnce('success');

      const onRetry = jest.fn();

      const resultPromise = withRetry(fn, { maxAttempts: 3, jitter: false }, onRetry);

      // Run all timers and pending promises
      await jest.runAllTimersAsync();

      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), expect.any(Number));
    });

    it('does not retry non-retryable errors', async () => {
      const error = new AppError({
        code: ErrorCode.API_UNAUTHORIZED,
        message: 'Invalid API key',
        retryable: false,
      });

      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('uses exponential backoff', async () => {
      // Use retryable error messages (network errors)
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');

      const onRetry = jest.fn();

      const resultPromise = withRetry(
        fn,
        { maxAttempts: 3, baseDelayMs: 1000, backoffMultiplier: 2, jitter: false },
        onRetry
      );

      // Run all timers and promises
      await jest.runAllTimersAsync();
      await resultPromise;

      // Check that delays increase exponentially
      expect(onRetry.mock.calls[0][2]).toBe(1000); // First delay
      expect(onRetry.mock.calls[1][2]).toBe(2000); // Second delay
    });

    it('respects maxDelayMs', async () => {
      // Use retryable error messages (network errors)
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');

      const onRetry = jest.fn();

      const resultPromise = withRetry(
        fn,
        {
          maxAttempts: 3,
          baseDelayMs: 5000,
          maxDelayMs: 3000,
          backoffMultiplier: 2,
          jitter: false,
        },
        onRetry
      );

      // Run all timers and promises
      await jest.runAllTimersAsync();
      await resultPromise;

      // All delays should be capped at maxDelayMs
      expect(onRetry.mock.calls[0][2]).toBe(3000);
      expect(onRetry.mock.calls[1][2]).toBe(3000);
    });
  });

  describe('shouldRetry', () => {
    it('returns true for retryable AppError', () => {
      const error = new AppError({
        code: ErrorCode.NETWORK_TIMEOUT,
        message: 'Timeout',
        retryable: true,
      });

      expect(shouldRetry(error)).toBe(true);
    });

    it('returns false for non-retryable AppError', () => {
      const error = new AppError({
        code: ErrorCode.API_UNAUTHORIZED,
        message: 'Unauthorized',
        retryable: false,
      });

      expect(shouldRetry(error)).toBe(false);
    });

    it('checks against allowed codes list', () => {
      const error = new AppError({
        code: ErrorCode.API_RATE_LIMITED,
        message: 'Rate limited',
        retryable: false, // Even if false, should check allowedCodes
      });

      expect(shouldRetry(error, [ErrorCode.API_RATE_LIMITED])).toBe(true);
      expect(shouldRetry(error, [ErrorCode.NETWORK_TIMEOUT])).toBe(false);
    });

    it('returns true for retryable standard errors', () => {
      expect(shouldRetry(new Error('Request timeout'))).toBe(true);
      expect(shouldRetry(new Error('Network error'))).toBe(true);
      expect(shouldRetry(new Error('Rate limit exceeded'))).toBe(true);
      expect(shouldRetry(new Error('Service overloaded'))).toBe(true);
      expect(shouldRetry(new Error('Error 503: Service unavailable'))).toBe(true);
    });

    it('returns false for non-retryable standard errors', () => {
      expect(shouldRetry(new Error('Invalid API key'))).toBe(false);
      expect(shouldRetry(new Error('Unauthorized access'))).toBe(false);
      expect(shouldRetry(new Error('Forbidden'))).toBe(false);
      expect(shouldRetry(new Error('Not found'))).toBe(false);
    });

    it('returns false for unknown error types', () => {
      expect(shouldRetry('string error')).toBe(false);
      expect(shouldRetry(123)).toBe(false);
      expect(shouldRetry(null)).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('identifies timeout errors as retryable', () => {
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('identifies network errors as retryable', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('Connection failed'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('identifies rate limit errors as retryable', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Too many requests'))).toBe(true);
      expect(isRetryableError(new Error('Error 429'))).toBe(true);
    });

    it('identifies server errors as retryable', () => {
      expect(isRetryableError(new Error('Error 502'))).toBe(true);
      expect(isRetryableError(new Error('Error 503'))).toBe(true);
      expect(isRetryableError(new Error('Error 504'))).toBe(true);
      expect(isRetryableError(new Error('Error 529'))).toBe(true);
      expect(isRetryableError(new Error('Service temporarily unavailable'))).toBe(true);
    });

    it('identifies auth errors as non-retryable', () => {
      expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
      expect(isRetryableError(new Error('Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('Forbidden'))).toBe(false);
      expect(isRetryableError(new Error('Error 401'))).toBe(false);
      expect(isRetryableError(new Error('Error 403'))).toBe(false);
      expect(isRetryableError(new Error('Permission denied'))).toBe(false);
    });

    it('identifies not found errors as non-retryable', () => {
      expect(isRetryableError(new Error('Not found'))).toBe(false);
      expect(isRetryableError(new Error('Error 404'))).toBe(false);
    });

    it('returns false for generic errors', () => {
      expect(isRetryableError(new Error('Something went wrong'))).toBe(false);
      expect(isRetryableError(new Error('Unknown error'))).toBe(false);
    });
  });

  describe('createRetryableAction', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates a function that retries on failure', async () => {
      const action = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('success');

      const retryableAction = createRetryableAction(action, { jitter: false });

      const resultPromise = retryableAction('arg1', 'arg2');

      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(action).toHaveBeenCalledWith('arg1', 'arg2');
      expect(action).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateMaxWaitTime', () => {
    it('calculates total wait time for default config', () => {
      const waitTime = calculateMaxWaitTime();

      // Default: 3 attempts, base 1000ms, multiplier 2
      // Wait times: 1000 (after 1st fail), 2000 (after 2nd fail) = 3000ms
      // With 25% jitter: 3000 * 1.25 = 3750ms
      expect(waitTime).toBeCloseTo(3750, 0);
    });

    it('calculates total wait time for custom config', () => {
      const waitTime = calculateMaxWaitTime({
        maxAttempts: 4,
        baseDelayMs: 500,
        backoffMultiplier: 2,
        jitter: false,
      });

      // Wait times: 500 + 1000 + 2000 = 3500ms
      expect(waitTime).toBe(3500);
    });

    it('respects maxDelayMs in calculation', () => {
      const waitTime = calculateMaxWaitTime({
        maxAttempts: 5,
        baseDelayMs: 5000,
        maxDelayMs: 3000,
        backoffMultiplier: 2,
        jitter: false,
      });

      // All delays capped at 3000: 3000 * 4 = 12000ms
      expect(waitTime).toBe(12000);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(10000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
    });
  });
});
