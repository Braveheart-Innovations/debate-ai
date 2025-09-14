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
import { Message } from '../../../types';

export interface DebateMessageListProps {
  messages: Message[];
  typingAIs: string[];
  contentContainerStyle?: object;
  showsVerticalScrollIndicator?: boolean;
  headerComponent?: React.ReactElement | null;
}

// Helper functions moved outside component for performance
const detectType = (msg: Message): 'topic' | 'exchange-winner' | 'debate-complete' | 'overall-winner' | 'debate-start' | null => {
  if (msg.sender !== 'Debate Host' && msg.sender !== 'System') return null;
  
  const content = msg.content.toLowerCase();
  
  // Check for legacy round winner format: "Round X: Name" and map to exchange-winner
  if (/round\s+\d+:\s*\w+/i.test(msg.content)) return 'exchange-winner';
  
  // Check for debate start
  if (content.includes('opens the debate')) return 'debate-start';
  
  // Check for other patterns
  if (content.includes('wins round') || content.includes('round winner')) return 'exchange-winner';
  // New exchange winner formats: "Opening: Name", "Rebuttal: Name", "Closing: Name", "Cross-examination: Name"
  // Backward-compat accepts "Opening Argument" and "Closing Argument"
  if (/^(opening(?:\s+argument)?|rebuttal|closing(?:\s+argument)?|cross[- ]?examination|counter|crossfire|question)\s*:\s*\S+/i.test(msg.content)) return 'exchange-winner';
  if (content.includes('debate complete') || content.includes('debate has ended')) return 'debate-complete';
  if (content.includes('overall winner') || content.includes('winner is')) return 'overall-winner';
  if (msg.content.startsWith('"') && msg.content.includes('"')) return 'topic';
  
  return null;
};

const getLabel = (type: string): string => {
  switch (type) {
    case 'topic': return 'DEBATE TOPIC';
    case 'debate-start': return 'DEBATE BEGINS';
    case 'exchange-winner': return 'EXCHANGE RESULT';
    case 'debate-complete': return 'DEBATE ENDED';
    case 'overall-winner': return 'CHAMPION';
    default: return 'ANNOUNCEMENT';
  }
};

const getIcon = (type: string): string => {
  switch (type) {
    case 'topic': return ''; // No icon for cleaner look
    case 'debate-start': return '🥊';
    case 'exchange-winner': return '🎯';
    case 'debate-complete': return '🏁';
    case 'overall-winner': return '🏆';
    default: return '📢';
  }
};

// Memoized message item component - optimized
const MessageItem = memo<{ message: Message; index: number }>(({ message, index }) => {
  const systemType = detectType(message);
  
  if (systemType) {
    return (
    <SystemAnnouncement
        type={systemType}
        label={getLabel(systemType)}
        content={message.content}
        icon={getIcon(systemType)}
        animation="slide-up"
      />
    );
  }
  
  return (
    <DebateMessageBubble
      message={message}
      index={index}
    />
  );
}, (prevProps, nextProps) => {
  // Improved comparison function
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.sender !== nextProps.message.sender) return false;
  if (prevProps.message.timestamp !== nextProps.message.timestamp) return false;
  return true;
});

MessageItem.displayName = 'MessageItem';

export const DebateMessageList: React.FC<DebateMessageListProps> = ({
  messages,
  typingAIs,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  headerComponent,
}) => {
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to new messages
  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // Scroll when new messages are added
  useEffect(() => {
    if (messages.length > 0) {
      scrollToEnd();
    }
  }, [messages.length, scrollToEnd]);

  // Memoized render function with proper types
  const renderItem: ListRenderItem<Message> = useCallback(({ item, index }) => {
    return <MessageItem message={item} index={index} />;
  }, []);
  
  // Memoized key extractor - optimized
  const keyExtractor = useCallback((item: Message, index: number) => {
    // Guard against accidental duplicate ids by including index suffix
    return item.id ? `msg-${item.id}-${index}` : `idx-${index}`;
  }, []);

  // Memoized typing indicator
  const renderTypingIndicator = useCallback(() => {
    if (typingAIs.length === 0) return null;
    
    return (
      <Box style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {typingAIs.map((aiName) => (
          <DebateTypingIndicator key={aiName} aiName={aiName} />
        ))}
      </Box>
    );
  }, [typingAIs]);

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={messages}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      ListHeaderComponent={headerComponent || null}
      contentContainerStyle={[
        { paddingTop: 8, paddingBottom: 16 },
        contentContainerStyle,
      ]}
      ListFooterComponent={renderTypingIndicator}
      // Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={15}
      windowSize={15}
      // Let FlatList handle dynamic heights; static getItemLayout caused disappearing content with streaming
      getItemLayout={undefined as unknown as never}
    />
  );
};
