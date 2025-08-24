import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { CompareMessageBubble } from './CompareMessageBubble';
import { ChatTypingIndicators } from '../chat/ChatTypingIndicators';
import { Button } from '../../molecules';
import { Box } from '../../atoms';
import { Message, AIConfig } from '../../../types';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';

interface CompareResponsePaneProps {
  ai: AIConfig;
  messages: Message[];
  isTyping: boolean;
  streamingContent?: string;
  onContinueWithAI: () => void;
  side: 'left' | 'right';
  isExpanded?: boolean;
  isDisabled?: boolean;
  onExpand?: () => void;
}

export const CompareResponsePane: React.FC<CompareResponsePaneProps> = ({
  ai,
  messages,
  isTyping,
  streamingContent,
  onContinueWithAI,
  side,
  isExpanded = false,
  isDisabled = false,
  onExpand,
}) => {
  const { theme } = useTheme();
  
  const paneStyle = {
    backgroundColor: side === 'left' 
      ? theme.colors.warning[50] 
      : theme.colors.info[50],
    borderColor: side === 'left'
      ? theme.colors.warning[200]
      : theme.colors.info[200],
    opacity: isDisabled ? 0.5 : 1,
  };

  return (
    <View style={[styles.pane, paneStyle]}>
      {/* Expand Button - Floating in top-right corner */}
      {onExpand && (
        <TouchableOpacity 
          onPress={onExpand} 
          disabled={isDisabled}
          style={styles.expandButton}
        >
          <Ionicons 
            name={isExpanded ? 'contract-outline' : 'expand-outline'} 
            size={20} 
            color={isDisabled ? theme.colors.text.disabled : theme.colors.text.primary} 
          />
        </TouchableOpacity>
      )}
      
      {/* Scrollable Response Area */}
      <ScrollView 
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => (
          <Box key={message.id} style={styles.messageWrapper}>
            <CompareMessageBubble
              message={message}
              side={side}
            />
          </Box>
        ))}
        
        {/* Streaming Content */}
        {streamingContent && (
          <Box style={styles.messageWrapper}>
            <CompareMessageBubble
              message={{
                id: `streaming_${side}`,
                sender: ai.name,
                senderType: 'ai',
                content: streamingContent,
                timestamp: Date.now(),
              }}
              side={side}
            />
          </Box>
        )}
        
        {/* Typing Indicator */}
        {isTyping && !streamingContent && (
          <ChatTypingIndicators typingAIs={[ai.name]} />
        )}
      </ScrollView>
      
      {/* Continue Button */}
      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Button
          title="Continue with this AI"
          onPress={onContinueWithAI}
          variant="ghost"
          size="small"
          disabled={isDisabled}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  expandButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    padding: 4,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 6, // Reduced from 12
  },
  messageWrapper: {
    marginBottom: 6, // Reduced from 8
  },
  footer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
});