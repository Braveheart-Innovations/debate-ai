import React, { useEffect, useCallback } from 'react';
import { View, Alert, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIServiceLoading, Header, HeaderActions } from '../components/organisms';
import { ErrorService } from '@/services/errors/ErrorService';
import { useAIService } from '../providers/AIServiceProvider';
import { MessageAttachment, type ChatSession } from '../types';
import { getAttachmentSupport } from '../utils/attachmentUtils';
import { shallowEqual, useSelector, useDispatch, useStore } from 'react-redux';
import {
  RootState,
  addMessage,
  updateMessage,
  isApiKeyConfigured,
  loadSession as loadSessionAction,
  setAIPersonality,
  setAIModel,
  clearComposerAttachments,
} from '../store';
import { ImageService } from '../services/images/ImageService';
import { useMergedModalityAvailability } from '../hooks/multimodal/useModalityAvailability';
import { ImageRefinementModal, RefinementProvider } from '../components/organisms/chat/ImageRefinementModal';
import { GeneratedContentReportModal } from '@/components/organisms/report/GeneratedContentReportModal';
import { getImageInputModels, getImageProviderDisplayName } from '../config/imageGenerationModels';
import { loadBase64FromFileUri } from '../services/images/fileCache';
import APIKeyService from '../services/APIKeyService';

// Chat-specific hooks
import {
  useChatSession,
  useChatMessages,
  useChatInput,
  useAIResponsesWithStreaming,
  useMentions,
  useQuickStart,
} from '../hooks/chat';

