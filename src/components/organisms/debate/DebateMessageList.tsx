/**
 * DebateMessageList Organism Component
 * Message list specifically designed for debate mode
 * Handles message rendering and typing indicators
 */

import React, { useRef, useEffect, memo, useCallback } from 'react';
import { FlatList, ListRenderItem } from 'react-native';
import { Box } from '../../atoms';
import { DebateMessageBubble, DebateTypingIndicator } from '../../molecules';
import { SystemAnnouncement } from './SystemAnnouncement';
import { useTheme } from '../../../theme';
import { Message } from '../../../types';

export interface DebateMessageListProps {
  messages: Message[];
  typingAIs: string[];
  contentContainerStyle?: object;
  showsVerticalScrollIndicator?: boolean;
}

// Memoized message item component
const MessageItem = memo<{ message: Message; index: number }>(({ message, index }) => {
  const { theme } = useTheme();
  const detectType = (msg: Message): 'topic' | 'round-winner' | 'debate-complete' | 'overall-winner' | 'debate-start' | null => {
    if (msg.sender !== 'Debate Host' && msg.sender !== 'System') return null;
    
    const content = msg.content.toLowerCase();
    
    // Check for round winner format: "Round X: Name" 
    if (/round\s+\d+:\s*\w+/i.test(msg.content)) return 'round-winner';
    
    // Check for debate start
    if (content.includes('opens the debate')) return 'debate-start';
    
    // Check for other patterns
    if (content.includes('wins round') || content.includes('round winner')) return 'round-winner';
    if (content.includes('debate complete') || content.includes('debate has ended')) return 'debate-complete';
    if (content.includes('overall winner') || content.includes('winner is')) return 'overall-winner';
    if (msg.content.startsWith('"') && msg.content.includes('"')) return 'topic';
    
    return null;
  };

  const getLabel = (type: string): string => {
    switch (type) {
      case 'topic': return 'DEBATE TOPIC';
      case 'debate-start': return 'DEBATE BEGINS';
      case 'round-winner': return 'ROUND RESULT';
      case 'debate-complete': return 'DEBATE ENDED';
      case 'overall-winner': return 'CHAMPION';
      default: return 'ANNOUNCEMENT';
    }
  };
  
  const getIcon = (type: string): string => {
    switch (type) {
      case 'topic': return ''; // No icon for cleaner look
      case 'debate-start': return '🥊';
      case 'round-winner': return '🎯';
      case 'debate-complete': return '🏁';
      case 'overall-winner': return '🏆';
      default: return '📢';
    }
  };
  
  const getGradient = (type: string): [string, string] => {
    switch (type) {
      case 'topic': return [theme.colors.semantic.primary, theme.colors.semantic.secondary];
      case 'debate-start': return [theme.colors.semantic.info, theme.colors.semantic.primary];
      case 'round-winner': return [theme.colors.semantic.success, theme.colors.semantic.info];
      case 'debate-complete': return [theme.colors.semantic.warning, theme.colors.semantic.error];
      case 'overall-winner': return [theme.colors.semantic.gold, theme.colors.semantic.secondary];
      default: return [theme.colors.overlays.soft, theme.colors.overlays.subtle];
    }
  };

  const systemType = detectType(message);
  
  if (systemType) {
    return (
      <SystemAnnouncement
        key={`${message.id}-${index}`}
        type={systemType}
        label={getLabel(systemType)}
        content={message.content}
        icon={getIcon(systemType)}
        gradient={getGradient(systemType)}
        animation="slide-up"
      />
    );
  }
  
  return (
    <DebateMessageBubble
      key={`${message.id}-${index}`}
      message={message}
      index={index}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if message id or content changes
  return prevProps.message.id === nextProps.message.id && 
         prevProps.message.content === nextProps.message.content;
});

MessageItem.displayName = 'MessageItem';

export const DebateMessageList: React.FC<DebateMessageListProps> = ({
  messages,
  typingAIs,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
}) => {
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to new messages
  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Scroll when new messages are added
  useEffect(() => {
    if (messages.length > 0) {
      scrollToEnd();
    }
  }, [messages.length]);

  // Memoized render function
  const renderItem: ListRenderItem<Message> = useCallback(({ item, index }) => {
    return <MessageItem message={item} index={index} />;
  }, []);
  
  // Memoized key extractor
  const keyExtractor = useCallback((item: Message, index: number) => {
    return `${item.id || index}-${item.timestamp || index}`;
  }, []);

  const renderTypingIndicator = () => {
    if (typingAIs.length === 0) return null;
    
    return (
      <Box style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {typingAIs.map((aiName) => (
          <DebateTypingIndicator key={aiName} aiName={aiName} />
        ))}
      </Box>
    );
  };

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListFooterComponent={renderTypingIndicator}
      contentContainerStyle={[
        {
          paddingHorizontal: 16,
          paddingVertical: 16,
        },
        contentContainerStyle,
      ]}
      onContentSizeChange={scrollToEnd}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={10}
      initialNumToRender={20}
    />
  );
};