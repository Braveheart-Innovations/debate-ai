import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ResponsiveContainer } from '../../atoms';
import { MessageBubble } from '@/components/organisms/common/MessageBubble';
import { ImageMessageRow } from './ImageMessageRow';
import { ImageGeneratingRow } from './ImageGeneratingRow';
import { ChatEmptyState } from './ChatEmptyState';
import { useTheme } from '../../../theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { Message, AIProvider } from '../../../types';
import { Ionicons } from '@expo/vector-icons';

const SCROLL_INDICATOR_REVEAL_DELAY_MS = 650;
const BOTTOM_VISIBILITY_THRESHOLD = 32;
const IS_TEST_ENV = process.env.NODE_ENV === 'test';

export interface ChatMessageListProps {
  messages: Message[];
  flatListRef: React.RefObject<FlatList | null>;
  searchTerm?: string;
  onContentSizeChange?: () => void;
  onScrollToSearchResult?: (messageIndex: number) => void;
  onCancelImage?: (message: Message) => void;
  onRetryImage?: (message: Message) => void;
  /** Whether any provider supports image refinement (img2img) */
  canRefineImages?: boolean;
  /** Called when user taps Refine on an image */
  onRefineImage?: (imageUri: string, originalPrompt: string, originalProvider: AIProvider, messageId?: string) => void;
  /** Called when user reports AI-generated chat content */
  onReportContent?: (message: Message) => void;
  /** Called when user continues a reply cut off at the length limit */
  onContinueMessage?: (message: Message) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  flatListRef,
  searchTerm,
  onContentSizeChange,
  onScrollToSearchResult,
  onCancelImage,
  onRetryImage,
  canRefineImages,
  onRefineImage,
  onReportContent,
  onContinueMessage,
}) => {
  const { theme } = useTheme();
  const { responsive, rs } = useResponsive();
  const isAtBottomRef = useRef(true);
  const userPinnedAwayRef = useRef(false);
  const userScrollInProgressRef = useRef(false);
  const hasInitializedContentSizeRef = useRef(false);
  const pendingLatestContentRevealRef = useRef(false);
  const indicatorRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMessageKeyRef = useRef('');
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    layoutHeight: 0,
    offsetY: 0,
  });
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const indicatorAnimatedValue = useRef(new Animated.Value(0)).current;
  const listEmpty = messages.length === 0;

  // Responsive padding for iPad
  const contentPadding = useMemo(() => ({
    paddingHorizontal: responsive(16, 32),
    paddingVertical: rs('md'),
  }), [responsive, rs]);

  // Auto-scroll to search result when searchTerm changes
  useEffect(() => {
    if (searchTerm && messages.length > 0 && onScrollToSearchResult) {
      const matchIndex = messages.findIndex(msg => 
        msg.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (matchIndex >= 0) {
        // Small delay to ensure list is rendered
        setTimeout(() => {
          onScrollToSearchResult(matchIndex);
        }, 100);
      }
    }
  }, [searchTerm, messages, onScrollToSearchResult]);

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
      onContentSizeChange?.();
      return;
    }

    if (syncBottomStateFromMetrics()) {
      pendingLatestContentRevealRef.current = false;
      requestScrollIndicatorReveal();
    } else {
      pendingLatestContentRevealRef.current = false;
      hideScrollIndicator();
    }
    onContentSizeChange?.();
  }, [hideScrollIndicator, onContentSizeChange, requestScrollIndicatorReveal, syncBottomStateFromMetrics]);

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

  const isUserMessage = useCallback((m: Message) => m.senderType === 'user', []);
  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const meta = item.metadata as { providerMetadata?: Record<string, unknown> } | undefined;
    const isGenerating = !!meta?.providerMetadata && meta.providerMetadata['imageGenerating'] === true;
    if (!isUserMessage(item) && isGenerating) {
      return <ImageGeneratingRow message={item} onCancel={onCancelImage} onRetry={onRetryImage} />;
    }
    const hasImageOnly = (item.attachments && item.attachments.length > 0 && item.attachments.some(a => a.type === 'image')) && (!item.content || item.content.trim() === '');
    if (!isUserMessage(item) && hasImageOnly) {
      return (
        <ImageMessageRow
          message={item}
          canRefine={canRefineImages}
          onRefine={onRefineImage}
          onReportContent={onReportContent}
        />
      );
    }
    return (
      <MessageBubble 
        message={item} 
        isLast={index === messages.length - 1}
        searchTerm={searchTerm}
        onReportContent={!isUserMessage(item) ? onReportContent : undefined}
        onContinue={!isUserMessage(item) ? onContinueMessage : undefined}
      />
    );
  }, [
    canRefineImages,
    isUserMessage,
    messages.length,
    onCancelImage,
    onRefineImage,
    onReportContent,
    onContinueMessage,
    onRetryImage,
    searchTerm,
  ]);

  const renderEmptyState = () => <ChatEmptyState />;

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
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [flatListRef, hideScrollIndicator]);

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
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ResponsiveContainer maxWidth="lg" center>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.messagesList, contentPadding]}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleListLayout}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleScrollEndDrag}
          scrollEventThrottle={16}
          style={{ backgroundColor: theme.colors.background }}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
          getItemLayout={undefined} // Let FlatList handle dynamic heights
        />
      </ResponsiveContainer>
      {showScrollIndicator && (
        <Animated.View
          style={[
            styles.scrollIndicator,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
            indicatorAnimatedStyle,
          ]}
        >
          <TouchableOpacity
            onPress={handleScrollToLatest}
            style={styles.scrollButton}
            testID="chat-latest-responses-button"
            accessibilityRole="button"
            accessibilityLabel="Scroll to latest chat responses"
          >
            <Ionicons name="arrow-down" size={20} color={theme.colors.primary[500]} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
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
