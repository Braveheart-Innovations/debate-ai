import { BaseAdapter } from '../ai/base/BaseAdapter';
import { Message, MessageAttachment } from '../../types';
import { ResumptionContext } from '../ai/types/adapter.types';

// Chunk buffer configuration
interface BufferConfig {
  flushInterval: number;  // Time in ms before auto-flush
  maxBufferSize: number;  // Max characters before forced flush
  enabled: boolean;       // Whether buffering is enabled
}

// Stream configuration
interface StreamConfig {
  messageId: string;
  adapter: BaseAdapter;
  message: string;
  conversationHistory: Message[];
  resumptionContext?: ResumptionContext;
  attachments?: MessageAttachment[];
  modelOverride?: string;
  bufferConfig?: BufferConfig;
  speed?: 'instant' | 'natural' | 'slow';
}

// Stream state tracking
interface StreamState {
  abortController: AbortController;
  startTime: number;
  chunksReceived: number;
  bytesReceived: number;
  isActive: boolean;
  buffer: ChunkBuffer;
}

// Chunk buffering class
class ChunkBuffer {
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly config: BufferConfig;
  private readonly onFlush: (content: string) => void;

  constructor(config: BufferConfig, onFlush: (content: string) => void) {
    this.config = config;
    this.onFlush = onFlush;
  }

