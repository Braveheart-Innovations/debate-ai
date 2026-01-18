/**
 * useDebateSession Hook
 * Manages debate session lifecycle and integration with Redux
 */

import { useEffect, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { startSession, startDebate } from '../../store';
import { DebateOrchestrator, DebateSession, DebateStatus } from '../../services/debate';
import { useAIService } from '../../providers/AIServiceProvider';
import { AI } from '../../types';
import { PersonalityOption } from '@/config/personalities';

export interface UseDebateSessionReturn {
  session: DebateSession | null;
  status: DebateStatus;
  isInitialized: boolean;
  orchestrator: DebateOrchestrator | null;
  initializeSession: (
    topic: string,
    participants: AI[],
    personalities?: { [aiId: string]: string },
    options?: {
      formatId?: 'oxford' | 'lincoln_douglas' | 'policy' | 'socratic';
      rounds?: number;
      civility?: 1|2|3|4|5;
      stances?: { [aiId: string]: 'pro' | 'con' };
      /** Optional pre-merged personalities from context (includes user customizations) */
      mergedPersonalities?: Record<string, PersonalityOption>;
    }
  ) => Promise<void>;
  resetSession: () => void;
  error: string | null;
}

export const useDebateSession = (_selectedAIs: AI[]): UseDebateSessionReturn => {
  const dispatch = useDispatch();
  const { aiService, isInitialized: aiServiceReady } = useAIService();

  const [orchestrator, setOrchestrator] = useState<DebateOrchestrator | null>(null);
  const [session, setSession] = useState<DebateSession | null>(null);
  const [status, setStatus] = useState<DebateStatus>(DebateStatus.IDLE);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize orchestrator when AI service is ready (uses shared service with demo adapters)
  useEffect(() => {
    if (aiService && aiServiceReady && !orchestrator) {
      const newOrchestrator = new DebateOrchestrator(aiService);
      setOrchestrator(newOrchestrator);
    }
  }, [aiService, aiServiceReady, orchestrator]);
  
  // Initialize session
  const initializeSession = useCallback(async (
    topic: string,
    participants: AI[],
    personalities: { [aiId: string]: string } = {},
    options?: {
      formatId?: 'oxford' | 'lincoln_douglas' | 'policy' | 'socratic';
      rounds?: number;
      civility?: 1|2|3|4|5;
      stances?: { [aiId: string]: 'pro' | 'con' };
      mergedPersonalities?: Record<string, PersonalityOption>;
    }
  ): Promise<void> => {
    if (!orchestrator) {
      setError('Orchestrator not initialized. Please wait a moment and try again.');
      throw new Error('Orchestrator not initialized');
    }
    
    try {
      setError(null);
      setStatus(DebateStatus.INITIALIZING);
      
      // Create Redux session for the UI to display messages
      dispatch(startSession({ selectedAIs: participants, sessionType: 'debate' }));
      
      // Initialize debate session
      const debateSession = await orchestrator.initializeDebate(topic, participants, personalities, options);
      
      // Initialize debate stats in Redux
      dispatch(startDebate({ 
        debateId: debateSession.id, 
        topic, 
        participants: participants.map(ai => ai.id) 
      }));
      
      setSession(debateSession);
      setStatus(debateSession.status);
      setIsInitialized(true);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize debate session';
      setError(errorMessage);
      setStatus(DebateStatus.ERROR);
    }
  }, [orchestrator, dispatch]);
  
  // Reset session
  const resetSession = useCallback(() => {
    if (orchestrator) {
      orchestrator.reset();
    }
    setSession(null);
    setStatus(DebateStatus.IDLE);
    setIsInitialized(false);
    setError(null);
  }, [orchestrator]);
  
  // Sync status from orchestrator session
  useEffect(() => {
    if (orchestrator && session) {
      const currentSession = orchestrator.getSession();
      if (currentSession) {
        setStatus(currentSession.status);
      }
    }
  }, [orchestrator, session]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (orchestrator) {
        orchestrator.reset();
      }
    };
  }, [orchestrator]);
  
  return {
    session,
    status,
    isInitialized,
    orchestrator,
    initializeSession,
    resetSession,
    error,
  };
};
