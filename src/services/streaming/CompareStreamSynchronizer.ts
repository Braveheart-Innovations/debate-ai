/**
 * CompareStreamSynchronizer
 *
 * Coordinates chunk delivery between two parallel AI streams in Compare mode
 * to provide a synchronized visual experience where both sides update together.
 */

export interface SyncConfig {
  /** How often to flush synchronized content (default: 80ms) */
  syncIntervalMs: number;
  /** Maximum buffer size before forced flush (default: 200 chars) */
  maxBufferSizeChars: number;
  /** Initial delay to wait for both streams to start (default: 150ms) */
  startDelayMs: number;
  /** Timeout to wait for second stream before releasing first (default: 500ms) */
  startTimeoutMs: number;
}

interface StreamState {
  buffer: string;
  totalContent: string;
  hasStarted: boolean;
  isComplete: boolean;
  error?: Error;
}

type FlushCallback = (content: string) => void;
type CompleteCallback = (finalContent: string) => void;
type ErrorCallback = (error: Error) => void;

const DEFAULT_CONFIG: SyncConfig = {
  syncIntervalMs: 80,
  maxBufferSizeChars: 200,
  startDelayMs: 150,
  startTimeoutMs: 500,
};

export class CompareStreamSynchronizer {
  private config: SyncConfig;
  private leftState: StreamState;
  private rightState: StreamState;

  private onLeftFlush: FlushCallback;
  private onRightFlush: FlushCallback;
  private onLeftComplete: CompleteCallback;
  private onRightComplete: CompleteCallback;
  private onLeftError?: ErrorCallback;
  private onRightError?: ErrorCallback;

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private hasStartedSyncing = false;
  private isCancelled = false;

  constructor(
    config: Partial<SyncConfig>,
    callbacks: {
      onLeftFlush: FlushCallback;
      onRightFlush: FlushCallback;
      onLeftComplete: CompleteCallback;
      onRightComplete: CompleteCallback;
      onLeftError?: ErrorCallback;
      onRightError?: ErrorCallback;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.onLeftFlush = callbacks.onLeftFlush;
    this.onRightFlush = callbacks.onRightFlush;
    this.onLeftComplete = callbacks.onLeftComplete;
    this.onRightComplete = callbacks.onRightComplete;
    this.onLeftError = callbacks.onLeftError;
    this.onRightError = callbacks.onRightError;

    this.leftState = this.createInitialState();
    this.rightState = this.createInitialState();
  }

  private createInitialState(): StreamState {
    return {
      buffer: '',
      totalContent: '',
      hasStarted: false,
      isComplete: false,
    };
  }

  /**
   * Append a chunk from the left stream
   */
  appendLeft(chunk: string): void {
    if (this.isCancelled) return;

    this.leftState.buffer += chunk;
    this.leftState.totalContent += chunk;

    if (!this.leftState.hasStarted) {
      this.leftState.hasStarted = true;
      this.checkBothStarted();
    }

    // Force flush if buffer exceeds max size
    if (this.leftState.buffer.length >= this.config.maxBufferSizeChars) {
      this.flushLeft();
    }
  }

  /**
   * Append a chunk from the right stream
   */
  appendRight(chunk: string): void {
    if (this.isCancelled) return;

    this.rightState.buffer += chunk;
    this.rightState.totalContent += chunk;

    if (!this.rightState.hasStarted) {
      this.rightState.hasStarted = true;
      this.checkBothStarted();
    }

    // Force flush if buffer exceeds max size
    if (this.rightState.buffer.length >= this.config.maxBufferSizeChars) {
      this.flushRight();
    }
  }

  /**
   * Mark left stream as complete
   */
  completeLeft(finalContent: string): void {
    if (this.isCancelled) return;

    this.leftState.isComplete = true;
    this.leftState.totalContent = finalContent;

    // Flush any remaining buffer
    this.flushLeft();

    // Notify completion
    this.onLeftComplete(finalContent);

    // Check if both are done
    this.checkBothComplete();
  }

  /**
   * Mark right stream as complete
   */
  completeRight(finalContent: string): void {
    if (this.isCancelled) return;

    this.rightState.isComplete = true;
    this.rightState.totalContent = finalContent;

    // Flush any remaining buffer
    this.flushRight();

    // Notify completion
    this.onRightComplete(finalContent);

    // Check if both are done
    this.checkBothComplete();
  }

  /**
   * Handle error on left stream
   */
  errorLeft(error: Error): void {
    if (this.isCancelled) return;

    this.leftState.isComplete = true;
    this.leftState.error = error;

    // Flush any buffer before error
    this.flushLeft();

    this.onLeftError?.(error);
    this.checkBothComplete();
  }

  /**
   * Handle error on right stream
   */
  errorRight(error: Error): void {
    if (this.isCancelled) return;

    this.rightState.isComplete = true;
    this.rightState.error = error;

    // Flush any buffer before error
    this.flushRight();

    this.onRightError?.(error);
    this.checkBothComplete();
  }

  /**
   * Cancel synchronization and clean up
   */
  cancel(): void {
    this.isCancelled = true;
    this.cleanup();
  }

  /**
   * Check if both streams have started and begin synchronized flushing
   */
  private checkBothStarted(): void {
    if (this.hasStartedSyncing) return;

    if (this.leftState.hasStarted && this.rightState.hasStarted) {
      // Both started, begin sync after initial delay
      this.startTimer = setTimeout(() => {
        this.startSynchronizedFlushing();
      }, this.config.startDelayMs);
    } else if (this.leftState.hasStarted || this.rightState.hasStarted) {
      // Only one started, set timeout to release it if other doesn't start
      if (!this.startTimer) {
        this.startTimer = setTimeout(() => {
          // Timeout reached, start syncing with whatever we have
          this.startSynchronizedFlushing();
        }, this.config.startTimeoutMs);
      }
    }
  }

  /**
   * Start the synchronized flushing interval
   */
  private startSynchronizedFlushing(): void {
    if (this.hasStartedSyncing || this.isCancelled) return;

    this.hasStartedSyncing = true;

    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }

    // Initial flush
    this.performSynchronizedFlush();

    // Set up interval for subsequent flushes
    this.syncTimer = setInterval(() => {
      this.performSynchronizedFlush();
    }, this.config.syncIntervalMs);
  }

