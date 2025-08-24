# Message Streaming Implementation Guide for Symposium AI

## Executive Summary

This document provides a comprehensive guide for implementing real-time message streaming in the Symposium AI React Native application. Message streaming enhances user experience by displaying AI responses character-by-character as they're generated, reducing perceived latency and providing immediate feedback. This implementation supports multiple AI providers (Claude, ChatGPT, Gemini) with graceful fallbacks for providers without streaming capabilities.

**Key Benefits:**
- Reduced perceived response time (users see content immediately)
- Better user engagement through real-time feedback
- Improved memory efficiency through chunked processing
- Enhanced error recovery with partial message preservation
- Provider-agnostic implementation with automatic fallback

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ MessageBubble│  │  Streaming   │  │    Chat      │      │
│  │  Component   │◄─┤  Indicator   │◄─┤   Screen     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ▲                ▲                   ▲              │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
┌─────────┼────────────────┼───────────────────┼──────────────┐
│         │          Hooks Layer               │              │
│         │                │                   │              │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌────────▼────────┐    │
│  │useStreaming │  │useAIResponses│  │useStreamingChat │    │
│  │   Message   │  │  (modified)  │  │                 │    │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘    │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
┌─────────┼────────────────┼───────────────────┼──────────────┐
│         │          Redux Store               │              │
│         │                │                   │              │
│  ┌──────▼──────────────────────────────────▼─┴────────┐    │
│  │            streamingSlice + chatSlice               │    │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │    │
│  │  │   State    │  │  Actions   │  │   Reducers   │  │    │
│  │  │Management  │  │  Creators  │  │              │  │    │
│  │  └────────────┘  └────────────┘  └──────────────┘  │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│                  Service Layer                               │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │               StreamingService                       │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│  │  │  Buffer  │  │  Error   │  │    Connection    │  │    │
│  │  │  Manager │  │ Recovery │  │    Management    │  │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│               Provider Adapters                              │
│                         │                                    │
│  ┌──────────┐  ┌────────▼────┐  ┌──────────────────────┐   │
│  │  Claude  │  │   ChatGPT   │  │      Gemini          │   │
│  │  Adapter │  │   Adapter   │  │      Adapter         │   │
│  └──────────┘  └─────────────┘  └──────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
User Input → Chat Screen → Redux Action → StreamingService
                                              │
                                              ▼
                                     Provider Adapter
                                              │
                                              ▼
                                      Stream API Call
                                              │
                                              ▼
                                     Chunk Reception
                                              │
                                              ▼
                                    Buffer Management
                                              │
                                              ▼
                                     Redux State Update
                                              │
                                              ▼
                                      Hook Notification
                                              │
                                              ▼
                                    Component Re-render
                                              │
                                              ▼
                                       UI Update
```

## Detailed Implementation Guide

### 1. Redux State Management (streamingSlice.ts)

```typescript
// src/store/slices/streamingSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface StreamingMessage {
  id: string;
  conversationId: string;
  content: string;
  isComplete: boolean;
  chunks: string[];
  timestamp: number;
  provider: string;
  model?: string;
  error?: StreamingError;
  metadata: StreamingMetadata;
}

export interface StreamingError {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: number;
  attemptCount: number;
}

export interface StreamingMetadata {
  startTime: number;
  endTime?: number;
  bytesReceived: number;
  chunksProcessed: number;
  averageChunkSize: number;
  streamingRate: number; // chars per second
}

export interface StreamingState {
  activeStreams: Map<string, StreamingMessage>;
  streamBuffer: Map<string, string[]>;
  connectionStatus: Map<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
  performanceMetrics: StreamingPerformanceMetrics;
  settings: StreamingSettings;
}

export interface StreamingPerformanceMetrics {
  totalStreamsStarted: number;
  totalStreamsCompleted: number;
  averageStreamDuration: number;
  totalBytesReceived: number;
  errorRate: number;
  recoverySuccessRate: number;
}

export interface StreamingSettings {
  enabled: boolean;
  chunkSize: number;
  bufferSize: number;
  flushInterval: number;
  maxRetries: number;
  timeoutMs: number;
  enableMetrics: boolean;
  enableDebugLogging: boolean;
}

// Initial state
const initialState: StreamingState = {
  activeStreams: new Map(),
  streamBuffer: new Map(),
  connectionStatus: new Map(),
  performanceMetrics: {
    totalStreamsStarted: 0,
    totalStreamsCompleted: 0,
    averageStreamDuration: 0,
    totalBytesReceived: 0,
    errorRate: 0,
    recoverySuccessRate: 0,
  },
  settings: {
    enabled: true,
    chunkSize: 20, // characters
    bufferSize: 100, // chunks
    flushInterval: 100, // ms
    maxRetries: 3,
    timeoutMs: 30000,
    enableMetrics: true,
    enableDebugLogging: false,
  },
};

