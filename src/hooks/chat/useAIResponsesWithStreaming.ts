import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addMessage } from '../../store';
import { selectStreamingSpeed } from '../../store/streamingSlice';
import { Message, MessageAttachment } from '../../types';
import { useAIService } from '../../providers/AIServiceProvider';
import { ChatService, ChatOrchestrator } from '../../services/chat';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import type { ResumptionContext } from '../../services/aiAdapter';

export interface AIResponsesHook {
  typingAIs: string[];
  isAnyAITyping: boolean;
  sendAIResponses: (
    userMessage: Message,
    enrichedPrompt?: string,
    attachments?: MessageAttachment[]
  ) => Promise<void>;
  sendQuickStartResponses: (
    userPrompt: string,
    enrichedPrompt: string
  ) => Promise<void>;
  isProcessing: boolean;
}

export const useAIResponsesWithStreaming = (isResuming?: boolean): AIResponsesHook => {
  const dispatch = useDispatch();
  const { aiService, isInitialized } = useAIService();

  const {
    currentSession,
    typingAIs,
    aiPersonalities,
    selectedModels,
  } = useSelector((state: RootState) => state.chat);

  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {});

  const streamingSpeed = useSelector(selectStreamingSpeed);
  const streamingPreferences = useSelector((state: RootState) => state.streaming?.streamingPreferences || {});
  const globalStreamingEnabled = useSelector((state: RootState) => state.streaming?.globalStreamingEnabled ?? true);

  const messages = useMemo(() => currentSession?.messages ?? [], [currentSession?.messages]);
  const { isDemo } = useFeatureAccess();

  const [hasResumed, setHasResumed] = useState(false);
  const orchestratorRef = useRef<ChatOrchestrator | null>(null);

  useEffect(() => {
    if (!aiService) {
      orchestratorRef.current = null;
      return;
    }
    orchestratorRef.current = new ChatOrchestrator(aiService, dispatch);
    return () => {
      orchestratorRef.current = null;
    };
  }, [aiService, dispatch]);

  useEffect(() => {
    orchestratorRef.current?.updateSession(currentSession ?? null);
  }, [currentSession]);

  useEffect(() => {
    setHasResumed(false);
  }, [currentSession?.id]);

  const sendAIResponses = useCallback(async (
    userMessage: Message,
    enrichedPrompt?: string,
    attachments?: MessageAttachment[]
  ) => {
    if (!aiService || !isInitialized || !currentSession || !orchestratorRef.current) {
      console.error('AI service not ready or no active session');
      return;
    }

    let resumptionContext: ResumptionContext | undefined;
    if (isResuming && !hasResumed && messages.length > 0) {
      resumptionContext = {
        originalPrompt: messages[0],
        isResuming: true,
      };
      setHasResumed(true);
    }

    await orchestratorRef.current.processUserMessage({
      userMessage,
      existingMessages: messages,
      mentions: userMessage.mentions || [],
      enrichedPrompt,
      attachments,
      resumptionContext,
      aiPersonalities,
      selectedModels,
      apiKeys,
      expertModeConfigs,
      streamingPreferences,
      globalStreamingEnabled,
      streamingSpeed,
      allowStreaming: true,
      isDemo,
    });
  }, [aiService, apiKeys, expertModeConfigs, globalStreamingEnabled, isDemo, isInitialized, isResuming, messages, selectedModels, aiPersonalities, streamingPreferences, streamingSpeed, currentSession, hasResumed]);

  const sendQuickStartResponses = useCallback(async (
    userPrompt: string,
    enrichedPrompt: string
  ) => {
    if (!aiService || !isInitialized || !currentSession || !orchestratorRef.current) {
      console.error('AI service not ready or no active session');
      return;
    }

    const userMessage = ChatService.createUserMessage(userPrompt, []);
    dispatch(addMessage(userMessage));

    await orchestratorRef.current.processUserMessage({
      userMessage,
      existingMessages: messages,
      mentions: [],
      enrichedPrompt,
      aiPersonalities,
      selectedModels,
      apiKeys,
      expertModeConfigs,
      streamingPreferences,
      globalStreamingEnabled,
      streamingSpeed,
      allowStreaming: true,
      isDemo,
    });
  }, [aiService, apiKeys, dispatch, expertModeConfigs, globalStreamingEnabled, isDemo, isInitialized, messages, selectedModels, aiPersonalities, streamingPreferences, streamingSpeed, currentSession]);

  return {
    typingAIs,
    isAnyAITyping: typingAIs.length > 0,
    sendAIResponses,
    sendQuickStartResponses,
    isProcessing: typingAIs.length > 0,
  };
};
