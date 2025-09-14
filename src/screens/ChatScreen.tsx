import React, { useEffect, useCallback } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
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
import { primeChat } from '@/services/demo/DemoPlaybackRouter';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import { showSheet } from '@/store';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { showTrialCTA } from '@/utils/demoGating';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';


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

  // Demo Mode: auto-start playback based on selected AIs using pack routing
  useEffect(() => {
    const run = async () => {
      if (!isDemo) return;
      if (!session.currentSession) return;
      if (messages.messages.length > 0) return;
      const providers = session.currentSession.selectedAIs.map(ai => ai.provider);
      if (providers.length === 0) return;
      try {
        const sample = await DemoContentService.getChatSampleForProviders(providers);
        if (!sample) return;
        // Prime playback router for adapters
        primeChat(sample);
        // Find first user message content
        const firstUser = sample.events.find(e => e.role === 'user' && e.type === 'message');
        const content = firstUser?.content || 'Let’s chat.';
        // Dispatch user message
        const userMessage = {
          id: `msg_${Date.now()}`,
          sender: 'You',
          senderType: 'user' as const,
          content,
          timestamp: Date.now(),
          mentions: [],
        };
        // Use existing helpers to add and trigger AI responses without invoking gated handler
        messages.sendMessage(content, []);
        await aiResponses.sendAIResponses(userMessage);
      } catch (e) {
        void e;
      }
    };
    run();
    // Only when entering an empty chat in demo with selected AIs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, session.currentSession?.id]);

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
                primeChat(sample);
                const firstUser = sample.events.find(e => e.role === 'user' && e.type === 'message');
                const content = firstUser?.content || 'Let’s chat.';
                // Send user message and trigger responses
                messages.sendMessage(content, []);
                const userMessage = {
                  id: `msg_${Date.now()}`,
                  sender: 'You',
                  senderType: 'user' as const,
                  content,
                  timestamp: Date.now(),
                  mentions: [],
                };
                await aiResponses.sendAIResponses(userMessage);
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
    </SafeAreaView>
  );
};

export default ChatScreen;