// Slice definition
const streamingSlice = createSlice({
  name: 'streaming',
  initialState,
  reducers: {
    // Stream lifecycle
    startStream: (state, action: PayloadAction<{
      messageId: string;
      conversationId: string;
      provider: string;
      model?: string;
    }>) => {
      const { messageId, conversationId, provider, model } = action.payload;
      
      const newStream: StreamingMessage = {
        id: messageId,
        conversationId,
        content: '',
        isComplete: false,
        chunks: [],
        timestamp: Date.now(),
        provider,
        model,
        metadata: {
          startTime: Date.now(),
          bytesReceived: 0,
          chunksProcessed: 0,
          averageChunkSize: 0,
          streamingRate: 0,
        },
      };
      
      state.activeStreams.set(messageId, newStream);
      state.streamBuffer.set(messageId, []);
      state.connectionStatus.set(messageId, 'connecting');
      
      if (state.settings.enableMetrics) {
        state.performanceMetrics.totalStreamsStarted++;
      }
    },
    
    // Chunk processing
    appendChunk: (state, action: PayloadAction<{
      messageId: string;
      chunk: string;
      timestamp?: number;
    }>) => {
      const { messageId, chunk, timestamp = Date.now() } = action.payload;
      const stream = state.activeStreams.get(messageId);
      
      if (!stream) return;
      
      // Update stream content
      stream.chunks.push(chunk);
      stream.content += chunk;
      
      // Update metadata
      stream.metadata.bytesReceived += chunk.length;
      stream.metadata.chunksProcessed++;
      stream.metadata.averageChunkSize = 
        stream.metadata.bytesReceived / stream.metadata.chunksProcessed;
      
      // Calculate streaming rate
      const elapsedSeconds = (timestamp - stream.metadata.startTime) / 1000;
      stream.metadata.streamingRate = stream.metadata.bytesReceived / elapsedSeconds;
      
      // Update buffer
      const buffer = state.streamBuffer.get(messageId) || [];
      buffer.push(chunk);
      
      // Trim buffer if exceeds max size
      if (buffer.length > state.settings.bufferSize) {
        buffer.shift();
      }
      
      state.streamBuffer.set(messageId, buffer);
      state.connectionStatus.set(messageId, 'connected');
    },
    
    // Stream completion
    completeStream: (state, action: PayloadAction<{
      messageId: string;
      finalContent?: string;
    }>) => {
      const { messageId, finalContent } = action.payload;
      const stream = state.activeStreams.get(messageId);
      
      if (!stream) return;
      
      stream.isComplete = true;
      if (finalContent !== undefined) {
        stream.content = finalContent;
      }
      
      stream.metadata.endTime = Date.now();
      
      // Update metrics
      if (state.settings.enableMetrics) {
        state.performanceMetrics.totalStreamsCompleted++;
        
        const duration = (stream.metadata.endTime - stream.metadata.startTime) / 1000;
        const currentAvg = state.performanceMetrics.averageStreamDuration;
        const totalCompleted = state.performanceMetrics.totalStreamsCompleted;
        
        state.performanceMetrics.averageStreamDuration = 
          (currentAvg * (totalCompleted - 1) + duration) / totalCompleted;
        
        state.performanceMetrics.totalBytesReceived += stream.metadata.bytesReceived;
      }
      
      // Clean up buffer
      state.streamBuffer.delete(messageId);
      state.connectionStatus.set(messageId, 'disconnected');
    },
    
    // Error handling
    setStreamError: (state, action: PayloadAction<{
      messageId: string;
      error: StreamingError;
    }>) => {
      const { messageId, error } = action.payload;
      const stream = state.activeStreams.get(messageId);
      
      if (!stream) return;
      
      stream.error = error;
      state.connectionStatus.set(messageId, 'error');
      
      // Update error metrics
      if (state.settings.enableMetrics) {
        const totalAttempts = state.performanceMetrics.totalStreamsStarted;
        const currentErrorRate = state.performanceMetrics.errorRate;
        state.performanceMetrics.errorRate = 
          (currentErrorRate * (totalAttempts - 1) + 1) / totalAttempts;
      }
    },
    
    // Recovery
    retryStream: (state, action: PayloadAction<{
      messageId: string;
      fromChunkIndex?: number;
    }>) => {
      const { messageId, fromChunkIndex = 0 } = action.payload;
      const stream = state.activeStreams.get(messageId);
      
      if (!stream) return;
      
      // Reset stream to retry point
      if (fromChunkIndex < stream.chunks.length) {
        stream.chunks = stream.chunks.slice(0, fromChunkIndex);
        stream.content = stream.chunks.join('');
      }
      
      stream.error = undefined;
      state.connectionStatus.set(messageId, 'connecting');
      
      if (stream.error) {
        stream.error.attemptCount++;
      }
    },
    
    // Buffer management
    flushBuffer: (state, action: PayloadAction<{ messageId: string }>) => {
      const { messageId } = action.payload;
      const buffer = state.streamBuffer.get(messageId);
      const stream = state.activeStreams.get(messageId);
      
      if (!buffer || !stream || buffer.length === 0) return;
      
      // Append all buffered chunks at once
      const flushedContent = buffer.join('');
      stream.content += flushedContent;
      stream.chunks.push(...buffer);
      
      // Update metadata
      stream.metadata.bytesReceived += flushedContent.length;
      stream.metadata.chunksProcessed += buffer.length;
      
      // Clear buffer
      state.streamBuffer.set(messageId, []);
    },
    
    // Settings management
    updateSettings: (state, action: PayloadAction<Partial<StreamingSettings>>) => {
      state.settings = { ...state.settings, ...action.payload };
    },
    
    // Cleanup
    cleanupStream: (state, action: PayloadAction<{ messageId: string }>) => {
      const { messageId } = action.payload;
      state.activeStreams.delete(messageId);
      state.streamBuffer.delete(messageId);
      state.connectionStatus.delete(messageId);
    },
    
    resetMetrics: (state) => {
      state.performanceMetrics = {
        totalStreamsStarted: 0,
        totalStreamsCompleted: 0,
        averageStreamDuration: 0,
        totalBytesReceived: 0,
        errorRate: 0,
        recoverySuccessRate: 0,
      };
    },
  },
});

// Export actions
export const {
  startStream,
  appendChunk,
  completeStream,
  setStreamError,
  retryStream,
  flushBuffer,
  updateSettings,
  cleanupStream,
  resetMetrics,
} = streamingSlice.actions;

// Selectors
export const selectActiveStream = (state: RootState, messageId: string) =>
  state.streaming.activeStreams.get(messageId);

export const selectStreamBuffer = (state: RootState, messageId: string) =>
  state.streaming.streamBuffer.get(messageId) || [];

export const selectConnectionStatus = (state: RootState, messageId: string) =>
  state.streaming.connectionStatus.get(messageId) || 'disconnected';

export const selectStreamingSettings = (state: RootState) =>
  state.streaming.settings;

export const selectPerformanceMetrics = (state: RootState) =>
  state.streaming.performanceMetrics;

export const selectIsStreaming = (state: RootState, messageId: string) => {
  const stream = state.streaming.activeStreams.get(messageId);
  return stream ? !stream.isComplete : false;
};

