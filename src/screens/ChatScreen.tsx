import React, { useEffect, useCallback } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIServiceLoading, Header } from '../components/organisms';
import { useAIService } from '../providers/AIServiceProvider';
import { MessageAttachment } from '../types';
import { getAttachmentSupport } from '../utils/attachmentUtils';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, addMessage, updateMessage } from '../store';
import { ImageService } from '../services/images/ImageService';
import { getProviderCapabilities } from '../config/providerCapabilities';
import { ImageGenerationModal } from '../components/organisms/chat/ImageGenerationModal';

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

  const imageGenerationEnabled = session.selectedAIs.some(ai => getProviderCapabilities(ai.provider).imageGeneration?.supported);
  const controllersRef = React.useRef<Record<string, AbortController>>({});
  const [imageModalVisible, setImageModalVisible] = React.useState(false);
  const [imageModalPrompt, setImageModalPrompt] = React.useState('');

  const handleGenerateImage = async (opts: { prompt: string; size: 'auto' | 'square' | 'portrait' | 'landscape' }, reuseMessageId?: string) => {
    try {
      const providerAI = session.selectedAIs.find(ai => ai.provider === 'openai') || session.selectedAIs[0];
      const apiKey = apiKeys.openai;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }
      // Placeholder message
      const messageId = reuseMessageId || `msg_${Date.now()}_${providerAI.id}`;
      if (!reuseMessageId) {
        const placeholder = {
          id: messageId,
          sender: providerAI.name,
          senderType: 'ai' as const,
          content: 'Generating image…',
          timestamp: Date.now(),
          metadata: { providerMetadata: { imageGenerating: true, imagePhase: 'sending', imageStartTime: Date.now(), imageParams: { size: opts.size, prompt: opts.prompt } } }
        };
        dispatch(addMessage(placeholder));
      } else {
        dispatch(updateMessage({ id: messageId, content: 'Generating image…', attachments: [], metadata: { providerMetadata: { imageGenerating: true, imagePhase: 'sending', imageStartTime: Date.now(), imageParams: { size: opts.size, prompt: opts.prompt } } } }));
      }
      // Map UI sizes to OpenAI sizes
      const sizeMap: Record<typeof opts.size, 'auto' | '1024x1024' | '1024x1536' | '1536x1024'> = {
        auto: 'auto',
        square: '1024x1024',
        portrait: '1024x1536',
        landscape: '1536x1024',
      };
      const controller = new AbortController();
      controllersRef.current[messageId] = controller;
      const images = await ImageService.generateImage({
        provider: 'openai',
        apiKey,
        prompt: opts.prompt,
        size: sizeMap[opts.size],
        n: 1,
        signal: controller.signal,
      });
      const img = images[0];
      const uri = img.url ? img.url : (img.b64 ? `data:${img.mimeType};base64,${img.b64}` : undefined);
      if (uri) {
        dispatch(updateMessage({ id: messageId, content: '', attachments: [{ type: 'image', uri, mimeType: img.mimeType }], metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'done' } } }));
      } else {
        dispatch(updateMessage({ id: messageId, content: 'Image generated.', metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'done' } } }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Update placeholder with error state
      // messageId is defined above
      dispatch(updateMessage({ id: reuseMessageId || Object.keys(controllersRef.current).slice(-1)[0] as string, content: `Failed to generate image: ${errorMsg}`, attachments: [], metadata: { providerMetadata: { imageGenerating: false, imagePhase: 'error' } } }));
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
    if (!params.prompt) return;
    handleGenerateImage({ prompt: params.prompt, size: params.size || 'square' }, message.id);
  };

  // Handle message sending
  const handleSendMessage = useCallback(async (messageText?: string, attachments?: MessageAttachment[]): Promise<void> => {
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
  }, [input, session.currentSession, mentions, messages, aiResponses]);

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
          actionButton={activeStreams > 0 ? {
            label: 'Stop',
            onPress: () => dispatch(cancelAllStreams()),
            variant: 'danger',
          } : undefined}
        />

        {/* Warnings (e.g., GPT-5 latency) */}
        <ChatWarnings selectedAIs={session.selectedAIs} />

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
          onOpenImageModal={() => {
            setImageModalPrompt(input.inputText.trim());
            setImageModalVisible(true);
          }}
          placeholder="Type a message..."
          disabled={aiResponses.isProcessing}
          attachmentSupport={getAttachmentSupport(session.selectedAIs)}
          maxAttachments={20}
          imageGenerationEnabled={imageGenerationEnabled}
        />
        <ImageGenerationModal
          visible={imageModalVisible}
          initialPrompt={imageModalPrompt}
          onClose={() => setImageModalVisible(false)}
          onGenerate={(opts) => {
            setImageModalVisible(false);
            handleGenerateImage(opts);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ChatScreen;
