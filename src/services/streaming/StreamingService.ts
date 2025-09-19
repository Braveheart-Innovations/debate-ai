import { BaseAdapter } from '../ai/base/BaseAdapter';
import { Message, MessageAttachment, AIProvider, PersonalityConfig, ModelParameters } from '../../types';
import { ResumptionContext, AIAdapterConfig } from '../ai/types/adapter.types';
import { AdapterFactory } from '../ai/factory/AdapterFactory';

// Chunk buffer configuration
interface BufferConfig {
  flushInterval: number;  // Time in ms before auto-flush
  maxBufferSize: number;  // Max characters before forced flush
  enabled: boolean;       // Whether buffering is enabled
}

// Stream configuration
interface StreamConfig {
  messageId: string;
  adapter?: BaseAdapter;  // Optional - for backward compatibility
  adapterConfig?: {  // New: configuration to create adapter dynamically
    provider: AIProvider;
    apiKey: string;
    model: string;
    personality?: PersonalityConfig;
    parameters?: ModelParameters;
    isDebateMode?: boolean;
  };
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
  private firstChunk = true;
  private startTime = Date.now();

  constructor(config: BufferConfig, onFlush: (content: string) => void) {
    this.config = config;
    this.onFlush = onFlush;
  }

  append(chunk: string): void {
    // Immediate first chunk for responsiveness
    if (this.firstChunk) {
      this.firstChunk = false;
      this.onFlush(chunk);
      return;
    }

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
    const content = this.buffer.join('');
    const totalSize = content.length;
    
    // Adaptive thresholds based on elapsed time
    const elapsed = Date.now() - this.startTime;
    const adaptiveSize = elapsed < 1000 ? 10 : this.config.maxBufferSize;
    
    // Flush at natural boundaries or size limit
    return totalSize >= adaptiveSize ||
           content.endsWith(' ') ||
           content.endsWith('\n') ||
           content.endsWith('.') ||
           content.endsWith(',');
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    // Adaptive timing - faster initially, slower later
    const elapsed = Date.now() - this.startTime;
    const adaptiveInterval = elapsed < 1000 ? 30 : this.config.flushInterval;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, adaptiveInterval);
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
    flushInterval: 60,  // Faster cadence for natural speed
    maxBufferSize: 30,  // Flush smaller chunks for snappier updates
    enabled: true,
  };

  /**
   * Start streaming a response from an AI adapter
   */
  async streamResponse(
    config: StreamConfig,
    onChunk: (chunk: string) => void,
    onComplete: (finalContent: string) => void,
    onError: (error: Error) => void,
    onEvent?: (event: unknown) => void
  ): Promise<void> {
    const { messageId, message, conversationHistory, resumptionContext, attachments, modelOverride } = config;
    
    // Create adapter dynamically based on model if config provided
    let adapter: BaseAdapter;
    if (config.adapterConfig) {
      const { provider, apiKey, model, personality, parameters, isDebateMode } = config.adapterConfig;
      const adapterConfig: AIAdapterConfig = {
        provider,
        apiKey,
        model,
        personality,
        parameters,
        isDebateMode
      };
      // Use the new createWithModel method to get the correct adapter
      adapter = AdapterFactory.createWithModel(adapterConfig, model);
    } else if (config.adapter) {
      // Backward compatibility: use provided adapter
      adapter = config.adapter;
    } else {
      const error = new Error('Either adapter or adapterConfig must be provided');
      console.error(`[StreamingService] Error:`, error.message);
      onError(error);
      return;
    }

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

    // Create buffer with flush callback (log UI flushes, not raw adapter yields)
    let flushCount = 0;
    const onBufferFlush = (content: string) => {
      flushCount++;
      if (process.env.NODE_ENV === 'development' && (flushCount <= 3 || flushCount % 50 === 0)) {
        console.warn(`[StreamingService] flush #${flushCount} (${content.length})`);
      }
      onChunk(content);
    };
    const buffer = new ChunkBuffer(bufferConfig, onBufferFlush);

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
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[StreamingService] Start stream ${messageId}`);
      }
      // Check if adapter has streamMessage method
      type StreamingAdapter = BaseAdapter & {
        streamMessage: (
          message: string,
          conversationHistory: Message[],
          attachments?: MessageAttachment[],
          resumptionContext?: ResumptionContext,
          modelOverride?: string,
          abortSignal?: AbortSignal,
          onEvent?: (event: unknown) => void
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
        modelOverride,
        abortController.signal,
        onEvent
      );

      // Stream generator created

      let fullContent = '';

      // Process stream chunks (adapter yields)
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

        // Buffer and flush chunk (UI flushes are logged in onBufferFlush)
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
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[StreamingService] Complete ${messageId}, chunks=${streamState.chunksReceived}, bytes=${streamState.bytesReceived}, flushes=${flushCount}`);
      }
      onComplete(fullContent);

    } catch (error) {
      // Handle errors
      
      streamState.isActive = false;
      buffer.clear();
      this.activeStreams.delete(messageId);

      if (error instanceof Error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[StreamingService] Error for ${messageId}:`, error.message);
        }
        onError(error);
      } else {
        const err = new Error(String(error));
        if (process.env.NODE_ENV === 'development') {
          console.error(`[StreamingService] Error for ${messageId}:`, err.message);
        }
        onError(err);
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
    return new Promise(resolve => setTimeout(resolve, 8 + Math.random() * 22));
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
