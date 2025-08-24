import React, { useEffect, useCallback } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIServiceLoading, Header } from '../components/organisms';
import { useAIService } from '../providers/AIServiceProvider';
import { MessageAttachment } from '../types';
import { getAttachmentSupport } from '../utils/attachmentUtils';

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
    resuming 
  } = route.params;

  // AI Service state
  const { aiService, isInitialized, isLoading, error } = useAIService();

  // Compose chat hooks
  const session = useChatSession();
  const messages = useChatMessages();
  const input = useChatInput();
  const mentions = useMentions();
  const aiResponses = useAIResponsesWithStreaming(resuming);
  const quickStart = useQuickStart({ initialPrompt, userPrompt, autoSend });

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
          placeholder="Type a message..."
          disabled={aiResponses.isProcessing}
          attachmentSupport={getAttachmentSupport(session.selectedAIs)}
          maxAttachments={20}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ChatScreen;