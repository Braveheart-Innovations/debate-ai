/**
 * useDebateFlow Hook
 * Manages the debate flow orchestration and event handling
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addMessage, setTypingAI, updateMessage } from '../../store';
import {
  startStreaming,
  updateStreamingContent,
  endStreaming,
  streamingError,
} from '../../store/streamingSlice';
import { DebateOrchestrator, DebateEvent, DebateStatus } from '../../services/debate';
import { Message } from '../../types';

export interface UseDebateFlowReturn {
  isDebateActive: boolean;
  isDebateEnded: boolean;
  startDebate: () => Promise<void>;
  error: string | null;
  currentRound: number;
  maxRounds: number;
}

export const useDebateFlow = (orchestrator: DebateOrchestrator | null): UseDebateFlowReturn => {
  const dispatch = useDispatch();
  const currentSession = useSelector((state: RootState) => state.chat.currentSession);
  const messages = useMemo(() => currentSession?.messages || [], [currentSession?.messages]);
  
  const [isDebateActive, setIsDebateActive] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  
  // Use ref to track if we've started the debate to prevent multiple starts
  const hasStartedRef = useRef(false);
  
  // Event handler for orchestrator events
  const handleDebateEvent = useCallback((event: DebateEvent) => {
    switch (event.type) {
      case 'message_added':
        if (event.data.message) {
          dispatch(addMessage(event.data.message as Message));
        }
        break;
      
      case 'debate_started': {
        // Initialize rounds from the session payload if present
        const session = (event.data?.session || null) as { totalRounds?: number; currentRound?: number } | null;
        if (session?.totalRounds) setMaxRounds(session.totalRounds);
        if (session?.currentRound) setCurrentRound(session.currentRound);
        setIsDebateActive(true);
        setIsDebateEnded(false);
        break;
      }
      
      case 'typing_started':
        if (event.data.aiName) {
          dispatch(setTypingAI({ ai: event.data.aiName as string, isTyping: true }));
        }
        break;
        
      case 'typing_stopped':
        if (event.data.aiName) {
          dispatch(setTypingAI({ ai: event.data.aiName as string, isTyping: false }));
        }
        break;
        
      case 'round_changed':
        if (typeof event.data.round === 'number') {
          setCurrentRound(event.data.round as number);
          // Keep maxRounds in sync (in case user picked 5 or 7 exchanges)
          const session = orchestrator?.getSession();
          if (session?.totalRounds) setMaxRounds(session.totalRounds);
        }
        break;
        
      case 'debate_ended':
        setIsDebateEnded(true);
        setIsDebateActive(false);
        break;
      
      // Streaming lifecycle events
      case 'stream_started': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const aiProvider = String((event.data as { aiProvider?: string }).aiProvider || '');
        if (messageId) dispatch(startStreaming({ messageId, aiProvider }));
        break;
      }
      case 'stream_chunk': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const chunk = String((event.data as { chunk?: string }).chunk || '');
        if (messageId && chunk) dispatch(updateStreamingContent({ messageId, chunk }));
        break;
      }
      case 'stream_completed': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const finalContent = String((event.data as { finalContent?: string }).finalContent || '');
        const modelUsed = (event.data as { modelUsed?: string }).modelUsed;
        if (messageId) {
          dispatch(endStreaming({ messageId, finalContent }));
          // Persist final content to the chat store
          dispatch(updateMessage({ id: messageId, content: finalContent, metadata: modelUsed ? { modelUsed } : {} }));
        }
        break;
      }
      case 'stream_error': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const error = String((event.data as { error?: string }).error || 'Streaming error');
        if (messageId) dispatch(streamingError({ messageId, error }));
        break;
      }
      
      case 'error_occurred':
        if (event.data.error) {
          const debateError = event.data.error as { message: string };
          setError(debateError.message);
        }
        break;
        
      default:
        break;
    }
  }, [dispatch, orchestrator]);
  
  // Register event handler with orchestrator
  useEffect(() => {
    if (orchestrator) {
      orchestrator.addEventListener(handleDebateEvent);
      
      return () => {
        orchestrator.removeEventListener(handleDebateEvent);
      };
    }
    return undefined;
  }, [orchestrator, handleDebateEvent]);
  
  // Monitor orchestrator session status
  useEffect(() => {
    if (orchestrator) {
      const session = orchestrator.getSession();
      if (session) {
        setIsDebateActive(session.status === DebateStatus.ACTIVE);
        setIsDebateEnded(session.status === DebateStatus.COMPLETED);
        setCurrentRound(session.currentRound);
        setMaxRounds(session.totalRounds);
      }
    }
  }, [orchestrator]);
  
  // Start debate function
  const startDebate = useCallback(async (): Promise<void> => {
    if (!orchestrator || hasStartedRef.current) {
      return;
    }
    
    try {
      setError(null);
      hasStartedRef.current = true;
      setIsDebateActive(true);
      
      await orchestrator.startDebate(messages);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start debate';
      setError(errorMessage);
      setIsDebateActive(false);
      hasStartedRef.current = false;
    }
  }, [orchestrator, messages]);
  
  // Reset when orchestrator changes
  useEffect(() => {
    hasStartedRef.current = false;
    setIsDebateActive(false);
    setIsDebateEnded(false);
    setError(null);
    setCurrentRound(1);
  }, [orchestrator]);
  
  return {
    isDebateActive,
    isDebateEnded,
    startDebate,
    error,
    currentRound,
    maxRounds,
  };
};
