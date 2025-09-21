/**
 * DebateMessageBubble Molecule Component
 * Specialized message bubble for debate mode with host message support
 * Extends the base MessageBubble functionality for debate-specific features
 */

import React, { useEffect, useState, useMemo } from 'react';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  Easing,
} from 'react-native-reanimated';
import { StyleSheet, Linking, TouchableOpacity } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { sanitizeMarkdown, shouldLazyRender } from '@/utils/markdown';
import { LazyMarkdownRenderer, createMarkdownStyles } from '@/components/molecules/common/LazyMarkdownRenderer';
import { Box } from '@/components/atoms';
import { Typography } from '../common/Typography';
import { StreamingIndicator } from '@/components/organisms/common/StreamingIndicator';
import { useTheme } from '@/theme';
import { Message } from '@/types';
import { AI_BRAND_COLORS } from '@/constants/aiColors';
import { useStreamingMessage } from '@/hooks/streaming/useStreamingMessage';
import { selectableMarkdownRules } from '@/utils/markdownSelectable';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

export interface DebateMessageBubbleProps {
  message: Message;
  index: number;
  participants?: Array<{ id: string; name: string }>;
  scores?: Record<string, { roundWins: number; name: string }>;
  side?: 'left' | 'right' | 'center';
}

export const DebateMessageBubble: React.FC<DebateMessageBubbleProps> = React.memo(({
  message,
  participants: _participants,
  scores: _scores,
  side = 'left',
}) => {
  const { theme, isDark } = useTheme();
  const isHost = message.sender === 'Debate Host';
  const { content: streamingContent, isStreaming, cursorVisible, error: streamingError, chunksReceived } = useStreamingMessage(message.id);
  const [copied, setCopied] = useState(false);

  // Determine display content
  const displayContent = useMemo(() => {
    if (isStreaming) return sanitizeMarkdown(streamingContent || '', { showWarning: false });
    if (!isStreaming && (!message.content || message.content.trim() === '')) {
      return sanitizeMarkdown(streamingContent || '', { showWarning: false });
    }
    return sanitizeMarkdown(message.content, { showWarning: false });
  }, [isStreaming, streamingContent, message.content]);

  // Check if content needs lazy rendering
  const isLongContent = useMemo(() => shouldLazyRender(displayContent), [displayContent]);

  // Create markdown styles
  const markdownStyles = useMemo(() => createMarkdownStyles(theme, isDark), [theme, isDark]);
  
  
  // Get AI-specific color from the message sender using theme brand colors
  const getAIColor = () => {
    if (isHost) return null;
    
    // Extract AI name from sender (format: "AI Name (Personality)")
    const aiName = message.sender.split(' (')[0].toLowerCase();
    
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
      dark: theme.colors.surface, // Use surface color with tinted border in dark mode
      border: brandColors[500],
    };
  };
  
  const aiColor = getAIColor();
  
  // Simple fade-in animation
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // This component now ONLY handles AI messages - host messages are handled by SystemMessageCard
  
  // Fallback for unrecognized host messages
  if (isHost || side === 'center') {
    return (
      <Animated.View
        style={[styles.messageRow, styles.rowCenter, animatedStyle]}
      >
        <Box style={styles.hostStack}>
          <Box style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 8,
          }}>
            <Box style={{
              height: 1,
              flex: 1,
              backgroundColor: theme.colors.border,
              opacity: 0.3,
            }} />
            
            <Markdown
              style={{
                body: {
                  fontSize: 12,
                  lineHeight: 16,
                  color: theme.colors.text.secondary,
                  textAlign: 'center',
                  paddingHorizontal: 16,
                  fontWeight: '500',
                },
                strong: { fontWeight: 'bold', color: theme.colors.text.secondary },
                em: { fontStyle: 'italic', color: theme.colors.text.secondary },
              }}
              rules={selectableMarkdownRules}
            >
              {displayContent}
            </Markdown>
            
            <Box style={{
              height: 1,
              flex: 1,
              backgroundColor: theme.colors.border,
              opacity: 0.3,
            }} />
          </Box>
        </Box>
      </Animated.View>
    );
  }
  
  // Regular AI message
  return (
    <Animated.View
      style={[
        styles.messageRow,
        side === 'right' ? styles.rowAlignEnd : styles.rowAlignStart,
        animatedStyle,
      ]}
    >
      <Box style={[styles.stack, side === 'right' ? styles.stackRight : styles.stackLeft]}>
        <Box style={[styles.aiHeader, side === 'right' ? styles.aiHeaderRight : null]}>
          <Typography 
            variant="subtitle" 
            weight="semibold"
            style={{ 
              color: aiColor?.border || theme.colors.primary[500],
              textAlign: side === 'right' ? 'right' : 'left',
            }}
          >
            {message.sender}
          </Typography>
        </Box>
        <Box style={[
          styles.aiBubble,
          side === 'right' ? styles.aiBubbleRight : styles.aiBubbleLeft,
          { 
            backgroundColor: aiColor ? (isDark ? aiColor.dark : aiColor.light) : theme.colors.card, 
            borderColor: aiColor?.border || theme.colors.border,
            borderWidth: 1,
          }
        ]}>
        {isLongContent ? (
          <LazyMarkdownRenderer
            content={displayContent}
            style={markdownStyles}
            onLinkPress={(url: string) => {
              Linking.openURL(url).catch(err =>
                console.error('Failed to open URL:', err)
              );
              return false;
            }}
            rules={selectableMarkdownRules}
          />
        ) : (
          <Markdown
            style={markdownStyles}
            rules={selectableMarkdownRules}
            onLinkPress={(url: string) => {
              Linking.openURL(url).catch(err =>
                console.error('Failed to open URL:', err)
              );
              return false;
            }}
          >
            {displayContent}
          </Markdown>
        )}
        {isStreaming && (
          <Box style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center' }}>
            {/* Use dots until first chunk arrives, then blink cursor based on state */}
            {chunksReceived === 0 ? (
              <StreamingIndicator visible={!streamingError} variant="dots" color={aiColor?.border || theme.colors.text.primary} />
            ) : (
              <StreamingIndicator visible={!!(cursorVisible && !streamingError)} variant="cursor" color={aiColor?.border || theme.colors.text.primary} />
            )}
          </Box>
        )}
        {/* Subtle inline error indicator if stream had an error */}
        {!isStreaming && streamingError && (
          <Box style={{ marginTop: 6 }}>
            <Typography variant="caption" color="secondary" style={{ color: theme.colors.warning[600] }}>
              {(() => {
                const err = (streamingError || '').toLowerCase();
                if (err.includes('overload') || err.includes('temporarily busy')) return '⚠️ Service temporarily busy. Showing finalized response.';
                if (err.includes('verification')) return '⚠️ Streaming disabled for this provider. Showing full response.';
                if (err.includes('network') || err.includes('connection')) return '⚠️ Connection issue. Showing finalized response.';
                return `⚠️ Streaming issue: ${streamingError}`;
              })()}
            </Typography>
          </Box>
        )}
        {/* Copy button */}
        <TouchableOpacity
          onPress={async () => {
            const displayContent = isStreaming
              ? (streamingContent || '')
              : (!message.content || message.content.trim() === '')
                ? (streamingContent || '')
                : message.content;
            try {
              await Clipboard.setStringAsync(displayContent || '');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              void 0;
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
            color={theme.colors.text.primary}
          />
        </TouchableOpacity>
      </Box>
      </Box>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Re-render when message identity or displayed content changes
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.sender === nextProps.message.sender &&
    prevProps.message.timestamp === nextProps.message.timestamp
  );
});

const styles = StyleSheet.create({
  messageRow: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
  },
  rowAlignStart: {
    justifyContent: 'flex-start',
  },
  rowAlignEnd: {
    justifyContent: 'flex-end',
  },
  rowCenter: {
    justifyContent: 'center',
  },
  stack: {
    maxWidth: '94%',
    flexShrink: 1,
    gap: 8,
  },
  stackLeft: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  stackRight: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  hostStack: {
    maxWidth: '88%',
    flexShrink: 1,
    alignItems: 'center',
  },
  aiHeader: {
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  aiHeaderRight: {
    alignSelf: 'flex-end',
  },
  aiBubble: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    position: 'relative',
    width: '100%',
    maxWidth: '100%',
  },
  aiBubbleLeft: {
    borderBottomLeftRadius: 6,
  },
  aiBubbleRight: {
    borderBottomRightRadius: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  copyButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 12,
    padding: 6,
  },
});
