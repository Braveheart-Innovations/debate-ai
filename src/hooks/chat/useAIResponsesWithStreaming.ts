import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addMessage } from '../../store';
import { Message, MessageAttachment } from '../../types';
import { useAIService } from '../../providers/AIServiceProvider';
import { ChatService, ChatOrchestrator } from '../../services/chat';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { usePersonality } from '@/hooks/usePersonality';

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
    enrichedPrompt: string,
    attachments?: MessageAttachment[]
  ) => Promise<void>;
  retryAIResponses: (
    userMessage: Message,
    existingMessagesOverride: Message[]
  ) => Promise<void>;
  /** Continue an AI reply that was cut off at the provider's length limit. */
  continueResponse: (messageId: string) => Promise<void>;
  isProcessing: boolean;
}

export const useAIResponsesWithStreaming = (_isResuming?: boolean): AIResponsesHook => {
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

  const streamingPreferences = useSelector((state: RootState) => state.streaming?.streamingPreferences || {});
  const globalStreamingEnabled = useSelector((state: RootState) => state.streaming?.globalStreamingEnabled ?? true);

  const messages = useMemo(() => currentSession?.messages ?? [], [currentSession?.messages]);
  const { isDemo } = useFeatureAccess();
  const { getPersonality: getMergedPersonality } = usePersonality();

  // Build merged personalities map from context (keyed by personality ID)
  const mergedPersonalities = useMemo(() => {
    const result: Record<string, NonNullable<ReturnType<typeof getMergedPersonality>>> = {};
    Object.values(aiPersonalities).forEach((personalityId) => {
      if (personalityId && personalityId !== 'default' && !result[personalityId]) {
        const merged = getMergedPersonality(personalityId);
        if (merged) {
          result[personalityId] = merged;
        }
      }
    });
    return result;
  }, [aiPersonalities, getMergedPersonality]);

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

  const processAIResponses = useCallback(async (
    userMessage: Message,
    enrichedPrompt?: string,
    attachments?: MessageAttachment[],
    existingMessagesOverride?: Message[]
  ) => {
    if (!aiService || !isInitialized || !currentSession || !orchestratorRef.current) {
      console.error('AI service not ready or no active session');
      return;
    }

    await orchestratorRef.current.processUserMessage({
      userMessage,
      existingMessages: existingMessagesOverride || messages,
      mentions: userMessage.mentions || [],
      enrichedPrompt,
      attachments,
      resumptionContext: undefined,
      aiPersonalities,
      mergedPersonalities,
      selectedModels,
      apiKeys,
      expertModeConfigs,
      streamingPreferences,
      globalStreamingEnabled,
      allowStreaming: true,
      isDemo,
    });
  }, [aiService, apiKeys, expertModeConfigs, globalStreamingEnabled, isDemo, isInitialized, messages, selectedModels, aiPersonalities, mergedPersonalities, streamingPreferences, currentSession]);

  const sendAIResponses = useCallback(async (
    userMessage: Message,
    enrichedPrompt?: string,
    attachments?: MessageAttachment[]
  ) => {
    await processAIResponses(userMessage, enrichedPrompt, attachments);
  }, [processAIResponses]);

  const retryAIResponses = useCallback(async (
    userMessage: Message,
    existingMessagesOverride: Message[]
  ) => {
    await processAIResponses(
      userMessage,
      undefined,
      userMessage.attachments,
      existingMessagesOverride
    );
  }, [processAIResponses]);

  const continueResponse = useCallback(async (messageId: string) => {
    if (!aiService || !isInitialized || !currentSession || !orchestratorRef.current) {
      console.error('AI service not ready or no active session');
      return;
    }

    await orchestratorRef.current.continueResponse({
      messageId,
      messages,
      aiPersonalities,
      mergedPersonalities,
      selectedModels,
      apiKeys,
      expertModeConfigs,
      streamingPreferences,
      globalStreamingEnabled,
      allowStreaming: true,
      isDemo,
    });
  }, [aiService, apiKeys, expertModeConfigs, globalStreamingEnabled, isDemo, isInitialized, messages, selectedModels, aiPersonalities, mergedPersonalities, streamingPreferences, currentSession]);

  const sendQuickStartResponses = useCallback(async (
    userPrompt: string,
    enrichedPrompt: string,
    attachments?: MessageAttachment[]
  ) => {
    if (!aiService || !isInitialized || !currentSession || !orchestratorRef.current) {
      console.error('AI service not ready or no active session');
      return;
    }

    const userMessage: Message = {
      ...ChatService.createUserMessage(userPrompt, []),
      ...(attachments?.length ? { attachments } : {}),
    };
    dispatch(addMessage(userMessage));

    await orchestratorRef.current.processUserMessage({
      userMessage,
      existingMessages: messages,
      mentions: [],
      enrichedPrompt,
      attachments,
      aiPersonalities,
      mergedPersonalities,
      selectedModels,
      apiKeys,
      expertModeConfigs,
      streamingPreferences,
      globalStreamingEnabled,
      allowStreaming: true,
      isDemo,
    });
  }, [aiService, apiKeys, dispatch, expertModeConfigs, globalStreamingEnabled, isDemo, isInitialized, messages, selectedModels, aiPersonalities, mergedPersonalities, streamingPreferences, currentSession]);

  return {
    typingAIs,
    isAnyAITyping: typingAIs.length > 0,
    sendAIResponses,
    sendQuickStartResponses,
    retryAIResponses,
    continueResponse,
    isProcessing: typingAIs.length > 0,
  };
};