export default streamingSlice.reducer;
```

### 2. StreamingService Class

```typescript
// src/services/StreamingService.ts
import { store } from '../store';
import {
  startStream,
  appendChunk,
  completeStream,
  setStreamError,
  retryStream,
  flushBuffer,
  cleanupStream,
} from '../store/slices/streamingSlice';
import { AIAdapter } from '../types/ai';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StreamingOptions {
  messageId: string;
  conversationId: string;
  provider: string;
  model?: string;
  prompt: string;
  apiKey: string;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullMessage: string) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export class StreamingService {
  private static instance: StreamingService;
  private activeConnections: Map<string, AbortController> = new Map();
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  
  private constructor() {
    // Initialize service
    this.setupMemoryPressureListener();
    this.setupNetworkListener();
  }
  
  public static getInstance(): StreamingService {
    if (!StreamingService.instance) {
      StreamingService.instance = new StreamingService();
    }
    return StreamingService.instance;
  }
  
  /**
   * Start a streaming session with an AI provider
   */
  public async startStreaming(
    adapter: AIAdapter,
    options: StreamingOptions
  ): Promise<void> {
    const {
      messageId,
      conversationId,
      provider,
      model,
      prompt,
      apiKey,
      onChunk,
      onComplete,
      onError,
      signal,
    } = options;
    
    try {
      // Initialize stream in Redux
      store.dispatch(startStream({
        messageId,
        conversationId,
        provider,
        model,
      }));
      
      // Create abort controller
      const abortController = new AbortController();
      this.activeConnections.set(messageId, abortController);
      
      // Combine signals if provided
      if (signal) {
        signal.addEventListener('abort', () => {
          abortController.abort();
        });
      }
      
      // Setup flush timer
      this.setupFlushTimer(messageId);
      
      // Check if adapter supports streaming
      if (!adapter.supportsStreaming) {
        // Fallback to non-streaming mode
        await this.fallbackToNonStreaming(adapter, options);
        return;
      }
      
      // Start streaming
      const stream = await adapter.streamMessage(prompt, {
        apiKey,
        model,
        signal: abortController.signal,
      });
      
      // Process stream
      await this.processStream(stream, messageId, {
        onChunk,
        onComplete,
        onError,
      });
      
    } catch (error) {
      await this.handleStreamError(messageId, error as Error, options);
    }
  }
  
  /**
   * Process incoming stream chunks
   */
  private async processStream(
    stream: ReadableStream<string> | AsyncIterator<string>,
    messageId: string,
    callbacks: {
      onChunk?: (chunk: string) => void;
      onComplete?: (fullMessage: string) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<void> {
    const { onChunk, onComplete, onError } = callbacks;
    
    try {
      let fullMessage = '';
      
      // Handle ReadableStream
      if ('getReader' in stream) {
        const reader = stream.getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          // Process chunk
          if (value) {
            fullMessage += value;
            
            // Dispatch to Redux
            store.dispatch(appendChunk({
              messageId,
              chunk: value,
            }));
            
            // Call callback
            if (onChunk) {
              onChunk(value);
            }
          }
        }
      }
      // Handle AsyncIterator
      else {
        for await (const chunk of stream) {
          fullMessage += chunk;
          
          // Dispatch to Redux
          store.dispatch(appendChunk({
            messageId,
            chunk,
          }));
          
          // Call callback
          if (onChunk) {
            onChunk(chunk);
          }
        }
      }
      
      // Complete stream
      store.dispatch(completeStream({
        messageId,
        finalContent: fullMessage,
      }));
      
      // Clear timers and connections
      this.cleanup(messageId);
      
      // Call completion callback
      if (onComplete) {
        onComplete(fullMessage);
      }
      
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Fallback for providers without streaming support
   */
  private async fallbackToNonStreaming(
    adapter: AIAdapter,
    options: StreamingOptions
  ): Promise<void> {
    const { messageId, prompt, apiKey, model, onComplete, onError } = options;
    
    try {
      // Get full response
      const response = await adapter.sendMessage(prompt, {
        apiKey,
        model,
      });
      
      // Simulate streaming by chunking the response
      await this.simulateStreaming(messageId, response, {
        chunkSize: 20,
        delayMs: 50,
        onComplete,
      });
      
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Simulate streaming for non-streaming providers
   */
  private async simulateStreaming(
    messageId: string,
    content: string,
    options: {
      chunkSize: number;
      delayMs: number;
      onComplete?: (fullMessage: string) => void;
    }
  ): Promise<void> {
    const { chunkSize, delayMs, onComplete } = options;
    
    // Split content into chunks
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    
    // Stream chunks with delay
    for (const chunk of chunks) {
      store.dispatch(appendChunk({ messageId, chunk }));
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    // Complete stream
    store.dispatch(completeStream({
      messageId,
      finalContent: content,
    }));
    
    if (onComplete) {
      onComplete(content);
    }
  }
  
  /**
   * Handle stream errors with retry logic
   */
  private async handleStreamError(
    messageId: string,
    error: Error,
    options: StreamingOptions
  ): Promise<void> {
    const { onError } = options;
    
    // Get retry count
    const retryCount = this.retryAttempts.get(messageId) || 0;
    const maxRetries = store.getState().streaming.settings.maxRetries;
    
    // Check if error is recoverable
    const isRecoverable = this.isRecoverableError(error);
    
    // Store error in Redux
    store.dispatch(setStreamError({
      messageId,
      error: {
        code: error.name,
        message: error.message,
        recoverable: isRecoverable,
        timestamp: Date.now(),
        attemptCount: retryCount,
      },
    }));
    
    // Attempt recovery if possible
    if (isRecoverable && retryCount < maxRetries) {
      this.retryAttempts.set(messageId, retryCount + 1);
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry stream
      store.dispatch(retryStream({ messageId }));
      
      // Restart streaming
      const adapter = this.getAdapterForProvider(options.provider);
      if (adapter) {
        await this.startStreaming(adapter, options);
      }
    } else {
      // Cleanup and notify
      this.cleanup(messageId);
      
      if (onError) {
        onError(error);
      }
    }
  }
  
  /**
   * Check if error is recoverable
   */
  private isRecoverableError(error: Error): boolean {
    const recoverableErrors = [
      'NetworkError',
      'TimeoutError',
      'AbortError',
      'ChunkParseError',
    ];
    
    return recoverableErrors.includes(error.name) ||
           error.message.includes('network') ||
           error.message.includes('timeout');
  }
  
  /**
   * Setup flush timer for buffered chunks
   */
  private setupFlushTimer(messageId: string): void {
    const settings = store.getState().streaming.settings;
    
    const timer = setInterval(() => {
      store.dispatch(flushBuffer({ messageId }));
    }, settings.flushInterval);
    
    this.flushTimers.set(messageId, timer);
  }
  
  /**
   * Setup memory pressure listener
   */
  private setupMemoryPressureListener(): void {
    // React Native specific memory warning
    if (typeof global !== 'undefined' && global.addEventListener) {
      global.addEventListener('memoryWarning', () => {
        this.handleMemoryPressure();
      });
    }
  }
  
  /**
   * Handle memory pressure
   */
  private handleMemoryPressure(): void {
    // Flush all buffers
    const state = store.getState().streaming;
    state.streamBuffer.forEach((_, messageId) => {
      store.dispatch(flushBuffer({ messageId }));
    });
    
    // Reduce buffer sizes
    store.dispatch(updateSettings({
      bufferSize: Math.max(10, state.settings.bufferSize / 2),
      chunkSize: Math.max(5, state.settings.chunkSize / 2),
    }));
  }
  
  /**
   * Setup network listener
   */
  private setupNetworkListener(): void {
    // Implementation depends on React Native NetInfo
    // This is a placeholder for network monitoring
  }
  
  /**
   * Abort a streaming session
   */
  public abort(messageId: string): void {
    const controller = this.activeConnections.get(messageId);
    if (controller) {
      controller.abort();
    }
    
    this.cleanup(messageId);
  }
  
  /**
   * Cleanup resources for a message
   */
  private cleanup(messageId: string): void {
    // Clear abort controller
    this.activeConnections.delete(messageId);
    
    // Clear flush timer
    const timer = this.flushTimers.get(messageId);
    if (timer) {
      clearInterval(timer);
      this.flushTimers.delete(messageId);
    }
    
    // Clear retry attempts
    this.retryAttempts.delete(messageId);
    
    // Clean up Redux state after delay
    setTimeout(() => {
      store.dispatch(cleanupStream({ messageId }));
    }, 5000);
  }
  
  /**
   * Get adapter for provider (placeholder)
   */
  private getAdapterForProvider(provider: string): AIAdapter | null {
    // This would be implemented to return the appropriate adapter
    // based on the provider name
    return null;
  }
  
  /**
   * Get streaming statistics
   */
  public getStatistics(): StreamingStatistics {
    const state = store.getState().streaming;
    const metrics = state.performanceMetrics;
    
    return {
      activeStreams: state.activeStreams.size,
      totalStreams: metrics.totalStreamsStarted,
      completedStreams: metrics.totalStreamsCompleted,
      averageDuration: metrics.averageStreamDuration,
      errorRate: metrics.errorRate,
      totalDataTransferred: metrics.totalBytesReceived,
    };
  }
}

export interface StreamingStatistics {
  activeStreams: number;
  totalStreams: number;
  completedStreams: number;
  averageDuration: number;
  errorRate: number;
  totalDataTransferred: number;
}

// Export singleton instance
export default StreamingService.getInstance();
```

### 3. Hook Implementations

```typescript
// src/hooks/useStreamingMessage.ts
import { useEffect, useCallback, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectActiveStream,
  selectIsStreaming,
  selectConnectionStatus,
  appendChunk,
} from '../store/slices/streamingSlice';
import { RootState } from '../store';
import StreamingService from '../services/StreamingService';

export interface UseStreamingMessageOptions {
  messageId: string;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullMessage: string) => void;
  onError?: (error: Error) => void;
  autoScroll?: boolean;
}

export interface UseStreamingMessageReturn {
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
  connectionStatus: string;
  error?: Error;
  abort: () => void;
  retry: () => void;
  metrics: StreamingMetrics;
}

export interface StreamingMetrics {
  chunksReceived: number;
  bytesReceived: number;
  streamingRate: number;
  duration: number;
}

export const useStreamingMessage = (
  options: UseStreamingMessageOptions
): UseStreamingMessageReturn => {
  const { messageId, onChunk, onComplete, onError, autoScroll = true } = options;
  
  const dispatch = useDispatch();
  const stream = useSelector((state: RootState) => selectActiveStream(state, messageId));
  const isStreaming = useSelector((state: RootState) => selectIsStreaming(state, messageId));
  const connectionStatus = useSelector((state: RootState) => 
    selectConnectionStatus(state, messageId)
  );
  
  const [metrics, setMetrics] = useState<StreamingMetrics>({
    chunksReceived: 0,
    bytesReceived: 0,
    streamingRate: 0,
    duration: 0,
  });
  
  const previousContentRef = useRef<string>('');
  const callbacksRef = useRef({ onChunk, onComplete, onError });
  
  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = { onChunk, onComplete, onError };
  }, [onChunk, onComplete, onError]);
  
  // Handle chunk updates
  useEffect(() => {
    if (!stream) return;
    
    const currentContent = stream.content;
    const previousContent = previousContentRef.current;
    
    // Detect new chunk
    if (currentContent.length > previousContent.length) {
      const newChunk = currentContent.substring(previousContent.length);
      
      // Call chunk callback
      if (callbacksRef.current.onChunk) {
        callbacksRef.current.onChunk(newChunk);
      }
      
      // Update metrics
      setMetrics({
        chunksReceived: stream.chunks.length,
        bytesReceived: stream.metadata.bytesReceived,
        streamingRate: stream.metadata.streamingRate,
        duration: (Date.now() - stream.metadata.startTime) / 1000,
      });
      
      previousContentRef.current = currentContent;
    }
    
    // Handle completion
    if (stream.isComplete && !previousContentRef.current.includes('__COMPLETE__')) {
      previousContentRef.current += '__COMPLETE__';
      
      if (callbacksRef.current.onComplete) {
        callbacksRef.current.onComplete(stream.content);
      }
    }
    
    // Handle error
    if (stream.error && callbacksRef.current.onError) {
      callbacksRef.current.onError(new Error(stream.error.message));
    }
  }, [stream]);
  
  // Abort function
  const abort = useCallback(() => {
    StreamingService.abort(messageId);
  }, [messageId]);
  
  // Retry function
  const retry = useCallback(() => {
    // Implementation would depend on storing original request params
    console.log('Retry not yet implemented');
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optionally abort if still streaming
      if (isStreaming) {
        StreamingService.abort(messageId);
      }
    };
  }, [messageId, isStreaming]);
  
  return {
    content: stream?.content || '',
    isStreaming,
    isComplete: stream?.isComplete || false,
    connectionStatus,
    error: stream?.error ? new Error(stream.error.message) : undefined,
    abort,
    retry,
    metrics,
  };
};

// src/hooks/useAIResponses.ts (modified version)
import { useState, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AIProviderType } from '../types/ai';
import StreamingService from '../services/StreamingService';
import { selectStreamingSettings } from '../store/slices/streamingSlice';
import { addMessage } from '../store/slices/chatSlice';

export interface UseAIResponsesOptions {
  conversationId: string;
  providers: AIProviderType[];
  streamingEnabled?: boolean;
}

export interface AIResponse {
  provider: AIProviderType;
  messageId: string;
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
  error?: Error;
}

export const useAIResponses = (options: UseAIResponsesOptions) => {
  const { conversationId, providers, streamingEnabled = true } = options;
  
  const dispatch = useDispatch();
  const streamingSettings = useSelector(selectStreamingSettings);
  const [responses, setResponses] = useState<Map<string, AIResponse>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  
  const activeStreamsRef = useRef<Set<string>>(new Set());
  
  const sendMessage = useCallback(async (
    message: string,
    selectedProviders: AIProviderType[] = providers
  ) => {
    setIsLoading(true);
    setResponses(new Map());
    activeStreamsRef.current.clear();
    
    try {
      // Process each provider
      const promises = selectedProviders.map(async (provider) => {
        const messageId = `${provider}-${Date.now()}`;
        activeStreamsRef.current.add(messageId);
        
        // Initialize response
        setResponses(prev => new Map(prev).set(provider, {
          provider,
          messageId,
          content: '',
          isStreaming: streamingEnabled && streamingSettings.enabled,
          isComplete: false,
        }));
        
        // Get adapter and API key
        const adapter = getAdapterForProvider(provider);
        const apiKey = await getApiKeyForProvider(provider);
        
        if (!adapter || !apiKey) {
          throw new Error(`Configuration missing for ${provider}`);
        }
        
        if (streamingEnabled && streamingSettings.enabled && adapter.supportsStreaming) {
          // Use streaming
          await StreamingService.startStreaming(adapter, {
            messageId,
            conversationId,
            provider,
            prompt: message,
            apiKey,
            onChunk: (chunk) => {
              setResponses(prev => {
                const updated = new Map(prev);
                const current = updated.get(provider);
                if (current) {
                  updated.set(provider, {
                    ...current,
                    content: current.content + chunk,
                  });
                }
                return updated;
              });
            },
            onComplete: (fullMessage) => {
              setResponses(prev => {
                const updated = new Map(prev);
                const current = updated.get(provider);
                if (current) {
                  updated.set(provider, {
                    ...current,
                    content: fullMessage,
                    isStreaming: false,
                    isComplete: true,
                  });
                }
                return updated;
              });
              
              // Add to chat history
              dispatch(addMessage({
                conversationId,
                sender: provider,
                content: fullMessage,
                timestamp: Date.now(),
              }));
              
              activeStreamsRef.current.delete(messageId);
            },
            onError: (error) => {
              setResponses(prev => {
                const updated = new Map(prev);
                const current = updated.get(provider);
                if (current) {
                  updated.set(provider, {
                    ...current,
                    error,
                    isStreaming: false,
                    isComplete: true,
                  });
                }
                return updated;
              });
              
              activeStreamsRef.current.delete(messageId);
            },
          });
        } else {
          // Use traditional request-response
          try {
            const response = await adapter.sendMessage(message, { apiKey });
            
            setResponses(prev => {
              const updated = new Map(prev);
              updated.set(provider, {
                provider,
                messageId,
                content: response,
                isStreaming: false,
                isComplete: true,
              });
              return updated;
            });
            
            // Add to chat history
            dispatch(addMessage({
              conversationId,
              sender: provider,
              content: response,
              timestamp: Date.now(),
            }));
            
          } catch (error) {
            setResponses(prev => {
              const updated = new Map(prev);
              updated.set(provider, {
                provider,
                messageId,
                content: '',
                isStreaming: false,
                isComplete: true,
                error: error as Error,
              });
              return updated;
            });
          }
          
          activeStreamsRef.current.delete(messageId);
        }
      });
      
      await Promise.allSettled(promises);
      
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, providers, streamingEnabled, streamingSettings, dispatch]);
  
  const abortAll = useCallback(() => {
    activeStreamsRef.current.forEach(messageId => {
      StreamingService.abort(messageId);
    });
    activeStreamsRef.current.clear();
    setIsLoading(false);
  }, []);
  
  return {
    responses: Array.from(responses.values()),
    isLoading,
    sendMessage,
    abortAll,
  };
};

// Helper functions (placeholders)
function getAdapterForProvider(provider: string): any {
  // Implementation would return the appropriate adapter
  return null;
}

async function getApiKeyForProvider(provider: string): Promise<string | null> {
  // Implementation would retrieve API key from secure storage
  return null;
}
```

### 4. Component Updates

```typescript
// src/components/organisms/MessageBubble.tsx (streaming version)
import React, { useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useStreamingMessage } from '../../hooks/useStreamingMessage';
import Typography from '../molecules/Typography';
import StreamingIndicator from './StreamingIndicator';

interface MessageBubbleProps {
  messageId: string;
  sender: string;
  initialContent?: string;
  isStreaming?: boolean;
  timestamp: number;
  onContentUpdate?: (content: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = memo(({
  messageId,
  sender,
  initialContent = '',
  isStreaming = false,
  timestamp,
  onContentUpdate,
}) => {
  const theme = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentRef = useRef<string>(initialContent);
  
  // Use streaming hook if streaming is enabled
  const streaming = isStreaming ? useStreamingMessage({
    messageId,
    onChunk: (chunk) => {
      // Smooth animation for new chunks
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.7,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    },
    onComplete: (fullMessage) => {
      if (onContentUpdate) {
        onContentUpdate(fullMessage);
      }
    },
  }) : null;
  
  const displayContent = streaming?.content || initialContent;
  const showStreamingIndicator = streaming?.isStreaming || false;
  
  // Update content ref
  useEffect(() => {
    contentRef.current = displayContent;
  }, [displayContent]);
  
  // Initial fade in
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);
  
  const bubbleStyle = [
    styles.bubble,
    sender === 'user' ? styles.userBubble : styles.aiBubble,
    {
      backgroundColor: sender === 'user' 
        ? theme.colors.primary 
        : theme.colors.surface,
    },
  ];
  
  const textStyle = {
    color: sender === 'user' 
      ? theme.colors.background 
      : theme.colors.text.primary,
  };
  
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={bubbleStyle}>
        <Typography variant="body" style={textStyle}>
          {displayContent}
        </Typography>
        {showStreamingIndicator && (
          <StreamingIndicator 
            style={styles.streamingIndicator}
            color={textStyle.color}
          />
        )}
      </View>
      <Typography variant="caption" style={styles.timestamp}>
        {formatTimestamp(timestamp)}
      </Typography>
      {streaming?.error && (
        <Typography variant="caption" style={styles.error}>
          Error: {streaming.error.message}
        </Typography>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  timestamp: {
    marginTop: 4,
    opacity: 0.6,
  },
  error: {
    color: 'red',
    marginTop: 4,
  },
  streamingIndicator: {
    marginTop: 8,
  },
});

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit' 
  });
}

// src/components/organisms/StreamingIndicator.tsx
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';

interface StreamingIndicatorProps {
  style?: ViewStyle;
  color?: string;
  size?: 'small' | 'medium' | 'large';
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  style,
  color = '#000',
  size = 'small',
}) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };
    
    const animation = Animated.parallel([
      createAnimation(dot1, 0),
      createAnimation(dot2, 200),
      createAnimation(dot3, 400),
    ]);
    
    animation.start();
    
    return () => {
      animation.stop();
    };
  }, [dot1, dot2, dot3]);
  
  const dotSize = size === 'small' ? 4 : size === 'medium' ? 6 : 8;
  const spacing = size === 'small' ? 4 : size === 'medium' ? 6 : 8;
  
  const dotStyle = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: color,
    marginHorizontal: spacing / 2,
  };
  
  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          dotStyle,
          {
            opacity: dot1,
            transform: [
              {
                scale: dot1.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.3],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          dotStyle,
          {
            opacity: dot2,
            transform: [
              {
                scale: dot2.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.3],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          dotStyle,
          {
            opacity: dot3,
            transform: [
              {
                scale: dot3.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.3],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default StreamingIndicator;
```

## Provider-Specific Implementation Details

### Provider Capabilities Matrix

| Provider | Streaming Support | Protocol | Chunk Format | Rate Limits | Special Considerations |
|----------|------------------|----------|--------------|-------------|------------------------|
| Claude | ✅ Yes | SSE | JSON | 50 req/min | Supports streaming with Anthropic SDK |
| ChatGPT | ✅ Yes | SSE | JSON | 60 req/min | OpenAI streaming API |
| Gemini | ✅ Yes | SSE | JSON | 60 req/min | Google AI streaming |
| Nomi | ❌ No | REST | N/A | 30 req/min | Fallback to simulation |
| Replika | ❌ No | REST | N/A | 20 req/min | Fallback to simulation |
| Character.AI | ⚠️ Limited | WebSocket | Custom | 40 req/min | Custom implementation needed |

### Claude Adapter Implementation

```typescript
// src/adapters/ClaudeAdapter.ts
import { Anthropic } from '@anthropic-ai/sdk';

export class ClaudeAdapter implements AIAdapter {
  public readonly supportsStreaming = true;
  
  async streamMessage(
    prompt: string,
    options: StreamOptions
  ): Promise<ReadableStream<string>> {
    const client = new Anthropic({
      apiKey: options.apiKey,
    });
    
    const stream = await client.messages.create({
      model: options.model || 'claude-3-opus-20240229',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 4096,
    });
    
    // Convert Anthropic stream to ReadableStream
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
              controller.enqueue(chunk.delta.text);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }
}
```

### ChatGPT Adapter Implementation

```typescript
// src/adapters/ChatGPTAdapter.ts
import OpenAI from 'openai';

export class ChatGPTAdapter implements AIAdapter {
  public readonly supportsStreaming = true;
  
  async streamMessage(
    prompt: string,
    options: StreamOptions
  ): Promise<ReadableStream<string>> {
    const client = new OpenAI({
      apiKey: options.apiKey,
    });
    
    const stream = await client.chat.completions.create({
      model: options.model || 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });
    
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(content);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }
}
```

## Error Handling Strategies

### Network Interruption Recovery

```typescript
// src/utils/streamErrorRecovery.ts
export class StreamErrorRecovery {
  private static readonly MAX_RETRIES = 3;
  private static readonly BACKOFF_BASE = 1000;
  
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      onRetry?: (attempt: number, error: Error) => void;
      shouldRetry?: (error: Error) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = this.MAX_RETRIES,
      onRetry,
      shouldRetry = this.isRetryableError,
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!shouldRetry(lastError) || attempt === maxRetries) {
          throw lastError;
        }
        
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }
        
        // Exponential backoff with jitter
        const delay = this.BACKOFF_BASE * Math.pow(2, attempt) + 
                     Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  private static isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'network',
      'timeout',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      '502',
      '503',
      '504',
    ];
    
    return retryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }
}

// Rate limiting handler
export class RateLimitHandler {
  private requestCounts: Map<string, number[]> = new Map();
  
  async executeWithRateLimit<T>(
    provider: string,
    operation: () => Promise<T>,
    limits: { requests: number; windowMs: number }
  ): Promise<T> {
    const now = Date.now();
    const counts = this.requestCounts.get(provider) || [];
    
    // Clean old requests
    const validCounts = counts.filter(time => 
      now - time < limits.windowMs
    );
    
    // Check rate limit
    if (validCounts.length >= limits.requests) {
      const oldestRequest = validCounts[0];
      const waitTime = limits.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Execute operation
    validCounts.push(now);
    this.requestCounts.set(provider, validCounts);
    
    return operation();
  }
}
```

## Performance Optimization Guide

### Chunk Buffering Implementation

```typescript
// src/utils/ChunkBuffer.ts
export class ChunkBuffer {
  private buffer: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly maxSize: number;
  private readonly flushInterval: number;
  private readonly onFlush: (chunks: string[]) => void;
  
  constructor(options: {
    maxSize: number;
    flushInterval: number;
    onFlush: (chunks: string[]) => void;
  }) {
    this.maxSize = options.maxSize;
    this.flushInterval = options.flushInterval;
    this.onFlush = options.onFlush;
  }
  
  add(chunk: string): void {
    this.buffer.push(chunk);
    
    if (this.buffer.length >= this.maxSize) {
      this.flush();
    } else if (!this.timer) {
      this.startTimer();
    }
  }
  
  private startTimer(): void {
    this.timer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  flush(): void {
    if (this.buffer.length === 0) return;
    
    const chunks = [...this.buffer];
    this.buffer = [];
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    this.onFlush(chunks);
  }
  
  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.flush();
  }
}
```

### FlatList Optimization for Streaming

```typescript
// src/components/optimized/StreamingFlatList.tsx
import React, { useCallback, useMemo, useRef } from 'react';
import { FlatList, FlatListProps, Platform } from 'react-native';

interface StreamingFlatListProps<T> extends FlatListProps<T> {
  streamingItemIds?: Set<string>;
  autoScrollThreshold?: number;
}

export function StreamingFlatList<T>({
  streamingItemIds = new Set(),
  autoScrollThreshold = 100,
  ...props
}: StreamingFlatListProps<T>) {
  const listRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  
  const optimizedProps = useMemo(() => ({
    // Optimize for streaming performance
    removeClippedSubviews: Platform.OS === 'android',
    maxToRenderPerBatch: 5,
    updateCellsBatchingPeriod: 50,
    windowSize: 10,
    initialNumToRender: 10,
    
    // Disable expensive features during streaming
    maintainVisibleContentPosition: streamingItemIds.size > 0 ? {
      minIndexForVisible: 0,
      autoscrollToTopThreshold: autoScrollThreshold,
    } : undefined,
    
    // Optimize scrolling
    scrollEventThrottle: 16,
    
    ...props,
  }), [props, streamingItemIds.size, autoScrollThreshold]);
  
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - 
                              (contentOffset.y + layoutMeasurement.height);
    
    isNearBottomRef.current = distanceFromBottom < autoScrollThreshold;
    
    if (props.onScroll) {
      props.onScroll(event);
    }
  }, [props.onScroll, autoScrollThreshold]);
  
  // Auto-scroll when new streaming content arrives
  const handleContentSizeChange = useCallback(() => {
    if (isNearBottomRef.current && streamingItemIds.size > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
    
    if (props.onContentSizeChange) {
      props.onContentSizeChange();
    }
  }, [props.onContentSizeChange, streamingItemIds.size]);
  
  return (
    <FlatList
      ref={listRef}
      {...optimizedProps}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
    />
  );
}
```

## Testing Strategy

### Unit Test Examples

```typescript
// __tests__/streaming/StreamingService.test.ts
import { StreamingService } from '../../src/services/StreamingService';
import { store } from '../../src/store';
import { waitFor } from '@testing-library/react-native';

describe('StreamingService', () => {
  let service: StreamingService;
  
  beforeEach(() => {
    service = StreamingService.getInstance();
    jest.clearAllMocks();
  });
  
  describe('startStreaming', () => {
    it('should initialize stream in Redux store', async () => {
      const mockAdapter = {
        supportsStreaming: true,
        streamMessage: jest.fn().mockResolvedValue(
          createMockStream(['Hello', ' ', 'World'])
        ),
      };
      
      await service.startStreaming(mockAdapter, {
        messageId: 'test-123',
        conversationId: 'conv-456',
        provider: 'test-provider',
        prompt: 'Test prompt',
        apiKey: 'test-key',
      });
      
      const state = store.getState();
      expect(state.streaming.activeStreams.has('test-123')).toBe(true);
    });
    
    it('should handle chunks correctly', async () => {
      const chunks: string[] = [];
      const mockAdapter = {
        supportsStreaming: true,
        streamMessage: jest.fn().mockResolvedValue(
          createMockStream(['Chunk1', 'Chunk2', 'Chunk3'])
        ),
      };
      
      await service.startStreaming(mockAdapter, {
        messageId: 'test-123',
        conversationId: 'conv-456',
        provider: 'test-provider',
        prompt: 'Test prompt',
        apiKey: 'test-key',
        onChunk: (chunk) => chunks.push(chunk),
      });
      
      await waitFor(() => {
        expect(chunks).toEqual(['Chunk1', 'Chunk2', 'Chunk3']);
      });
    });
    
    it('should fallback to non-streaming when not supported', async () => {
      const mockAdapter = {
        supportsStreaming: false,
        sendMessage: jest.fn().mockResolvedValue('Full response'),
      };
      
      let finalContent = '';
      await service.startStreaming(mockAdapter, {
        messageId: 'test-123',
        conversationId: 'conv-456',
        provider: 'test-provider',
        prompt: 'Test prompt',
        apiKey: 'test-key',
        onComplete: (content) => { finalContent = content; },
      });
      
      await waitFor(() => {
        expect(finalContent).toBe('Full response');
      });
    });
    
    it('should handle errors with retry', async () => {
      const mockAdapter = {
        supportsStreaming: true,
        streamMessage: jest.fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(createMockStream(['Success'])),
      };
      
      let error: Error | undefined;
      let content = '';
      
      await service.startStreaming(mockAdapter, {
        messageId: 'test-123',
        conversationId: 'conv-456',
        provider: 'test-provider',
        prompt: 'Test prompt',
        apiKey: 'test-key',
        onError: (e) => { error = e; },
        onComplete: (c) => { content = c; },
      });
      
      await waitFor(() => {
        expect(content).toBe('Success');
        expect(error).toBeUndefined();
      });
    });
  });
  
  describe('abort', () => {
    it('should abort active stream', async () => {
      const abortController = new AbortController();
      const mockAdapter = {
        supportsStreaming: true,
        streamMessage: jest.fn().mockImplementation(() => {
          return new Promise((resolve, reject) => {
            abortController.signal.addEventListener('abort', () => {
              reject(new Error('Aborted'));
            });
          });
        }),
      };
      
      const streamPromise = service.startStreaming(mockAdapter, {
        messageId: 'test-123',
        conversationId: 'conv-456',
        provider: 'test-provider',
        prompt: 'Test prompt',
        apiKey: 'test-key',
      });
      
      service.abort('test-123');
      
      await expect(streamPromise).rejects.toThrow('Aborted');
    });
  });
});

function createMockStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      controller.close();
    },
  });
}
```

### Integration Test Scenarios

```typescript
// __tests__/integration/streaming-flow.test.tsx
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { store } from '../../src/store';
import ChatScreen from '../../src/screens/ChatScreen';

