import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './index';

// Types for streaming state
export interface StreamingMessage {
  messageId: string;
  content: string;
  isStreaming: boolean;
  startTime: number;
  endTime?: number;
  aiProvider: string;
  error?: string;
  status?: 'streaming' | 'completed' | 'cancelled' | 'interrupted' | 'failed';
  cursorVisible: boolean;
  chunksReceived: number;
  bytesReceived: number;
}

export interface StreamingPreference {
  enabled: boolean;
  supported: boolean;
  chunkSize?: number;
}

export interface StreamingState {
  // Track streaming messages by messageId
  streamingMessages: {
    [messageId: string]: StreamingMessage;
  };
  
  // Provider-level streaming preferences
  streamingPreferences: {
    [providerId: string]: StreamingPreference;
  };
  
  // Global streaming settings
  globalStreamingEnabled: boolean;
  
  // Performance metrics
  activeStreamCount: number;
  totalStreamsCompleted: number;
  
  // Track providers that have verification errors
  providerVerificationErrors: {
    [providerId: string]: boolean;
  };
}

const initialState: StreamingState = {
  streamingMessages: {},
  streamingPreferences: {
    // Default preferences for known providers
    claude: { enabled: true, supported: true },
    openai: { enabled: true, supported: true },
    google: { enabled: true, supported: true },
    mistral: { enabled: true, supported: true },
    perplexity: { enabled: true, supported: true },
    cohere: { enabled: true, supported: true },
    deepseek: { enabled: true, supported: true },
    grok: { enabled: true, supported: true },
    moonshot: { enabled: true, supported: true },
    zai: { enabled: true, supported: true },
  },
  globalStreamingEnabled: true,
  activeStreamCount: 0,
  totalStreamsCompleted: 0,
  providerVerificationErrors: {},
};

