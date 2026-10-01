import { BaseAdapter } from '../ai/base/BaseAdapter';
import { Message, MessageAttachment, AIProvider, PersonalityConfig, ModelParameters } from '../../types';
import { ResumptionContext, AIAdapterConfig, GroupChatContext } from '../ai/types/adapter.types';
import { AdapterFactory } from '../ai/factory/AdapterFactory';
import { ErrorService } from '@/services/errors/ErrorService';
import { AppError } from '@/errors/types/AppError';
import { ErrorCode } from '@/errors/codes/ErrorCodes';
import { resolveProviderModelId } from '@/config/modelConfigs';
import { withProviderRetry } from '@/services/retry/ProviderRetryService';

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
    identityId?: string;
    apiKey: string;
    model: string;
    personality?: PersonalityConfig;
    parameters?: Partial<ModelParameters>;
    isDebateMode?: boolean;
    webSearchEnabled?: boolean;
    groupChat?: GroupChatContext;
  };
  message: string;
  conversationHistory: Message[];
  resumptionContext?: ResumptionContext;
  attachments?: MessageAttachment[];
  modelOverride?: string;
  bufferConfig?: BufferConfig;
}

// Stream state tracking
interface StreamState {
  abortController: AbortController;
  startTime: number;
  chunksReceived: number;
  bytesReceived: number;
  isActive: boolean;
  stopReason?: StreamStopReason;
  buffer: ChunkBuffer;
}

export type StreamStopReason = 'cancelled' | 'interrupted';

export class StreamInterruptedError extends Error {
  reason: StreamStopReason;

  constructor(reason: StreamStopReason) {
    super(reason === 'interrupted'
      ? 'Stream interrupted by app lifecycle'
      : 'Stream cancelled');
    this.name = 'StreamInterruptedError';
    this.reason = reason;
  }
}

export const isStreamInterruptedError = (error: unknown): error is StreamInterruptedError =>
  error instanceof StreamInterruptedError
  || (
    Boolean(error)
    && typeof error === 'object'
    && (error as { name?: string }).name === 'StreamInterruptedError'
  );

// Chunk buffering class
class ChunkBuffer {
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly config: BufferConfig;
  private readonly onFlush: (content: string) => void;
  private firstChunk = true;

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
    flushInterval: 48,
    maxBufferSize: 120,
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
    const { messageId, message, conversationHistory, resumptionContext, attachments } = config;
    
    // Create adapter dynamically based on model if config provided
    let adapter: BaseAdapter;
    let resolvedModelOverride = config.modelOverride;
    if (config.adapterConfig) {
      const { provider, identityId, apiKey, model, personality, parameters, isDebateMode, webSearchEnabled, groupChat } = config.adapterConfig;
      const resolvedModel = resolveProviderModelId(provider, model) || model;
      resolvedModelOverride = resolveProviderModelId(
        provider,
        config.modelOverride || model
      ) || resolvedModel;
      const adapterConfig: AIAdapterConfig = {
        provider,
        identityId,
        apiKey,
        model: resolvedModel,
        personality,
        parameters,
        isDebateMode,
        webSearchEnabled,
        groupChat,
      };
      // Use the new createWithModel method to get the correct adapter
      adapter = AdapterFactory.createWithModel(adapterConfig, resolvedModel);
    } else if (config.adapter) {
      // Backward compatibility: use provided adapter
      adapter = config.adapter;
      if (config.modelOverride) {
        resolvedModelOverride = resolveProviderModelId(
          adapter.config.provider,
          config.modelOverride
        ) || config.modelOverride;
      }
    } else {
      const error = new AppError({
        code: ErrorCode.VALIDATION_REQUIRED,
        message: 'Either adapter or adapterConfig must be provided',
        userMessage: 'Streaming configuration error. Please try again.',
        context: { messageId },
      });
      ErrorService.handleSilent(error);
      onError(error);
      return;
    }