// Chat-specific components
import {
  ChatMessageList,
  ChatInputBar,
  ChatTypingIndicators,
  ChatMentionSuggestions,
} from '../components/organisms/chat';
import { AIConfig, Message, AIProvider } from '../types';
import { cancelAllStreams, selectActiveStreamCount } from '../store';
import { getStreamingService } from '../services/streaming/StreamingService';
import {
  cancelActiveStreamingContent,
  getStreamingContentSnapshot,
} from '@/services/streaming/StreamingContentStore';
import { DemoContentService } from '@/services/demo/DemoContentService';
import { loadChatScript, primeNextChatTurn, hasNextChatTurn, isTurnComplete } from '@/services/demo/DemoPlaybackRouter';
import { DemoEmptyState } from '@/components/organisms/demo';
import { showSheet } from '@/store';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { ContextBar, DemoProgressIndicator, KeyboardAvoider } from '@/components/molecules';
import { getTotalChatTurns, getCurrentChatTurnIndex } from '@/services/demo/DemoPlaybackRouter';
import { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';
import { RecordController } from '@/services/demo/RecordController';
import { ChatService, StorageService } from '@/services/chat';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AppendToPackService from '@/services/demo/AppendToPackService';
import { useTheme } from '@/theme';
import { ActiveSessionPersistenceService, type ActiveChatSessionSnapshot } from '@/services/lifecycle/ActiveSessionPersistenceService';
import { AppLifecycleService } from '@/services/lifecycle/AppLifecycleService';
import { useRecoverableExitGuard } from '@/hooks/lifecycle/useRecoverableExitGuard';
import type { GeneratedContentReportTarget } from '@/services/reports/GeneratedContentReportService';
import { buildMessageReportTarget } from '@/utils/generatedContentReportTargets';


interface ChatScreenProps {
  navigation: {
    goBack: () => void;
    dispatch?: (action: unknown) => void;
    addListener?: (event: 'beforeRemove', callback: (event: { preventDefault: () => void; data?: { action?: unknown } }) => void) => (() => void) | undefined;
  };
  route: {
    params: {
      sessionId: string;
      resuming?: boolean;
      searchTerm?: string;
      initialPrompt?: string;
      userPrompt?: string;
      autoSend?: boolean;
      demoSampleId?: string;
      selectedAIs?: AIConfig[];
      initialMessages?: Message[];
    };
  };
}

const DEBATE_OPENING_AUDIENCE_STANCE = 'Cast your opening audience stance before the first speech.';

const hasDebateOnlyMessages = (messages: Message[] = []): boolean =>
  messages.some(message =>
    message.sender === 'Debate Host'
    || message.content === DEBATE_OPENING_AUDIENCE_STANCE
  );

const isChatScreenSession = (candidate: ChatSession | null | undefined): boolean => {
  if (!candidate) return false;
  if (candidate.id.startsWith('debate_')) return false;
  if (candidate.sessionType !== undefined && candidate.sessionType !== 'chat') return false;
  if (candidate.topic || candidate.debateConfig) return false;
  if (hasDebateOnlyMessages(candidate.messages)) return false;
  return true;
};

const isRestorableChatSnapshot = (
  snapshot: ActiveChatSessionSnapshot | null,
  expectedSessionId?: string
): boolean => {
  if (!snapshot || snapshot.mode !== 'chat') return false;
  if (expectedSessionId && snapshot.sessionId !== expectedSessionId) return false;
  return isChatScreenSession(snapshot.session)
    && !hasDebateOnlyMessages(snapshot.messages || []);
};

const ChatScreen: React.FC<ChatScreenProps> = ({ navigation, route }) => {
  const { theme, isDark } = useTheme();
  // Extract route parameters
  const { 
    searchTerm, 
    initialPrompt, 
    userPrompt, 
    autoSend,
    resuming,
  } = route.params;

  // Redux and streaming state
  const dispatch = useDispatch();
  const reduxStore = useStore<RootState>();
  const activeStreams = useSelector((state: RootState) => selectActiveStreamCount(state));
  const activeStreamIds = useSelector((state: RootState) => (
    Object.values(state.streaming.streamingMessages)
      .filter(stream => stream.isStreaming)
      .map(stream => stream.messageId)
  ), shallowEqual);
  const aiPersonalities = useSelector((state: RootState) => state.chat.aiPersonalities);
  const selectedModels = useSelector((state: RootState) => state.chat.selectedModels);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys);

  // AI Service state
  const { aiService, isInitialized, isLoading, error } = useAIService();

  // Compose chat hooks
  const session = useChatSession();
  const messages = useChatMessages();
  const input = useChatInput();
  const mentions = useMentions();
  const aiResponses = useAIResponsesWithStreaming(resuming);
  const quickStart = useQuickStart({ initialPrompt, userPrompt, autoSend });
  const isCurrentSessionChat = isChatScreenSession(session.currentSession);
  const selectedAIsForChat = React.useMemo(
    () => isCurrentSessionChat ? session.currentSession?.selectedAIs || [] : [],
    [isCurrentSessionChat, session.currentSession?.selectedAIs]
  );
  const displayMessages = session.currentSession && !isCurrentSessionChat ? [] : messages.messages;

  const availability = useMergedModalityAvailability(
    selectedAIsForChat.map(ai => ({ provider: ai.provider, model: ai.model }))
  );

  const controllersRef = React.useRef<Record<string, AbortController>>({});
  // Refinement modal state
  const [refinementModalVisible, setRefinementModalVisible] = React.useState(false);
  const [refinementImageUri, setRefinementImageUri] = React.useState('');
  const [refinementOriginalPrompt, setRefinementOriginalPrompt] = React.useState('');
  const [refinementOriginalProvider, setRefinementOriginalProvider] = React.useState<AIProvider>('openai');
  const [refinementMessageId, setRefinementMessageId] = React.useState<string | undefined>();
  const { isDemo, canStartTrial } = useFeatureAccess();
  const subscriptionUnlockMessage = canStartTrial
    ? 'Start a free trial to unlock this feature.'
    : 'Upgrade to Premium to unlock this feature.';
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [topicPickerVisible, setTopicPickerVisible] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<GeneratedContentReportTarget | null>(null);
  // Demo progress tracking state
  const [demoCurrentTurn, setDemoCurrentTurn] = React.useState(0);
  const [demoTotalTurns, setDemoTotalTurns] = React.useState(0);
  const [demoComplete, setDemoComplete] = React.useState(false);
  const [recoveryNotice, setRecoveryNotice] = React.useState<string | null>(null);

  const mapProvidersToMentions = React.useCallback((providers: string[]): string[] => {
    const normalized = providers.map(p => p.toLowerCase());
    const results = new Set<string>();
    for (const ai of selectedAIsForChat) {
      if (normalized.includes(ai.provider.toLowerCase())) {
        results.add(ai.name.toLowerCase());
      }
    }
    return Array.from(results);
  }, [selectedAIsForChat]);

  const computeMentionsForTurn = React.useCallback((content: string, providersForTurn: string[] = []) => {
    const textMentions = mentions.parseMentions(content);
    if (!isDemo) return textMentions;
    const scriptedMentions = mapProvidersToMentions(providersForTurn);
    return Array.from(new Set([...textMentions, ...scriptedMentions]));
  }, [isDemo, mapProvidersToMentions, mentions]);

  const dispatchDemoTurn = React.useCallback(async (content: string, providersForTurn: string[] = []) => {
    const messageMentions = computeMentionsForTurn(content, providersForTurn);
    messages.sendMessage(content, messageMentions);
    const userMessage = {
      id: `msg_${Date.now()}`,
      sender: 'You',
      senderType: 'user' as const,
      content,
      timestamp: Date.now(),
      mentions: messageMentions,
    };
    await aiResponses.sendAIResponses(userMessage);
  }, [aiResponses, computeMentionsForTurn, messages]);

  const getMessagesWithStreamingContent = React.useCallback((sourceMessages?: Message[]): Message[] => {
    const baseMessages = sourceMessages || session.currentSession?.messages || [];
    return baseMessages.map((message) => {
      const stream = getStreamingContentSnapshot(message.id);
      if (!stream.exists) return message;

      const interrupted = stream.status === 'interrupted' || stream.status === 'cancelled';
      const content = stream.content || message.content;
      return {
        ...message,
        content,
        metadata: interrupted
          ? {
            ...message.metadata,
            lifecycle: {
              status: stream.status === 'interrupted' ? 'interrupted' : 'cancelled',
              reason: stream.error,
              interruptedAt: stream.endTime || Date.now(),
              partial: content.trim().length > 0,
            },
          }
          : message.metadata,
      };
    });
  }, [session.currentSession?.messages]);

  const saveActiveChatSnapshot = React.useCallback(async (
    status: ActiveChatSessionSnapshot['status'] = 'active',
    reason?: string,
    sessionOverride?: ChatSession
  ) => {
    const currentSession = sessionOverride || session.currentSession;
    if (!currentSession || !isChatScreenSession(currentSession)) return;

    const messagesWithStreamingContent = getMessagesWithStreamingContent(currentSession.messages);
    if (messagesWithStreamingContent.length === 0) return;

    const interruptedMessageIds = messagesWithStreamingContent
      .filter(message => message.metadata?.lifecycle?.status === 'interrupted')
      .map(message => message.id);
    const latestUserMessage = [...messagesWithStreamingContent].reverse().find(message => message.senderType === 'user');

    await ActiveSessionPersistenceService.saveSnapshot({
      mode: 'chat',
      sessionId: currentSession.id,
      status,
      createdAt: currentSession.createdAt,
      session: {
        ...currentSession,
        messages: messagesWithStreamingContent,
        isActive: status !== 'completed',
        lastMessageAt: Date.now(),
      },
      selectedAIs: currentSession.selectedAIs,
      messages: messagesWithStreamingContent,
      selectedModels,
      aiPersonalities,
      interruptedMessageIds,
      pendingTurn: activeStreamIds.length > 0 || status === 'interrupted'
        ? {
          kind: 'chat_response',
          prompt: latestUserMessage?.content,
          messageIds: activeStreamIds.length > 0 ? activeStreamIds : interruptedMessageIds,
          reason,
          interruptedAt: Date.now(),
        }
        : undefined,
    });
  }, [
    aiPersonalities,
    getMessagesWithStreamingContent,
    selectedModels,
    session.currentSession,
    activeStreamIds,
  ]);

  const persistChatCheckpoint = React.useCallback(async (
    chatSession: ChatSession,
    status: ActiveChatSessionSnapshot['status'] = 'active',
    reason?: string
  ) => {
    if (!isChatScreenSession(chatSession) || chatSession.messages.length === 0) return;

    const latestMessageAt = chatSession.messages.reduce(
      (latest, message) => Math.max(latest, message.timestamp || 0),
      chatSession.lastMessageAt || chatSession.createdAt
    );
    const sessionToSave: ChatSession = {
      ...chatSession,
      sessionType: 'chat',
      lastMessageAt: latestMessageAt,
    };

    try {
      await Promise.all([
        StorageService.saveSession(sessionToSave),
        saveActiveChatSnapshot(status, reason, sessionToSave),
      ]);
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'persistChatCheckpoint',
        sessionId: sessionToSave.id,
        status,
      });
    }
  }, [saveActiveChatSnapshot]);

  const recoveryAttemptedRef = React.useRef(false);
  useEffect(() => {
    if (recoveryAttemptedRef.current || session.currentSession) return;
    recoveryAttemptedRef.current = true;

    const restoreSnapshot = async () => {
      const fallbackToStoredChat = async () => {
        if (route.params?.sessionId) {
          await session.loadSession(route.params.sessionId);
        }
      };

      const snapshot = route.params?.sessionId
        ? await ActiveSessionPersistenceService.loadSnapshot<ActiveChatSessionSnapshot>('chat', route.params.sessionId)
        : await ActiveSessionPersistenceService.loadLatestSnapshot<ActiveChatSessionSnapshot>('chat');

      if (!snapshot || snapshot.status === 'completed') {
        if (!snapshot && route.params?.sessionId) {
          await ActiveSessionPersistenceService.clearSnapshot('chat', route.params.sessionId);
        }
        await fallbackToStoredChat();
        return;
      }

      if (!isRestorableChatSnapshot(snapshot, route.params?.sessionId)) {
        await ActiveSessionPersistenceService.clearSnapshot('chat', snapshot.sessionId);
        await fallbackToStoredChat();
        return;
      }

      dispatch(loadSessionAction({
        ...snapshot.session,
        sessionType: 'chat',
        messages: snapshot.messages || snapshot.session.messages,
        isActive: true,
      }));
      Object.entries(snapshot.aiPersonalities || {}).forEach(([aiId, personalityId]) => {
        dispatch(setAIPersonality({ aiId, personalityId }));
      });
      Object.entries(snapshot.selectedModels || {}).forEach(([aiId, modelId]) => {
        dispatch(setAIModel({ aiId, modelId }));
      });

      if (snapshot.status === 'interrupted' || snapshot.interruptedMessageIds?.length) {
        setRecoveryNotice('The last response was interrupted. Retry when you are ready.');
      } else if (snapshot.status === 'active' && snapshot.pendingTurn) {
        setRecoveryNotice('The last response was interrupted. Retry when you are ready.');
      }
    };

    void restoreSnapshot();
  }, [dispatch, route.params?.sessionId, session]);

  const invalidSessionRecoveryKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    const current = session.currentSession;
    if (!current || isChatScreenSession(current)) return;

    const recoveryKey = `${current.id}:${route.params?.sessionId || 'none'}`;
    if (invalidSessionRecoveryKeyRef.current === recoveryKey) return;
    invalidSessionRecoveryKeyRef.current = recoveryKey;

    const recoverChatRoute = async () => {
      session.endSession();
      if (route.params?.sessionId) {
        await session.loadSession(route.params.sessionId);
      }
    };

    void recoverChatRoute();
  }, [route.params?.sessionId, session]);

  useEffect(() => {
    const currentSession = session.currentSession;
    if (!currentSession || !isChatScreenSession(currentSession)) return undefined;

    return AppLifecycleService.register({
      id: `chat-${currentSession.id}`,
      onBackground: () => saveActiveChatSnapshot(activeStreams > 0 ? 'active' : 'backgrounded', 'app_backgrounded'),
      onForeground: async () => {
        const snapshot = await ActiveSessionPersistenceService.loadSnapshot<ActiveChatSessionSnapshot>('chat', currentSession.id);
        if (snapshot
          && isRestorableChatSnapshot(snapshot, currentSession.id)
          && (snapshot.status === 'interrupted' || snapshot.interruptedMessageIds?.length)) {
          setRecoveryNotice('The last response was interrupted. Retry when you are ready.');
        }
      },
    });
  }, [activeStreams, saveActiveChatSnapshot, session.currentSession]);

  const markActiveStreamsInterrupted = React.useCallback((status: 'cancelled' | 'interrupted', reason: string) => {
    activeStreamIds
      .forEach(messageId => {
        const stream = getStreamingContentSnapshot(messageId);
        const content = stream.content || (status === 'interrupted'
          ? 'Response paused when the app backgrounded. Retry when ready.'
          : 'Response stopped. Retry when ready.');
        cancelActiveStreamingContent(messageId, status);
        dispatch(updateMessage({
          id: messageId,
          content,
          metadata: {
            lifecycle: {
              status,
              reason,
              interruptedAt: Date.now(),
              partial: Boolean(stream.content?.trim()),
            },
          },
        }));
      });
  }, [activeStreamIds, dispatch]);

  const handleStopResponses = React.useCallback(async () => {
    markActiveStreamsInterrupted('cancelled', 'user_stop');
    try { getStreamingService().cancelAllStreams('cancelled'); } catch { /* no-op */ }
    dispatch(cancelAllStreams({ reason: 'cancelled' }));
    await saveActiveChatSnapshot('interrupted', 'user_stop');
    setRecoveryNotice('Response stopped. Retry when you are ready.');
  }, [dispatch, markActiveStreamsInterrupted, saveActiveChatSnapshot]);

  const handleRetryInterrupted = React.useCallback(async () => {
    const currentMessages = session.currentSession?.messages || [];
    const lastUserIndex = currentMessages.map(message => message.senderType).lastIndexOf('user');
    if (lastUserIndex < 0) return;

    const userMessage = currentMessages[lastUserIndex];
    const interruptedIds = new Set(
      currentMessages
        .filter(message => message.metadata?.lifecycle?.status === 'interrupted' || message.metadata?.lifecycle?.status === 'cancelled')
        .map(message => message.id)
    );
    const existingMessages = currentMessages.filter((message, index) => (
      index < lastUserIndex && !interruptedIds.has(message.id)
    ));

    setRecoveryNotice(null);
    await aiResponses.retryAIResponses(userMessage, existingMessages);
    await saveActiveChatSnapshot('active');
  }, [aiResponses, saveActiveChatSnapshot, session.currentSession?.messages]);

  // Continue a reply cut off at the provider's length limit (appends to the same message).
  const handleContinueMessage = React.useCallback(async (message: Message) => {
    await aiResponses.continueResponse(message.id);
  }, [aiResponses]);

  const confirmChatLeave = useRecoverableExitGuard({
    navigation,
    shouldGuard: Boolean(activeStreams > 0 || aiResponses.isProcessing),
    title: 'Leave this chat?',
    message: 'The active response will be stopped and saved so you can retry it later.',
    onSaveAndLeave: async () => {
      markActiveStreamsInterrupted('cancelled', 'user_exit');
      try { getStreamingService().cancelAllStreams('cancelled'); } catch { /* no-op */ }
      dispatch(cancelAllStreams({ reason: 'cancelled' }));
      await saveActiveChatSnapshot('interrupted', 'user_exit');
    },
  });

  // Build list of providers available for refinement (those that support img2img)
  const refinementProviders = React.useMemo((): RefinementProvider[] => {
    const allProviders: AIProvider[] = ['openai', 'google', 'grok', 'claude'];
    return allProviders.map(provider => {
      const hasApiKey = isApiKeyConfigured(apiKeys[provider]);
      return {
        provider,
        name: getImageProviderDisplayName(provider),
        supportsImg2Img: getImageInputModels(provider).length > 0,
        hasApiKey,
      };
    });
  }, [apiKeys]);

  // Check if any provider supports refinement (img2img)
  const canRefineImages = React.useMemo(() => {
    return refinementProviders.some(p => p.supportsImg2Img && p.hasApiKey);
  }, [refinementProviders]);

  // Handler for opening the refinement modal from an image
  const handleOpenRefinement = React.useCallback((imageUri: string, originalPrompt: string, originalProvider: AIProvider, messageId?: string) => {
    setRefinementImageUri(imageUri);
    setRefinementOriginalPrompt(originalPrompt);
    setRefinementOriginalProvider(originalProvider);
    setRefinementMessageId(messageId);
    setRefinementModalVisible(true);
  }, []);

  const handleReportChatContent = React.useCallback((message: Message) => {
    setReportTarget(buildMessageReportTarget(
      message,
      'chat',
      session.currentSession?.id
    ));
  }, [session.currentSession?.id]);

  // Handler for executing refinement
  const handleRefineImage = React.useCallback(async (opts: { instructions: string; provider: AIProvider; modelId: string }) => {
    if (isDemo) {
      ErrorService.showInfo(`Image refinement requires a subscription. ${subscriptionUnlockMessage}`, 'chat');
      return;
    }
    setRefinementModalVisible(false);

    const apiKey = await APIKeyService.getKey(opts.provider);
    if (!apiKey) {
      ErrorService.handleWithToast(new Error(`${opts.provider} API key not configured`), { feature: 'chat', provider: opts.provider });
      return;
    }

    const providerName = getImageProviderDisplayName(opts.provider, {
      includeModel: true,
      modelId: opts.modelId,
    });
    const messageId = `msg_${Date.now()}_refine`;

    dispatch(addMessage({
      id: messageId,
      sender: providerName,
      senderType: 'ai',
      content: 'Refining image…',
      timestamp: Date.now(),
      metadata: {
        providerMetadata: { imageGenerating: true, imagePhase: 'rendering', imageStartTime: Date.now() },
        generatedImage: {
          url: '',
          prompt: opts.instructions,
          providerId: opts.provider,
          model: opts.modelId,
          isRefinement: true,
          refinementOf: refinementMessageId,
        },
      },
    }));

    try {
      // Load base64 from file for img2img
      const base64 = await loadBase64FromFileUri(refinementImageUri);
      if (!base64) {
        throw new Error('Could not load image data for refinement');
      }

      const controller = new AbortController();
      controllersRef.current[messageId] = controller;

      // Build refinement prompt combining original context + user instructions
      const refinementPrompt = `Original image prompt: "${refinementOriginalPrompt}"\n\nUser refinement instructions: ${opts.instructions}`;

      const images = await ImageService.generateImage({
        provider: opts.provider,
        model: opts.modelId,
        apiKey,
        prompt: refinementPrompt,
        n: 1,
        signal: controller.signal,
        sourceImage: base64,
      });

      const img = images[0];
      const uri = img?.url || (img?.b64 ? `data:${img.mimeType};base64,${img.b64}` : undefined);

      if (uri) {
        dispatch(updateMessage({
          id: messageId,
          content: '',
          attachments: [{ type: 'image', uri, mimeType: img.mimeType }],
          metadata: {
            providerMetadata: { imageGenerating: false, imagePhase: 'done' },
            generatedImage: {
              url: uri,
              prompt: opts.instructions,
              providerId: opts.provider,
              model: opts.modelId,
              isRefinement: true,
              refinementOf: refinementMessageId,
            },
          },
        }));
      } else {
        dispatch(updateMessage({
          id: messageId,
          content: 'No image returned from refinement',
          metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'error' } },
        }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      dispatch(updateMessage({
        id: messageId,
        content: `Refinement failed: ${errorMsg}`,
        metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'error' } },
      }));
    }
  }, [isDemo, dispatch, refinementImageUri, refinementOriginalPrompt, refinementMessageId, subscriptionUnlockMessage]);

  // Handle message sending
  const handleSendMessage = useCallback(async (messageText?: string, attachments?: MessageAttachment[]): Promise<void> => {
    // In Demo Mode, always gate sending (recording should be done in Premium mode)
    if (isDemo) { dispatch(showSheet({ sheet: 'subscription' })); return; }
    const textToSend = messageText || input.inputText;
    
    if (!textToSend.trim() && (!attachments || attachments.length === 0)) {
      return;
    }
    
    const currentSession = session.currentSession;
    if (!isChatScreenSession(currentSession)) {
      return;
    }
    const chatSession = currentSession as ChatSession;

    // Parse mentions from the message
    const messageMentions = mentions.parseMentions(textToSend);
    
    // If recording, capture the user message text
    try { if (RecordController.isActive() && textToSend.trim()) { RecordController.recordUserMessage(textToSend.trim()); } } catch { /* ignore */ }

    if (!attachments || attachments.length === 0) {
      const validation = ChatService.validateMessageContent(textToSend);
      if (!validation.isValid) {
        console.error('Invalid message:', validation.error);
        return;
      }
    }

    const timestamp = Date.now();
    const userMessage: Message = {
      ...ChatService.createUserMessage(textToSend, messageMentions),
      id: `msg_${timestamp}`,
      timestamp,
      attachments,
    };
    const updatedSession: ChatSession = {
      ...chatSession,
      sessionType: 'chat',
      messages: [...chatSession.messages, userMessage],
      lastMessageAt: userMessage.timestamp,
    };

    dispatch(addMessage(userMessage));
    const checkpoint = persistChatCheckpoint(updatedSession, 'active', 'user_send');
    
    // Clear input and dismiss keyboard
    input.clearInput();
    input.dismissKeyboard();

    await checkpoint;

    // Trigger AI responses; web search is capability-driven per AI downstream
    await aiResponses.sendAIResponses(userMessage, undefined, attachments);
  }, [dispatch, input, session.currentSession, mentions, aiResponses, isDemo, persistChatCheckpoint]);

  const messagePersistenceSignature = React.useMemo(() => {
    const currentSession = session.currentSession;
    if (!isChatScreenSession(currentSession)) return '';
    const chatSession = currentSession as ChatSession;
    return chatSession.messages
      .map(message => [
        message.id,
        message.timestamp,
        message.content.length,
        message.attachments?.length || 0,
        message.metadata?.lifecycle?.status || '',
        message.metadata?.citations?.length || 0,
        message.metadata?.providerMetadata ? JSON.stringify(message.metadata.providerMetadata).length : 0,
      ].join(':'))
      .join('|');
  }, [session.currentSession]);

  // Auto-save session when it is created or messages are added/finalized.
  useEffect(() => {
    const currentSession = session.currentSession;
    if (isChatScreenSession(currentSession)) {
      void persistChatCheckpoint(
        currentSession as ChatSession,
        activeStreams > 0 ? 'active' : 'backgrounded',
        'message_update'
      );
    }
  }, [
    activeStreams,
    messagePersistenceSignature,
    persistChatCheckpoint,
    session.currentSession,
    session.currentSession?.id,
  ]);

  // Handle Quick Start auto-send logic. Attachments staged by the entry
  // composer live in Redux (never in nav params — those are persisted); take
  // them once at fire time via getState so multi-MB base64 stays out of deps.
  const sendQuickStartWithStagedAttachments = useCallback(async (
    quickStartUserPrompt: string,
    enrichedPrompt: string
  ) => {
    const staged = reduxStore.getState().composerAttachments.chat;
    if (staged.length > 0) {
      dispatch(clearComposerAttachments({ mode: 'chat' }));
    }
    await aiResponses.sendQuickStartResponses(
      quickStartUserPrompt,
      enrichedPrompt,
      staged.length > 0 ? staged : undefined
    );
  }, [aiResponses, dispatch, reduxStore]);

  useEffect(() => {
    if (quickStart.hasInitialPrompt || quickStart.shouldAutoSend) {

      quickStart.handleQuickStart(
        sendQuickStartWithStagedAttachments,
        input.setInputText,
        handleSendMessage
      );
    }
  }, [
    quickStart,
    sendQuickStartWithStagedAttachments,
    input.setInputText,
    handleSendMessage,
    initialPrompt,
    userPrompt,
    autoSend,
    session.currentSession,
    isInitialized,
    aiService,
    quickStart.initialPromptSent,
  ]);

  // Demo Mode: start selected sample if provided via navigation
  useEffect(() => {
    const run = async () => {
      if (!isDemo) return;
      if (!isChatScreenSession(session.currentSession)) return;
      if (messages.messages.length > 0) return;
      const sampleId = route.params?.demoSampleId;
      if (!sampleId) return; // Wait for user selection from Home
      try {
        const sample = await DemoContentService.findChatById(sampleId);
        if (!sample) return;
        loadChatScript(sample);
        // Prime and play first turn
        const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
        const content = user || 'Let’s chat.';
        await dispatchDemoTurn(content, scriptedProviders);
      } catch { /* ignore */ }
    };
    run();
  }, [dispatchDemoTurn, isDemo, messages.messages.length, route.params?.demoSampleId, session.currentSession, session.currentSession?.id]);

  // Advance multi-turn demo chat when streaming completes
  const prevActiveStreamsRef = React.useRef<number>(0);
  useEffect(() => {
    const prev = prevActiveStreamsRef.current;
    prevActiveStreamsRef.current = activeStreams;
    if (!isDemo) return;
    if (!isChatScreenSession(session.currentSession)) return;
    // Trigger on transition from >0 to 0 (responses ended)
    if (prev > 0 && activeStreams === 0 && hasNextChatTurn() && isTurnComplete()) {
      const t = setTimeout(async () => {
        try {
          const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
          setDemoCurrentTurn(getCurrentChatTurnIndex() + 1);
          const content = user || 'OK.';
          // If recording, capture the user message
          try { if (RecordController.isActive()) { RecordController.recordUserMessage(content); } } catch { /* ignore */ }
          await dispatchDemoTurn(content, scriptedProviders);
        } catch { /* ignore */ }
      }, 250);
      return () => clearTimeout(t);
    }
    // Check if demo is complete
    if (prev > 0 && activeStreams === 0 && !hasNextChatTurn() && isTurnComplete() && demoTotalTurns > 0) {
      setDemoComplete(true);
    }
    return undefined;
  }, [activeStreams, dispatchDemoTurn, isDemo, session.currentSession, demoTotalTurns]);

  // Fallback: advance multi-turn even for non-streaming responses (no active stream boundary)
  const demoAdvanceGuardRef = React.useRef(false);
  useEffect(() => {
    if (!isDemo) return;
    if (!isChatScreenSession(session.currentSession)) return;
    if (!hasNextChatTurn()) {
      // Mark demo as complete if we have turns and no more to play
      if (demoTotalTurns > 0 && isTurnComplete()) {
        setDemoComplete(true);
      }
      return;
    }
    if (activeStreams > 0) { demoAdvanceGuardRef.current = false; return; }
    if (!isTurnComplete()) { demoAdvanceGuardRef.current = false; return; }
    const last = messages.messages[messages.messages.length - 1];
    if (!last || last.senderType !== 'ai') return;
    if (demoAdvanceGuardRef.current) return;
    demoAdvanceGuardRef.current = true;
    const t = setTimeout(async () => {
      try {
        const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
        setDemoCurrentTurn(getCurrentChatTurnIndex() + 1);
        const content = user || 'OK.';
        try { if (RecordController.isActive()) { RecordController.recordUserMessage(content); } } catch { /* ignore */ }
        await dispatchDemoTurn(content, scriptedProviders);
      } catch { /* ignore */ }
      finally {
        demoAdvanceGuardRef.current = false;
      }
    }, 350);
    return () => {
      clearTimeout(t);
      demoAdvanceGuardRef.current = false;
    };
  }, [messages.messages, messages.messages.length, activeStreams, dispatchDemoTurn, isDemo, session.currentSession, demoTotalTurns]);

  // Handle input changes with mention detection
  const handleInputChange = (text: string): void => {
    input.handleInputChange(text);
    
    // Detect mention trigger
    const shouldShowMentions = mentions.detectMentionTrigger(text);
    mentions.setShowMentions(shouldShowMentions);
  };

  // Handle mention selection
  const handleMentionSelect = (aiName: string): void => {
    mentions.insertMention(aiName, input.inputText, input.setInputText);
  };

  // Handle scroll to search result
  const handleScrollToSearchResult = (messageIndex: number): void => {
    messages.scrollToMessage(messageIndex);
  };

  // Show loading screen while AI service is initializing
  if (isLoading || !isInitialized) {
    return <AIServiceLoading error={error} />;
  }

  const aiNames = selectedAIsForChat.map(ai => ai.name);
  const conversationContextSubtitle = (() => {
    const count = aiNames.length;

    if (count === 0) {
      return 'Preparing symposium';
    } else if (count === 1) {
      return `In dialogue with ${aiNames[0]}`;
    } else if (count === 2) {
      return `${aiNames[0]} meets ${aiNames[1]}`;
    } else if (count === 3) {
      return `${aiNames[0]}, ${aiNames[1]} & ${aiNames[2]}`;
    }

    return `${aiNames[0]}, ${aiNames[1]} & ${count - 2} others`;
  })();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoider keyboardVerticalOffset={0}>
        <View style={{ flex: 1 }}>
        {/* Header */}
        <Header
          variant="gradient"
          slim
          title="The Forum"
          onBack={() => confirmChatLeave(navigation.goBack)}
          showBackButton={true}
          animated={true}
          rightElement={<HeaderActions variant="gradient" helpTopicId="multi-ai-chat" />}
          actionButton={recordModeEnabled ? {
            label: isRecording ? 'Stop' : 'Record',
            onPress: async () => {
              if (isRecording) {
                try {
                  const res = RecordController.stop();
                  if (res && res.session) {
                    const sessionData = res.session as { id?: string };
                    const json = JSON.stringify(sessionData, null, 2);
                    console.warn('[DEMO_RECORDING]', json);
                    try { await Clipboard.setStringAsync(json); } catch { /* ignore */ }
                    // Save to a temp file and open share sheet
                    try {
                      const fileName = `${sessionData.id || 'recording'}_${Date.now()}.json`.replace(/[^a-zA-Z0-9_.-]/g, '_');
                      const path = `${FileSystem.cacheDirectory}${fileName}`;
                      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(path, { mimeType: 'application/json' });
                      }
                    } catch { /* ignore */ }
                    try {
                      Alert.alert(
                        'Recording captured',
                        'Copied to clipboard, saved to a temp file, and printed to logs.',
                        [
                          { text: 'OK' },
                          { text: 'Append to Pack (dev)', onPress: async () => {
                            try {
                              const resp = await AppendToPackService.append(sessionData);
                              if (!resp.ok) {
                                Alert.alert('Append failed', resp.error || 'Unknown error. Is dev packer server running on :8889?');
                              } else {
                                Alert.alert('Appended', 'Recording appended to pack.');
                              }
                            } catch (e) {
                              Alert.alert('Append error', (e as Error)?.message || String(e));
                            }
                          }},
                        ]
                      );
                    } catch { /* ignore */ }
                  }
                } catch { /* ignore */ }
                setIsRecording(false);
              } else {
                setTopicPickerVisible(true);
              }
            },
            variant: isRecording ? 'danger' : 'primary'
          } : undefined}
          showDemoBadge={isDemo}
        />

        <ContextBar
          title="In the Forum"
          subtitle={conversationContextSubtitle}
          testID="chat-context-bar"
        />

        {/* Demo Banner */}
        <DemoBanner
          subtitle={canStartTrial
            ? 'Simulated chat preview. Start a free trial to chat for real.'
            : 'Simulated chat preview. Upgrade to Premium to chat for real.'}
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
        />

        {/* Demo Progress Indicator */}
        {isDemo && demoTotalTurns > 0 && (
          <DemoProgressIndicator
            currentTurn={demoCurrentTurn}
            totalTurns={demoTotalTurns}
            isComplete={demoComplete}
            onReplay={() => {
              // Reset demo state and replay (messages continue in same conversation)
              const sampleId = route.params?.demoSampleId;
              if (sampleId) {
                setDemoCurrentTurn(0);
                setDemoComplete(false);
                // Re-select the same sample to replay
                DemoContentService.findChatById(sampleId).then(sample => {
                  if (sample) {
                    loadChatScript(sample);
                    setDemoTotalTurns(getTotalChatTurns());
                    const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
                    setDemoCurrentTurn(getCurrentChatTurnIndex() + 1);
                    const content = user || 'Let\'s chat.';
                    dispatchDemoTurn(content, scriptedProviders);
                  }
                }).catch(() => { /* ignore */ });
              }
            }}
          />
        )}

        {recoveryNotice && (
          <View style={[
            chatRecoveryStyles.banner,
            {
              backgroundColor: isDark ? theme.colors.card : theme.colors.warning[50],
              borderColor: isDark ? theme.colors.warning[700] : theme.colors.warning[300],
            },
          ]}>
            <Text style={[chatRecoveryStyles.bannerText, { color: theme.colors.text.primary }]}>
              {recoveryNotice}
            </Text>
            <View style={chatRecoveryStyles.bannerActions}>
              <Text
                accessibilityRole="button"
                onPress={() => setRecoveryNotice(null)}
                style={[chatRecoveryStyles.bannerAction, { color: theme.colors.text.secondary }]}
              >
                Dismiss
              </Text>
              <Text
                accessibilityRole="button"
                onPress={handleRetryInterrupted}
                style={[chatRecoveryStyles.bannerAction, { color: theme.colors.primary[600] }]}
              >
                Retry
              </Text>
            </View>
          </View>
        )}

        {/* Message List or Demo Empty State */}
        {isDemo && displayMessages.length === 0 ? (
          <DemoEmptyState
            title="Demo Conversation"
            subtitle="This is a simulated preview of the AI chat experience"
            showArrow={false}
          />
        ) : (
          <ChatMessageList
            messages={displayMessages}
            flatListRef={messages.flatListRef}
            searchTerm={searchTerm}
            onScrollToSearchResult={handleScrollToSearchResult}
            canRefineImages={canRefineImages}
            onRefineImage={handleOpenRefinement}
            onReportContent={handleReportChatContent}
            onContinueMessage={activeStreams > 0 || aiResponses.isProcessing ? undefined : handleContinueMessage}
          />
        )}

        {/* Typing Indicators */}
        <ChatTypingIndicators typingAIs={aiResponses.typingAIs} />

        {/* Mention Suggestions */}
        <ChatMentionSuggestions
          suggestions={selectedAIsForChat}
          onSelectMention={handleMentionSelect}
          visible={mentions.showMentions}
        />

        {/* Input Bar */}
        <ChatInputBar
          inputText={input.inputText}
          onInputChange={handleInputChange}
          onSend={handleSendMessage}
          isProcessing={aiResponses.isProcessing || activeStreams > 0}
          onStop={handleStopResponses}
          placeholder="Type a message..."
          disabled={aiResponses.isProcessing}
          attachmentSupport={getAttachmentSupport(selectedAIsForChat)}
          maxAttachments={20}
          modalityAvailability={{
            imageUpload: availability.imageUpload.supported,
            documentUpload: availability.documentUpload.supported,
            imageGeneration: false, // Image generation moved to Create mode
            videoGeneration: availability.videoGeneration.supported,
          }}
          modalityReasons={{
            imageUpload: availability.imageUpload.supported ? undefined : 'Selected model(s) do not support image input',
            documentUpload: availability.documentUpload.supported ? undefined : 'Selected model(s) do not support document/PDF input',
            imageGeneration: 'Use Create mode to generate images',
            videoGeneration: availability.videoGeneration.supported ? undefined : 'Selected provider(s) do not support video generation',
          }}
        />
        </View>
        <View>
          <ImageRefinementModal
            visible={refinementModalVisible}
            imageUri={refinementImageUri}
            originalProvider={refinementOriginalProvider}
            availableProviders={refinementProviders}
            onClose={() => setRefinementModalVisible(false)}
            onRefine={handleRefineImage}
          />
          <GeneratedContentReportModal
            visible={reportTarget !== null}
            target={reportTarget}
            onClose={() => setReportTarget(null)}
          />
        </View>
      </KeyboardAvoider>
      {/* Record Mode: Chat Topic Picker */}
      {recordModeEnabled && (
        <ChatTopicPickerModal
          visible={topicPickerVisible}
          providers={selectedAIsForChat.map(a => a.provider)}
          personaId={selectedAIsForChat.length === 1 ? (selectedAIsForChat[0].personality || 'default') : undefined}
          allowNewSample={true}
          onClose={() => setTopicPickerVisible(false)}
          onSelect={async (sampleId, title) => {
            setTopicPickerVisible(false);
            if (!isChatScreenSession(session.currentSession)) return;
            try {
              const providers = selectedAIsForChat.map(a => a.provider);
              const comboKey = DemoContentService.comboKey(providers);
              if (sampleId.startsWith('new:')) {
                const rawId = sampleId.slice(4);
                try { RecordController.startChat({ id: rawId, title, comboKey }); } catch { /* ignore */ }
                setIsRecording(true);
                // No script; user will type the first prompt in Premium mode
                return;
              }
              const sample = await DemoContentService.findChatById(sampleId);
              if (!sample) return;
              // Start recording
              try { RecordController.startChat({ id: `${sampleId}_rec_${Date.now()}`, title, comboKey }); } catch { /* ignore */ }
              setIsRecording(true);
              // Load multi-turn script and play first turn
              loadChatScript(sample);
              const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
              const content = user || 'Let’s chat.';
              try { if (RecordController.isActive()) { RecordController.recordUserMessage(content); } } catch { /* ignore */ }
              await dispatchDemoTurn(content, scriptedProviders);
            } catch { /* ignore */ }
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default ChatScreen;

const chatRecoveryStyles = StyleSheet.create({
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  bannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  bannerAction: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 16,
  },
});
