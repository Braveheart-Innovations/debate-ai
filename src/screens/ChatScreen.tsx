import React, { useEffect, useCallback } from 'react';
import { KeyboardAvoidingView, Platform, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIServiceLoading, Header, HeaderActions } from '../components/organisms';
import { useAIService } from '../providers/AIServiceProvider';
import { MessageAttachment } from '../types';
import { getAttachmentSupport } from '../utils/attachmentUtils';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, addMessage, updateMessage, setWebSearchPreferred } from '../store';
import { ImageService } from '../services/images/ImageService';
import { useMergedModalityAvailability } from '../hooks/multimodal/useModalityAvailability';
import { ImageRefinementModal, RefinementProvider } from '../components/organisms/chat/ImageRefinementModal';
import { getProviderCapabilities } from '../config/providerCapabilities';
import { getImageProviderDisplayName } from '../config/imageGenerationModels';
import { loadBase64FromFileUri } from '../services/images/fileCache';
// import APIKeyService from '../services/APIKeyService';
// import VideoService from '../services/videos/VideoService';

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
import { DemoContentService } from '@/services/demo/DemoContentService';
import { loadChatScript, primeNextChatTurn, hasNextChatTurn, isTurnComplete } from '@/services/demo/DemoPlaybackRouter';
import { DemoEmptyState } from '@/components/organisms/demo';
import { showSheet } from '@/store';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { DemoProgressIndicator } from '@/components/molecules';
import { getTotalChatTurns, getCurrentChatTurnIndex } from '@/services/demo/DemoPlaybackRouter';
import { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';
import { RecordController } from '@/services/demo/RecordController';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AppendToPackService from '@/services/demo/AppendToPackService';


interface ChatScreenProps {
  navigation: {
    goBack: () => void;
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

const ChatScreen: React.FC<ChatScreenProps> = ({ navigation, route }) => {
  // Extract route parameters
  const { 
    searchTerm, 
    initialPrompt, 
    userPrompt, 
    autoSend,
    resuming,
    // selectedAIs, // TODO: Implement continuation from Compare
    // initialMessages // TODO: Implement continuation from Compare
  } = route.params;

  // Redux and streaming state
  const dispatch = useDispatch();
  const activeStreams = useSelector((state: RootState) => selectActiveStreamCount(state));
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys);
  const webSearchPreferred = useSelector((state: RootState) => state.chat.webSearchPreferred);

  // AI Service state
  const { aiService, isInitialized, isLoading, error } = useAIService();

  // Compose chat hooks
  const session = useChatSession();
  const messages = useChatMessages();
  const input = useChatInput();
  const mentions = useMentions();
  const aiResponses = useAIResponsesWithStreaming(resuming);
  const quickStart = useQuickStart({ initialPrompt, userPrompt, autoSend });

  const availability = useMergedModalityAvailability(
    session.selectedAIs.map(ai => ({ provider: ai.provider, model: ai.model }))
  );

  // Web search availability - only show toggle when all selected AIs support it
  const webSearchAvailable = availability.webSearch.supported;
  const webSearchEnabled = webSearchPreferred && webSearchAvailable;
  const controllersRef = React.useRef<Record<string, AbortController>>({});
  // Refinement modal state
  const [refinementModalVisible, setRefinementModalVisible] = React.useState(false);
  const [refinementImageUri, setRefinementImageUri] = React.useState('');
  const [refinementOriginalPrompt, setRefinementOriginalPrompt] = React.useState('');
  const [refinementOriginalProvider, setRefinementOriginalProvider] = React.useState<AIProvider>('openai');
  const [refinementMessageId, setRefinementMessageId] = React.useState<string | undefined>();
  const { isDemo } = useFeatureAccess();
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [topicPickerVisible, setTopicPickerVisible] = React.useState(false);
  // Demo progress tracking state
  const [demoCurrentTurn, setDemoCurrentTurn] = React.useState(0);
  const [demoTotalTurns, setDemoTotalTurns] = React.useState(0);
  const [demoComplete, setDemoComplete] = React.useState(false);

  const mapProvidersToMentions = React.useCallback((providers: string[]): string[] => {
    if (!session.currentSession) return [];
    const selected = session.currentSession.selectedAIs || [];
    const normalized = providers.map(p => p.toLowerCase());
    const results = new Set<string>();
    for (const ai of selected) {
      if (normalized.includes(ai.provider.toLowerCase())) {
        results.add(ai.name.toLowerCase());
      }
    }
    return Array.from(results);
  }, [session.currentSession]);

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

  // Build list of providers available for refinement (those that support img2img)
  const refinementProviders = React.useMemo((): RefinementProvider[] => {
    const allProviders: AIProvider[] = ['openai', 'google', 'grok', 'claude'];
    return allProviders.map(provider => {
      const caps = getProviderCapabilities(provider);
      const hasApiKey = Boolean(apiKeys[provider as keyof typeof apiKeys]);
      return {
        provider,
        name: getImageProviderDisplayName(provider, { includeModel: true }),
        supportsImg2Img: caps.imageGeneration?.supportsImageInput || false,
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

  // Handler for executing refinement
  const handleRefineImage = React.useCallback(async (opts: { instructions: string; provider: AIProvider }) => {
    if (isDemo) {
      Alert.alert('Demo Mode', 'Image refinement requires a subscription. Start a free trial to unlock this feature.');
      return;
    }
    setRefinementModalVisible(false);

    const apiKey = apiKeys[opts.provider as keyof typeof apiKeys];
    if (!apiKey) {
      Alert.alert('Error', `${opts.provider} API key not configured`);
      return;
    }

    const providerName = getImageProviderDisplayName(opts.provider);
    const messageId = `msg_${Date.now()}_refine`;

    dispatch(addMessage({
      id: messageId,
      sender: providerName,
      senderType: 'ai',
      content: 'Refining image…',
      timestamp: Date.now(),
      metadata: {
        providerMetadata: { imageGenerating: true, imagePhase: 'rendering', imageStartTime: Date.now() },
        generatedImage: { url: '', prompt: opts.instructions, providerId: opts.provider, model: '', isRefinement: true, refinementOf: refinementMessageId },
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
              model: '',
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
  }, [isDemo, apiKeys, dispatch, refinementImageUri, refinementOriginalPrompt, refinementMessageId]);

  /* const handleGenerateVideo = async (opts: { prompt: string; resolution: '720p' | '1080p'; duration: 5 | 10 | 15 }) => {
    try {
      const providerAI = session.selectedAIs[0];
      const apiKey = await APIKeyService.getKey(providerAI.provider);
      if (!apiKey) throw new Error(`${providerAI.provider} API key not configured`);
      const videos = await VideoService.generateVideo({ provider: providerAI.provider as any, apiKey, prompt: opts.prompt, resolution: opts.resolution, duration: opts.duration });
      if (videos && videos.length > 0) {
        const messageId = `msg_${Date.now()}_${providerAI.id}`;
        const v = videos[0];
        dispatch(addMessage({ id: messageId, sender: providerAI.name, senderType: 'ai', content: '', timestamp: Date.now(), attachments: [{ type: 'video', uri: v.uri, mimeType: v.mimeType }] }));
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Video generation failed';
      alert(err);
    }
  };
*/

  // Handle message sending
  const handleSendMessage = useCallback(async (messageText?: string, attachments?: MessageAttachment[]): Promise<void> => {
    // In Demo Mode, always gate sending (recording should be done in Premium mode)
    if (isDemo) { dispatch(showSheet({ sheet: 'subscription' })); return; }
    const textToSend = messageText || input.inputText;
    
    if (!textToSend.trim() && (!attachments || attachments.length === 0)) {
      return;
    }
    
    if (!session.currentSession) {
      return;
    }

    // Parse mentions from the message
    const messageMentions = mentions.parseMentions(textToSend);
    
    // If recording, capture the user message text
    try { if (RecordController.isActive() && textToSend.trim()) { RecordController.recordUserMessage(textToSend.trim()); } } catch { /* ignore */ }

    // Send user message with attachments
    messages.sendMessage(textToSend, messageMentions, attachments);
    
    // Clear input and dismiss keyboard
    input.clearInput();
    input.dismissKeyboard();

    // Create user message object for AI responses
    const userMessage = {
      id: `msg_${Date.now()}`,
      sender: 'You',
      senderType: 'user' as const,
      content: textToSend.trim(),
      timestamp: Date.now(),
      mentions: messageMentions,
      attachments,
    };

    // Trigger AI responses with attachments and web search if enabled
    console.warn('[ChatScreen] Sending with webSearchEnabled:', webSearchEnabled, 'webSearchPreferred:', webSearchPreferred, 'webSearchAvailable:', webSearchAvailable);
    await aiResponses.sendAIResponses(userMessage, undefined, attachments, webSearchEnabled);
  }, [dispatch, input, session.currentSession, mentions, messages, aiResponses, isDemo, webSearchEnabled, webSearchPreferred, webSearchAvailable]);

  // Auto-save session when it's created or messages change
  useEffect(() => {
    if (session.currentSession) {
      session.saveSession();
    }
  }, [session, session.currentSession?.id, session.currentSession?.messages.length]);

  // Handle Quick Start auto-send logic
  useEffect(() => {
    if (quickStart.hasInitialPrompt || quickStart.shouldAutoSend) {

      quickStart.handleQuickStart(
        aiResponses.sendQuickStartResponses,
        input.setInputText,
        handleSendMessage
      );
    }
  }, [
    quickStart,
    aiResponses.sendQuickStartResponses,
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
      if (!session.currentSession) return;
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
    if (!session.currentSession) return;
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
    if (!session.currentSession) return;
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

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
        {/* Header */}
        <Header
          variant="gradient"
          title="AI Conversation"
          subtitle={(() => {
            const aiNames = session.selectedAIs.map(ai => ai.name);
            const count = aiNames.length;
            
            if (count === 0) {
              return "Preparing symposium";
            } else if (count === 1) {
              return `In dialogue with ${aiNames[0]}`;
            } else if (count === 2) {
              return `${aiNames[0]} meets ${aiNames[1]}`;
            } else if (count === 3) {
              return `${aiNames[0]}, ${aiNames[1]} & 1 more`;
            } else {
              return `${aiNames[0]}, ${aiNames[1]} & ${count - 2} others`;
            }
          })()}
          onBack={navigation.goBack}
          showBackButton={true}
          showTime={true}
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

        {/* Demo Banner */}
        <DemoBanner
          subtitle="Simulated chat preview. Start a free trial to chat for real."
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

        {/* Message List or Demo Empty State */}
        {isDemo && messages.messages.length === 0 ? (
          <DemoEmptyState
            title="Demo Conversation"
            subtitle="This is a simulated preview of the AI chat experience"
            showArrow={false}
          />
        ) : (
          <ChatMessageList
            messages={messages.messages}
            flatListRef={messages.flatListRef}
            searchTerm={searchTerm}
            onContentSizeChange={messages.scrollToBottom}
            onScrollToSearchResult={handleScrollToSearchResult}
            canRefineImages={canRefineImages}
            onRefineImage={handleOpenRefinement}
          />
        )}

        {/* Typing Indicators */}
        <ChatTypingIndicators typingAIs={aiResponses.typingAIs} />

        {/* Mention Suggestions */}
        <ChatMentionSuggestions
          suggestions={session.selectedAIs}
          onSelectMention={handleMentionSelect}
          visible={mentions.showMentions}
        />

        {/* Input Bar */}
        <ChatInputBar
          inputText={input.inputText}
          onInputChange={handleInputChange}
          onSend={handleSendMessage}
          isProcessing={aiResponses.isProcessing || activeStreams > 0}
          onStop={() => {
            // Abort active network streams and update UI state
            try { getStreamingService().cancelAllStreams(); } catch { /* no-op */ }
            dispatch(cancelAllStreams());
          }}
          placeholder="Type a message..."
          disabled={aiResponses.isProcessing}
          attachmentSupport={getAttachmentSupport(session.selectedAIs)}
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
          webSearchAvailable={webSearchAvailable}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={() => dispatch(setWebSearchPreferred(!webSearchPreferred))}
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
        </View>
      </KeyboardAvoidingView>
      {/* Record Mode: Chat Topic Picker */}
      {recordModeEnabled && (
        <ChatTopicPickerModal
          visible={topicPickerVisible}
          providers={session.currentSession ? session.currentSession.selectedAIs.map(a => a.provider) : []}
          personaId={session.currentSession && session.currentSession.selectedAIs.length === 1 ? (session.currentSession.selectedAIs[0].personality || 'default') : undefined}
          allowNewSample={true}
          onClose={() => setTopicPickerVisible(false)}
          onSelect={async (sampleId, title) => {
            setTopicPickerVisible(false);
            if (!session.currentSession) return;
            try {
              const providers = session.currentSession.selectedAIs.map(a => a.provider);
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