const streamingSlice = createSlice({
  name: 'streaming',
  initialState,
  reducers: {
    // Start a new streaming session
    startStreaming: (state, action: PayloadAction<{
      messageId: string;
      aiProvider: string;
    }>) => {
      const { messageId, aiProvider } = action.payload;
      state.streamingMessages[messageId] = {
        messageId,
        content: '',
        isStreaming: true,
        status: 'streaming',
        startTime: Date.now(),
        aiProvider,
        cursorVisible: true,
        chunksReceived: 0,
        bytesReceived: 0,
      };
      state.activeStreamCount++;
    },
    
    // Update streaming content with a new chunk
    updateStreamingContent: (state, action: PayloadAction<{
      messageId: string;
      chunk: string;
    }>) => {
      const { messageId, chunk } = action.payload;
      const stream = state.streamingMessages[messageId];
      if (stream && stream.isStreaming) {
        stream.content += chunk;
        stream.chunksReceived++;
        stream.bytesReceived += chunk.length;
        // Toggle cursor visibility for the streaming cursor.
        stream.cursorVisible = stream.chunksReceived % 3 !== 0;
      }
    },
    
    // Complete a streaming session
    endStreaming: (state, action: PayloadAction<{
      messageId: string;
      finalContent?: string;
    }>) => {
      const { messageId, finalContent } = action.payload;
      const stream = state.streamingMessages[messageId];
      if (stream) {
        stream.isStreaming = false;
        stream.endTime = Date.now();
        stream.cursorVisible = false;
        if (finalContent !== undefined) {
          stream.content = finalContent;
        }
        stream.status = 'completed';
        stream.error = undefined;
        state.activeStreamCount = Math.max(0, state.activeStreamCount - 1);
        state.totalStreamsCompleted++;
      }
    },
    
    // Handle streaming error
    streamingError: (state, action: PayloadAction<{
      messageId: string;
      error: string;
    }>) => {
      const { messageId, error } = action.payload;
      const stream = state.streamingMessages[messageId];
      if (stream) {
        stream.isStreaming = false;
        stream.error = error;
        stream.status = 'failed';
        stream.cursorVisible = false;
        stream.endTime = Date.now();
        state.activeStreamCount = Math.max(0, state.activeStreamCount - 1);
      }
    },
    
    // Clear completed stream data (for memory management)
    clearStreamingMessage: (state, action: PayloadAction<string>) => {
      const messageId = action.payload;
      // Clearing a stream that never ended (e.g. a continuation handing display back to the
      // stored message) also ends it, so the active count can't leak and leave Stop showing.
      if (state.streamingMessages[messageId]?.isStreaming) {
        state.activeStreamCount = Math.max(0, state.activeStreamCount - 1);
      }
      delete state.streamingMessages[messageId];
    },
    
    // Clear all completed streams
    clearCompletedStreams: (state) => {
      const completedIds = Object.keys(state.streamingMessages).filter(
        id => !state.streamingMessages[id].isStreaming
      );
      completedIds.forEach(id => {
        delete state.streamingMessages[id];
      });
    },
    
    // Set provider streaming preference
    setProviderStreamingPreference: (state, action: PayloadAction<{
      providerId: string;
      enabled: boolean;
    }>) => {
      const { providerId, enabled } = action.payload;
      if (!state.streamingPreferences[providerId]) {
        state.streamingPreferences[providerId] = {
          enabled,
          supported: true,
        };
      } else {
        state.streamingPreferences[providerId].enabled = enabled;
      }
    },
    
    // Set global streaming enabled/disabled
    setGlobalStreaming: (state, action: PayloadAction<boolean>) => {
      state.globalStreamingEnabled = action.payload;
    },
    
    // Cancel all active streams
    cancelAllStreams: (state, action: PayloadAction<{
      reason?: 'cancelled' | 'interrupted';
    } | undefined>) => {
      const reason = action.payload?.reason || 'cancelled';
      Object.keys(state.streamingMessages).forEach(messageId => {
        const stream = state.streamingMessages[messageId];
        if (stream.isStreaming) {
          stream.isStreaming = false;
          stream.endTime = Date.now();
          stream.cursorVisible = false;
          stream.status = reason;
          stream.error = reason === 'interrupted' ? 'Stream interrupted' : 'Stream cancelled';
        }
      });
      state.activeStreamCount = 0;
    },
    
    // Mark provider as having verification error
    setProviderVerificationError: (state, action: PayloadAction<{
      providerId: string;
      hasError: boolean;
    }>) => {
      const { providerId, hasError } = action.payload;
      state.providerVerificationErrors[providerId] = hasError;
    },
  },
});

// Export actions
export const {
  startStreaming,
  updateStreamingContent,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  clearCompletedStreams,
  setProviderStreamingPreference,
  setGlobalStreaming,
  cancelAllStreams,
  setProviderVerificationError,
} = streamingSlice.actions;

// Selectors
export const selectStreamingMessage = (messageId: string) => (state: RootState) =>
  state.streaming?.streamingMessages[messageId];

export const selectIsStreaming = (messageId: string) => (state: RootState) =>
  state.streaming?.streamingMessages[messageId]?.isStreaming || false;

export const selectStreamingContent = (messageId: string) => (state: RootState) =>
  state.streaming?.streamingMessages[messageId]?.content || '';

export const selectProviderStreamingEnabled = (providerId: string) => (state: RootState) => {
  if (!state.streaming?.globalStreamingEnabled) return false;
  // Check if provider has verification errors
  if (state.streaming?.providerVerificationErrors[providerId]) return false;
  return state.streaming?.streamingPreferences[providerId]?.enabled ?? true;
};

export const selectProviderHasVerificationError = (providerId: string) => (state: RootState) =>
  state.streaming?.providerVerificationErrors[providerId] || false;

export const selectActiveStreamCount = (state: RootState) =>
  state.streaming?.activeStreamCount || 0;

// Export reducer
export default streamingSlice.reducer;
