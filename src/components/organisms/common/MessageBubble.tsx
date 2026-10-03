import React, { useState, useMemo, useCallback } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';
import { sanitizeMarkdown, shouldLazyRender } from '@/utils/markdown';
import { processMessageContentWithCitations } from '@/utils/citationUtils';
import { Image, View } from 'react-native';
import { ImageBubble } from '../chat/ImageBubble';
import { Box } from '@/components/atoms';
import IconStopOctagon from '@/components/atoms/icons/IconStopOctagon';
import { Typography } from '@/components/molecules';
import { LazyMarkdownRenderer, createMarkdownStyles } from '@/components/molecules/common/LazyMarkdownRenderer';
import { StreamingIndicator } from './StreamingIndicator';
import { CitationSources } from './CitationSources';
import { useTheme } from '@/theme';
import { Message } from '@/types';
import { AI_BRAND_COLORS } from '@/constants/aiColors';
import { getReadableBrandAccent } from '@/utils/aiBrandColors';
import { useStreamingMessage } from '@/hooks/streaming';
import { useMessageBubbleAnimation } from '@/hooks/useMessageBubbleAnimation';
import { useCitationInteractions } from '@/hooks/useCitationInteractions';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { selectableMarkdownRules } from '@/utils/markdownSelectable';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { useResponsive } from '@/hooks/useResponsive';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  searchTerm?: string;
  onReportContent?: (message: Message) => void;
  /** Continue or retry a reply that was cut off or failed. Omit while a continuation can't start. */
  onContinue?: (message: Message) => void;
}

// Helper component for highlighted text
const HighlightedText: React.FC<{ text: string; searchTerm: string }> = ({ text, searchTerm }) => {
  const { theme } = useTheme();
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <Text>
      {parts.map((part, index) => 
        regex.test(part) ? (
          <Text key={index} style={{ backgroundColor: theme.colors.warning[200] }}>
            {part}
          </Text>
        ) : (
          <Text key={index}>{part}</Text>
        )
      )}
    </Text>
  );
};

// Helper function for formatting mentions
const highlightMentions = (text: string, mentionStyle: TextStyle) => {
  const mentionRegex = /@(\w+)/g;
  const parts = text.split(mentionRegex);
  
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <Text key={index} style={[{ fontWeight: '700' }, mentionStyle]}>
          @{part}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
};

// Helper function for formatting time
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
};

// Plain-language version of a stream or provider error
const describeReplyError = (raw: string): string => {
  if (raw.includes('overload') || raw.includes('Overloaded')) {
    return 'Service temporarily busy. Please try again in a moment.';
  }
  if (raw.includes('verification')) {
    return 'Organization verification required for streaming.';
  }
  if (raw.includes('network') || raw.includes('connection') || raw.includes('Connection')) {
    return 'Connection issue. Please check your internet.';
  }
  return raw;
};

