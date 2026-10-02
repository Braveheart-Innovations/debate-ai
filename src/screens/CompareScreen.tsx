import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, ScrollView, Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState, clearComposerAttachments } from '../store';
import { ErrorService } from '@/services/errors/ErrorService';

import {
  Header,
  HeaderActions,
  CompareSplitView,
  CompareUserMessage
} from '../components/organisms';
import { ChatInputBar } from '../components/organisms/chat';
import { useMergedModalityAvailabilityStrict } from '../hooks/multimodal/useModalityAvailability';
import { ImageLightboxModal } from '../components/organisms/chat/ImageLightboxModal';

import { useTheme } from '../theme';
import { useAIService } from '../providers/AIServiceProvider';
import { AIConfig, Message, ChatSession, MessageAttachment, Citation } from '../types';
import { StorageService } from '../services/chat/StorageService';
import { getExpertOverrides } from '../utils/expertMode';
import { getModelById, resolveProviderModelId, supportsWebSearch } from '@/config/modelConfigs';
import { getProviderById } from '@/config/aiProviders';
import { getPersonality } from '@/config/personalities';
import { buildPersonalityRuntime, mergeRuntimeModelParameters } from '@/services/personality';
import { PromptDebugLogger } from '@/services/debug/PromptDebugLogger';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { usePersonality } from '@/hooks/usePersonality';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { KeyboardAvoider } from '@/components/molecules';
import { useDispatch, useStore } from 'react-redux';
import { showSheet } from '@/store';
import { DemoContentService } from '@/services/demo/DemoContentService';
import { loadCompareScript, primeNextCompareTurn, hasNextCompareTurn } from '@/services/demo/DemoPlaybackRouter';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import { getStreamingService, isStreamInterruptedError } from '@/services/streaming/StreamingService';
import { CompareStreamSynchronizer } from '@/services/streaming/CompareStreamSynchronizer';
import { RecordController } from '@/services/demo/RecordController';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CompareRecordPickerModal } from '@/components/organisms/demo/CompareRecordPickerModal';
import AppendToPackService from '@/services/demo/AppendToPackService';
import { ensureAnswerContent } from '@/utils/citationUtils';
import { ActiveSessionPersistenceService, type ActiveCompareSessionSnapshot } from '@/services/lifecycle/ActiveSessionPersistenceService';
import { AppLifecycleService } from '@/services/lifecycle/AppLifecycleService';
import { useRecoverableExitGuard } from '@/hooks/lifecycle/useRecoverableExitGuard';
import { GeneratedContentReportModal } from '@/components/organisms/report/GeneratedContentReportModal';
import type { GeneratedContentReportTarget } from '@/services/reports/GeneratedContentReportService';
import { buildMessageReportTarget } from '@/utils/generatedContentReportTargets';

interface CompareScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
    dispatch?: (action: unknown) => void;
    addListener?: (event: 'beforeRemove', callback: (event: { preventDefault: () => void; data?: { action?: unknown } }) => void) => (() => void) | undefined;
  };
  route: {
    params: {
      leftAI?: AIConfig;
      rightAI?: AIConfig;
      sessionId?: string;
      resuming?: boolean;
      demoSampleId?: string;
      initialPrompt?: string;
    };
  };
}

type ViewMode = 'split' | 'left-full' | 'right-full' | 'left-only' | 'right-only';

type AIResponseResult = string | {
  response: string;
  modelUsed?: string;
  metadata?: {
    citations?: Citation[];
  };
};

const getResponseContent = (response: AIResponseResult): string => (
  typeof response === 'string' ? response : response.response
);

const getResponseModel = (response: AIResponseResult, fallbackModel: string): string => (
  typeof response === 'string' ? fallbackModel : response.modelUsed || fallbackModel
);

const getResponseCitations = (response: AIResponseResult): Citation[] | undefined => (
  typeof response === 'string' ? undefined : response.metadata?.citations
);

const PROVIDER_LABEL_FALLBACKS: Partial<Record<AIConfig['provider'], string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  google: 'Gemini',
  grok: 'Grok',
  mistral: 'Mistral',
  moonshot: 'Kimi',
  openai: 'ChatGPT',
  perplexity: 'Perplexity',
  zai: 'GLM',
};

const humanizeIdentifier = (value: string): string => (
  value
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
);

const getProviderLabel = (ai: AIConfig): string => (
  getProviderById(ai.provider)?.name
    || PROVIDER_LABEL_FALLBACKS[ai.provider]
    || humanizeIdentifier(ai.provider)
);

const getModelLabel = (ai: AIConfig): string => (
  ai.modelConfig?.displayName
    || getModelById(ai.provider, ai.model)?.name
    || humanizeIdentifier(ai.model)
);

const getPersonalityLabel = (ai: AIConfig): string | null => {
  if (!ai.personality || ai.personality === 'default') {
    return null;
  }

  return getPersonality(ai.personality)?.name || humanizeIdentifier(ai.personality);
};

interface CompareAIMetadataCardProps {
  ai: AIConfig;
  side: 'left' | 'right';
}

const CompareAIMetadataCard: React.FC<CompareAIMetadataCardProps> = ({ ai, side }) => {
  const { theme, isDark } = useTheme();
  const personalityLabel = getPersonalityLabel(ai);
  const accentColor = ai.color || theme.colors.primary[500];

  return (
    <View
      style={[
        styles.aiMetadataCard,
        {
          backgroundColor: isDark ? theme.colors.card : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.aiMetadataAccent, { backgroundColor: accentColor }]} />
      <View style={styles.aiMetadataCopy}>
        <Text
          style={[styles.aiMetadataSideLabel, { color: theme.colors.text.secondary }]}
          numberOfLines={1}
        >
          {side === 'left' ? 'Left' : 'Right'}
        </Text>
        <Text
          style={[styles.aiMetadataProvider, { color: theme.colors.text.primary }]}
          numberOfLines={1}
        >
          {getProviderLabel(ai)}
        </Text>
        <Text
          style={[styles.aiMetadataDetail, { color: theme.colors.text.secondary }]}
          numberOfLines={1}
        >
          {getModelLabel(ai)}
        </Text>
        {personalityLabel && (
          <Text
            style={[styles.aiMetadataDetail, { color: theme.colors.text.secondary }]}
            numberOfLines={1}
          >
            {personalityLabel}
          </Text>
        )}
      </View>
    </View>
  );
};

interface CompareAIMetadataHeaderProps {
  leftAI: AIConfig;
  rightAI: AIConfig;
}

const CompareAIMetadataHeader: React.FC<CompareAIMetadataHeaderProps> = ({ leftAI, rightAI }) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.aiMetadataHeader,
        {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
        },
      ]}
      testID="compare-ai-metadata-header"
    >
      <View style={styles.aiMetadataRow}>
        <View style={styles.aiMetadataLeftPane}>
          <CompareAIMetadataCard ai={leftAI} side="left" />
        </View>
        <View style={[styles.aiMetadataDivider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.aiMetadataRightPane}>
          <CompareAIMetadataCard ai={rightAI} side="right" />
        </View>
      </View>
    </View>
  );
};