  append(chunk: string): void {
    if (!this.config.enabled) {
      this.onFlush(chunk);
      return;
    }

    this.buffer.push(chunk);

    if (this.shouldFlush()) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private shouldFlush(): boolean {
    const totalSize = this.buffer.join('').length;
    return totalSize >= this.config.maxBufferSize;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const content = this.buffer.join('');
    this.buffer = [];
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.onFlush(content);
  }

  clear(): void {
    this.buffer = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// Main streaming service class
export class StreamingService {
  private activeStreams: Map<string, StreamState> = new Map();
  private readonly defaultBufferConfig: BufferConfig = {
    flushInterval: 100,  // 100ms default flush
    maxBufferSize: 50,   // 50 characters default
    enabled: true,
  };

  /**
   * Start streaming a response from an AI adapter
   */
  async streamResponse(
    config: StreamConfig,
    onChunk: (chunk: string) => void,
    onComplete: (finalContent: string) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    const { messageId, adapter, message, conversationHistory, resumptionContext, attachments, modelOverride } = config;

    // Debug logging removed for production

    // Check if stream already exists
    if (this.activeStreams.has(messageId)) {
      const error = new Error(`Stream already active for message ${messageId}`);
      console.error(`[StreamingService] Error:`, error.message);
      onError(error);
      return;
    }

    // Check if adapter supports streaming
    const capabilities = adapter.getCapabilities();
    if (!capabilities.streaming) {
      const error = new Error(`Adapter does not support streaming`);
      console.error(`[StreamingService] Error:`, error.message);
      onError(error);
      return;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();

    // Determine buffer configuration
    const bufferConfig = config.bufferConfig || this.getBufferConfigForSpeed(config.speed);

    // Create buffer with flush callback
    const buffer = new ChunkBuffer(bufferConfig, onChunk);

    // Create stream state
    const streamState: StreamState = {
      abortController,
      startTime: Date.now(),
      chunksReceived: 0,
      bytesReceived: 0,
      isActive: true,
      buffer,
    };

    // Store stream state
    this.activeStreams.set(messageId, streamState);

    try {
      // Check if adapter has streamMessage method
      type StreamingAdapter = BaseAdapter & {
        streamMessage: (
          message: string,
          conversationHistory: Message[],
          attachments?: MessageAttachment[],
          resumptionContext?: ResumptionContext,
          modelOverride?: string
        ) => AsyncGenerator<string, void, unknown>;
      };
      
      if (!('streamMessage' in adapter) || typeof (adapter as StreamingAdapter).streamMessage !== 'function') {
        const error = new Error('Adapter does not implement streamMessage method');
        console.error(`[StreamingService] Error:`, error.message);
        throw error;
      }

      // Calling adapter.streamMessage...

      // Start streaming
      const stream = (adapter as StreamingAdapter).streamMessage(
        message,
        conversationHistory,
        attachments,
        resumptionContext,
        modelOverride
      );

      // Stream generator created

      let fullContent = '';

      // Process stream chunks
      // Process stream chunks
      let iterationCount = 0;
      
      for await (const chunk of stream) {
        iterationCount++;
        
        // Check if stream was cancelled
        if (!streamState.isActive || abortController.signal.aborted) {
          // Stream cancelled
          break;
        }

        // Update metrics
        streamState.chunksReceived++;
        streamState.bytesReceived += chunk.length;
        fullContent += chunk;

        // Add artificial delay for natural speed
        if (config.speed === 'natural') {
          await this.naturalDelay();
        } else if (config.speed === 'slow') {
          await this.slowDelay();
        }

        // Buffer and flush chunk
        buffer.append(chunk);
      }
      
      // Stream iteration complete
      if (iterationCount === 0) {
        // No stream iterations occurred - streaming may have failed
      }

      // Flush any remaining buffered content
      buffer.flush();

      // Mark stream as complete
      streamState.isActive = false;
      this.activeStreams.delete(messageId);

      // Call completion callback
      onComplete(fullContent);

    } catch (error) {
      // Handle errors
      
      streamState.isActive = false;
      buffer.clear();
      this.activeStreams.delete(messageId);

      if (error instanceof Error) {
        onError(error);
      } else {
        onError(new Error(String(error)));
      }
    }
  }

  /**
   * Cancel a specific stream
   */
  cancelStream(messageId: string): boolean {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState) return false;

    streamState.isActive = false;
    streamState.abortController.abort();
    streamState.buffer.clear();
    this.activeStreams.delete(messageId);
    return true;
  }

  /**
   * Cancel all active streams
   */
  cancelAllStreams(): number {
    const count = this.activeStreams.size;
    this.activeStreams.forEach((_streamState, messageId) => {
      this.cancelStream(messageId);
    });
    return count;
  }

  /**
   * Get active stream count
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Check if a stream is active
   */
  isStreamActive(messageId: string): boolean {
    return this.activeStreams.has(messageId);
  }

  /**
   * Get stream metrics
   */
  getStreamMetrics(messageId: string): {
    duration: number;
    chunksReceived: number;
    bytesReceived: number;
    averageChunkSize: number;
  } | null {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState) return null;

    const duration = Date.now() - streamState.startTime;
    const averageChunkSize = streamState.chunksReceived > 0 
      ? streamState.bytesReceived / streamState.chunksReceived 
      : 0;

    return {
      duration,
      chunksReceived: streamState.chunksReceived,
      bytesReceived: streamState.bytesReceived,
      averageChunkSize,
    };
  }

  /**
   * Get buffer configuration based on speed preference
   */
  private getBufferConfigForSpeed(speed?: 'instant' | 'natural' | 'slow'): BufferConfig {
    switch (speed) {
      case 'instant':
        return {
          flushInterval: 0,
          maxBufferSize: 1,
          enabled: false,  // No buffering for instant
        };
      case 'slow':
        return {
          flushInterval: 200,
          maxBufferSize: 30,
          enabled: true,
        };
      case 'natural':
      default:
        return this.defaultBufferConfig;
    }
  }

  /**
   * Natural typing delay
   */
  private naturalDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));
  }

  /**
   * Slow typing delay
   */
  private slowDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.cancelAllStreams();
    this.activeStreams.clear();
  }
}

// Singleton instance
let streamingServiceInstance: StreamingService | null = null;

/**
 * Get or create the streaming service singleton
 */
export function getStreamingService(): StreamingService {
  if (!streamingServiceInstance) {
    streamingServiceInstance = new StreamingService();
  }
  return streamingServiceInstance;
}

/**
 * Reset the streaming service (mainly for testing)
 */
export function resetStreamingService(): void {
  if (streamingServiceInstance) {
    streamingServiceInstance.cleanup();
    streamingServiceInstance = null;
  }
}