// Process message content to add citation links (using shared utility)
const processMessageContent = (message: Message): string => {
  if (message.metadata?.citations && message.metadata.citations.length > 0) {
    return processMessageContentWithCitations(message.content, message.metadata.citations);
  }
  return message.content;
};

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({ message, isLast, searchTerm, onReportContent, onContinue }) => {
  const isUser = message.senderType === 'user';
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const { isDemo } = useFeatureAccess();
  const { responsive } = useResponsive();

  // Narrower bubbles on tablet for better readability
  const bubbleMaxWidth = responsive('88%', '70%');

  // Unified animation hook - spring-scale for Chat mode
  const { animatedStyle } = useMessageBubbleAnimation({
    type: 'spring-scale',
    isNew: isLast,
  });
  
  // Hook for streaming messages
  const { 
    content: streamingContent, 
    isStreaming, 
    cursorVisible,
    error: streamingError 
  } = useStreamingMessage(message.id);
  
  // Determine what content to display
  let displayContent = message.content;
  let hasError = false;
  let errorMessage = '';
  const isCancelled = !!streamingError && streamingError.toLowerCase().includes('cancel');
  const lifecycle = message.metadata?.lifecycle;

  // The reply errored. The saved lifecycle survives an app restart; the live stream error covers
  // the moment before the lifecycle is saved.
  const isFailed = !isUser
    && !isStreaming
    && !isCancelled
    && (lifecycle?.status === 'failed'
      || (!!streamingError && lifecycle?.status !== 'interrupted' && lifecycle?.status !== 'cancelled'));
  const failedText = lifecycle?.status === 'failed' ? message.content : streamingContent;
  const failedWithPartial = isFailed
    && failedText.trim().length > 0
    && (lifecycle?.status === 'failed' ? lifecycle.partial === true : true);
  const canRetryFailure = isFailed && lifecycle?.status === 'failed' && lifecycle.retryable !== false;

  if (isFailed) {
    hasError = true;
    errorMessage = describeReplyError(streamingError || lifecycle?.reason || 'Something went wrong.');
    displayContent = failedText.trim().length > 0 ? failedText : errorMessage;
  } else if (streamingError) {
    // Stopped by the user or paused when the app backgrounded (failures are handled above)
    hasError = true;
    errorMessage = isCancelled ? 'Stream cancelled by you' : `⚠️ ${describeReplyError(streamingError)}`;

    // If we have partial content, keep it; for cancel, avoid noisy suffix
    if (streamingContent) {
      displayContent = isCancelled
        ? streamingContent
        : streamingContent + '\n\n[Message incomplete due to error]';
    } else {
      displayContent = isCancelled ? '' : errorMessage;
    }
  } else if (isStreaming) {
    // Use streaming content while streaming
    displayContent = streamingContent;
  }

  // The provider stopped at its output token limit; the text so far is kept.
  const isTruncated = !isUser
    && !isStreaming
    && !streamingError
    && message.metadata?.lifecycle?.status === 'truncated';
  const hasPartialContent = message.content.trim().length > 0;

  const canReportContent = !isUser
    && !isStreaming
    && !(isFailed && !failedWithPartial)
    && Boolean(onReportContent)
    && displayContent.trim().length > 0;

  // Get AI-specific color from the message sender
  const getAIColor = () => {
    if (isUser) return null;
    
    // Parse sender name to get AI provider
    const aiName = message.sender.toLowerCase();
    
    // Map AI names to their brand color keys
    const aiBrandKey = (aiName === 'chatgpt' || aiName === 'openai') ? 'openai' : 
                       aiName === 'claude' ? 'claude' :
                       (aiName === 'gemini' || aiName === 'google') ? 'gemini' :
                       aiName === 'perplexity' ? 'perplexity' :
                       aiName === 'mistral' ? 'mistral' :
                       aiName === 'cohere' ? 'cohere' :
                       aiName === 'deepseek' ? 'deepseek' :
                       aiName === 'grok' ? 'grok' :
                       aiName === 'moonshot' ? 'moonshot' :
                       aiName === 'kimi' ? 'moonshot' :
                       aiName === 'zai' ? 'zai' :
                       aiName === 'glm' ? 'zai' : null;
    
    if (!aiBrandKey || !(aiBrandKey in AI_BRAND_COLORS)) return null;
    
    const brandColors = AI_BRAND_COLORS[aiBrandKey as keyof typeof AI_BRAND_COLORS];
    // Use a theme-aware accent so near-monochrome palettes (e.g. Grok) stay
    // visible against a dark surface instead of collapsing into the background.
    const accent = getReadableBrandAccent(brandColors, isDark);
    return {
      light: brandColors[50],
      dark: theme.colors.surface,
      border: accent,
      text: accent,
    };
  };
  
  const aiColor = getAIColor();

  const markdownContent = useMemo(() => {
    if (isUser || isStreaming || !displayContent) return '';
    return sanitizeMarkdown(
      processMessageContent({ ...message, content: displayContent }),
      { showWarning: !isCancelled } // Don't show warning for cancelled messages
    );
  }, [isUser, isStreaming, displayContent, message, isCancelled]);

  const isLongContent = useMemo(() => {
    if (isStreaming) return false;
    return shouldLazyRender(markdownContent);
  }, [isStreaming, markdownContent]);

  const markdownStyles = useMemo(() => createMarkdownStyles(theme, isDark), [theme, isDark]);

  // Get AI brand color for citation preview
  const citationBrandColor = aiColor?.border;
  const { handleCitationLinkPress } = useCitationInteractions(citationBrandColor);

  // Handle link press - check if it's a citation first
  const handleLinkPress = useCallback((url: string): boolean => {
    return handleCitationLinkPress(url, message.metadata?.citations);
  }, [handleCitationLinkPress, message.metadata?.citations]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isUser ? styles.rowAlignEnd : styles.rowAlignStart,
        animatedStyle,
      ]}
    >
      <Box
        style={[
          styles.stack,
          { maxWidth: bubbleMaxWidth },
          isUser ? styles.stackRight : styles.stackLeft,
        ]}
      >
        {!isUser && (
          <Box style={styles.aiHeader}>
            <Typography 
              variant="caption" 
              weight="semibold"
              style={{ color: hasError ? (isDark ? theme.colors.error[400] : theme.colors.error[600]) : (aiColor?.border || theme.colors.text.secondary) }}
            >
              {message.sender}{(hasError && !isCancelled) ? ' ⚠️' : ''}
            </Typography>
          </Box>
        )}
        <Box
          style={[
            styles.messageBubble,
            isUser ? {
              backgroundColor: theme.colors.primary[500],
              borderBottomRightRadius: 4,
            } : {
              backgroundColor: (hasError && !isCancelled)
                ? (isDark ? theme.colors.semantic.error : theme.colors.error[50])
                : (aiColor ? (isDark ? aiColor.dark : aiColor.light) : theme.colors.card),
              borderBottomLeftRadius: 4,
              borderWidth: 1,
              borderColor: (hasError && !isCancelled)
                ? (isDark ? theme.colors.error[600] : theme.colors.error[500])
                : (aiColor?.border || theme.colors.border),
              // Demo mode: add dashed border and slightly reduced opacity
              ...(isDemo && !isUser && {
                borderStyle: 'dashed',
                borderWidth: 1.5,
                borderColor: isDark ? theme.colors.glass.border : theme.colors.overlays.strong,
                opacity: 0.95,
              }),
            },
          ]}
        >
        {/* Demo watermark */}
        {isDemo && !isUser && (
          <View style={styles.demoWatermark} pointerEvents="none">
            <Text style={[
              styles.demoWatermarkText,
              { color: isDark ? theme.colors.overlays.medium : theme.colors.overlays.strong }
            ]}>
              DEMO
            </Text>
          </View>
        )}
        {isUser ? (
          // User messages - simple text with mentions
          <Typography style={{
            fontSize: 16, 
            lineHeight: 22,
            color: theme.colors.text.inverse
          }} selectable>
            {searchTerm ? <HighlightedText text={displayContent} searchTerm={searchTerm} /> : highlightMentions(displayContent, { color: theme.colors.text.inverse })}
          </Typography>
        ) : (
          // AI messages - render markdown with streaming support
          <>
            {isStreaming ? (
              // Only reserve a text line once content actually arrives; while
              // waiting, the status row below sits at the top of the bubble.
              streamingContent ? (
                <Typography style={styles.streamingText} selectable>
                  {displayContent}
                </Typography>
              ) : null
            ) : isLongContent ? (
              <LazyMarkdownRenderer
                content={markdownContent}
                style={markdownStyles}
                onLinkPress={handleLinkPress}
                rules={{
                  ...selectableMarkdownRules,
                  // Custom image renderer to avoid spreading key in props (RN warning) and to control sizing
                  image: (node: { key?: string; attributes?: { src?: string; href?: string; alt?: string } }) => {
                    const src: string | undefined = node?.attributes?.src || node?.attributes?.href;
                    const alt: string | undefined = node?.attributes?.alt;
                    if (!src) return null;
                    return (
                      <View key={node?.key || `img_${Math.random()}`} style={{ marginVertical: 8 }}>
                        <Image
                          source={{ uri: src }}
                          style={{ width: '100%', height: 220, borderRadius: 8 }}
                          resizeMode="cover"
                          accessible
                          accessibilityLabel={alt || 'image'}
                        />
                      </View>
                    );
                  },
                }}
              />
            ) : (
              <Markdown
                style={markdownStyles}
                onLinkPress={handleLinkPress}
                rules={{
                  ...selectableMarkdownRules,
                  // Custom image renderer to avoid spreading key in props (RN warning) and to control sizing
                  image: (node: { key?: string; attributes?: { src?: string; href?: string; alt?: string } }) => {
                    const src: string | undefined = node?.attributes?.src || node?.attributes?.href;
                    const alt: string | undefined = node?.attributes?.alt;
                    if (!src) return null;
                    return (
                      <View key={node?.key || `img_${Math.random()}`} style={{ marginVertical: 8 }}>
                        <Image
                          source={{ uri: src }}
                          style={{ width: '100%', height: 220, borderRadius: 8 }}
                          resizeMode="cover"
                          accessible
                          accessibilityLabel={alt || 'image'}
                        />
                      </View>
                    );
                  },
                }}
              >
                {markdownContent}
              </Markdown>
            )}
          {/* Render image attachments if present */}
          {!isUser && message.attachments && message.attachments.length > 0 && (
            <ImageBubble uris={message.attachments.filter(a => a.type === 'image').map(a => a.uri)} />
          )}
          {isStreaming && (
            <Box style={styles.streamingContainer}>
              {!streamingContent ? (
                // Nothing has arrived yet — say what the AI is doing instead
                // of showing a bare cursor (search retrieval can take a while).
                <Box style={styles.streamingStatusRow}>
                  <StreamingIndicator
                    visible
                    variant="dots"
                    color={aiColor?.text || theme.colors.text.secondary}
                    size={12}
                  />
                  <Typography variant="caption" color="secondary">
                    {message.metadata?.webSearchEnabled ? 'Searching the web…' : 'Thinking…'}
                  </Typography>
                </Box>
              ) : (
                <StreamingIndicator
                  visible={cursorVisible}
                  variant="cursor"
                  color={aiColor?.text || theme.colors.text.primary}
                />
              )}
            </Box>
          )}
          </>
        )}
        {/* Copy button */}
        <TouchableOpacity
          onPress={async () => {
            try {
              await Clipboard.setStringAsync(displayContent || '');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              void 0; // noop
            }
          }}
          accessibilityLabel="Copy message"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          style={[
            styles.copyButton,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
          ]}
        >
          <Ionicons
            name={copied ? 'checkmark-outline' : 'copy-outline'}
            size={16}
            color={isUser ? theme.colors.text.inverse : theme.colors.text.primary}
          />
        </TouchableOpacity>
        {canReportContent && (
          <TouchableOpacity
            onPress={() => onReportContent?.(message)}
            accessibilityLabel="Report AI content"
            accessibilityRole="button"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            testID={`report-message-${message.id}`}
            style={[
              styles.reportButton,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
            ]}
          >
            <Ionicons
              name="flag-outline"
              size={16}
              color={theme.colors.error[500]}
            />
          </TouchableOpacity>
        )}
        </Box>

        {/* Status pill for cancelled streams */}
        {!isUser && isCancelled && (
          <Box
            style={{
              marginTop: 6,
              alignSelf: 'flex-start',
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 999,
              backgroundColor: isDark ? theme.colors.semantic.error : theme.colors.error[50],
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isDark ? theme.colors.error[600] : theme.colors.error[300],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <IconStopOctagon size={12} color={isDark ? theme.colors.error[300] : theme.colors.error[600]} />
            <Typography variant="caption" style={{ color: isDark ? theme.colors.error[300] : theme.colors.error[700], marginLeft: 6 }}>
              Cancelled by you
            </Typography>
          </Box>
        )}
        
        {/* Cut off at the length limit: say so and offer to continue */}
        {isTruncated && (
          <Box
            testID={`truncated-notice-${message.id}`}
            style={[
              styles.truncatedNotice,
              {
                backgroundColor: isDark ? theme.colors.semantic.warning : theme.colors.warning[50],
                borderColor: isDark ? theme.colors.warning[700] : theme.colors.warning[300],
              },
            ]}
          >
            <Ionicons
              name="cut-outline"
              size={14}
              color={isDark ? theme.colors.warning[300] : theme.colors.warning[800]}
            />
            <Typography
              variant="caption"
              style={[styles.truncatedText, { color: isDark ? theme.colors.warning[300] : theme.colors.warning[800] }]}
            >
              {hasPartialContent ? 'Cut off at the length limit' : 'Hit the length limit before answering'}
            </Typography>
            {onContinue && (
              <TouchableOpacity
                onPress={() => onContinue(message)}
                accessibilityRole="button"
                accessibilityLabel={hasPartialContent ? `Continue ${message.sender}'s reply` : `Ask ${message.sender} again`}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                testID={`continue-message-${message.id}`}
                style={[
                  styles.truncatedAction,
                  { backgroundColor: isDark ? theme.colors.warning[700] : theme.colors.warning[600] },
                ]}
              >
                <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.inverse }}>
                  {hasPartialContent ? 'Continue' : 'Try again'}
                </Typography>
              </TouchableOpacity>
            )}
          </Box>
        )}

        {/* Failed reply: say why and offer to continue or try again */}
        {isFailed && (
          <Box
            testID={`failed-notice-${message.id}`}
            style={[
              styles.truncatedNotice,
              {
                backgroundColor: isDark ? theme.colors.semantic.error : theme.colors.error[50],
                borderColor: isDark ? theme.colors.error[600] : theme.colors.error[300],
              },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={14}
              color={isDark ? theme.colors.error[300] : theme.colors.error[700]}
            />
            <Typography
              variant="caption"
              numberOfLines={2}
              style={[styles.truncatedText, { color: isDark ? theme.colors.error[300] : theme.colors.error[700] }]}
            >
              {failedWithPartial ? errorMessage : 'No reply received'}
            </Typography>
            {canRetryFailure && onContinue && (
              <TouchableOpacity
                onPress={() => onContinue(message)}
                accessibilityRole="button"
                accessibilityLabel={failedWithPartial ? `Continue ${message.sender}'s reply` : `Ask ${message.sender} again`}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                testID={`retry-message-${message.id}`}
                style={[
                  styles.truncatedAction,
                  { backgroundColor: isDark ? theme.colors.error[700] : theme.colors.error[600] },
                ]}
              >
                <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.inverse }}>
                  {failedWithPartial ? 'Continue' : 'Try again'}
                </Typography>
              </TouchableOpacity>
            )}
          </Box>
        )}

        {/* Citations section for messages with sources */}
        {!isUser && (
          <CitationSources
            citations={message.metadata?.citations}
            initialVisible={3}
            brandColor={aiColor?.border}
          />
        )}
        
        <Box
          style={[
            styles.metadataContainer,
            isUser ? styles.userMetadata : styles.aiMetadata,
          ]}
        >
          <Typography 
            variant="caption" 
            color="secondary"
            style={styles.timestamp}
          >
            {formatTime(message.timestamp)}
          </Typography>
          {!isUser && message.metadata?.modelUsed && (
            <Typography
              variant="caption"
              color="secondary"
              style={styles.modelInfo}
            >
              • {message.metadata.modelUsed}
            </Typography>
          )}
        </Box>
      </Box>
    </Animated.View>
  );
};

