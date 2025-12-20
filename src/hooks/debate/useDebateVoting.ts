/**
 * useDebateVoting Hook
 * Manages voting state and interactions with the voting service
 */

import { useEffect, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { recordRoundWinner, recordOverallWinner } from '../../store';
import { DebateOrchestrator, DebateEvent, ScoreBoard } from '../../services/debate';
import { AI } from '../../types';

export interface UseDebateVotingReturn {
  isVoting: boolean;
  votingRound: number;
  isFinalVote: boolean;
  isOverallVote: boolean;
  scores: ScoreBoard | null;
  hasVotedForRound: (round: number) => boolean;
  recordVote: (aiId: string) => Promise<void>;
  getVotingPrompt: () => string;
  error: string | null;
}

export const useDebateVoting = (
  orchestrator: DebateOrchestrator | null,
  _participants: AI[]
): UseDebateVotingReturn => {
  const dispatch = useDispatch();

  const [isVoting, setIsVoting] = useState(false);
  const [votingRound, setVotingRound] = useState(0);
  const [isFinalVote, setIsFinalVote] = useState(false);
  const [isOverallVote, setIsOverallVote] = useState(false);
  const [scores, setScores] = useState<ScoreBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Event handler for voting events
  const handleVotingEvent = useCallback((event: DebateEvent) => {
    switch (event.type) {
      case 'voting_started':
        setIsVoting(true);
        if (typeof event.data.round === 'number') {
          setVotingRound(event.data.round as number);
        }
        setIsFinalVote(!!event.data.isFinalRound);
        setIsOverallVote(!!event.data.isOverallVote);
        break;
        
      case 'voting_completed':
        setIsVoting(false);
        // Update scores if provided
        if (event.data.scores) {
          setScores(event.data.scores as ScoreBoard);
        }
        break;
        
      case 'debate_ended':
        setIsVoting(false);
        // Dispatch the overall winner to Redux if provided
        if (event.data.overallWinner) {
          dispatch(recordOverallWinner({ winnerId: event.data.overallWinner as string }));
        }
        // Note: Stats are persisted in App.tsx which is always mounted
        break;
        
      default:
        break;
    }
  }, [dispatch]);
  
  // Update scores from voting service
  const updateScores = useCallback(() => {
    if (orchestrator) {
      const votingService = orchestrator.getVotingService();
      if (votingService) {
        const currentScores = votingService.calculateScores();
        setScores(currentScores);
      }
    }
  }, [orchestrator]);
  
  // Register event handler
  useEffect(() => {
    if (orchestrator) {
      orchestrator.addEventListener(handleVotingEvent);
      
      return () => {
        orchestrator.removeEventListener(handleVotingEvent);
      };
    }
    return undefined;
  }, [orchestrator, handleVotingEvent]);
  
  // Check if voted for a specific round
  const hasVotedForRound = useCallback((round: number): boolean => {
    if (orchestrator) {
      const votingService = orchestrator.getVotingService();
      if (votingService) {
        return votingService.hasVotedForRound(round);
      }
    }
    return false;
  }, [orchestrator]);
  
  // Record a vote
  const recordVote = useCallback(async (aiId: string): Promise<void> => {
    if (!orchestrator) {
      setError('No active orchestrator');
      return;
    }
    
    try {
      setError(null);

      // Record vote in Redux store FIRST
      // This must happen before orchestrator.recordVote because on the final round,
      // the orchestrator will emit debate_ended which triggers recordOverallWinner
      // and clears currentDebate. If we dispatch after, currentDebate is already gone.
      if (!isOverallVote) {
        dispatch(recordRoundWinner({ round: votingRound, winnerId: aiId }));
      }

      // Record vote in orchestrator (may trigger debate_ended for final round)
      await orchestrator.recordVote(votingRound, aiId, isOverallVote);

      // Note: recordOverallWinner is dispatched by the debate_ended event handler,
      // so we don't need to dispatch it here

      // Scores will be updated by the useEffect watching orchestrator

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to record vote';
      setError(errorMessage);
    }
  }, [orchestrator, votingRound, isOverallVote, dispatch]);
  
  // Get voting prompt text
  const getVotingPrompt = useCallback((): string => {
    if (orchestrator) {
      const votingService = orchestrator.getVotingService();
      if (votingService) {
        return votingService.getVotingPrompt(votingRound, isFinalVote, isOverallVote);
      }
    }
    return '';
  }, [orchestrator, votingRound, isFinalVote, isOverallVote]);
  
  // Initialize scores when orchestrator is available
  useEffect(() => {
    updateScores();
  }, [orchestrator, updateScores]);

  return {
    isVoting,
    votingRound,
    isFinalVote,
    isOverallVote,
    scores,
    hasVotedForRound,
    recordVote,
    getVotingPrompt,
    error,
  };
};