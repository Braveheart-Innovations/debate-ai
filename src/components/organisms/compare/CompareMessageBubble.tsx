import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Typography } from '../../molecules';
import { LazyMarkdownRenderer, createMarkdownStyles } from '../../molecules/common/LazyMarkdownRenderer';
import { Message } from '../../../types';
import { useTheme } from '../../../theme';
import { sanitizeMarkdown, shouldLazyRender } from '@/utils/markdown';
import { selectableMarkdownRules } from '@/utils/markdownSelectable';
import { useStreamingMessage } from '@/hooks/streaming';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { Image } from 'react-native';

interface CompareMessageBubbleProps {
  message: Message;
  side: 'left' | 'right';
}

export const CompareMessageBubble: React.FC<CompareMessageBubbleProps> = ({
  message,
  side
}) => {
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const { isDemo } = useFeatureAccess();

  // Hook for streaming messages
  const {
    content: streamingContent,
    isStreaming,
    error: streamingError
  } = useStreamingMessage(message.id);

  // Determine what content to display
  const displayContent = useMemo(() => {
    if (streamingError) {
      // If there's an error, show original content or error message
      return streamingContent || message.content || 'Error loading message';
    } else if (isStreaming && streamingContent) {
      // Use streaming content while streaming
      return streamingContent;
    }
    return message.content;
  }, [message.content, streamingContent, streamingError, isStreaming]);

  // Process markdown content
  const markdownContent = useMemo(() => {
    return sanitizeMarkdown(displayContent, { showWarning: false });
  }, [displayContent]);

  // Check if content needs lazy rendering
  const isLongContent = useMemo(() => {
    return shouldLazyRender(markdownContent);
  }, [markdownContent]);

  // Create markdown styles
  const markdownStyles = useMemo(() => createMarkdownStyles(theme, isDark), [theme, isDark]);
  
  const bubbleStyle = isDark
    ? {
        backgroundColor: theme.colors.surface,
        borderColor: side === 'left' ? theme.colors.warning[500] : theme.colors.info[500],
      }
    : {
        backgroundColor: side === 'left' ? theme.colors.warning[100] : theme.colors.info[100],
        borderColor: side === 'left' ? theme.colors.warning[300] : theme.colors.info[300],
      };

  // Match Chat dark mode: primary text on dark bubble
  const headerColor = isDark ? theme.colors.text.secondary : theme.colors.text.primary;
  const bodyColor = isDark ? theme.colors.text.primary : theme.colors.text.primary;

  return (
    <View style={[
      styles.row,
      side === 'left' ? styles.alignStart : styles.alignEnd,
    ]}>
      <View style={[styles.container, bubbleStyle]}>
        {isDemo && (
          <View style={{ position: 'absolute', top: 6, left: 6, transform: [{ rotate: '-18deg' }], pointerEvents: 'none' }}>
            <Typography variant="caption" style={{ fontSize: 18, fontWeight: '800', letterSpacing: 1, color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
              DEMO
            </Typography>
          </View>
        )}
        <View style={styles.header}>
          <Typography 
            variant="caption" 
            weight="semibold" 
            style={{ color: headerColor }}
          >
            {message.sender}
          </Typography>
        </View>
        {isLongContent ? (
          <LazyMarkdownRenderer
            content={markdownContent}
            style={markdownStyles}
            onLinkPress={(url: string) => {
              Linking.openURL(url).catch(err =>
                console.error('Failed to open URL:', err)
              );
              return false;
            }}
            rules={{
              ...selectableMarkdownRules,
              // Custom image renderer
              image: (node: { key?: string; attributes?: { src?: string; href?: string; alt?: string } }) => {
                const src: string | undefined = node?.attributes?.src || node?.attributes?.href;
                const alt: string | undefined = node?.attributes?.alt;
                if (!src) return null;
                return (
                  <View key={node?.key || `img_${Math.random()}`} style={{ marginVertical: 8 }}>
                    <Image
                      source={{ uri: src }}
                      style={{ width: '100%', height: 180, borderRadius: 8 }}
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
            onLinkPress={(url: string) => {
              Linking.openURL(url).catch(err =>
                console.error('Failed to open URL:', err)
              );
              return false;
            }}
            rules={{
              ...selectableMarkdownRules,
              // Custom image renderer
              image: (node: { key?: string; attributes?: { src?: string; href?: string; alt?: string } }) => {
                const src: string | undefined = node?.attributes?.src || node?.attributes?.href;
                const alt: string | undefined = node?.attributes?.alt;
                if (!src) return null;
                return (
                  <View key={node?.key || `img_${Math.random()}`} style={{ marginVertical: 8 }}>
                    <Image
                      source={{ uri: src }}
                      style={{ width: '100%', height: 180, borderRadius: 8 }}
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
        {/* Copy button */}
        <TouchableOpacity
          onPress={async () => {
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
            color={bodyColor}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: '100%',
    paddingHorizontal: 8,
    flexDirection: 'row',
  },
  alignStart: {
    justifyContent: 'flex-start',
  },
  alignEnd: {
    justifyContent: 'flex-end',
  },
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10, // Compact padding
    width: '100%', // Use full width available
    position: 'relative',
  },
  header: {
    marginBottom: 4,
  },
  content: {
    lineHeight: 20,
  },
  copyButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    borderRadius: 12,
    padding: 6,
  },
});