export const MessageBubble = React.memo(MessageBubbleComponent, (prevProps, nextProps) => (
  prevProps.message === nextProps.message
  && prevProps.isLast === nextProps.isLast
  && prevProps.searchTerm === nextProps.searchTerm
  && prevProps.onReportContent === nextProps.onReportContent
  && prevProps.onContinue === nextProps.onContinue
));

const styles = StyleSheet.create({
  messageRow: {
    width: '100%',
    paddingHorizontal: 16,
    marginVertical: 8,
    flexDirection: 'row',
  },
  rowAlignStart: {
    justifyContent: 'flex-start',
  },
  rowAlignEnd: {
    justifyContent: 'flex-end',
  },
  stack: {
    flexShrink: 1,
  },
  stackLeft: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  stackRight: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  aiHeader: {
    marginBottom: 4,
  },
  messageBubble: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 28, // Extra space for copy button
    borderRadius: 16,
    position: 'relative',
  },
  timestamp: {
    fontSize: 11,
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  aiMetadata: {
    alignSelf: 'flex-start',
  },
  userMetadata: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  modelInfo: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  streamingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  streamingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  streamingText: {
    fontSize: 16,
    lineHeight: 24,
  },
  copyButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 12,
    padding: 6,
  },
  reportButton: {
    position: 'absolute',
    right: 42,
    bottom: 8,
    borderRadius: 12,
    padding: 6,
  },
  truncatedNotice: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  truncatedText: {
    flexShrink: 1,
  },
  truncatedAction: {
    marginLeft: 2,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  demoWatermark: {
    position: 'absolute',
    top: 8,
    left: 8,
    transform: [{ rotate: '-18deg' }],
  },
  demoWatermarkText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
