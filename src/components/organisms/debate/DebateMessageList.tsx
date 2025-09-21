/**
 * DebateMessageList Organism Component
 * Message list specifically designed for debate mode
 * Handles message rendering and typing indicators
 */

import React, { useRef, useEffect, useLayoutEffect, memo, useCallback, useState } from 'react';
import { FlatList, ListRenderItem, NativeSyntheticEvent, NativeScrollEvent, TouchableOpacity, StyleSheet } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { DebateMessageBubble, DebateTypingIndicator } from '../../molecules';
import { SystemAnnouncement } from './SystemAnnouncement';
import { Message } from '../../../types';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

export interface DebateMessageListProps {
  messages: Message[];
  typingAIs: string[];
  contentContainerStyle?: object;
  showsVerticalScrollIndicator?: boolean;
  headerComponent?: React.ReactElement | null;
  bottomInset?: number;
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
const MessageItem = memo<{ message: Message; index: number; alignment: 'left' | 'right' | 'center' }>(({ message, index, alignment }) => {
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
      side={alignment}
    />
  );
}, (prevProps, nextProps) => {
  // Improved comparison function
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.sender !== nextProps.message.sender) return false;
  if (prevProps.message.timestamp !== nextProps.message.timestamp) return false;
  if (prevProps.alignment !== nextProps.alignment) return false;
  return true;
});

MessageItem.displayName = 'MessageItem';

export const DebateMessageList: React.FC<DebateMessageListProps> = ({
  messages,
  typingAIs,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  headerComponent,
  bottomInset = 0,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const alignmentMapRef = useRef<Record<string, 'left' | 'right'>>({});
  const lastAssignedSideRef = useRef<'left' | 'right'>('right');
  const isAtBottomRef = useRef(true);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const { theme } = useTheme();
  const lastMessageKeyRef = useRef('');

  // Auto-scroll to new messages
  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // Scroll when new messages are added
  const listEmpty = messages.length === 0;

  useEffect(() => {
    if (listEmpty) {
      alignmentMapRef.current = {};
      lastAssignedSideRef.current = 'right';
    }
  }, [listEmpty]);

  const handleContentUpdate = useCallback(() => {
    if (listEmpty) return;
    if (isAtBottomRef.current) {
      scrollToEnd();
    } else {
      setShowScrollIndicator(true);
    }
  }, [listEmpty, scrollToEnd]);

  useLayoutEffect(() => {
    handleContentUpdate();
  }, [messages.length, handleContentUpdate]);

  const latestMessageFingerprint = messages.length > 0
    ? `${messages[messages.length - 1].id}:${messages[messages.length - 1].content?.length ?? 0}:${messages[messages.length - 1].metadata?.citations?.length ?? 0}`
    : '';

  useLayoutEffect(() => {
    if (!latestMessageFingerprint) return;
    handleContentUpdate();
  }, [latestMessageFingerprint, handleContentUpdate]);

  useEffect(() => {
    if (typingAIs.length === 0) return;
    if (isAtBottomRef.current) {
      scrollToEnd();
    } else {
      setShowScrollIndicator(true);
    }
  }, [typingAIs, scrollToEnd]);

  useEffect(() => {
    if (listEmpty) {
      lastMessageKeyRef.current = '';
      return;
    }
    const lastMessage = messages[messages.length - 1];
    const key = `${lastMessage.id ?? 'unknown'}:${lastMessage.timestamp ?? ''}:${lastMessage.content?.length ?? 0}`;
    if (key !== lastMessageKeyRef.current) {
      lastMessageKeyRef.current = key;
      if (!isAtBottomRef.current) {
        setShowScrollIndicator(true);
      }
    }
  }, [messages, listEmpty]);

  const getAlignment = useCallback((message: Message): 'left' | 'right' | 'center' => {
    if (message.sender === 'Debate Host' || message.sender === 'System') {
      return 'center';
    }
    const key = message.sender;
    const current = alignmentMapRef.current[key];
    if (current) return current;

    const assigned = Object.values(alignmentMapRef.current);
    if (!assigned.includes('left')) {
      alignmentMapRef.current[key] = 'left';
      lastAssignedSideRef.current = 'left';
      return 'left';
    }
    if (!assigned.includes('right')) {
      alignmentMapRef.current[key] = 'right';
      lastAssignedSideRef.current = 'right';
      return 'right';
    }

    const next = lastAssignedSideRef.current === 'left' ? 'right' : 'left';
    alignmentMapRef.current[key] = next;
    lastAssignedSideRef.current = next;
    return next;
  }, []);

  // Memoized render function with proper types
  const renderItem: ListRenderItem<Message> = useCallback(({ item, index }) => {
    const alignment = getAlignment(item);
    return <MessageItem message={item} index={index} alignment={alignment} />;
  }, [getAlignment]);

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

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const paddingToBottom = 32;
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setShowScrollIndicator(false);
    }
  }, []);

  const handleScrollToLatest = useCallback(() => {
    isAtBottomRef.current = true;
    setShowScrollIndicator(false);
    scrollToEnd();
  }, [scrollToEnd]);

  useEffect(() => {
    if (listEmpty) return;
    if (isAtBottomRef.current) {
      scrollToEnd();
    }
  }, [bottomInset, listEmpty, scrollToEnd]);

  const effectiveBottomPadding = 32 + bottomInset;
  const indicatorBottomOffset = 24 + bottomInset;

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={messages}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        ListHeaderComponent={headerComponent || null}
        contentContainerStyle={[
          { paddingTop: 8, paddingBottom: effectiveBottomPadding },
          contentContainerStyle,
        ]}
        ListFooterComponent={renderTypingIndicator}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={15}
        // Let FlatList handle dynamic heights; static getItemLayout caused disappearing content with streaming
        getItemLayout={undefined as unknown as never}
      />
      {showScrollIndicator && (
        <Box
          style={[
            styles.scrollIndicator,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              bottom: indicatorBottomOffset,
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleScrollToLatest}
            style={styles.scrollButton}
            accessibilityRole="button"
            accessibilityLabel="Scroll to the latest responses"
          >
            <Ionicons name="arrow-down" size={18} color={theme.colors.text.primary} />
            <Typography variant="caption" weight="semibold" style={{ marginLeft: 6 }}>
              New debate responses
            </Typography>
          </TouchableOpacity>
        </Box>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  scrollIndicator: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
