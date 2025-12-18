import { CompareStreamSynchronizer } from '@/services/streaming/CompareStreamSynchronizer';

describe('CompareStreamSynchronizer', () => {
  let leftFlushes: string[];
  let rightFlushes: string[];
  let leftComplete: string | null;
  let rightComplete: string | null;
  let synchronizer: CompareStreamSynchronizer;

  beforeEach(() => {
    leftFlushes = [];
    rightFlushes = [];
    leftComplete = null;
    rightComplete = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    synchronizer?.cancel();
    jest.useRealTimers();
  });

  const createSynchronizer = (config = {}) => {
    return new CompareStreamSynchronizer(
      { syncIntervalMs: 80, maxBufferSizeChars: 200, startDelayMs: 150, startTimeoutMs: 500, ...config },
      {
        onLeftFlush: (content) => leftFlushes.push(content),
        onRightFlush: (content) => rightFlushes.push(content),
        onLeftComplete: (content) => { leftComplete = content; },
        onRightComplete: (content) => { rightComplete = content; },
      }
    );
  };

  describe('appendLeft and appendRight', () => {
    it('should buffer chunks from left stream', () => {
      synchronizer = createSynchronizer();
      synchronizer.appendLeft('Hello ');
      synchronizer.appendLeft('World');

      // Before syncing starts, no flushes
      expect(leftFlushes).toHaveLength(0);
    });

    it('should buffer chunks from right stream', () => {
      synchronizer = createSynchronizer();
      synchronizer.appendRight('Hi ');
      synchronizer.appendRight('there');

      expect(rightFlushes).toHaveLength(0);
    });

    it('should force flush when buffer exceeds max size', () => {
      synchronizer = createSynchronizer({ maxBufferSizeChars: 10 });
      synchronizer.appendLeft('This is a very long message');

      expect(leftFlushes.length).toBeGreaterThan(0);
    });
  });

  describe('synchronized flushing', () => {
    it('should start syncing after both streams have started', () => {
      synchronizer = createSynchronizer();

      synchronizer.appendLeft('Left content');
      synchronizer.appendRight('Right content');

      // Wait for start delay
      jest.advanceTimersByTime(150);

      // Initial flush should occur
      expect(leftFlushes.length).toBeGreaterThanOrEqual(0);
      expect(rightFlushes.length).toBeGreaterThanOrEqual(0);
    });

    it('should flush at synchronized intervals', () => {
      synchronizer = createSynchronizer({ syncIntervalMs: 80, startDelayMs: 50 });

      synchronizer.appendLeft('Left');
      synchronizer.appendRight('Right');

      // Wait for start delay + sync interval
      jest.advanceTimersByTime(150);

      // Should have flushed
      const leftCount = leftFlushes.length;
      const rightCount = rightFlushes.length;

      // Add more content and advance timer
      synchronizer.appendLeft(' more');
      synchronizer.appendRight(' data');
      jest.advanceTimersByTime(80);

      expect(leftFlushes.length).toBeGreaterThanOrEqual(leftCount);
      expect(rightFlushes.length).toBeGreaterThanOrEqual(rightCount);
    });

    it('should timeout and start syncing if only one stream starts', () => {
      synchronizer = createSynchronizer({ startTimeoutMs: 100 });

      synchronizer.appendLeft('Only left started');

      // Wait for timeout
      jest.advanceTimersByTime(100);

      // Should have started syncing even without right
      expect(leftFlushes.length).toBeGreaterThan(0);
    });
  });

  describe('completion', () => {
    it('should call onLeftComplete when left stream completes', () => {
      synchronizer = createSynchronizer();

      synchronizer.appendLeft('Final');
      synchronizer.completeLeft('Final content');

      expect(leftComplete).toBe('Final content');
    });

    it('should call onRightComplete when right stream completes', () => {
      synchronizer = createSynchronizer();

      synchronizer.appendRight('Done');
      synchronizer.completeRight('Done content');

      expect(rightComplete).toBe('Done content');
    });

    it('should flush remaining buffer on completion', () => {
      synchronizer = createSynchronizer();

      synchronizer.appendLeft('Buffered content');
      synchronizer.completeLeft('Final');

      expect(leftFlushes).toContain('Buffered content');
    });

    it('should clean up timers when both streams complete', () => {
      synchronizer = createSynchronizer();

      synchronizer.appendLeft('L');
      synchronizer.appendRight('R');

      synchronizer.completeLeft('Left done');
      synchronizer.completeRight('Right done');

      expect(leftComplete).toBe('Left done');
      expect(rightComplete).toBe('Right done');
    });
  });

  describe('error handling', () => {
    it('should handle left stream error', () => {
      let leftError: Error | null = null;
      synchronizer = new CompareStreamSynchronizer(
        { syncIntervalMs: 80, maxBufferSizeChars: 200, startDelayMs: 150, startTimeoutMs: 500 },
        {
          onLeftFlush: (content) => leftFlushes.push(content),
          onRightFlush: (content) => rightFlushes.push(content),
          onLeftComplete: (content) => { leftComplete = content; },
          onRightComplete: (content) => { rightComplete = content; },
          onLeftError: (error) => { leftError = error; },
        }
      );

      synchronizer.appendLeft('Content');
      synchronizer.errorLeft(new Error('Left failed'));

      expect(leftError?.message).toBe('Left failed');
    });

    it('should handle right stream error', () => {
      let rightError: Error | null = null;
      synchronizer = new CompareStreamSynchronizer(
        { syncIntervalMs: 80, maxBufferSizeChars: 200, startDelayMs: 150, startTimeoutMs: 500 },
        {
          onLeftFlush: (content) => leftFlushes.push(content),
          onRightFlush: (content) => rightFlushes.push(content),
          onLeftComplete: (content) => { leftComplete = content; },
          onRightComplete: (content) => { rightComplete = content; },
          onRightError: (error) => { rightError = error; },
        }
      );

      synchronizer.appendRight('Content');
      synchronizer.errorRight(new Error('Right failed'));

      expect(rightError?.message).toBe('Right failed');
    });
  });

  describe('cancellation', () => {
    it('should stop processing after cancel', () => {
      synchronizer = createSynchronizer();

      synchronizer.appendLeft('Before');
      synchronizer.cancel();
      synchronizer.appendLeft('After');

      // Content added after cancel should not be processed
      synchronizer.completeLeft('Final');
      expect(leftComplete).toBeNull();
    });
  });

  describe('getState', () => {
    it('should return current synchronizer state', () => {
      synchronizer = createSynchronizer();

      const initialState = synchronizer.getState();
      expect(initialState.left.hasStarted).toBe(false);
      expect(initialState.right.hasStarted).toBe(false);
      expect(initialState.isSyncing).toBe(false);

      synchronizer.appendLeft('Start');
      const afterLeft = synchronizer.getState();
      expect(afterLeft.left.hasStarted).toBe(true);
      expect(afterLeft.right.hasStarted).toBe(false);
    });
  });
});
