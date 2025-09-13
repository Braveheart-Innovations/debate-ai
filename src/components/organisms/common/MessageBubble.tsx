import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import Animated, { 
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';
import { sanitizeMarkdown } from '@/utils/markdown';
import { Image, View } from 'react-native';
import { ImageBubble } from '../chat/ImageBubble';
import { Box } from '@/components/atoms';
import IconStopOctagon from '@/components/atoms/icons/IconStopOctagon';
import { Typography } from '@/components/molecules';
import { StreamingIndicator } from './StreamingIndicator';
import { useTheme } from '@/theme';
import { Message } from '@/types';
import { AI_BRAND_COLORS } from '@/constants/aiColors';
import { useStreamingMessage } from '@/hooks/streaming';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { selectableMarkdownRules } from '@/utils/markdownSelectable';
import useFeatureAccess from '@/hooks/useFeatureAccess';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  searchTerm?: string;
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
const highlightMentions = (text: string) => {
  const mentionRegex = /@(\w+)/g;
  const parts = text.split(mentionRegex);
  
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <Text key={index} style={{ fontWeight: 'bold', color: '#007AFF' }}>
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

// Process message content to add citation links
const processMessageContent = (message: Message): string => {
  let content = message.content;
  
  // If we have citations, convert [1] references to clickable links
  if (message.metadata?.citations && message.metadata.citations.length > 0) {
    const citations = message.metadata.citations;
    
    // Replace [n] with markdown links keeping the bracket format
    citations.forEach(citation => {
      const pattern = new RegExp(`\\[${citation.index}\\]`, 'g');
      // Keep the [n] format but make it a link
      content = content.replace(pattern, `[[${citation.index}]](${citation.url})`);
    });
    
    // Don't add sources section here - we show it separately in the UI
  }
  
  return content;
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast, searchTerm }) => {
  const isUser = message.senderType === 'user';
  const scale = useSharedValue(isLast ? 0 : 1);
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const { isDemo } = useFeatureAccess();
  
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
  
  if (streamingError) {
    // If there's a streaming error, show error message
    hasError = true;
    
    // Provide user-friendly error messages
    if (isCancelled) {
      errorMessage = 'Stream cancelled by you';
    } else if (streamingError.includes('overload') || streamingError.includes('Overloaded')) {
      errorMessage = '⚠️ Service temporarily busy. Please try again in a moment.';
    } else if (streamingError.includes('verification')) {
      errorMessage = '⚠️ Organization verification required for streaming.';
    } else if (streamingError.includes('network') || streamingError.includes('connection')) {
      errorMessage = '⚠️ Connection issue. Please check your internet.';
    } else {
      errorMessage = `⚠️ ${streamingError}`;
    }
    
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

  useEffect(() => {
    if (isLast) {
      scale.value = withSpring(1, {
        damping: 15,
        stiffness: 150,
      });
    }
  }, [isLast, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Get AI-specific color from the message sender
  const getAIColor = () => {
    if (isUser) return null;
    
    // Parse sender name to get AI provider
    const aiName = message.sender.toLowerCase();
    
    // Map AI names to their brand color keys
    const aiBrandKey = (aiName === 'chatgpt' || aiName === 'openai') ? 'openai' : 
                       aiName === 'claude' ? 'claude' :
                       aiName === 'gemini' ? 'gemini' :
                       aiName === 'perplexity' ? 'perplexity' :
                       aiName === 'mistral' ? 'mistral' :
                       aiName === 'cohere' ? 'cohere' :
                       aiName === 'together' ? 'together' :
                       aiName === 'deepseek' ? 'deepseek' :
                       aiName === 'grok' ? 'grok' :
                       aiName === 'nomi' ? 'nomi' :
                       aiName === 'replika' ? 'replika' :
                       aiName.includes('character') ? 'characterai' : null;
    
    if (!aiBrandKey || !(aiBrandKey in AI_BRAND_COLORS)) return null;
    
    const brandColors = AI_BRAND_COLORS[aiBrandKey as keyof typeof AI_BRAND_COLORS];
    return {
      light: brandColors[50],
      dark: theme.colors.surface,
      border: brandColors[500],
      text: brandColors[600],
    };
  };
  
  const aiColor = getAIColor();

  return (
    <Animated.View
      style={[
        styles.messageContainer,
        isUser && styles.userMessageContainer,
        animatedStyle,
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
          },
        ]}
      >
        {isDemo && (
          <View style={{ position: 'absolute', top: 8, left: 8, transform: [{ rotate: '-18deg' }], pointerEvents: 'none' }}>
            <Text style={{ fontSize: 28, fontWeight: '900', letterSpacing: 2, color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
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
            {searchTerm ? <HighlightedText text={displayContent} searchTerm={searchTerm} /> : highlightMentions(displayContent)}
          </Typography>
        ) : (
          // AI messages - render markdown with streaming support
          <>
            <Markdown
            style={{
              body: { 
                fontSize: 16, 
                lineHeight: 22,
                color: theme.colors.text.primary
              },
              heading1: { 
                fontSize: 20, 
                fontWeight: 'bold', 
                marginBottom: 8,
                color: theme.colors.text.primary
              },
              heading2: { 
                fontSize: 18, 
                fontWeight: 'bold', 
                marginBottom: 6,
                color: theme.colors.text.primary
              },
              heading3: { 
                fontSize: 16, 
                fontWeight: 'bold', 
                marginBottom: 4,
                color: theme.colors.text.primary
              },
              strong: { 
                fontWeight: 'bold',
                color: theme.colors.text.primary
              },
              em: { 
                fontStyle: 'italic',
                color: theme.colors.text.primary
              },
              link: { 
                color: theme.colors.primary[600], 
                textDecorationLine: 'none',  // No underline for cleaner appearance
                fontSize: 15,  // Almost same as body for better readability
                fontWeight: '600',  // Semi-bold for visibility
                paddingHorizontal: 2,  // Small padding for better touch targets
              },
              code_inline: { 
                backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100], 
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 14,
                color: theme.colors.text.primary
              },
              code_block: {
                backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100],
                padding: 12,
                borderRadius: 8,
                marginVertical: 8,
                fontFamily: 'monospace',
                fontSize: 14,
                color: theme.colors.text.primary
              },
              list_item: { 
                marginBottom: 4,
                color: theme.colors.text.primary
              },
              bullet_list: { marginVertical: 4 },
              ordered_list: { marginVertical: 4 },
              blockquote: {
                backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[50],
                borderLeftWidth: 4,
                borderLeftColor: theme.colors.primary[500],
                paddingLeft: 12,
                paddingVertical: 8,
                marginVertical: 8,
              }
            }}
            onLinkPress={(url: string) => {
              Linking.openURL(url).catch(err => 
                console.error('Failed to open URL:', err)
              );
              return false;
            }}
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
            {displayContent 
              ? sanitizeMarkdown(processMessageContent({ ...message, content: displayContent })) 
              : ''}
          </Markdown>
          {/* Render image attachments if present */}
          {!isUser && message.attachments && message.attachments.length > 0 && (
            <ImageBubble uris={message.attachments.filter(a => a.type === 'image').map(a => a.uri)} />
          )}
          {isStreaming && (
            <Box style={styles.streamingContainer}>
              <StreamingIndicator 
                visible={cursorVisible} 
                variant="cursor"
                color={aiColor?.text || theme.colors.text.primary}
              />
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
      
      {/* Citations section for messages with sources */}
      {!isUser && message.metadata?.citations && message.metadata.citations.length > 0 && (
        <Box style={[styles.citationsContainer, { borderTopColor: theme.colors.border }]}>
          <Typography variant="caption" weight="semibold" style={{ marginBottom: 4 }}>
            Sources:
          </Typography>
          {message.metadata.citations.slice(0, 3).map((citation, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => Linking.openURL(citation.url)}
              style={styles.citationItem}
            >
              <Typography variant="caption" style={{ color: theme.colors.primary[500] }}>
                [{citation.index}] {citation.title || citation.url}
              </Typography>
            </TouchableOpacity>
          ))}
        </Box>
      )}
      
      <Box style={[styles.metadataContainer, isUser && styles.userMetadata]}>
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  userMessageContainer: {
    alignSelf: 'flex-end',
  },
  aiHeader: {
    marginBottom: 4,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    position: 'relative',
  },
  timestamp: {
    fontSize: 11,
  },
  userTimestamp: {
    textAlign: 'right',
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  userMetadata: {
    justifyContent: 'flex-end',
  },
  modelInfo: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  citationsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  citationItem: {
    paddingVertical: 2,
  },
  streamingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  copyButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 12,
    padding: 6,
  },
});
