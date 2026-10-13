/**
 * useDebateFlow Hook
 * Manages the debate flow orchestration and event handling
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { addMessage, setTypingAI, updateMessage } from '../../store';
import {
  startStreaming,
  endStreaming,
  streamingError,
} from '../../store/streamingSlice';
import {
  appendStreamingContent,
  completeStreamingContent,
  failStreamingContent,
  startStreamingContent,
} from '@/services/streaming/StreamingContentStore';
import { DebateOrchestrator, DebateEvent, DebateStatus, type DebateAudienceQuestionsPrompt, type DebateContinuationPrompt } from '../../services/debate';
import type { PhaseId } from '../../services/debate';
import type { OxfordAudienceQuestions } from '@/config/debate/formats';
import { RecordController } from '@/services/demo/RecordController';
import { ensureAnswerContent } from '@/utils/citationUtils';
import { Message } from '../../types';

export interface UseDebateFlowReturn {
  isDebateActive: boolean;
  isDebateEnded: boolean;
  startDebate: () => Promise<void>;
  continueDebate: () => void;
  continuation: DebateContinuationPrompt | null;
  audienceQuestionsPrompt: DebateAudienceQuestionsPrompt | null;
  submitAudienceQuestions: (questions: OxfordAudienceQuestions) => void;
  error: string | null;
  currentRound: number;
  maxRounds: number;
  currentPhase?: PhaseId;
  currentMessageLabel?: string;
  currentCxRole?: 'questioner' | 'answerer';
  currentTurnLabel?: string;
  currentMessageIndex: number;
  totalMessages: number;
}

const PHASE_LABELS: Record<PhaseId, string> = {
  opening: 'Opening',
  constructive: 'Constructive',
  cross_examination: 'Cross-Examination',
  rebuttal: 'Rebuttal',
  final_rebuttal: 'Final Rebuttal',
  question: 'Question',
  closing: 'Closing',
  synthesis: 'Synthesis',
};

const isPhaseId = (value: unknown): value is PhaseId =>
  typeof value === 'string' && value in PHASE_LABELS;

const toCxRole = (value: unknown): 'questioner' | 'answerer' | undefined => {
  if (value === 'questioner' || value === 'answerer') {
    return value;
  }
  return undefined;
};

const buildTurnLabel = (
  messageLabel?: string,
  phase?: PhaseId,
  cxRole?: 'questioner' | 'answerer'
): string | undefined => {
  const baseLabel = messageLabel || (phase ? PHASE_LABELS[phase] : undefined);
  if (!baseLabel) return undefined;

  if (cxRole === 'questioner') return `${baseLabel} · questioning`;
  if (cxRole === 'answerer') return `${baseLabel} · answering`;
  return baseLabel;
};

export const useDebateFlow = (orchestrator: DebateOrchestrator | null): UseDebateFlowReturn => {
  const dispatch = useDispatch();

  const [isDebateActive, setIsDebateActive] = useState(false);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [currentPhase, setCurrentPhase] = useState<PhaseId | undefined>(undefined);
  const [currentMessageLabel, setCurrentMessageLabel] = useState<string | undefined>(undefined);
  const [currentCxRole, setCurrentCxRole] = useState<'questioner' | 'answerer' | undefined>(undefined);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [continuation, setContinuation] = useState<DebateContinuationPrompt | null>(null);
  const [audienceQuestionsPrompt, setAudienceQuestionsPrompt] = useState<DebateAudienceQuestionsPrompt | null>(null);
  
  // Use ref to track if we've started the debate to prevent multiple starts
  const hasStartedRef = useRef(false);
  const currentTurnLabel = buildTurnLabel(currentMessageLabel, currentPhase, currentCxRole);
  
  // Event handler for orchestrator events
  const handleDebateEvent = useCallback((event: DebateEvent) => {
    const updateTurnStatus = (): void => {
      const messageLabel = typeof event.data.messageLabel === 'string'
        ? event.data.messageLabel
        : undefined;
      const phase = isPhaseId(event.data.phase) ? event.data.phase : undefined;
      const cxRole = toCxRole(event.data.cxRole);
      if (typeof event.data.messageIndex === 'number') {
        setCurrentMessageIndex(event.data.messageIndex);
      }

      if (messageLabel || phase) {
        setCurrentMessageLabel(messageLabel);
        setCurrentPhase(phase);
        setCurrentCxRole(cxRole);
      }
    };

    switch (event.type) {
      case 'message_added':
        updateTurnStatus();
        if (event.data.message) {
          dispatch(addMessage(event.data.message as Message));
          // If recording a debate, capture assistant messages
          try {
            if (RecordController.isActive()) {
              const m = event.data.message as Message & { metadata?: { providerId?: string } };
              if (m.senderType === 'ai') {
                const provider = m?.metadata?.providerId || '';
                RecordController.recordAssistantMessage(provider, m.content || '');
              }
            }
          } catch { /* ignore */ }
        }
        break;
      
      case 'debate_started': {
        // Initialize rounds from the session payload if present
        const session = (event.data?.session || null) as {
          totalRounds?: number;
          totalMessages?: number;
          currentRound?: number;
          messageIndex?: number;
          preset?: {
            messages?: Array<{
              label?: string;
              phase?: unknown;
              cxRole?: unknown;
            }>;
          };
        } | null;
        if (session?.totalRounds) setMaxRounds(session.totalRounds);
        if (session?.totalMessages) setTotalMessages(session.totalMessages);
        if (session?.currentRound) setCurrentRound(session.currentRound);
        if (typeof session?.messageIndex === 'number') {
          setCurrentMessageIndex(session.messageIndex);
        } else {
          setCurrentMessageIndex(0);
        }
        const firstMessage = session?.preset?.messages?.[0];
        setCurrentMessageLabel(firstMessage?.label);
        setCurrentPhase(isPhaseId(firstMessage?.phase) ? firstMessage.phase : undefined);
        setCurrentCxRole(toCxRole(firstMessage?.cxRole));
        setContinuation(null);
        setIsDebateActive(true);
        setIsDebateEnded(false);
        break;
      }
      
      case 'typing_started':
        updateTurnStatus();
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
        setCurrentMessageLabel(undefined);
        setCurrentPhase(undefined);
        setCurrentCxRole(undefined);
        setContinuation(null);
        break;
      
      // Streaming lifecycle events
      case 'stream_started': {
        updateTurnStatus();
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const aiProvider = String((event.data as { aiProvider?: string }).aiProvider || '');
        if (messageId) {
          startStreamingContent({ messageId, aiProvider });
          dispatch(startStreaming({ messageId, aiProvider }));
        }
        break;
      }
      case 'stream_chunk': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const chunk = String((event.data as { chunk?: string }).chunk || '');
        if (messageId && chunk) appendStreamingContent(messageId, chunk);
        // If recording a debate, capture chunks
        try {
          if (RecordController.isActive()) {
            const src = event.data as { aiProvider?: string; providerId?: string };
            const aiProvider = String(src?.aiProvider || src?.providerId || '');
            if (aiProvider) RecordController.recordAssistantChunk(aiProvider, chunk);
          }
        } catch (_e) { console.warn('debate stream chunk capture failed', _e); }
        break;
      }
      case 'stream_completed': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const finalContent = String((event.data as { finalContent?: string }).finalContent || '');
        const modelUsed = (event.data as { modelUsed?: string }).modelUsed;
        const webSearchEnabled = Boolean((event.data as { webSearchEnabled?: boolean }).webSearchEnabled);
        const citations = (event.data as { citations?: Array<{ index: number; url: string; title?: string; snippet?: string }> }).citations;
        const lifecycle = (event.data as { lifecycle?: NonNullable<Message['metadata']>['lifecycle'] }).lifecycle;
        const normalizedAnswer = ensureAnswerContent(finalContent, citations, 'The AI');
        if (messageId) {
          completeStreamingContent(messageId, normalizedAnswer.content);
          dispatch(endStreaming({ messageId, finalContent: normalizedAnswer.content }));
          // Persist final content to the chat store, including citations if present
          dispatch(updateMessage({
            id: messageId,
            content: normalizedAnswer.content,
            metadata: {
              ...(modelUsed ? { modelUsed } : {}),
              webSearchEnabled,
              ...(normalizedAnswer.citations ? { citations: normalizedAnswer.citations } : {}),
              ...(lifecycle ? { lifecycle } : {}),
            },
          }));
        }
        break;
      }
      case 'stream_error': {
        const messageId = String((event.data as { messageId?: string }).messageId || '');
        const error = String((event.data as { error?: string }).error || 'Streaming error');
        if (messageId) {
          failStreamingContent(messageId, error);
          dispatch(streamingError({ messageId, error }));
        }
        break;
      }

      case 'voting_started': {
        const votingLabel = typeof event.data.votingLabel === 'string'
          ? event.data.votingLabel
          : undefined;
        const round = typeof event.data.round === 'number' ? event.data.round : undefined;
        setCurrentMessageLabel(votingLabel ? `Vote: ${votingLabel}` : round ? `Vote ${round}` : 'Vote');
        setCurrentPhase(undefined);
        setCurrentCxRole(undefined);
        setContinuation(null);
        setAudienceQuestionsPrompt(null);
        break;
      }

      case 'continuation_required': {
        const title = typeof event.data.title === 'string'
          ? event.data.title
          : 'Review checkpoint';
        const message = typeof event.data.message === 'string'
          ? event.data.message
          : 'Review the latest speeches before the debate continues.';
        const buttonLabel = typeof event.data.buttonLabel === 'string'
          ? event.data.buttonLabel
          : 'Continue Debate';
        const completedMessageIndex = typeof event.data.completedMessageIndex === 'number'
          ? event.data.completedMessageIndex
          : 0;
        const nextMessageIndex = typeof event.data.nextMessageIndex === 'number'
          ? event.data.nextMessageIndex
          : undefined;
        const continueAction = typeof event.data.continueAction === 'string'
          ? event.data.continueAction as DebateContinuationPrompt['continueAction']
          : undefined;
        const retryMessageId = typeof event.data.retryMessageId === 'string'
          ? event.data.retryMessageId
          : undefined;

        setContinuation({
          title,
          message,
          buttonLabel,
          isFinalReview: Boolean(event.data.isFinalReview),
          completedMessageIndex,
          ...(typeof nextMessageIndex === 'number' ? { nextMessageIndex } : {}),
          ...(continueAction ? { continueAction } : {}),
          ...(retryMessageId ? { retryMessageId } : {}),
        });
        setAudienceQuestionsPrompt(null);
        setCurrentMessageLabel(title);
        setCurrentPhase(undefined);
        setCurrentCxRole(undefined);
        setCurrentMessageIndex(completedMessageIndex);
        setIsDebateActive(true);
        break;
      }

      case 'audience_questions_requested': {
        const title = typeof event.data.title === 'string'
          ? event.data.title
          : 'Audience questions';
        const message = typeof event.data.message === 'string'
          ? event.data.message
          : 'Enter one question for each side before the debate continues.';
        const completedMessageIndex = typeof event.data.completedMessageIndex === 'number'
          ? event.data.completedMessageIndex
          : 0;
        const nextMessageIndex = typeof event.data.nextMessageIndex === 'number'
          ? event.data.nextMessageIndex
          : completedMessageIndex + 1;
        const affirmativeLabel = typeof event.data.affirmativeLabel === 'string'
          ? event.data.affirmativeLabel
          : 'Affirmative';
        const negativeLabel = typeof event.data.negativeLabel === 'string'
          ? event.data.negativeLabel
          : 'Negative';

        setAudienceQuestionsPrompt({
          title,
          message,
          completedMessageIndex,
          nextMessageIndex,
          affirmativeLabel,
          negativeLabel,
          required: true,
        });
        setContinuation(null);
        setCurrentMessageLabel(title);
        setCurrentPhase(undefined);
        setCurrentCxRole(undefined);
        setCurrentMessageIndex(completedMessageIndex);
        setIsDebateActive(true);
        break;
      }

      case 'audience_questions_submitted':
        setAudienceQuestionsPrompt(null);
        break;
      
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
        setIsDebateActive(
          session.status === DebateStatus.ACTIVE ||
          session.status === DebateStatus.PAUSED_FOR_REVIEW ||
          session.status === DebateStatus.VOTING_ROUND ||
          session.status === DebateStatus.VOTING_OVERALL
        );
        setIsDebateEnded(session.status === DebateStatus.COMPLETED);
        setCurrentRound(session.currentRound);
        setMaxRounds(session.totalRounds);
        setCurrentMessageIndex(session.messageIndex);
        setTotalMessages(session.totalMessages);
        setContinuation(orchestrator.getPendingContinuation());
        setAudienceQuestionsPrompt(orchestrator.getPendingAudienceQuestions());
      }
    }
  }, [orchestrator]);

  const continueDebate = useCallback((): void => {
    setContinuation(null);
    orchestrator?.continueDebate();
  }, [orchestrator]);

  const submitAudienceQuestions = useCallback((questions: OxfordAudienceQuestions): void => {
    orchestrator?.submitAudienceQuestions(questions);
    setAudienceQuestionsPrompt(null);
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
      
      await orchestrator.startDebate();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start debate';
      setError(errorMessage);
      setIsDebateActive(false);
      hasStartedRef.current = false;
    }
  }, [orchestrator]);
  
  // Reset when orchestrator changes
  useEffect(() => {
    hasStartedRef.current = false;
    setIsDebateActive(false);
    setIsDebateEnded(false);
    setError(null);
    setCurrentRound(1);
    setCurrentMessageLabel(undefined);
    setCurrentPhase(undefined);
    setCurrentCxRole(undefined);
    setCurrentMessageIndex(0);
    setTotalMessages(0);
    setContinuation(null);
  }, [orchestrator]);
  
  return {
    isDebateActive,
    isDebateEnded,
    startDebate,
    continueDebate,
    continuation,
    audienceQuestionsPrompt,
    submitAudienceQuestions,
    error,
    currentRound,
    maxRounds,
    currentPhase,
    currentMessageLabel,
    currentCxRole,
    currentTurnLabel,
    currentMessageIndex,
    totalMessages,
  };
};