const CompareScreen: React.FC<CompareScreenProps> = ({ navigation, route }) => {
  const { theme, isDark } = useTheme();
  const { aiService, isInitialized } = useAIService();
  const dispatch = useDispatch();
  const reduxStore = useStore<RootState>();
  const { isDemo, canStartTrial } = useFeatureAccess();
  const { getPersonality: getMergedPersonality } = usePersonality();
  
  // Get models and user status from Redux
  const selectedModels = useSelector((state: RootState) => state.chat.selectedModels);
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {});
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const streamingState = useSelector((state: RootState) => state.streaming);
  
  // Check if we're resuming a session
  const currentSession = useSelector((state: RootState) => 
    route.params?.resuming ? state.chat.currentSession : null
  );
  const [recoveredAIs, setRecoveredAIs] = useState<{ left?: AIConfig; right?: AIConfig }>({});
  
  // Use AIs from resumed session or from params
  const leftAI = currentSession?.selectedAIs[0] || route.params?.leftAI || recoveredAIs.left;
  const rightAI = currentSession?.selectedAIs[1] || route.params?.rightAI || recoveredAIs.right;
  const demoSampleId = route.params?.demoSampleId;
  
  // Check if resumed session had diverged
  const resumedSessionData = currentSession as ChatSession & { hasDiverged?: boolean; continuedWithAI?: string };
  const hadDiverged = resumedSessionData?.hasDiverged || false;
  const continuedWithAIName = resumedSessionData?.continuedWithAI;
  
  // View mode state - initialize based on resumed session state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (hadDiverged && continuedWithAIName && leftAI) {
      return continuedWithAIName === leftAI.name ? 'left-only' : 'right-only';
    }
    return 'split';
  });
  
  const [continuedSide, setContinuedSide] = useState<'left' | 'right' | null>(() => {
    if (hadDiverged && continuedWithAIName && leftAI) {
      return continuedWithAIName === leftAI.name ? 'left' : 'right';
    }
    return null;
  });
  
  // State for messages - initialize from resumed session if available
  const [userMessages, setUserMessages] = useState<Message[]>(() => {
    if (currentSession && route.params?.resuming) {
      return currentSession.messages.filter(m => m.sender === 'You');
    }
    return [];
  });
  
  const [leftMessages, setLeftMessages] = useState<Message[]>(() => {
    if (currentSession && route.params?.resuming && leftAI) {
      return currentSession.messages.filter(m => m.sender === leftAI.name);
    }
    return [];
  });
  
  const [rightMessages, setRightMessages] = useState<Message[]>(() => {
    if (currentSession && route.params?.resuming && rightAI) {
      return currentSession.messages.filter(m => m.sender === rightAI.name);
    }
    return [];
  });
  const [inputText, setInputText] = useState('');
  
  // Streaming and typing states
  const [leftTyping, setLeftTyping] = useState(false);
  const [rightTyping, setRightTyping] = useState(false);
  const [leftStreamingContent, setLeftStreamingContent] = useState('');
  const [rightStreamingContent, setRightStreamingContent] = useState('');
  
  // Track conversation history separately for each AI
  const leftHistoryRef = useRef<Message[]>(currentSession && route.params?.resuming && leftAI
    ? currentSession.messages.filter(m => m.sender === 'You' || m.sender === leftAI.name)
    : []);
  const rightHistoryRef = useRef<Message[]>(currentSession && route.params?.resuming && rightAI
    ? currentSession.messages.filter(m => m.sender === 'You' || m.sender === rightAI.name)
    : []);
  
  // Save comparison session to history
  // Use a stable session ID - either from resumed session or create new one
  const sessionId = useRef(currentSession?.id || route.params?.sessionId || `compare_${Date.now()}`).current;
  const [hasBeenSaved, setHasBeenSaved] = useState(route.params?.resuming || false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [compareSamples, setCompareSamples] = useState<Array<{ id: string; title: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);

  // Image lightbox state
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<GeneratedContentReportTarget | null>(null);
  const synchronizerRef = useRef<CompareStreamSynchronizer | null>(null);
  const leftStreamingContentRef = useRef('');
  const rightStreamingContentRef = useRef('');
  const activeCompareStreamIdsRef = useRef<{ left?: string; right?: string }>({});

  // Refs for capturing citations during streaming
  const leftCitationsRef = useRef<Array<{ index: number; url: string; title?: string; snippet?: string }> | undefined>(undefined);
  const rightCitationsRef = useRef<Array<{ index: number; url: string; title?: string; snippet?: string }> | undefined>(undefined);

  // Effective models for web search availability check
  const leftEffectiveModel = leftAI
    ? (resolveProviderModelId(leftAI.provider, selectedModels[leftAI.id] || leftAI.model) || leftAI.model)
    : '';
  const rightEffectiveModel = rightAI
    ? (resolveProviderModelId(rightAI.provider, selectedModels[rightAI.id] || rightAI.model) || rightAI.model)
    : '';

  React.useEffect(() => {
    leftStreamingContentRef.current = leftStreamingContent;
  }, [leftStreamingContent]);

  React.useEffect(() => {
    rightStreamingContentRef.current = rightStreamingContent;
  }, [rightStreamingContent]);

  const saveActiveCompareSnapshot = useCallback(async (
    status: ActiveCompareSessionSnapshot['status'] = 'active',
    reason?: string
  ) => {
    if (!leftAI || !rightAI) return;
    const hasWork = userMessages.length > 0
      || leftMessages.length > 0
      || rightMessages.length > 0
      || Boolean(leftStreamingContentRef.current || rightStreamingContentRef.current)
      || leftTyping
      || rightTyping;
    if (!hasWork) return;

    const activeSides: Array<'left' | 'right'> = [];
    if (leftTyping || activeCompareStreamIdsRef.current.left) activeSides.push('left');
    if (rightTyping || activeCompareStreamIdsRef.current.right) activeSides.push('right');

    await ActiveSessionPersistenceService.saveSnapshot({
      mode: 'comparison',
      sessionId,
      status,
      createdAt: userMessages[0]?.timestamp || Date.now(),
      leftAI,
      rightAI,
      selectedAIs: [leftAI, rightAI],
      messages: [
        ...userMessages,
        ...leftMessages,
        ...rightMessages,
      ],
      userMessages,
      leftMessages,
      rightMessages,
      leftStreamingContent: leftStreamingContentRef.current,
      rightStreamingContent: rightStreamingContentRef.current,
      leftTyping,
      rightTyping,
      viewMode,
      continuedSide,
      pendingTurn: activeSides.length > 0 || status === 'interrupted'
        ? {
          kind: 'compare_response',
          side: activeSides.length === 2 ? 'both' : activeSides[0],
          reason,
          messageIds: [
            activeCompareStreamIdsRef.current.left,
            activeCompareStreamIdsRef.current.right,
          ].filter((value): value is string => Boolean(value)),
          prompt: userMessages[userMessages.length - 1]?.content,
          interruptedAt: Date.now(),
        }
        : undefined,
    });
  }, [
    continuedSide,
    leftAI,
    leftMessages,
    leftTyping,
    rightAI,
    rightMessages,
    rightTyping,
    sessionId,
    userMessages,
    viewMode,
  ]);

  const addInterruptedCompareMessage = useCallback((
    side: 'left' | 'right',
    reason: 'cancelled' | 'interrupted',
    partialContent: string
  ) => {
    const ai = side === 'left' ? leftAI : rightAI;
    if (!ai) return;

    const content = partialContent.trim().length > 0
      ? `${partialContent.trim()}\n\n_Response ${reason === 'interrupted' ? 'paused when the app backgrounded' : 'stopped'}. Retry when ready._`
      : `Response ${reason === 'interrupted' ? 'paused when the app backgrounded' : 'stopped'}. Retry when ready.`;
    const message: Message = {
      id: `msg_${side}_interrupted_${Date.now()}`,
      sender: ai.name,
      senderType: 'ai',
      content,
      timestamp: Date.now(),
      metadata: {
        modelUsed: side === 'left' ? leftEffectiveModel : rightEffectiveModel,
        providerId: ai.provider,
        lifecycle: {
          status: reason,
          reason,
          interruptedAt: Date.now(),
          partial: partialContent.trim().length > 0,
        },
      },
    };

    if (side === 'left') {
      setLeftMessages(prev => [...prev, message]);
      leftHistoryRef.current.push(message);
      setLeftStreamingContent('');
      setLeftTyping(false);
    } else {
      setRightMessages(prev => [...prev, message]);
      rightHistoryRef.current.push(message);
      setRightStreamingContent('');
      setRightTyping(false);
    }
  }, [leftAI, leftEffectiveModel, rightAI, rightEffectiveModel]);

  const compareRecoveryAttemptedRef = useRef(false);
  React.useEffect(() => {
    if (compareRecoveryAttemptedRef.current || userMessages.length > 0) return;
    compareRecoveryAttemptedRef.current = true;

    const restoreSnapshot = async () => {
      if (!route.params?.sessionId) return;
      const snapshot = await ActiveSessionPersistenceService.loadSnapshot<ActiveCompareSessionSnapshot>('comparison', route.params.sessionId);
      if (!snapshot || snapshot.status === 'completed') return;

      setRecoveredAIs({ left: snapshot.leftAI, right: snapshot.rightAI });
      setUserMessages(snapshot.userMessages);
      setLeftMessages(snapshot.leftMessages);
      setRightMessages(snapshot.rightMessages);
      setLeftStreamingContent(snapshot.status === 'interrupted' ? '' : snapshot.leftStreamingContent || '');
      setRightStreamingContent(snapshot.status === 'interrupted' ? '' : snapshot.rightStreamingContent || '');
      setLeftTyping(false);
      setRightTyping(false);
      setViewMode(snapshot.viewMode);
      setContinuedSide(snapshot.continuedSide || null);
      leftHistoryRef.current = [
        ...snapshot.userMessages,
        ...snapshot.leftMessages,
      ].sort((a, b) => a.timestamp - b.timestamp);
      rightHistoryRef.current = [
        ...snapshot.userMessages,
        ...snapshot.rightMessages,
      ].sort((a, b) => a.timestamp - b.timestamp);

      if (snapshot.status === 'interrupted' || (snapshot.status === 'active' && snapshot.pendingTurn)) {
        setRecoveryNotice('This comparison was interrupted. Retry your last prompt when ready.');
      }
    };

    void restoreSnapshot();
  }, [route.params?.sessionId, userMessages.length]);

  // Build provider list for modality availability check
  const selectedList: Array<{ provider: string; model: string }> = (() => {
    if (!leftAI || !rightAI) return [];
    if (viewMode === 'left-only' || continuedSide === 'left') return [{ provider: leftAI.provider, model: leftEffectiveModel }];
    if (viewMode === 'right-only' || continuedSide === 'right') return [{ provider: rightAI.provider, model: rightEffectiveModel }];
    return [
      { provider: leftAI.provider, model: leftEffectiveModel },
      { provider: rightAI.provider, model: rightEffectiveModel },
    ];
  })();
  const availability = useMergedModalityAvailabilityStrict(selectedList);

  // Web search is capability-driven per side — each model that supports it
  // searches; the other pane is unaffected.

  const buildCompareRuntime = useCallback((ai: AIConfig) => {
    const personalityId = ai.personality || 'default';
    const personality = getMergedPersonality(personalityId) || getPersonality(personalityId);
    return buildPersonalityRuntime({
      mode: 'compare',
      personality,
      ai,
    });
  }, [getMergedPersonality]);

  const logComparePrompt = useCallback((
    side: 'left' | 'right',
    ai: AIConfig,
    personalityId: string,
    runtime: ReturnType<typeof buildPersonalityRuntime>,
    adapter: { debugGetSystemPrompt?: () => string } | undefined,
    prompt: string
  ) => {
    PromptDebugLogger.logTurn(`compare-${side}`, {
      aiId: ai.id,
      aiName: ai.name,
      model: ai.model,
      personalityId,
      personalityName: runtime.debug.personalityName,
      systemPromptApplied: runtime.systemPrompt,
      systemPromptAdapter: adapter?.debugGetSystemPrompt?.(),
      userPrompt: prompt,
    });
  }, []);

  const saveComparisonSession = useCallback(async () => {
    if (userMessages.length === 0) return; // Don't save empty sessions
    
    try {
      const isPremium = currentUser?.subscription === 'pro' || currentUser?.subscription === 'business';
      
      // Check if this session already exists
      const existingSession = await StorageService.loadSession(sessionId);
      
      // Only enforce storage limits for truly NEW sessions (not updates)
      if (!existingSession && !hasBeenSaved) {
        await StorageService.enforceStorageLimits('comparison', isPremium, true);
      }
      
      // Combine all messages for storage
      const allMessages: Message[] = [];
      userMessages.forEach((userMsg, index) => {
        allMessages.push(userMsg);
        if (leftMessages[index]) {
          allMessages.push(leftMessages[index]);
        }
        if (rightMessages[index]) {
          allMessages.push(rightMessages[index]);
        }
      });
      
      // Create comparison session with divergence metadata if applicable
      const comparisonSession: ChatSession & { hasDiverged?: boolean; continuedWithAI?: string } = {
        id: sessionId,
        sessionType: 'comparison',
        selectedAIs: [leftAI!, rightAI!], // We know they exist here as this is only called when messages exist
        messages: allMessages,
        isActive: false,
        createdAt: Date.now(),
        lastMessageAt: Date.now(),
        ...(continuedSide && {
          hasDiverged: true,
          continuedWithAI: continuedSide === 'left' ? leftAI!.name : rightAI!.name
        })
      };
      
      // Save to storage
      await StorageService.saveSession(comparisonSession);
    } catch (error) {
      console.error('Failed to save comparison to history:', error);
    }
  }, [userMessages, leftMessages, rightMessages, leftAI, rightAI, currentUser, continuedSide, sessionId, hasBeenSaved]);

  const isProcessing = leftTyping || rightTyping;

  React.useEffect(() => {
    if (userMessages.length === 0 || isProcessing) return;
    void saveComparisonSession().then(() => {
      if (!hasBeenSaved) setHasBeenSaved(true);
    });
  }, [
    hasBeenSaved,
    isProcessing,
    leftMessages.length,
    rightMessages.length,
    saveComparisonSession,
    userMessages.length,
  ]);

  React.useEffect(() => {
    void saveActiveCompareSnapshot(isProcessing ? 'active' : 'backgrounded');
  }, [
    isProcessing,
    leftMessages.length,
    leftStreamingContent,
    rightMessages.length,
    rightStreamingContent,
    saveActiveCompareSnapshot,
    userMessages.length,
  ]);

  React.useEffect(() => {
    return AppLifecycleService.register({
      id: `compare-${sessionId}`,
      onBackground: () => saveActiveCompareSnapshot(isProcessing ? 'active' : 'backgrounded', 'app_backgrounded'),
      onForeground: async () => {
        const snapshot = await ActiveSessionPersistenceService.loadSnapshot<ActiveCompareSessionSnapshot>('comparison', sessionId);
        if (snapshot?.status === 'interrupted') {
          setRecoveryNotice('This comparison was interrupted. Retry your last prompt when ready.');
        }
      },
    });
  }, [isProcessing, saveActiveCompareSnapshot, sessionId]);

  const handleStopCompare = useCallback(async () => {
    try { getStreamingService().cancelAllStreams('cancelled'); } catch { /* ignore */ }
    if (leftTyping && !activeCompareStreamIdsRef.current.left) {
      addInterruptedCompareMessage('left', 'cancelled', leftStreamingContentRef.current);
    }
    if (rightTyping && !activeCompareStreamIdsRef.current.right) {
      addInterruptedCompareMessage('right', 'cancelled', rightStreamingContentRef.current);
    }
    setLeftTyping(false);
    setRightTyping(false);
    await saveActiveCompareSnapshot('interrupted', 'user_stop');
    setRecoveryNotice('Comparison response stopped. Retry your last prompt when ready.');
  }, [addInterruptedCompareMessage, leftTyping, rightTyping, saveActiveCompareSnapshot]);

  const confirmCompareLeave = useRecoverableExitGuard({
    navigation,
    shouldGuard: isProcessing,
    title: 'Leave this comparison?',
    message: 'The active responses will be stopped and saved so you can retry them later.',
    onSaveAndLeave: async () => {
      try { getStreamingService().cancelAllStreams('cancelled'); } catch { /* ignore */ }
      setLeftTyping(false);
      setRightTyping(false);
      await saveActiveCompareSnapshot('interrupted', 'user_exit');
    },
  });
  
  const handleSend = useCallback(async (text?: string, attachments?: MessageAttachment[]) => {
    if (isDemo) { dispatch(showSheet({ sheet: 'subscription' })); return; }
    const messageContent = text?.trim() || inputText.trim();
    if (!messageContent || !aiService || !isInitialized || !leftAI || !rightAI) return;

    const messageText = messageContent;
    setInputText('');

    // Create user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: 'You',
      senderType: 'user',
      content: messageText,
      timestamp: Date.now(),
      attachments,
    };
    // If recording, capture the user message
    try { if (RecordController.isActive()) { RecordController.recordUserMessage(messageText); } } catch (_e) { console.warn('compare record user msg failed', _e); }
    
    // Add to user messages display
    setUserMessages(prev => [...prev, userMessage]);
    
    // Add to both histories
    leftHistoryRef.current.push(userMessage);
    rightHistoryRef.current.push(userMessage);
    
    // Compute effective models, expert params, and execution-time keys.
    const leftEffModel = leftEffectiveModel;
    const rightEffModel = rightEffectiveModel;
    const leftExp = getExpertOverrides(expertModeConfigs as Record<string, unknown>, leftAI.provider);
    const rightExp = getExpertOverrides(expertModeConfigs as Record<string, unknown>, rightAI.provider);
    const leftApiKey = isDemo ? 'demo' : await aiService.getApiKey(leftAI.provider);
    const rightApiKey = isDemo ? 'demo' : await aiService.getApiKey(rightAI.provider);
    const leftAdapter = await aiService.ensureAdapter(leftAI.provider, leftAI.provider, leftEffModel, leftApiKey);
    const rightAdapter = await aiService.ensureAdapter(rightAI.provider, rightAI.provider, rightEffModel, rightApiKey);
    const leftRuntime = buildCompareRuntime({ ...leftAI, model: leftEffModel });
    const rightRuntime = buildCompareRuntime({ ...rightAI, model: rightEffModel });
    const leftRuntimeParameters = mergeRuntimeModelParameters(
      leftExp?.enabled,
      leftExp?.parameters,
      leftRuntime.modelParameters,
      leftAI.parameters
    );
    const rightRuntimeParameters = mergeRuntimeModelParameters(
      rightExp?.enabled,
      rightExp?.parameters,
      rightRuntime.modelParameters,
      rightAI.parameters
    );

    // Determine streaming capability and preferences for each side
    const globalEnabled = streamingState?.globalStreamingEnabled ?? true;
    const leftEnabled = streamingState?.streamingPreferences?.[leftAI.id]?.enabled ?? true;
    const rightEnabled = streamingState?.streamingPreferences?.[rightAI.id]?.enabled ?? true;
    const leftBlocked = !!streamingState?.providerVerificationErrors?.[leftAI.id];
    const rightBlocked = !!streamingState?.providerVerificationErrors?.[rightAI.id];
    const hasLeftKey = Boolean(leftApiKey);
    const hasRightKey = Boolean(rightApiKey);
    const shouldStreamLeft = globalEnabled && leftEnabled && !leftBlocked && hasLeftKey;
    const shouldStreamRight = globalEnabled && rightEnabled && !rightBlocked && hasRightKey;

    // Start typing indicators only for non-streaming sides
    const leftActive = (viewMode === 'split' && !continuedSide) || continuedSide === 'left' || viewMode === 'left-only' || viewMode === 'left-full';
    const rightActive = (viewMode === 'split' && !continuedSide) || continuedSide === 'right' || viewMode === 'right-only' || viewMode === 'right-full';
    
    const pendingPromises: Promise<void>[] = [];

    // Apply personalities before sending. Default intentionally clears reused adapters.
    try {
      aiService.setPersonality(leftAI.provider, leftRuntime.personalityConfig);
      aiService.setPersonality(rightAI.provider, rightRuntime.personalityConfig);
    } catch (_e) { console.warn('compare apply personality failed', _e); }

    logComparePrompt('left', { ...leftAI, model: leftEffModel }, leftAI.personality || 'default', leftRuntime, leftAdapter, messageText);
    logComparePrompt('right', { ...rightAI, model: rightEffModel }, rightAI.personality || 'default', rightRuntime, rightAdapter, messageText);

    // Determine if we should use synchronized streaming (both AIs active and both streaming)
    const useSynchronizedStreaming = leftActive && rightActive && shouldStreamLeft && shouldStreamRight;

    // Create synchronizer for dual streaming
    if (useSynchronizedStreaming) {
      synchronizerRef.current = new CompareStreamSynchronizer(
        { syncIntervalMs: 48, maxBufferSizeChars: 120, startDelayMs: 50, startTimeoutMs: 150 },
        {
          onLeftFlush: (content: string) => {
            setLeftTyping(false);
            setLeftStreamingContent(prev => prev + content);
          },
          onRightFlush: (content: string) => {
            setRightTyping(false);
            setRightStreamingContent(prev => prev + content);
          },
          onLeftComplete: (finalContent: string) => {
            const normalizedAnswer = ensureAnswerContent(finalContent, leftCitationsRef.current, leftAI.name);
            const leftMessage: Message = {
              id: `msg_left_${Date.now()}`,
              sender: leftAI.name,
              senderType: 'ai',
              content: normalizedAnswer.content,
              timestamp: Date.now(),
              metadata: { modelUsed: leftEffModel, providerId: leftAI.provider, citations: normalizedAnswer.citations },
            };
            setLeftMessages(prev => [...prev, leftMessage]);
            leftHistoryRef.current.push(leftMessage);
            setLeftStreamingContent('');
            setLeftTyping(false);
            try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(leftAI.provider, normalizedAnswer.content); } } catch (_e) { console.warn('compare left sync final record failed', _e); }
          },
          onRightComplete: (finalContent: string) => {
            const normalizedAnswer = ensureAnswerContent(finalContent, rightCitationsRef.current, rightAI.name);
            const rightMessage: Message = {
              id: `msg_right_${Date.now()}`,
              sender: rightAI.name,
              senderType: 'ai',
              content: normalizedAnswer.content,
              timestamp: Date.now(),
              metadata: { modelUsed: rightEffModel, providerId: rightAI.provider, citations: normalizedAnswer.citations },
            };
            setRightMessages(prev => [...prev, rightMessage]);
            rightHistoryRef.current.push(rightMessage);
            setRightStreamingContent('');
            setRightTyping(false);
            try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(rightAI.provider, normalizedAnswer.content); } } catch (_e) { console.warn('compare right sync final record failed', _e); }
          },
        }
      );
    }

    // Send to left AI if active
    if (leftActive) {
      setLeftTyping(true);
      try {
        const adapter = leftAdapter;
        if (adapter && leftRuntimeParameters) {
          adapter.config.parameters = leftRuntimeParameters;
        }
      } catch (_e) { console.warn('compare left expert params failed', _e); }

      if (shouldStreamLeft) {
        setLeftStreamingContent('');
        leftCitationsRef.current = undefined; // Clear citations before streaming
        const leftStreamId = `cmp_left_${Date.now()}`;
        activeCompareStreamIdsRef.current.left = leftStreamId;
        const leftStreamPromise = getStreamingService().streamResponse(
          {
            messageId: leftStreamId,
            adapterConfig: {
              provider: leftAI.provider,
              apiKey: leftApiKey || '',
              model: leftEffModel,
              personality: leftRuntime.personalityConfig,
              parameters: leftRuntimeParameters,
              isDebateMode: false,
              webSearchEnabled: supportsWebSearch(leftAI.provider, leftEffModel),
            },
            message: messageText,
            conversationHistory: leftHistoryRef.current,
            attachments,
            modelOverride: leftEffModel,
          },
          (chunk: string) => {
            try { if (RecordController.isActive()) { RecordController.recordAssistantChunk(leftAI.provider, chunk); } } catch (_e) { console.warn('compare left chunk record failed', _e); }
            if (useSynchronizedStreaming && synchronizerRef.current) {
              synchronizerRef.current.appendLeft(chunk);
            } else {
              setLeftTyping(false);
              setLeftStreamingContent(prev => prev + chunk);
            }
          },
          (finalContent: string) => {
            activeCompareStreamIdsRef.current.left = undefined;
            if (useSynchronizedStreaming && synchronizerRef.current) {
              synchronizerRef.current.completeLeft(finalContent);
            } else {
              const normalizedAnswer = ensureAnswerContent(finalContent, leftCitationsRef.current, leftAI.name);
              const leftMessage: Message = {
                id: `msg_left_${Date.now()}`,
                sender: leftAI.name,
                senderType: 'ai',
                content: normalizedAnswer.content,
                timestamp: Date.now(),
                metadata: { modelUsed: leftEffModel, providerId: leftAI.provider, citations: normalizedAnswer.citations },
              };
              setLeftMessages(prev => [...prev, leftMessage]);
              leftHistoryRef.current.push(leftMessage);
              setLeftStreamingContent('');
              setLeftTyping(false);
              try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(leftAI.provider, normalizedAnswer.content); } } catch (_e) { console.warn('compare left final record failed', _e); }
            }
          },
          async (err: Error) => {
            activeCompareStreamIdsRef.current.left = undefined;
            if (isStreamInterruptedError(err)) {
              addInterruptedCompareMessage('left', err.reason, leftStreamingContentRef.current);
              setRecoveryNotice('This comparison was interrupted. Retry your last prompt when ready.');
              await saveActiveCompareSnapshot('interrupted', err.reason);
              return;
            }
            const msg = err?.message || '';
            const isVerification = msg.toLowerCase().includes('verification');
            const isOverload = msg.toLowerCase().includes('overload') || msg.toLowerCase().includes('rate limit');
            try {
              const response = await aiService.sendMessage(leftAI.provider, messageText, leftHistoryRef.current, leftRuntime.personalityConfig || false, undefined, attachments, leftEffModel);
              const normalizedAnswer = ensureAnswerContent(
                getResponseContent(response as AIResponseResult),
                getResponseCitations(response as AIResponseResult),
                leftAI.name
              );
              const leftMessage: Message = {
                id: `msg_left_${Date.now()}`,
                sender: leftAI.name,
                senderType: 'ai',
                content: normalizedAnswer.content,
                timestamp: Date.now(),
                metadata: {
                  modelUsed: getResponseModel(response as AIResponseResult, leftEffModel),
                  providerId: leftAI.provider,
                  citations: normalizedAnswer.citations,
                },
              };
              setLeftMessages(prev => [...prev, leftMessage]);
              leftHistoryRef.current.push(leftMessage);
              try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(leftAI.provider, leftMessage.content); } } catch (_e) { console.warn('compare left fallback final record failed', _e); }
            } catch (fallbackError) {
              console.error('Left AI streaming error:', err, 'fallback error:', fallbackError);
              const errorMsg = isVerification ? `${leftAI.name} requires org verification to stream.` : isOverload ? `${leftAI.name} is overloaded. Try again soon.` : `Failed to get response from ${leftAI.name}`;
              ErrorService.handleWithToast(new Error(errorMsg), { feature: 'compare', provider: leftAI.provider });
            } finally {
              setLeftStreamingContent('');
              setLeftTyping(false);
            }
          },
          (event: unknown) => {
            try {
              const e = event as Record<string, unknown>;
              const type = String(e?.type || '');
              // Handle citations event
              if (type === 'citations') {
                const citations = (e as { citations?: Array<{ index: number; url: string; title?: string; snippet?: string }> }).citations;
                if (citations && citations.length > 0) {
                  leftCitationsRef.current = citations;
                }
              }
              if (type.includes('output_image')) {
                const ee = e as { image?: { url?: string; b64?: string; data?: string }; delta?: { image?: { url?: string; b64?: string; data?: string } }; image_url?: string };
                const imageUrl = ee?.image?.url || ee?.delta?.image?.url || ee?.image_url;
                const imageB64 = ee?.image?.b64 || ee?.delta?.image?.b64 || ee?.image?.data || ee?.delta?.image?.data;
                if (imageUrl) setLeftStreamingContent(prev => prev + `\n\n![image](${imageUrl})\n\n`);
                else if (imageB64) setLeftStreamingContent(prev => prev + `\n\n![image](data:image/png;base64,${imageB64})\n\n`);
                else setLeftStreamingContent(prev => prev + `\n\n[image content]\n\n`);
              }
              if (type.includes('tool')) {
                const name = (e as { tool?: { name?: string }; name?: string }).tool?.name || (e as { name?: string }).name || 'tool';
                const args = (e as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments || (e as { arguments?: unknown }).arguments || (e as { params?: unknown }).params || (e as { parameters?: unknown }).parameters;
                const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
                setLeftStreamingContent(prev => prev + `\n\n[${name} call]\n${snippet}\n`);
              }
              if (process.env.NODE_ENV === 'development') {
                console.warn(`[${leftAI.provider}] event`, JSON.stringify(event).slice(0, 200));
              }
            } catch { /* noop */ }
          }
        ).catch(() => {
          setLeftTyping(false);
        });
        pendingPromises.push(leftStreamPromise);
      } else {
        const leftCompletion = aiService
          .sendMessage(leftAI.provider, messageText, leftHistoryRef.current, leftRuntime.personalityConfig || false, undefined, attachments, leftEffModel)
          .then(response => {
            const normalizedAnswer = ensureAnswerContent(
              getResponseContent(response as AIResponseResult),
              getResponseCitations(response as AIResponseResult),
              leftAI.name
            );
            const leftMessage: Message = {
              id: `msg_left_${Date.now()}`,
              sender: leftAI.name,
              senderType: 'ai',
              content: normalizedAnswer.content,
              timestamp: Date.now(),
              metadata: {
                modelUsed: getResponseModel(response as AIResponseResult, leftEffModel),
                providerId: leftAI.provider,
                citations: normalizedAnswer.citations,
              },
            };
            setLeftMessages(prev => [...prev, leftMessage]);
            leftHistoryRef.current.push(leftMessage);
            try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(leftAI.provider, leftMessage.content); } } catch (err) { console.warn('compare record left direct failed', err); }
            setLeftTyping(false);
            setLeftStreamingContent('');
          })
          .catch(error => {
            console.error('Left AI error:', error);
            setLeftTyping(false);
            ErrorService.handleWithToast(new Error(`Failed to get response from ${leftAI.name}`), { feature: 'compare', provider: leftAI.provider });
          });
        pendingPromises.push(leftCompletion);
      }
    }
    
    // Send to right AI if active
    if (rightActive) {
      setRightTyping(true);
      try {
        const adapter = rightAdapter;
        if (adapter && rightRuntimeParameters) {
          adapter.config.parameters = rightRuntimeParameters;
        }
      } catch (_e) { console.warn('compare right expert params failed', _e); }

      if (shouldStreamRight) {
        setRightStreamingContent('');
        rightCitationsRef.current = undefined; // Clear citations before streaming
        const rightStreamId = `cmp_right_${Date.now()}`;
        activeCompareStreamIdsRef.current.right = rightStreamId;
        const rightStreamPromise = getStreamingService().streamResponse(
          {
            messageId: rightStreamId,
            adapterConfig: {
              provider: rightAI.provider,
              apiKey: rightApiKey || '',
              model: rightEffModel,
              personality: rightRuntime.personalityConfig,
              parameters: rightRuntimeParameters,
              isDebateMode: false,
              webSearchEnabled: supportsWebSearch(rightAI.provider, rightEffModel),
            },
            message: messageText,
            conversationHistory: rightHistoryRef.current,
            attachments,
            modelOverride: rightEffModel,
          },
          (chunk: string) => {
            try { if (RecordController.isActive()) { RecordController.recordAssistantChunk(rightAI.provider, chunk); } } catch (_e) { console.warn('compare right chunk record failed', _e); }
            if (useSynchronizedStreaming && synchronizerRef.current) {
              synchronizerRef.current.appendRight(chunk);
            } else {
              setRightTyping(false);
              setRightStreamingContent(prev => prev + chunk);
            }
          },
          (finalContent: string) => {
            activeCompareStreamIdsRef.current.right = undefined;
            if (useSynchronizedStreaming && synchronizerRef.current) {
              synchronizerRef.current.completeRight(finalContent);
            } else {
              const normalizedAnswer = ensureAnswerContent(finalContent, rightCitationsRef.current, rightAI.name);
              const rightMessage: Message = {
                id: `msg_right_${Date.now()}`,
                sender: rightAI.name,
                senderType: 'ai',
                content: normalizedAnswer.content,
                timestamp: Date.now(),
                metadata: { modelUsed: rightEffModel, providerId: rightAI.provider, citations: normalizedAnswer.citations },
              };
              setRightMessages(prev => [...prev, rightMessage]);
              rightHistoryRef.current.push(rightMessage);
              setRightStreamingContent('');
              setRightTyping(false);
              try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(rightAI.provider, normalizedAnswer.content); } } catch (_e) { console.warn('compare right final record failed', _e); }
            }
          },
          async (err: Error) => {
            activeCompareStreamIdsRef.current.right = undefined;
            if (isStreamInterruptedError(err)) {
              addInterruptedCompareMessage('right', err.reason, rightStreamingContentRef.current);
              setRecoveryNotice('This comparison was interrupted. Retry your last prompt when ready.');
              await saveActiveCompareSnapshot('interrupted', err.reason);
              return;
            }
            const msg = err?.message || '';
            const isVerification = msg.toLowerCase().includes('verification');
            const isOverload = msg.toLowerCase().includes('overload') || msg.toLowerCase().includes('rate limit');
            try {
              const response = await aiService.sendMessage(rightAI.provider, messageText, rightHistoryRef.current, rightRuntime.personalityConfig || false, undefined, attachments, rightEffModel);
              const normalizedAnswer = ensureAnswerContent(
                getResponseContent(response as AIResponseResult),
                getResponseCitations(response as AIResponseResult),
                rightAI.name
              );
              const rightMessage: Message = {
                id: `msg_right_${Date.now()}`,
                sender: rightAI.name,
                senderType: 'ai',
                content: normalizedAnswer.content,
                timestamp: Date.now(),
                metadata: {
                  modelUsed: getResponseModel(response as AIResponseResult, rightEffModel),
                  providerId: rightAI.provider,
                  citations: normalizedAnswer.citations,
                },
              };
              setRightMessages(prev => [...prev, rightMessage]);
              rightHistoryRef.current.push(rightMessage);
              try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(rightAI.provider, rightMessage.content); } } catch (_e) { console.warn('compare right fallback final record failed', _e); }
            } catch (fallbackError) {
              console.error('Right AI streaming error:', err, 'fallback error:', fallbackError);
              const errorMsg = isVerification ? `${rightAI.name} requires org verification to stream.` : isOverload ? `${rightAI.name} is overloaded. Try again soon.` : `Failed to get response from ${rightAI.name}`;
              ErrorService.handleWithToast(new Error(errorMsg), { feature: 'compare', provider: rightAI.provider });
            } finally {
              setRightStreamingContent('');
              setRightTyping(false);
            }
          },
          (event: unknown) => {
            try {
              const e = event as Record<string, unknown>;
              const type = String(e?.type || '');
              // Handle citations event
              if (type === 'citations') {
                const citations = (e as { citations?: Array<{ index: number; url: string; title?: string; snippet?: string }> }).citations;
                if (citations && citations.length > 0) {
                  rightCitationsRef.current = citations;
                }
              }
              if (type.includes('output_image')) {
                const ee = e as { image?: { url?: string; b64?: string; data?: string }; delta?: { image?: { url?: string; b64?: string; data?: string } }; image_url?: string };
                const imageUrl = ee?.image?.url || ee?.delta?.image?.url || ee?.image_url;
                const imageB64 = ee?.image?.b64 || ee?.delta?.image?.b64 || ee?.image?.data || ee?.delta?.image?.data;
                if (imageUrl) setRightStreamingContent(prev => prev + `\n\n![image](${imageUrl})\n\n`);
                else if (imageB64) setRightStreamingContent(prev => prev + `\n\n![image](data:image/png;base64,${imageB64})\n\n`);
                else setRightStreamingContent(prev => prev + `\n\n[image content]\n\n`);
              }
              if (type.includes('tool')) {
                const name = (e as { tool?: { name?: string }; name?: string }).tool?.name || (e as { name?: string }).name || 'tool';
                const args = (e as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments || (e as { arguments?: unknown }).arguments || (e as { params?: unknown }).params || (e as { parameters?: unknown }).parameters;
                const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
                setRightStreamingContent(prev => prev + `\n\n[${name} call]\n${snippet}\n`);
              }
              if (process.env.NODE_ENV === 'development') {
                console.warn(`[${rightAI.provider}] event`, JSON.stringify(event).slice(0, 200));
              }
            } catch { /* noop */ }
          }
        ).catch(() => {
          setRightTyping(false);
        });
        pendingPromises.push(rightStreamPromise);
      } else {
        const rightCompletion = aiService
          .sendMessage(rightAI.provider, messageText, rightHistoryRef.current, rightRuntime.personalityConfig || false, undefined, attachments, rightEffModel)
          .then(response => {
            const normalizedAnswer = ensureAnswerContent(
              getResponseContent(response as AIResponseResult),
              getResponseCitations(response as AIResponseResult),
              rightAI.name
            );
            const rightMessage: Message = {
              id: `msg_right_${Date.now()}`,
              sender: rightAI.name,
              senderType: 'ai',
              content: normalizedAnswer.content,
              timestamp: Date.now(),
              metadata: {
                modelUsed: getResponseModel(response as AIResponseResult, rightEffModel),
                providerId: rightAI.provider,
                citations: normalizedAnswer.citations,
              },
            };
            setRightMessages(prev => [...prev, rightMessage]);
            rightHistoryRef.current.push(rightMessage);
            try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(rightAI.provider, rightMessage.content); } } catch (err) { console.warn('compare record right direct failed', err); }
            setRightTyping(false);
            setRightStreamingContent('');
          })
          .catch(error => {
            console.error('Right AI error:', error);
            setRightTyping(false);
            ErrorService.handleWithToast(new Error(`Failed to get response from ${rightAI.name}`), { feature: 'compare', provider: rightAI.provider });
          });
        pendingPromises.push(rightCompletion);
      }
    }

    if (pendingPromises.length) {
      void Promise.allSettled(pendingPromises);
    }

  }, [
    addInterruptedCompareMessage,
    dispatch,
    inputText,
    aiService,
    isInitialized,
    leftAI,
    rightAI,
    viewMode,
    continuedSide,
    saveActiveCompareSnapshot,
    expertModeConfigs,
    isDemo,
    streamingState?.globalStreamingEnabled,
    streamingState?.streamingPreferences,
    streamingState?.providerVerificationErrors,
    buildCompareRuntime,
    logComparePrompt,
    leftEffectiveModel,
    rightEffectiveModel,
  ]);

  const handleRetryCompare = useCallback(async () => {
    const lastPrompt = userMessages[userMessages.length - 1];
    if (!lastPrompt) return;
    setRecoveryNotice(null);
    await handleSend(lastPrompt.content, lastPrompt.attachments);
  }, [handleSend, userMessages]);

  const dispatchScriptedTurn = useCallback((rawMessage: string) => {
    if (!aiService || !leftAI || !rightAI) return;
    const messageText = rawMessage?.trim().length ? rawMessage.trim() : rawMessage || 'Demo prompt';
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: 'You',
      senderType: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    setUserMessages(prev => [...prev, userMessage]);
    leftHistoryRef.current.push(userMessage);
    rightHistoryRef.current.push(userMessage);

    try { if (RecordController.isActive()) { RecordController.recordUserMessage(messageText); } } catch (e) { console.warn('compare record scripted user failed', e); }

    setLeftTyping(true);
    setRightTyping(true);

    const leftEffModel = leftEffectiveModel;
    const rightEffModel = rightEffectiveModel;
    const leftRuntime = buildCompareRuntime({ ...leftAI, model: leftEffModel });
    const rightRuntime = buildCompareRuntime({ ...rightAI, model: rightEffModel });
    try {
      aiService.setPersonality(leftAI.provider, leftRuntime.personalityConfig);
      aiService.setPersonality(rightAI.provider, rightRuntime.personalityConfig);
    } catch (err) {
      console.warn('compare scripted personality failed', err);
    }

    const leftPromise = aiService.sendMessage(leftAI.provider, messageText, leftHistoryRef.current, leftRuntime.personalityConfig || false, undefined, undefined, leftEffModel)
      .then(response => {
        const normalizedAnswer = ensureAnswerContent(
          getResponseContent(response as AIResponseResult),
          getResponseCitations(response as AIResponseResult),
          leftAI.name
        );
        const leftMessage: Message = {
          id: `msg_left_${Date.now()}`,
          sender: leftAI.name,
          senderType: 'ai',
          content: normalizedAnswer.content,
          timestamp: Date.now(),
          metadata: {
            modelUsed: getResponseModel(response as AIResponseResult, leftEffModel),
            providerId: leftAI.provider,
            citations: normalizedAnswer.citations,
          },
        };
        setLeftMessages(prev => [...prev, leftMessage]);
        leftHistoryRef.current.push(leftMessage);
        try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(leftAI.provider, leftMessage.content); } } catch (err) { console.warn('compare record scripted left failed', err); }
        setLeftTyping(false);
        setLeftStreamingContent('');
      })
      .catch(error => {
        console.warn('compare scripted left failed', error);
        setLeftTyping(false);
      });

    const rightPromise = aiService.sendMessage(rightAI.provider, messageText, rightHistoryRef.current, rightRuntime.personalityConfig || false, undefined, undefined, rightEffModel)
      .then(response => {
        const normalizedAnswer = ensureAnswerContent(
          getResponseContent(response as AIResponseResult),
          getResponseCitations(response as AIResponseResult),
          rightAI.name
        );
        const rightMessage: Message = {
          id: `msg_right_${Date.now()}`,
          sender: rightAI.name,
          senderType: 'ai',
          content: normalizedAnswer.content,
          timestamp: Date.now(),
          metadata: {
            modelUsed: getResponseModel(response as AIResponseResult, rightEffModel),
            providerId: rightAI.provider,
            citations: normalizedAnswer.citations,
          },
        };
        setRightMessages(prev => [...prev, rightMessage]);
        rightHistoryRef.current.push(rightMessage);
        try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(rightAI.provider, rightMessage.content); } } catch (err) { console.warn('compare record scripted right failed', err); }
        setRightTyping(false);
        setRightStreamingContent('');
      })
      .catch(error => {
        console.warn('compare scripted right failed', error);
        setRightTyping(false);
      });

    Promise.allSettled([leftPromise, rightPromise]).then(() => {
      if (!isDemo) return;
      if (!leftAI || !rightAI) return;
      if (!hasNextCompareTurn()) return;
      setTimeout(() => {
        try {
          const { user } = primeNextCompareTurn();
          const nextMessage = user || 'Next demo turn';
          dispatchScriptedTurn(nextMessage);
        } catch (err) {
          console.warn('compare scripted auto-advance failed', err);
        }
      }, 350);
    }).catch(() => {
      // ignore individual rejection handling above
    });
  }, [aiService, buildCompareRuntime, isDemo, leftAI, leftEffectiveModel, rightAI, rightEffectiveModel]);

  // Live mode: auto-send the prompt typed in the Compare composer (fresh
  // sessions only). Attachments staged by the entry composer live in Redux
  // (never in nav params — those are persisted); take them once at fire time.
  const initialPromptSentRef = React.useRef(false);
  React.useEffect(() => {
    const initialPrompt = route.params?.initialPrompt?.trim();
    if (!initialPrompt || initialPromptSentRef.current) return;
    if (isDemo) return;
    if (!isInitialized || !aiService || !leftAI || !rightAI) return;
    if (userMessages.length > 0) return;
    initialPromptSentRef.current = true;
    const staged = reduxStore.getState().composerAttachments.compare;
    if (staged.length > 0) {
      dispatch(clearComposerAttachments({ mode: 'compare' }));
    }
    handleSend(initialPrompt, staged.length > 0 ? staged : undefined);
  }, [route.params?.initialPrompt, isDemo, isInitialized, aiService, leftAI, rightAI, userMessages.length, handleSend, reduxStore, dispatch]);

  // Demo Mode: auto-start playback when both AIs are selected and no messages yet
  React.useEffect(() => {
    const run = async () => {
      if (!isInitialized || !aiService) return;
      if (!isDemo) return;
      if (!leftAI || !rightAI) return;
      if (userMessages.length > 0) return;
      try {
        let sample = demoSampleId
          ? await DemoContentService.findCompareById(demoSampleId)
          : await DemoContentService.getCompareSampleForProviders([leftAI.provider, rightAI.provider]);
        if (!sample && !demoSampleId) {
          sample = await DemoContentService.getCompareSampleForProviders([leftAI.provider, rightAI.provider]);
        }
        if (!sample) return;
        loadCompareScript(sample);
        const { user } = primeNextCompareTurn();
        const messageText = user || `Demo prompt: ${sample.title}`;
        dispatchScriptedTurn(messageText);
      } catch (_e) { console.warn('compare demo auto-start failed', _e); }
    };
    run();
  }, [isDemo, leftAI, rightAI, isInitialized, aiService, userMessages.length, dispatchScriptedTurn, demoSampleId]);

  // Demo Mode: fetch compare samples list for current pair
  React.useEffect(() => {
    const run = async () => {
      if (!isDemo || !leftAI || !rightAI) { setCompareSamples([]); return; }
      const list = await DemoContentService.listCompareSamples([leftAI.provider, rightAI.provider]);
      setCompareSamples(list);
    };
    run();
  }, [isDemo, leftAI, rightAI]);

  const handleContinueWithLeft = useCallback(() => {
    if (!leftAI) return;
    Alert.alert(
      'Continue with ' + leftAI.name,
      'This will end the comparison and continue chatting with only ' + leftAI.name + '. The other conversation will be disabled. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: async () => {
            setViewMode('left-only');
            setContinuedSide('left');
            // Save the comparison session as diverged
            await saveComparisonSession();
          }
        }
      ]
    );
  }, [leftAI, saveComparisonSession]);
  
  const handleContinueWithRight = useCallback(() => {
    if (!rightAI) return;
    Alert.alert(
      'Continue with ' + rightAI.name,
      'This will end the comparison and continue chatting with only ' + rightAI.name + '. The other conversation will be disabled. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: async () => {
            setViewMode('right-only');
            setContinuedSide('right');
            // Save the comparison session as diverged
            await saveComparisonSession();
          }
        }
      ]
    );
  }, [rightAI, saveComparisonSession]);
  
  const handleExpandLeft = useCallback(() => {
    setViewMode(viewMode === 'left-full' ? 'split' : 'left-full');
  }, [viewMode]);
  
  const handleExpandRight = useCallback(() => {
    setViewMode(viewMode === 'right-full' ? 'split' : 'right-full');
  }, [viewMode]);
  
  const handleStartOver = useCallback(() => {
    if (isProcessing) {
      confirmCompareLeave(navigation.goBack);
      return;
    }

    Alert.alert(
      'Start Over',
      'This will end the current comparison. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Over', 
          onPress: async () => {
            // Save the comparison session before leaving
            await saveComparisonSession();
            navigation.goBack();
          }
        }
      ]
    );
  }, [confirmCompareLeave, isProcessing, saveComparisonSession, navigation]);

  // Lightbox handler
  const handleOpenLightbox = useCallback((uri: string) => {
    setLightboxUri(uri);
  }, []);

  const handleReportCompareContent = useCallback((message: Message) => {
    setReportTarget(buildMessageReportTarget(message, 'compare', sessionId));
  }, [sessionId]);

  // Navigate back if AIs are not provided (must be after all hooks)
  if (!leftAI || !rightAI) {
    navigation.goBack();
    return null;
  }
  
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <KeyboardAvoider
        style={styles.keyboardContainer}
        keyboardVerticalOffset={0}
      >
        <View style={styles.screenContent}>
        <Header
          variant="gradient"
          slim
          title="The Lens"
          animated={true}
          rightElement={<HeaderActions variant="gradient" helpTopicId="compare-mode" />}
          actionButton={recordModeEnabled ? {
            label: isRecording ? 'Stop' : 'Record',
            onPress: async () => {
              if (isRecording) {
                try {
                  const res = RecordController.stop();
                  if (res && res.session) {
                    const sessionData = res.session;
                    const json = JSON.stringify(sessionData, null, 2);
                    console.warn('[DEMO_RECORDING_COMPARE]', json);
                    try { await Clipboard.setStringAsync(json); } catch (_e) { console.warn('clipboard failed', _e); }
                    try {
                      const fileName = `${sessionData.id || 'compare'}_${Date.now()}.json`.replace(/[^a-zA-Z0-9_.-]/g, '_');
                      const path = `${FileSystem.cacheDirectory}${fileName}`;
                      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(path, { mimeType: 'application/json' });
                      }
                    } catch (_e) { console.warn('share failed', _e); }
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
                    } catch (_e) { console.warn('append alert failed', _e); }
                  }
                } finally {
                  setIsRecording(false);
                }
              } else {
                setPickerVisible(true);
              }
            },
            variant: isRecording ? 'danger' : 'primary',
          } : undefined}
          showBackButton={true}
          onBack={handleStartOver}
          showDemoBadge={isDemo}
        />

        <CompareAIMetadataHeader leftAI={leftAI} rightAI={rightAI} />

        {isDemo && compareSamples.length > 0 && (
          <DemoSamplesBar
            label="Demo Samples"
            samples={compareSamples}
            onSelect={async (sampleId) => {
              try {
                const sample = await DemoContentService.findCompareById(sampleId);
                if (!sample || !leftAI || !rightAI || !aiService) return;
                loadCompareScript(sample);
                const { user } = primeNextCompareTurn();
                const messageText = user || `Demo prompt: ${sample.title}`;
                dispatchScriptedTurn(messageText);
              } catch (_e) { console.warn('compare samples bar selection failed', _e); }
            }}
          />
        )}

        {recoveryNotice && (
          <View style={[
            styles.recoveryBanner,
            {
              backgroundColor: isDark ? theme.colors.card : theme.colors.warning[50],
              borderColor: isDark ? theme.colors.warning[700] : theme.colors.warning[300],
            },
          ]}>
            <Text style={[styles.recoveryText, { color: theme.colors.text.primary }]}>
              {recoveryNotice}
            </Text>
            <View style={styles.recoveryActions}>
              <Text
                accessibilityRole="button"
                onPress={() => setRecoveryNotice(null)}
                style={[styles.recoveryAction, { color: theme.colors.text.secondary }]}
              >
                Dismiss
              </Text>
              <Text
                accessibilityRole="button"
                onPress={handleRetryCompare}
                style={[styles.recoveryAction, { color: theme.colors.primary[600] }]}
              >
                Retry
              </Text>
            </View>
          </View>
        )}
        
        <ScrollView 
          style={styles.mainContent}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isDemo && (
            <DemoBanner
              subtitle={canStartTrial
                ? 'Sample comparisons only. Start a free trial for live runs.'
                : 'Sample comparisons only. Upgrade to Premium for live runs.'}
              onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
            />
          )}
          {/* User Messages */}
          {userMessages.map((message, index) => (
            <React.Fragment key={message.id}>
              <CompareUserMessage message={message} />
              
              {/* Show split view after each user message */}
              {index < userMessages.length && (
                <CompareSplitView
                  leftAI={leftAI}
                  rightAI={rightAI}
                  leftMessages={leftMessages.filter((_, i) => i === index)}
                  rightMessages={rightMessages.filter((_, i) => i === index)}
                  leftTyping={index === userMessages.length - 1 && leftTyping}
                  rightTyping={index === userMessages.length - 1 && rightTyping}
                  leftStreamingContent={index === userMessages.length - 1 ? leftStreamingContent : undefined}
                  rightStreamingContent={index === userMessages.length - 1 ? rightStreamingContent : undefined}
                  onContinueWithLeft={handleContinueWithLeft}
                  onContinueWithRight={handleContinueWithRight}
                  viewMode={viewMode}
                  continuedSide={continuedSide}
                  onExpandLeft={handleExpandLeft}
                  onExpandRight={handleExpandRight}
                  onOpenLightbox={handleOpenLightbox}
                  onReportContent={handleReportCompareContent}
                />
              )}
            </React.Fragment>
          ))}
        </ScrollView>
        
        {/* Input Bar */}
        <ChatInputBar
          inputText={inputText}
          onInputChange={setInputText}
          onSend={handleSend}
          placeholder={
            continuedSide === 'left' ? `Ask ${leftAI.name}...` :
            continuedSide === 'right' ? `Ask ${rightAI.name}...` :
            "Ask both AIs..."
          }
          disabled={isProcessing}
          isProcessing={isProcessing}
          onStop={handleStopCompare}
          imageGenerationEnabled={false}
          modalityAvailability={{
            imageUpload: availability.imageUpload.supported,
            documentUpload: availability.documentUpload.supported,
            imageGeneration: false,
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
      {recordModeEnabled && (
        <CompareRecordPickerModal
          visible={pickerVisible}
          leftProvider={leftAI.provider}
          rightProvider={rightAI.provider}
          onClose={() => setPickerVisible(false)}
          onSelect={async (sel) => {
            setPickerVisible(false);
            try {
              const providers = [leftAI.provider, rightAI.provider];
              const comboKey = providers.sort().join('+');
              if (sel.type === 'new') {
                RecordController.startCompare({ id: sel.id, title: sel.title, comboKey });
                setIsRecording(true);
                return;
              }
              RecordController.startCompare({ id: `${sel.id}_rec_${Date.now()}`, title: sel.title, comboKey });
              setIsRecording(true);
              const sample = await DemoContentService.findCompareById(sel.id);
              if (sample) {
                if (!aiService) return;
                loadCompareScript(sample);
                const { user } = primeNextCompareTurn();
                const messageText = user || `Demo prompt: ${sample.title}`;
                dispatchScriptedTurn(messageText);
              }
            } catch (_e) { console.warn('compare record picker runtime failed', _e); }
          }}
        />
      )}
      </KeyboardAvoider>
      <ImageLightboxModal
        visible={!!lightboxUri}
        uri={lightboxUri || ''}
        onClose={() => setLightboxUri(null)}
      />
      <GeneratedContentReportModal
        visible={reportTarget !== null}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
  },
  aiMetadataHeader: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  aiMetadataRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  aiMetadataLeftPane: {
    flex: 1,
    paddingRight: 2,
  },
  aiMetadataRightPane: {
    flex: 1,
    paddingLeft: 2,
  },
  aiMetadataDivider: {
    width: 1,
    marginVertical: 4,
  },
  aiMetadataCard: {
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  aiMetadataAccent: {
    width: 4,
  },
  aiMetadataCopy: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  aiMetadataSideLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  aiMetadataProvider: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  aiMetadataDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  recoveryBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  recoveryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  recoveryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  recoveryAction: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 16,
  },
});

export default CompareScreen;