  /**
   * Perform a synchronized flush of both buffers
   */
  private performSynchronizedFlush(): void {
    if (this.isCancelled) return;

    const leftHasContent = this.leftState.buffer.length > 0;
    const rightHasContent = this.rightState.buffer.length > 0;

    // If neither has content and not complete, skip
    if (!leftHasContent && !rightHasContent) {
      return;
    }

    // Determine flush amounts - try to balance visual progress
    // If both have content, flush proportionally
    // If only one has content and the other is not complete, flush smaller amount
    // If only one has content and the other is complete, flush all

    if (leftHasContent && rightHasContent) {
      // Both have content - flush together
      this.flushLeft();
      this.flushRight();
    } else if (leftHasContent && !rightHasContent) {
      if (this.rightState.isComplete) {
        // Right is done, flush all left
        this.flushLeft();
      } else {
        // Right might catch up, flush portion of left
        this.flushLeftPortion();
      }
    } else if (rightHasContent && !leftHasContent) {
      if (this.leftState.isComplete) {
        // Left is done, flush all right
        this.flushRight();
      } else {
        // Left might catch up, flush portion of right
        this.flushRightPortion();
      }
    }
  }

  /**
   * Flush all content from left buffer
   */
  private flushLeft(): void {
    if (this.leftState.buffer.length > 0) {
      const content = this.leftState.buffer;
      this.leftState.buffer = '';
      this.onLeftFlush(content);
    }
  }

  /**
   * Flush all content from right buffer
   */
  private flushRight(): void {
    if (this.rightState.buffer.length > 0) {
      const content = this.rightState.buffer;
      this.rightState.buffer = '';
      this.onRightFlush(content);
    }
  }

  /**
   * Flush a portion of left buffer (for pacing)
   */
  private flushLeftPortion(): void {
    if (this.leftState.buffer.length > 0) {
      // Flush up to half or at natural boundaries
      const content = this.leftState.buffer;
      const flushAmount = this.findFlushBoundary(content, Math.ceil(content.length / 2));
      const toFlush = content.slice(0, flushAmount);
      this.leftState.buffer = content.slice(flushAmount);
      if (toFlush.length > 0) {
        this.onLeftFlush(toFlush);
      }
    }
  }

  /**
   * Flush a portion of right buffer (for pacing)
   */
  private flushRightPortion(): void {
    if (this.rightState.buffer.length > 0) {
      // Flush up to half or at natural boundaries
      const content = this.rightState.buffer;
      const flushAmount = this.findFlushBoundary(content, Math.ceil(content.length / 2));
      const toFlush = content.slice(0, flushAmount);
      this.rightState.buffer = content.slice(flushAmount);
      if (toFlush.length > 0) {
        this.onRightFlush(toFlush);
      }
    }
  }

  /**
   * Find a natural boundary to flush at (word/sentence boundary)
   */
  private findFlushBoundary(content: string, targetLength: number): number {
    if (targetLength >= content.length) return content.length;

    // Look for natural boundaries near target
    const searchWindow = Math.min(20, Math.floor(targetLength / 2));
    const searchStart = Math.max(0, targetLength - searchWindow);
    const searchEnd = Math.min(content.length, targetLength + searchWindow);
    const searchArea = content.slice(searchStart, searchEnd);

    // Prefer sentence boundaries, then word boundaries
    const boundaries = ['. ', '! ', '? ', '\n', ', ', ' '];
    for (const boundary of boundaries) {
      const idx = searchArea.lastIndexOf(boundary);
      if (idx !== -1) {
        return searchStart + idx + boundary.length;
      }
    }

    // No natural boundary found, use target
    return targetLength;
  }

  /**
   * Check if both streams are complete and clean up
   */
  private checkBothComplete(): void {
    if (this.leftState.isComplete && this.rightState.isComplete) {
      this.cleanup();
    }
  }

  /**
   * Clean up timers and resources
   */
  private cleanup(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  /**
   * Get current sync state (for debugging)
   */
  getState(): {
    left: { hasStarted: boolean; isComplete: boolean; bufferSize: number };
    right: { hasStarted: boolean; isComplete: boolean; bufferSize: number };
    isSyncing: boolean;
  } {
    return {
      left: {
        hasStarted: this.leftState.hasStarted,
        isComplete: this.leftState.isComplete,
        bufferSize: this.leftState.buffer.length,
      },
      right: {
        hasStarted: this.rightState.hasStarted,
        isComplete: this.rightState.isComplete,
        bufferSize: this.rightState.buffer.length,
      },
      isSyncing: this.hasStartedSyncing,
    };
  }
}