describe('Streaming Integration', () => {
  it('should display streaming messages in real-time', async () => {
    const { getByTestId, queryByText } = render(
      <Provider store={store}>
        <ChatScreen />
      </Provider>
    );
    
    // Send a message
    const input = getByTestId('message-input');
    const sendButton = getByTestId('send-button');
    
    fireEvent.changeText(input, 'Test message');
    fireEvent.press(sendButton);
    
    // Wait for streaming to start
    await waitFor(() => {
      expect(queryByText(/streaming/i)).toBeTruthy();
    });
    
    // Verify chunks appear progressively
    await waitFor(() => {
      expect(queryByText(/Hello/)).toBeTruthy();
    });
    
    await waitFor(() => {
      expect(queryByText(/Hello World/)).toBeTruthy();
    });
  });
  
  it('should handle multiple concurrent streams', async () => {
    const { getByTestId, getAllByTestId } = render(
      <Provider store={store}>
        <ChatScreen providers={['claude', 'chatgpt', 'gemini']} />
      </Provider>
    );
    
    // Send message
    const input = getByTestId('message-input');
    const sendButton = getByTestId('send-button');
    
    fireEvent.changeText(input, 'Test message');
    fireEvent.press(sendButton);
    
    // Verify multiple streaming indicators
    await waitFor(() => {
      const indicators = getAllByTestId('streaming-indicator');
      expect(indicators.length).toBe(3);
    });
  });
});
```

### Performance Benchmarks

```typescript
// __tests__/performance/streaming-benchmarks.test.ts
describe('Streaming Performance Benchmarks', () => {
  it('should process 1000 chunks in under 2 seconds', async () => {
    const startTime = Date.now();
    const chunks = Array(1000).fill('x');
    
    const service = StreamingService.getInstance();
    await service.processChunks('test-id', chunks);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(2000);
  });
  
  it('should maintain 60fps during streaming', async () => {
    const frameDrops = await measureFrameDrops(async () => {
      // Simulate streaming
      for (let i = 0; i < 100; i++) {
        store.dispatch(appendChunk({
          messageId: 'test',
          chunk: 'Lorem ipsum dolor sit amet ',
        }));
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    });
    
    expect(frameDrops).toBeLessThan(5);
  });
  
  it('should not exceed 50MB memory for 10 concurrent streams', async () => {
    const initialMemory = getMemoryUsage();
    
    // Start 10 concurrent streams
    const promises = Array(10).fill(null).map((_, i) => 
      simulateStream(`stream-${i}`, 1000)
    );
    
    await Promise.all(promises);
    
    const finalMemory = getMemoryUsage();
    const memoryIncrease = finalMemory - initialMemory;
    
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });
});
```

## Migration Plan

### Phase 1: Infrastructure Setup (Week 1)

1. **Create streaming slice and service**
   ```bash
   # Create new files
   touch src/store/slices/streamingSlice.ts
   touch src/services/StreamingService.ts
   touch src/hooks/useStreamingMessage.ts
   ```

2. **Add streaming slice to store**
   ```typescript
   // src/store/index.ts
   import streamingReducer from './slices/streamingSlice';
   
   export const store = configureStore({
     reducer: {
       // ... existing reducers
       streaming: streamingReducer,
     },
   });
   ```

3. **Install required dependencies**
   ```bash
   npm install @anthropic-ai/sdk openai
   npm install --save-dev @types/readable-stream
   ```

### Phase 2: Provider Integration (Week 2)

1. **Update provider adapters**
   - Add streaming methods to Claude adapter
   - Add streaming methods to ChatGPT adapter
   - Add streaming methods to Gemini adapter
   - Implement fallback for non-streaming providers

2. **Test provider implementations**
   ```bash
   npm test -- --testPathPattern=adapters
   ```

### Phase 3: UI Components (Week 3)

1. **Create streaming components**
   - Implement StreamingIndicator
   - Update MessageBubble for streaming
   - Optimize FlatList for streaming

2. **Feature flag implementation**
   ```typescript
   // src/config/featureFlags.ts
   export const FEATURES = {
     STREAMING_ENABLED: __DEV__ || false,
   };
   ```

### Phase 4: Testing & Rollout (Week 4)

1. **Comprehensive testing**
   - Unit tests for all new components
   - Integration tests for streaming flow
   - Performance testing
   - Manual testing on iOS and Android

2. **Gradual rollout**
   - Enable for development builds
   - Beta testing with selected users
   - Monitor performance metrics
   - Full production release

### Rollback Procedures

```typescript
// src/utils/streamingRollback.ts
export class StreamingRollback {
  static async execute(): Promise<void> {
    // 1. Disable streaming flag
    await AsyncStorage.setItem('streaming_enabled', 'false');
    
    // 2. Clear streaming state
    store.dispatch(resetStreamingState());
    
    // 3. Abort all active streams
    StreamingService.getInstance().abortAll();
    
    // 4. Switch to fallback mode
    store.dispatch(setFallbackMode(true));
    
    // 5. Log rollback event
    analytics.track('streaming_rollback', {
      timestamp: Date.now(),
      reason: 'manual_rollback',
    });
  }
}
```

## Configuration & Settings

### User Preferences Structure

```typescript
// src/types/preferences.ts
export interface StreamingPreferences {
  enabled: boolean;
  autoScroll: boolean;
  chunkAnimation: 'fade' | 'slide' | 'none';
  showIndicator: boolean;
  bufferSize: 'small' | 'medium' | 'large';
  providers: {
    [key: string]: {
      enabled: boolean;
      chunkSize?: number;
      delay?: number;
    };
  };
}

// Default settings
export const DEFAULT_STREAMING_PREFERENCES: StreamingPreferences = {
  enabled: true,
  autoScroll: true,
  chunkAnimation: 'fade',
  showIndicator: true,
  bufferSize: 'medium',
  providers: {
    claude: { enabled: true },
    chatgpt: { enabled: true },
    gemini: { enabled: true },
    nomi: { enabled: false },
    replika: { enabled: false },
    characterai: { enabled: false },
  },
};
```

### Settings Screen Implementation

```typescript
// src/screens/StreamingSettingsScreen.tsx
import React from 'react';
import { View, Switch, ScrollView } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import Typography from '../components/molecules/Typography';
import { updateStreamingSettings } from '../store/slices/settingsSlice';

export const StreamingSettingsScreen: React.FC = () => {
  const settings = useSelector(selectStreamingSettings);
  const dispatch = useDispatch();
  
  return (
    <ScrollView>
      <View style={styles.section}>
        <Typography variant="h2">Streaming Settings</Typography>
        
        <SettingRow
          label="Enable Streaming"
          value={settings.enabled}
          onValueChange={(enabled) => 
            dispatch(updateStreamingSettings({ enabled }))
          }
        />
        
        <SettingRow
          label="Auto-scroll to Bottom"
          value={settings.autoScroll}
          onValueChange={(autoScroll) => 
            dispatch(updateStreamingSettings({ autoScroll }))
          }
        />
        
        <SettingRow
          label="Show Streaming Indicator"
          value={settings.showIndicator}
          onValueChange={(showIndicator) => 
            dispatch(updateStreamingSettings({ showIndicator }))
          }
        />
        
        <Typography variant="h3" style={styles.sectionTitle}>
          Provider Settings
        </Typography>
        
        {Object.entries(settings.providers).map(([provider, config]) => (
          <SettingRow
            key={provider}
            label={`Enable ${provider} Streaming`}
            value={config.enabled}
            onValueChange={(enabled) => 
              dispatch(updateStreamingSettings({
                providers: {
                  ...settings.providers,
                  [provider]: { ...config, enabled },
                },
              }))
            }
          />
        ))}
      </View>
    </ScrollView>
  );
};
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: Streaming stops unexpectedly

**Symptoms:**
- Messages stop appearing mid-stream
- No error message displayed

**Solutions:**
1. Check network connectivity
2. Verify API key validity
3. Check rate limits for provider
4. Review console logs for errors

**Debug steps:**
```typescript
// Enable debug logging
StreamingService.getInstance().enableDebugLogging();

// Check active streams
const stats = StreamingService.getInstance().getStatistics();
console.log('Active streams:', stats.activeStreams);

// Monitor Redux state
store.subscribe(() => {
  const state = store.getState();
  console.log('Streaming state:', state.streaming);
});
```

#### Issue: High memory usage during streaming

**Symptoms:**
- App becomes sluggish
- Memory warnings in console

**Solutions:**
1. Reduce buffer size in settings
2. Limit concurrent streams
3. Enable chunk aggregation

```typescript
// Reduce memory usage
store.dispatch(updateSettings({
  bufferSize: 10,
  chunkSize: 5,
  maxConcurrentStreams: 3,
}));
```

#### Issue: Chunks appear out of order

**Symptoms:**
- Text appears jumbled
- Words or sentences repeated

**Solutions:**
1. Verify chunk ordering logic
2. Check for race conditions
3. Enable sequential processing

```typescript
// Force sequential processing
StreamingService.getInstance().setProcessingMode('sequential');
```

### Debug Logging Setup

```typescript
// src/utils/streamingDebug.ts
export class StreamingDebugger {
  private static logs: DebugLog[] = [];
  
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    const entry: DebugLog = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };
    
    this.logs.push(entry);
    
    if (__DEV__) {
      console.log(`[Streaming ${level}]`, message, data);
    }
  }
  
  static exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
  
  static clearLogs(): void {
    this.logs = [];
  }
}

interface DebugLog {
  timestamp: number;
  level: string;
  message: string;
  data?: any;
}
```

### Performance Profiling

```typescript
// src/utils/streamingProfiler.ts
export class StreamingProfiler {
  private static metrics: Map<string, PerformanceMetric> = new Map();
  
  static startMeasure(label: string): void {
    this.metrics.set(label, {
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
    });
  }
  
  static endMeasure(label: string): number {
    const metric = this.metrics.get(label);
    if (!metric) return 0;
    
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    
    return metric.duration;
  }
  
  static getReport(): PerformanceReport {
    const report: PerformanceReport = {
      metrics: {},
      summary: {
        totalDuration: 0,
        averageDuration: 0,
        slowestOperation: '',
        fastestOperation: '',
      },
    };
    
    let totalDuration = 0;
    let slowest = { label: '', duration: 0 };
    let fastest = { label: '', duration: Infinity };
    
    this.metrics.forEach((metric, label) => {
      report.metrics[label] = metric.duration;
      totalDuration += metric.duration;
      
      if (metric.duration > slowest.duration) {
        slowest = { label, duration: metric.duration };
      }
      
      if (metric.duration < fastest.duration) {
        fastest = { label, duration: metric.duration };
      }
    });
    
    report.summary = {
      totalDuration,
      averageDuration: totalDuration / this.metrics.size,
      slowestOperation: slowest.label,
      fastestOperation: fastest.label,
    };
    
    return report;
  }
}

interface PerformanceMetric {
  startTime: number;
  endTime: number;
  duration: number;
}

interface PerformanceReport {
  metrics: Record<string, number>;
  summary: {
    totalDuration: number;
    averageDuration: number;
    slowestOperation: string;
    fastestOperation: string;
  };
}
```

## API Reference

### StreamingService API

```typescript
class StreamingService {
  /**
   * Get singleton instance
   */
  static getInstance(): StreamingService;
  
  /**
   * Start a new streaming session
   * @param adapter - AI provider adapter
   * @param options - Streaming configuration
   * @returns Promise that resolves when streaming completes
   */
  startStreaming(
    adapter: AIAdapter,
    options: StreamingOptions
  ): Promise<void>;
  
  /**
   * Abort a streaming session
   * @param messageId - ID of the message to abort
   */
  abort(messageId: string): void;
  
  /**
   * Abort all active streaming sessions
   */
  abortAll(): void;
  
  /**
   * Get streaming statistics
   * @returns Current statistics
   */
  getStatistics(): StreamingStatistics;
  
  /**
   * Enable debug logging
   * @param enabled - Whether to enable logging
   */
  enableDebugLogging(enabled: boolean): void;
  
  /**
   * Set processing mode
   * @param mode - 'parallel' | 'sequential'
   */
  setProcessingMode(mode: 'parallel' | 'sequential'): void;
}
```

### Redux Actions

```typescript
// Start a new stream
startStream(payload: {
  messageId: string;
  conversationId: string;
  provider: string;
  model?: string;
}): Action;

// Append a chunk to stream
appendChunk(payload: {
  messageId: string;
  chunk: string;
  timestamp?: number;
}): Action;

// Complete a stream
completeStream(payload: {
  messageId: string;
  finalContent?: string;
}): Action;

// Set stream error
setStreamError(payload: {
  messageId: string;
  error: StreamingError;
}): Action;

// Retry a failed stream
retryStream(payload: {
  messageId: string;
  fromChunkIndex?: number;
}): Action;

// Flush buffer
flushBuffer(payload: {
  messageId: string;
}): Action;

// Update settings
updateSettings(payload: Partial<StreamingSettings>): Action;

// Cleanup stream
cleanupStream(payload: {
  messageId: string;
}): Action;

// Reset metrics
resetMetrics(): Action;
```

### Hooks API

```typescript
// useStreamingMessage hook
interface UseStreamingMessageOptions {
  messageId: string;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullMessage: string) => void;
  onError?: (error: Error) => void;
  autoScroll?: boolean;
}

interface UseStreamingMessageReturn {
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
  connectionStatus: string;
  error?: Error;
  abort: () => void;
  retry: () => void;
  metrics: StreamingMetrics;
}

function useStreamingMessage(
  options: UseStreamingMessageOptions
): UseStreamingMessageReturn;

// useAIResponses hook (enhanced)
interface UseAIResponsesOptions {
  conversationId: string;
  providers: AIProviderType[];
  streamingEnabled?: boolean;
}

interface AIResponse {
  provider: AIProviderType;
  messageId: string;
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
  error?: Error;
}

function useAIResponses(
  options: UseAIResponsesOptions
): {
  responses: AIResponse[];
  isLoading: boolean;
  sendMessage: (message: string, providers?: AIProviderType[]) => Promise<void>;
  abortAll: () => void;
};
```

## Code Examples

### Basic Streaming Implementation

```typescript
// Example: Simple chat component with streaming
import React, { useState } from 'react';
import { View, TextInput, Button, FlatList } from 'react-native';
import { useAIResponses } from '../hooks/useAIResponses';
import MessageBubble from '../components/organisms/MessageBubble';

export const StreamingChat: React.FC = () => {
  const [input, setInput] = useState('');
  const { responses, isLoading, sendMessage } = useAIResponses({
    conversationId: 'chat-123',
    providers: ['claude', 'chatgpt'],
    streamingEnabled: true,
  });
  
  const handleSend = async () => {
    if (!input.trim()) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };
  
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={responses}
        keyExtractor={(item) => item.messageId}
        renderItem={({ item }) => (
          <MessageBubble
            messageId={item.messageId}
            sender={item.provider}
            initialContent={item.content}
            isStreaming={item.isStreaming}
            timestamp={Date.now()}
          />
        )}
      />
      <View style={{ flexDirection: 'row', padding: 10 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          style={{ flex: 1, borderWidth: 1, padding: 10 }}
        />
        <Button
          title="Send"
          onPress={handleSend}
          disabled={isLoading}
        />
      </View>
    </View>
  );
};
```

### Advanced Streaming with Error Recovery

```typescript
// Example: Robust streaming with error handling
import React, { useCallback } from 'react';
import { useStreamingMessage } from '../hooks/useStreamingMessage';
import StreamingService from '../services/StreamingService';
import { ClaudeAdapter } from '../adapters/ClaudeAdapter';

export const RobustStreamingComponent: React.FC = () => {
  const [messageId] = useState(`msg-${Date.now()}`);
  const [retryCount, setRetryCount] = useState(0);
  
  const {
    content,
    isStreaming,
    error,
    abort,
    metrics,
  } = useStreamingMessage({
    messageId,
    onError: useCallback((error) => {
      console.error('Streaming error:', error);
      
      // Automatic retry logic
      if (retryCount < 3) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          startStreaming();
        }, 1000 * Math.pow(2, retryCount));
      }
    }, [retryCount]),
    onComplete: useCallback((fullMessage) => {
      console.log('Streaming complete:', fullMessage);
      // Save to database or perform other actions
    }, []),
  });
  
  const startStreaming = useCallback(async () => {
    try {
      const adapter = new ClaudeAdapter();
      await StreamingService.startStreaming(adapter, {
        messageId,
        conversationId: 'conv-123',
        provider: 'claude',
        prompt: 'Tell me a story',
        apiKey: 'your-api-key',
      });
    } catch (error) {
      console.error('Failed to start streaming:', error);
    }
  }, [messageId]);
  
  return (
    <View>
      <Text>{content}</Text>
      {isStreaming && <StreamingIndicator />}
      {error && (
        <View>
          <Text>Error: {error.message}</Text>
          <Button title="Retry" onPress={startStreaming} />
        </View>
      )}
      <Text>Speed: {metrics.streamingRate} chars/sec</Text>
      <Button title="Abort" onPress={abort} disabled={!isStreaming} />
    </View>
  );
};
```

### Custom Streaming Provider

```typescript
// Example: Implementing a custom streaming provider
export class CustomStreamingProvider implements AIAdapter {
  public readonly supportsStreaming = true;
  
  async streamMessage(
    prompt: string,
    options: StreamOptions
  ): Promise<ReadableStream<string>> {
    const response = await fetch('https://api.custom-ai.com/stream', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        model: options.model,
        stream: true,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    
    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    controller.enqueue(parsed.content);
                  }
                } catch (e) {
                  console.warn('Failed to parse chunk:', e);
                }
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }
  
  async sendMessage(prompt: string, options: any): Promise<string> {
    // Fallback implementation for non-streaming
    const response = await fetch('https://api.custom-ai.com/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model: options.model }),
    });
    
    const data = await response.json();
    return data.content;
  }
}
```

## Conclusion

This comprehensive implementation guide provides everything needed to add streaming support to the Symposium AI React Native application. The architecture is designed to be:

- **Scalable**: Handles multiple concurrent streams efficiently
- **Resilient**: Includes error recovery and retry mechanisms
- **Performant**: Optimized for mobile devices with memory management
- **Flexible**: Supports multiple providers with fallback options
- **Testable**: Comprehensive testing strategies included
- **Maintainable**: Clean architecture with clear separation of concerns

Follow the migration plan to implement streaming incrementally, starting with infrastructure and gradually rolling out to users. The implementation prioritizes user experience while maintaining system stability and performance.

For questions or issues during implementation, refer to the troubleshooting guide and API reference sections. Regular monitoring of performance metrics will ensure the streaming feature continues to meet performance requirements as the application scales.