    // Debug logging removed for production

    // Check if stream already exists
    if (this.activeStreams.has(messageId)) {
      const error = new AppError({
        code: ErrorCode.UNKNOWN,
        message: `Stream already active for message ${messageId}`,
        userMessage: 'A response is already in progress.',
        context: { messageId },
      });
      ErrorService.handleSilent(error);
      onError(error);
      return;
    }

    // Check if adapter supports streaming
    const capabilities = adapter.getCapabilities();
    if (!capabilities.streaming) {
      const error = new AppError({
        code: ErrorCode.APP_FEATURE_NOT_AVAILABLE,
        message: 'Adapter does not support streaming',
        userMessage: 'Streaming is not available for this AI provider.',
        context: { messageId, provider: config.adapterConfig?.provider },
      });
      ErrorService.handleSilent(error);
      onError(error);
      return;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();

    // Determine buffer configuration
    const bufferConfig = config.bufferConfig || this.defaultBufferConfig;

    // Buffer display updates without slowing provider consumption.
    const onBufferFlush = (content: string) => {
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
        throw new AppError({
          code: ErrorCode.APP_ADAPTER_NOT_FOUND,
          message: 'Adapter does not implement streamMessage method',
          userMessage: 'This AI provider is not properly configured for streaming.',
          context: { messageId, provider: config.adapterConfig?.provider },
        });
      }

      let fullContent = '';
      const retryProvider = adapter.config.provider || config.adapterConfig?.provider;
      const retryModel = resolvedModelOverride || adapter.config.model || config.adapterConfig?.model;

      await withProviderRetry(
        async () => {
          // Start streaming
          const stream = (adapter as StreamingAdapter).streamMessage(
            message,
            conversationHistory,
            attachments,
            resumptionContext,
            resolvedModelOverride,
            abortController.signal,
            onEvent
          );

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

            // Buffer and flush chunk (UI flushes are logged in onBufferFlush)
            buffer.append(chunk);
          }

          // Stream iteration complete
          if (iterationCount === 0) {
            // No stream iterations occurred - streaming may have failed
          }
        },
        {
          provider: retryProvider,
          model: retryModel,
          operation: 'streaming_response',
          canRetry: () => (
            streamState.isActive
            && !abortController.signal.aborted
            && streamState.chunksReceived === 0
            && fullContent.length === 0
          ),
        }
      );

      if (!streamState.isActive || abortController.signal.aborted) {
        throw new StreamInterruptedError(streamState.stopReason || 'cancelled');
      }

      // Flush any remaining buffered content
      buffer.flush();

      // Mark stream as complete
      streamState.isActive = false;
      this.activeStreams.delete(messageId);

      // Call completion callback
      onComplete(fullContent);

    } catch (error) {
      // Handle errors through ErrorService (silent - no toast, let caller handle UI)
      streamState.isActive = false;
      buffer.clear();
      this.activeStreams.delete(messageId);

      if (isStreamInterruptedError(error)) {
        onError(error);
        return;
      }

      const appError = ErrorService.handleError(error, {
        feature: 'streaming',
        showToast: false,
        context: { messageId, provider: config.adapterConfig?.provider },
      });
      onError(appError);
    }
  }

  /**
   * Cancel a specific stream
   */
  cancelStream(messageId: string, reason: StreamStopReason = 'cancelled'): boolean {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState) return false;

    streamState.isActive = false;
    streamState.stopReason = reason;
    streamState.abortController.abort();
    streamState.buffer.clear();
    return true;
  }

  /**
   * Cancel all active streams
   */
  cancelAllStreams(reason: StreamStopReason = 'cancelled'): number {
    const count = this.activeStreams.size;
    this.activeStreams.forEach((_streamState, messageId) => {
      this.cancelStream(messageId, reason);
    });
    return count;
  }

  interruptAllStreams(): number {
    return this.cancelAllStreams('interrupted');
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
