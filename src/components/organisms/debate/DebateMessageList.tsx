/**
 * DebateMessageList Organism Component
 * Message list specifically designed for debate mode
 * Handles message rendering and typing indicators
 */

import React, { useRef, useEffect, memo, useCallback, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  ListRenderItem,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { Box } from '../../atoms';
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
  canRetryAudio?: boolean;
  onRetryAudio?: (message: Message) => void;
  retryTurnMessageId?: string;
  onRetryTurn?: (message: Message) => void;
  onReportContent?: (message: Message) => void;
}

type DetectedAnnouncementType =
  | 'topic'
  | 'exchange-winner'
  | 'debate-complete'
  | 'overall-winner'
  | 'debate-start'
  | 'audience-stance'
  | 'audience-questions'
  | 'mc';

// Helper functions moved outside component for performance
const detectType = (msg: Message): DetectedAnnouncementType | null => {
  if (msg.metadata?.debateInterstitial) return 'mc';
  if (msg.metadata?.debateAudienceQuestions) return 'audience-questions';
  if (msg.sender !== 'Debate Host' && msg.sender !== 'System') return null;
  
  const content = msg.content.toLowerCase();

  if (content.includes('audience questions submitted')) return 'audience-questions';
  if (content.includes('audience stance') || content.includes('audience vote')) return 'audience-stance';
  
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

const getLabel = (type: DetectedAnnouncementType, content = ''): string => {
  switch (type) {
    case 'topic': return 'DEBATE TOPIC';
    case 'debate-start': return 'DEBATE BEGINS';
    case 'audience-stance':
      return content.toLowerCase().includes('final audience')
        ? 'FINAL AUDIENCE VOTE'
        : 'OPENING AUDIENCE STANCE';
    case 'audience-questions': return 'AUDIENCE Q&A';
    case 'mc': return 'MC';
    case 'exchange-winner': return 'EXCHANGE RESULT';
    case 'debate-complete': return 'DEBATE ENDED';
    case 'overall-winner': return 'CHAMPION';
    default: return 'ANNOUNCEMENT';
  }
};

const getIcon = (type: DetectedAnnouncementType): string => {
  switch (type) {
    case 'topic': return ''; // No icon for cleaner look
    case 'debate-start': return '🥊';
    case 'audience-stance': return '◉';
    case 'audience-questions': return '?';
    case 'mc': return '🎙️';
    case 'exchange-winner': return '🎯';
    case 'debate-complete': return '🏁';
    case 'overall-winner': return '🏆';
    default: return '📢';
  }
};

const getCitationMetadataKey = (message: Message): string => {
  const citations = message.metadata?.citations || [];
  const audio = message.metadata?.debateAudio;
  const lifecycle = message.metadata?.lifecycle;
  const audienceQuestions = message.metadata?.debateAudienceQuestions;
  const audioAttachments = (message.attachments || [])
    .filter((attachment) => attachment.type === 'audio')
    .map((attachment) => `${attachment.uri}:${attachment.mimeType}`)
    .join('|');
  return [
    message.metadata?.webSearchEnabled ? 'search' : 'no-search',
    citations.length,
    citations.map(citation => `${citation.index}:${citation.url}`).join('|'),
    audienceQuestions ? `${audienceQuestions.aff}:${audienceQuestions.neg}` : 'no-audience-questions',
    audio ? `${audio.status}:${audio.voiceId}:${audio.uri || ''}:${audio.error || ''}` : 'no-audio',
    lifecycle ? `${lifecycle.status}:${lifecycle.retryable !== false}:${lifecycle.reason || ''}` : 'no-lifecycle',
    audioAttachments,
  ].join(':');
};

const SCROLL_INDICATOR_REVEAL_DELAY_MS = 650;
const BOTTOM_VISIBILITY_THRESHOLD = 32;
const IS_TEST_ENV = process.env.NODE_ENV === 'test';

// Memoized message item component - optimized
const MessageItem = memo<{
  message: Message;
  index: number;
  alignment: 'left' | 'right' | 'center';
  canRetryAudio?: boolean;
  onRetryAudio?: (message: Message) => void;
  retryTurnMessageId?: string;
  onRetryTurn?: (message: Message) => void;
  onReportContent?: (message: Message) => void;
}>(({ message, index, alignment, canRetryAudio, onRetryAudio, retryTurnMessageId, onRetryTurn, onReportContent }) => {
  const systemType = detectType(message);
  
  if (systemType) {
    return (
      <SystemAnnouncement
        type={systemType}
        label={systemType === 'mc' ? message.metadata?.debateInterstitial?.label : getLabel(systemType, message.content)}
        content={message.content}
        icon={getIcon(systemType)}
        animation="slide-up"
        onReportContent={systemType === 'mc' && onReportContent ? () => onReportContent(message) : undefined}
      />
    );
  }
  
  return (
    <DebateMessageBubble
      message={message}
      index={index}
      side={alignment}
      canRetryAudio={canRetryAudio}
      onRetryAudio={onRetryAudio}
      canRetryTurn={retryTurnMessageId === message.id}
      onRetryTurn={onRetryTurn}
      onReportContent={onReportContent}
    />
  );
}, (prevProps, nextProps) => {
  // Improved comparison function
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.sender !== nextProps.message.sender) return false;
  if (prevProps.message.timestamp !== nextProps.message.timestamp) return false;
  if (getCitationMetadataKey(prevProps.message) !== getCitationMetadataKey(nextProps.message)) return false;
  if (prevProps.alignment !== nextProps.alignment) return false;
  if (prevProps.canRetryAudio !== nextProps.canRetryAudio) return false;
  if (prevProps.onRetryAudio !== nextProps.onRetryAudio) return false;
  if (prevProps.retryTurnMessageId !== nextProps.retryTurnMessageId) return false;
  if (prevProps.onRetryTurn !== nextProps.onRetryTurn) return false;
  if (prevProps.onReportContent !== nextProps.onReportContent) return false;
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
  canRetryAudio,
  onRetryAudio,
  retryTurnMessageId,
  onRetryTurn,
  onReportContent,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const alignmentMapRef = useRef<Record<string, 'left' | 'right'>>({});
  const lastAssignedSideRef = useRef<'left' | 'right'>('right');
  const isAtBottomRef = useRef(true);
  const userPinnedAwayRef = useRef(false);
  const userScrollInProgressRef = useRef(false);
  const hasInitializedContentSizeRef = useRef(false);
  const pendingLatestContentRevealRef = useRef(false);
  const indicatorRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    layoutHeight: 0,
    offsetY: 0,
  });
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const indicatorAnimatedValue = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();
  const latestMessageKeyRef = useRef('');
  const listEmpty = messages.length === 0;

  const scrollToEnd = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  const clearIndicatorRevealTimeout = useCallback(() => {
    if (indicatorRevealTimeoutRef.current) {
      clearTimeout(indicatorRevealTimeoutRef.current);
      indicatorRevealTimeoutRef.current = null;
    }
  }, []);

  const hasContentBelowViewport = useCallback(() => {
    const { contentHeight, layoutHeight, offsetY } = scrollMetricsRef.current;
    if (layoutHeight <= 0 || contentHeight <= 0) {
      return !isAtBottomRef.current || userPinnedAwayRef.current;
    }
    return offsetY + layoutHeight < contentHeight - BOTTOM_VISIBILITY_THRESHOLD;
  }, []);

  const syncBottomStateFromMetrics = useCallback(() => {
    const belowViewport = hasContentBelowViewport();
    isAtBottomRef.current = !belowViewport;
    if (!belowViewport) {
      userPinnedAwayRef.current = false;
    }
    return belowViewport;
  }, [hasContentBelowViewport]);

  const hideScrollIndicator = useCallback(() => {
    clearIndicatorRevealTimeout();
    setShowScrollIndicator(false);
  }, [clearIndicatorRevealTimeout]);

  const requestScrollIndicatorReveal = useCallback(() => {
    if (listEmpty || !hasContentBelowViewport()) {
      hideScrollIndicator();
      return;
    }

    clearIndicatorRevealTimeout();
    indicatorRevealTimeoutRef.current = setTimeout(() => {
      indicatorRevealTimeoutRef.current = null;
      if (!hasContentBelowViewport()) {
        setShowScrollIndicator(false);
        return;
      }
      setShowScrollIndicator(true);
    }, SCROLL_INDICATOR_REVEAL_DELAY_MS);
  }, [clearIndicatorRevealTimeout, hasContentBelowViewport, hideScrollIndicator, listEmpty]);

  const handleContentSizeChange = useCallback((_: number, height: number) => {
    if (height > 0) {
      scrollMetricsRef.current.contentHeight = height;
    }

    if (!hasInitializedContentSizeRef.current) {
      hasInitializedContentSizeRef.current = true;
      const hasContentBelow = syncBottomStateFromMetrics();
      if (hasContentBelow && (userPinnedAwayRef.current || pendingLatestContentRevealRef.current)) {
        pendingLatestContentRevealRef.current = false;
        requestScrollIndicatorReveal();
      } else {
        pendingLatestContentRevealRef.current = false;
        hideScrollIndicator();
      }
      return;
    }

    if (syncBottomStateFromMetrics()) {
      pendingLatestContentRevealRef.current = false;
      requestScrollIndicatorReveal();
    } else {
      pendingLatestContentRevealRef.current = false;
      hideScrollIndicator();
    }
  }, [hideScrollIndicator, requestScrollIndicatorReveal, syncBottomStateFromMetrics]);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    scrollMetricsRef.current.layoutHeight = event.nativeEvent.layout.height;
    const hasContentBelow = syncBottomStateFromMetrics();
    if (hasContentBelow && userPinnedAwayRef.current) {
      requestScrollIndicatorReveal();
    } else if (!hasContentBelow) {
      hideScrollIndicator();
    }
  }, [hideScrollIndicator, requestScrollIndicatorReveal, syncBottomStateFromMetrics]);

  useEffect(() => {
    return () => {
      clearIndicatorRevealTimeout();
    };
  }, [clearIndicatorRevealTimeout]);

  useEffect(() => {
    if (IS_TEST_ENV) {
      indicatorAnimatedValue.setValue(showScrollIndicator ? 1 : 0);
      return;
    }

    Animated.timing(indicatorAnimatedValue, {
      toValue: showScrollIndicator ? 1 : 0,
      duration: showScrollIndicator ? 180 : 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [indicatorAnimatedValue, showScrollIndicator]);

  useEffect(() => {
    if (listEmpty) {
      alignmentMapRef.current = {};
      lastAssignedSideRef.current = 'right';
      userPinnedAwayRef.current = false;
      hasInitializedContentSizeRef.current = false;
      pendingLatestContentRevealRef.current = false;
      scrollMetricsRef.current = {
        contentHeight: 0,
        layoutHeight: 0,
        offsetY: 0,
      };
      latestMessageKeyRef.current = '';
      hideScrollIndicator();
    }
  }, [hideScrollIndicator, listEmpty]);

  const latestMessageKey = messages.length > 0
    ? `${messages.length}:${messages[messages.length - 1].id ?? 'unknown'}:${messages[messages.length - 1].timestamp ?? ''}`
    : '';

  useEffect(() => {
    if (!latestMessageKey) return;
    if (!latestMessageKeyRef.current) {
      latestMessageKeyRef.current = latestMessageKey;
      return;
    }
    if (latestMessageKey !== latestMessageKeyRef.current) {
      latestMessageKeyRef.current = latestMessageKey;
      pendingLatestContentRevealRef.current = true;
      requestScrollIndicatorReveal();
    }
  }, [latestMessageKey, requestScrollIndicatorReveal]);

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
    return (
      <MessageItem
        message={item}
        index={index}
        alignment={alignment}
        canRetryAudio={canRetryAudio}
        onRetryAudio={onRetryAudio}
        retryTurnMessageId={retryTurnMessageId}
        onRetryTurn={onRetryTurn}
        onReportContent={onReportContent}
      />
    );
  }, [canRetryAudio, getAlignment, onReportContent, onRetryAudio, onRetryTurn, retryTurnMessageId]);

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

  const handleScrollBeginDrag = useCallback(() => {
    userScrollInProgressRef.current = true;
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    if (userScrollInProgressRef.current && !isAtBottomRef.current) {
      userPinnedAwayRef.current = true;
      requestScrollIndicatorReveal();
    }
    userScrollInProgressRef.current = false;
  }, [requestScrollIndicatorReveal]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollMetricsRef.current = {
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      offsetY: contentOffset.y,
    };
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - BOTTOM_VISIBILITY_THRESHOLD;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      userPinnedAwayRef.current = false;
      hideScrollIndicator();
    } else if (userScrollInProgressRef.current) {
      userPinnedAwayRef.current = true;
      requestScrollIndicatorReveal();
    }
  }, [hideScrollIndicator, requestScrollIndicatorReveal]);

  const handleScrollToLatest = useCallback(() => {
    isAtBottomRef.current = true;
    userPinnedAwayRef.current = false;
    hideScrollIndicator();
    scrollToEnd(true);
  }, [hideScrollIndicator, scrollToEnd]);

  const effectiveBottomPadding = 32 + bottomInset;
  const indicatorBottomOffset = 24 + bottomInset;
  const indicatorAnimatedStyle = {
    opacity: indicatorAnimatedValue,
    transform: [
      {
        translateY: indicatorAnimatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        }),
      },
    ],
  };

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        ListHeaderComponent={headerComponent || null}
        contentContainerStyle={[
          { paddingTop: 8, paddingBottom: effectiveBottomPadding },
          contentContainerStyle,
        ]}
        ListFooterComponent={renderTypingIndicator}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleScrollEndDrag}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleListLayout}
        scrollEventThrottle={16}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={15}
        // No getItemLayout: FlatList measures dynamic heights; a static layout caused disappearing content with streaming
      />
      {showScrollIndicator && (
        <Animated.View
          style={[
            styles.scrollIndicator,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              bottom: indicatorBottomOffset,
            },
            indicatorAnimatedStyle,
          ]}
        >
          <TouchableOpacity
            onPress={handleScrollToLatest}
            style={styles.scrollButton}
            testID="debate-latest-responses-button"
            accessibilityRole="button"
            accessibilityLabel="Scroll to latest debate responses"
          >
            <Ionicons name="arrow-down" size={20} color={theme.colors.primary[500]} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  scrollIndicator: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
