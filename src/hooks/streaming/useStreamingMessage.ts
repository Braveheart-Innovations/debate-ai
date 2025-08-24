import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect } from 'react';
import {
  selectStreamingMessage,
  selectIsStreaming,
  selectStreamingContent,
  updateStreamingContent,
  endStreaming,
  streamingError,
  clearStreamingMessage,
} from '../../store/streamingSlice';
import type { AppDispatch } from '../../store';

export interface StreamingMessageHook {
  // State
  content: string;
  isStreaming: boolean;
  cursorVisible: boolean;
  error?: string;
  chunksReceived: number;
  
  // Actions
  appendChunk: (chunk: string) => void;
  completeStream: (finalContent?: string) => void;
  handleError: (error: string) => void;
  clearStream: () => void;
  
  // Metrics
  streamDuration?: number;
  bytesReceived: number;
}

/**
 * Hook to manage streaming state for a specific message
 */
export const useStreamingMessage = (messageId: string): StreamingMessageHook => {
  const dispatch = useDispatch<AppDispatch>();
  
  // Select streaming state from Redux
  const streamingMessage = useSelector(selectStreamingMessage(messageId));
  const isStreaming = useSelector(selectIsStreaming(messageId));
  const content = useSelector(selectStreamingContent(messageId));
  
  // Append a chunk to the streaming message
  const appendChunk = useCallback((chunk: string) => {
    dispatch(updateStreamingContent({ messageId, chunk }));
  }, [dispatch, messageId]);
  
  // Complete the streaming session
  const completeStream = useCallback((finalContent?: string) => {
    dispatch(endStreaming({ messageId, finalContent }));
  }, [dispatch, messageId]);
  
  // Handle streaming error
  const handleError = useCallback((error: string) => {
    dispatch(streamingError({ messageId, error }));
  }, [dispatch, messageId]);
  
  // Clear stream data from memory
  const clearStream = useCallback(() => {
    dispatch(clearStreamingMessage(messageId));
  }, [dispatch, messageId]);
  
  // Auto-cleanup completed streams after 5 minutes
  useEffect(() => {
    if (streamingMessage && !streamingMessage.isStreaming && streamingMessage.endTime) {
      const cleanupDelay = 5 * 60 * 1000; // 5 minutes
      const timer = setTimeout(() => {
        clearStream();
      }, cleanupDelay);
      
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [streamingMessage, clearStream]);
  
  // Calculate stream duration
  const streamDuration = streamingMessage?.endTime && streamingMessage?.startTime
    ? streamingMessage.endTime - streamingMessage.startTime
    : undefined;
  
  return {
    // State
    content,
    isStreaming,
    cursorVisible: streamingMessage?.cursorVisible || false,
    error: streamingMessage?.error,
    chunksReceived: streamingMessage?.chunksReceived || 0,
    
    // Actions
    appendChunk,
    completeStream,
    handleError,
    clearStream,
    
    // Metrics
    streamDuration,
    bytesReceived: streamingMessage?.bytesReceived || 0,
  };
};