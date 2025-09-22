import React, { useEffect, useCallback } from 'react';
import { KeyboardAvoidingView, Platform, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIServiceLoading, Header, HeaderActions } from '../components/organisms';
import { useAIService } from '../providers/AIServiceProvider';
import { MessageAttachment } from '../types';
import { getAttachmentSupport } from '../utils/attachmentUtils';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, addMessage, updateMessage } from '../store';
import { ImageService } from '../services/images/ImageService';
// import { getProviderCapabilities } from '../config/providerCapabilities';
import { useMergedModalityAvailability } from '../hooks/multimodal/useModalityAvailability';
import { ImageGenerationModal } from '../components/organisms/chat/ImageGenerationModal';
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
  ChatWarnings,
} from '../components/organisms/chat';
import { AIConfig, Message } from '../types';
import { cancelAllStreams, selectActiveStreamCount } from '../store';
import { getStreamingService } from '../services/streaming/StreamingService';
import { DemoContentService } from '@/services/demo/DemoContentService';
import { loadChatScript, primeNextChatTurn, hasNextChatTurn, isTurnComplete } from '@/services/demo/DemoPlaybackRouter';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import { showSheet } from '@/store';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { showTrialCTA } from '@/utils/demoGating';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
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
  const imageGenerationEnabled = availability.imageGeneration.supported;
  const controllersRef = React.useRef<Record<string, AbortController>>({});
  const [imageModalVisible, setImageModalVisible] = React.useState(false);
  const [imageModalPrompt, setImageModalPrompt] = React.useState('');
  const { isDemo } = useFeatureAccess();
  const [chatSamples, setChatSamples] = React.useState<Array<{ id: string; title: string }>>([]);
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [topicPickerVisible, setTopicPickerVisible] = React.useState(false);
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
  // Local nav function compatible with showTrialCTA typing
  const navTo = React.useMemo(() => (
    (screen: string, params?: Record<string, unknown>) => {
      try { (navigation as unknown as { navigate: (s: string, p?: Record<string, unknown>) => void }).navigate(screen, params); } catch { /* no-op */ }
    }
  ), [navigation]);
  // Video generation is out of scope for v1; remove UI

  const handleGenerateImage = async (opts: { prompt: string; size: 'auto' | 'square' | 'portrait' | 'landscape' }, reuseMessageId?: string) => {
    if (isDemo) {
      showTrialCTA(navTo, { message: 'Image generation requires a Free Trial.' });
      return;
    }
    try {
      const providerAI = session.selectedAIs.find(ai => ai.provider === 'openai') || session.selectedAIs[0];
      const apiKey = apiKeys.openai;
      if (!apiKey) throw new Error('OpenAI API key not configured');
      const messageId = reuseMessageId || `msg_${Date.now()}_${providerAI.id}`;
      if (!reuseMessageId) {
        dispatch(addMessage({
          id: messageId,
          sender: providerAI.name,
          senderType: 'ai',
          content: 'Generating image…',
          timestamp: Date.now(),
          metadata: { providerMetadata: { imageGenerating: true, imagePhase: 'sending', imageStartTime: Date.now(), imageParams: { size: opts.size, prompt: opts.prompt } } }
        }));
      } else {
        dispatch(updateMessage({ id: messageId, content: 'Generating image…', attachments: [], metadata: { providerMetadata: { imageGenerating: true, imagePhase: 'sending', imageStartTime: Date.now(), imageParams: { size: opts.size, prompt: opts.prompt } } } }));
      }
      const sizeMap: Record<typeof opts.size, 'auto' | '1024x1024' | '1024x1536' | '1536x1024'> = {
        auto: 'auto',
        square: '1024x1024',
        portrait: '1024x1536',
        landscape: '1536x1024',
      };
      const controller = new AbortController();
      controllersRef.current[messageId] = controller;
      const images = await ImageService.generateImage({ provider: 'openai', apiKey, prompt: opts.prompt, size: sizeMap[opts.size], n: 1, signal: controller.signal });
      const img = images[0];
      const uri = img.url ? img.url : (img.b64 ? `data:${img.mimeType};basee64,${img.b64}` : undefined);
      if (uri) {
        dispatch(updateMessage({ id: messageId, content: '', attachments: [{ type: 'image', uri, mimeType: img.mimeType }], metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'done' } } }));
      } else {
        dispatch(updateMessage({ id: messageId, content: 'Image generated.', metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'done' } } }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const lastId = Object.keys(controllersRef.current).slice(-1)[0] as string;
      dispatch(updateMessage({ id: reuseMessageId || lastId, content: `Failed to generate image: ${errorMsg}`, attachments: [], metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'error' } } }));
    }
  };

  const handleCancelImage = (message: Message) => {
    const ctrl = controllersRef.current[message.id];
    if (ctrl) ctrl.abort();
    dispatch(updateMessage({ id: message.id, content: 'Generation cancelled.', metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'cancelled' } } }));
  };

  const handleRetryImage = (message: Message) => {
    const meta = message.metadata as { providerMetadata?: { imageParams?: { size?: 'auto' | 'square' | 'portrait' | 'landscape'; prompt?: string } } } | undefined;
    const params = meta?.providerMetadata?.imageParams || { prompt: '', size: 'square' as const };

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
    if (!params.prompt) return;
    handleGenerateImage({ prompt: params.prompt, size: params.size || 'square' }, message.id);
  };

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

    // Trigger AI responses with attachments
    await aiResponses.sendAIResponses(userMessage, undefined, attachments);
  }, [dispatch, input, session.currentSession, mentions, messages, aiResponses, isDemo]);

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
          const content = user || 'OK.';
          // If recording, capture the user message
          try { if (RecordController.isActive()) { RecordController.recordUserMessage(content); } } catch { /* ignore */ }
          await dispatchDemoTurn(content, scriptedProviders);
        } catch { /* ignore */ }
      }, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [activeStreams, dispatchDemoTurn, isDemo, session.currentSession]);

  // Fallback: advance multi-turn even for non-streaming responses (no active stream boundary)
  const demoAdvanceGuardRef = React.useRef(false);
  useEffect(() => {
    if (!isDemo) return;
    if (!session.currentSession) return;
    if (!hasNextChatTurn()) return;
    if (activeStreams > 0) { demoAdvanceGuardRef.current = false; return; }
    if (!isTurnComplete()) { demoAdvanceGuardRef.current = false; return; }
    const last = messages.messages[messages.messages.length - 1];
    if (!last || last.senderType !== 'ai') return;
    if (demoAdvanceGuardRef.current) return;
    demoAdvanceGuardRef.current = true;
    const t = setTimeout(async () => {
      try {
        const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
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
  }, [messages.messages, messages.messages.length, activeStreams, dispatchDemoTurn, isDemo, session.currentSession]);

  // Demo Mode: fetch available samples for current selection
  useEffect(() => {
    const run = async () => {
      if (!isDemo || !session.currentSession) { setChatSamples([]); return; }
      const providers = session.currentSession.selectedAIs.map(ai => ai.provider);
      const list = await DemoContentService.listChatSamples(providers);
      setChatSamples(list);
    };
    run();
  }, [isDemo, session.currentSession, messages.messages.length]);

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
          rightElement={<HeaderActions variant="gradient" />}
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

        {/* Warnings (e.g., GPT-5 latency) */}
        <ChatWarnings selectedAIs={session.selectedAIs} />

        {/* Demo Samples picker */}
        {isDemo && chatSamples.length > 0 && (
          <DemoSamplesBar
            label="Demo Samples"
            samples={chatSamples}
            onSelect={async (sampleId) => {
              try {
                const sample = await DemoContentService.findChatById(sampleId);
                if (!sample) return;
                loadChatScript(sample);
                const { user, providers: scriptedProviders = [] } = primeNextChatTurn();
                const content = user || 'Let’s chat.';
                await dispatchDemoTurn(content, scriptedProviders);
              } catch { /* ignore */ }
            }}
          />
        )}

        {/* Demo Banner */}
        <DemoBanner
          subtitle="Simulated chat preview. Start a free trial to chat for real."
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
        />

        {/* Message List */}
        <ChatMessageList
          messages={messages.messages}
          flatListRef={messages.flatListRef}
          searchTerm={searchTerm}
          onContentSizeChange={messages.scrollToBottom}
          onScrollToSearchResult={handleScrollToSearchResult}
          onCancelImage={handleCancelImage}
          onRetryImage={handleRetryImage}
        />

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
          onOpenImageModal={() => {
            setImageModalPrompt(input.inputText.trim());
            setImageModalVisible(true);
          }}
          placeholder="Type a message..."
          disabled={aiResponses.isProcessing}
          attachmentSupport={getAttachmentSupport(session.selectedAIs)}
          maxAttachments={20}
          imageGenerationEnabled={imageGenerationEnabled}
          modalityAvailability={{
            imageUpload: availability.imageUpload.supported,
            documentUpload: availability.documentUpload.supported,
            imageGeneration: availability.imageGeneration.supported,
            videoGeneration: availability.videoGeneration.supported,
            voice: availability.voiceInput.supported,
          }}
          modalityReasons={{
            imageUpload: availability.imageUpload.supported ? undefined : 'Selected model(s) do not support image input',
            documentUpload: availability.documentUpload.supported ? undefined : 'Selected model(s) do not support document/PDF input',
            imageGeneration: availability.imageGeneration.supported ? undefined : 'Selected provider(s) do not support image generation',
            videoGeneration: availability.videoGeneration.supported ? undefined : 'Selected provider(s) do not support video generation',
            voice: availability.voiceInput.supported ? undefined : 'Selected model(s) do not support voice input',
          }}
        />
        </View>
        <View>
          <ImageGenerationModal
            visible={imageModalVisible}
            initialPrompt={imageModalPrompt}
            onClose={() => setImageModalVisible(false)}
            onGenerate={(opts) => {
              setImageModalVisible(false);
              handleGenerateImage(opts);
            }}
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
