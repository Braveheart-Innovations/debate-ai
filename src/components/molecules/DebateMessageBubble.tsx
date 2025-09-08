/**
 * DebateMessageBubble Molecule Component
 * Specialized message bubble for debate mode with host message support
 * Extends the base MessageBubble functionality for debate-specific features
 */

import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  Easing,
} from 'react-native-reanimated';
import { StyleSheet, Linking } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { sanitizeMarkdown } from '@/utils/markdown';
import { Box } from '../atoms';
import { Typography } from './Typography';
import { StreamingIndicator } from '../organisms/StreamingIndicator';
import { useTheme } from '../../theme';
import { Message } from '../../types';
import { AI_BRAND_COLORS } from '../../constants/aiColors';
import { useStreamingMessage } from '../../hooks/streaming/useStreamingMessage';

export interface DebateMessageBubbleProps {
  message: Message;
  index: number;
  participants?: Array<{ id: string; name: string }>;
  scores?: Record<string, { roundWins: number; name: string }>;
}

export const DebateMessageBubble: React.FC<DebateMessageBubbleProps> = React.memo(({ 
  message,
  participants: _participants,
  scores: _scores 
}) => {
  const { theme, isDark } = useTheme();
  const isHost = message.sender === 'Debate Host';
  const { content: streamingContent, isStreaming, cursorVisible, error: streamingError, chunksReceived } = useStreamingMessage(message.id);
  
  
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
  if (isHost) {
    return (
      <Animated.View style={[styles.messageContainer, animatedStyle, { alignItems: 'center' }]}>
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
          >
            {sanitizeMarkdown(message.content)}
          </Markdown>
          
          <Box style={{
            height: 1,
            flex: 1,
            backgroundColor: theme.colors.border,
            opacity: 0.3,
          }} />
        </Box>
      </Animated.View>
    );
  }
  
  // Regular AI message
  return (
    <Animated.View style={[styles.messageContainer, animatedStyle]}>
      <Box style={styles.aiHeader}>
        <Typography 
          variant="subtitle" 
          weight="semibold"
          style={{ color: aiColor?.border || theme.colors.primary[500] }}
        >
          {message.sender}
        </Typography>
      </Box>
      <Box style={[
        styles.aiBubble,
        { 
          backgroundColor: aiColor ? (isDark ? aiColor.dark : aiColor.light) : theme.colors.card, 
          borderColor: aiColor?.border || theme.colors.border,
          borderWidth: 1,
        }
      ]}>
        <Markdown
          style={{
            body: { 
              fontSize: 16, 
              lineHeight: 22,
              color: theme.colors.text.primary
            },
            strong: { fontWeight: 'bold', color: theme.colors.text.primary },
            em: { fontStyle: 'italic', color: theme.colors.text.primary },
            link: { color: theme.colors.primary[500], textDecorationLine: 'underline' },
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
            list_item: { marginBottom: 4, color: theme.colors.text.primary },
            bullet_list: { marginVertical: 4 },
            ordered_list: { marginVertical: 4 },
          }}
          onLinkPress={(url: string) => {
            Linking.openURL(url).catch(err => 
              console.error('Failed to open URL:', err)
            );
            return false;
          }}
        >
          {(() => {
            // If streaming, show live content
            if (isStreaming) return sanitizeMarkdown(streamingContent || '');
            // After streaming completes, there can be a short window where
            // message.content hasn't been updated yet. Fall back to the last
            // streamed content to avoid an empty bubble.
            if (!isStreaming && (!message.content || message.content.trim() === '')) {
              return sanitizeMarkdown(streamingContent || '');
            }
            // Otherwise, show finalized message content
            return sanitizeMarkdown(message.content);
          })()}
        </Markdown>
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
  messageContainer: {
    marginBottom: 16,
  },
  aiHeader: {
    marginBottom: 4,
  },
  aiBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '85%',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
