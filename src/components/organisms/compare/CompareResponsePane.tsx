import React, { useMemo, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking, Image, Dimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ContinueButton } from './ContinueButton';
import { CompareTypingIndicator } from './CompareTypingIndicator';
import { CompareImageGeneratingPane } from './CompareImageGeneratingPane';
import { CompareImageDisplay } from './CompareImageDisplay';
import { Typography } from '../../molecules';
import { LazyMarkdownRenderer, createMarkdownStyles } from '../../molecules/common/LazyMarkdownRenderer';
import { CitationList } from '../common/CitationList';
import { Message, AIConfig } from '../../../types';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';
import type { BrandColor } from '@/constants/aiColors';
import { getBrandPalette } from '@/utils/aiBrandColors';
import { sanitizeMarkdown, shouldLazyRender } from '@/utils/markdown';
import { processMessageContentWithCitations, findCitationByUrl } from '@/utils/citationUtils';
import { selectableMarkdownRules } from '@/utils/markdownSelectable';
import { useCitationPreview } from '@/providers/CitationPreviewProvider';
import * as Clipboard from 'expo-clipboard';
import type { ImageGenState } from './CompareSplitView';

interface CompareResponsePaneProps {
  ai: AIConfig;
  messages: Message[];
  isTyping: boolean;
  streamingContent?: string;
  onContinueWithAI: () => void;
  side: 'left' | 'right';
  isExpanded?: boolean;
  isDisabled?: boolean;
  onExpand?: () => void;
  // Image generation props
  imageState?: ImageGenState;
  onCancelImage?: () => void;
  onRetryImage?: () => void;
  onOpenLightbox?: (uri: string) => void;
}

export const CompareResponsePane: React.FC<CompareResponsePaneProps> = ({
  ai,
  messages,
  isTyping,
  streamingContent,
  onContinueWithAI,
  side,
  isExpanded = false,
  isDisabled = false,
  onExpand,
  imageState,
  onCancelImage,
  onRetryImage,
  onOpenLightbox,
}) => {
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const { showPreview } = useCitationPreview();

  const brandPalette: BrandColor | null = useMemo(
    () => getBrandPalette(ai.provider, ai.name),
    [ai.name, ai.provider]
  );

  const paneBorderColor = brandPalette
    ? (isDark ? brandPalette[500] : brandPalette[300])
    : (side === 'left' ? theme.colors.warning[200] : theme.colors.info[200]);
  const paneBackgroundColor = brandPalette
    ? (isDark ? theme.colors.card : brandPalette[50])
    : (isDark ? theme.colors.card : side === 'left' ? theme.colors.warning[50] : theme.colors.info[50]);
  const accentColor = brandPalette
    ? brandPalette[500]
    : (side === 'left' ? theme.colors.warning[500] : theme.colors.info[500]);

  const paneStyle = {
    backgroundColor: paneBackgroundColor,
    borderColor: paneBorderColor,
    opacity: isDisabled ? 0.5 : 1,
  } as const;

  // Create markdown styles
  const markdownStyles = useMemo(() => createMarkdownStyles(theme, isDark), [theme, isDark]);

  // Create link press handler for a message (checks for citations)
  const createLinkPressHandler = useCallback((message: Message) => {
    return (url: string): boolean => {
      const citations = message.metadata?.citations;
      if (citations && citations.length > 0) {
        const citation = findCitationByUrl(url, citations);
        if (citation) {
          const screenWidth = Dimensions.get('window').width;
          const screenHeight = Dimensions.get('window').height;
          showPreview(citation, { x: screenWidth / 2, y: screenHeight / 3 }, accentColor);
          return false;
        }
      }
      Linking.openURL(url).catch(err => console.error('Failed to open URL:', err));
      return false;
    };
  }, [showPreview, accentColor]);

  // Get all content for copy functionality
  const allContent = useMemo(() => {
    const messageContent = messages.map(m => m.content).join('\n\n');
    return streamingContent ? `${messageContent}\n\n${streamingContent}` : messageContent;
  }, [messages, streamingContent]);

  // Handle copy
  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(allContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      void 0;
    }
  };

  // Render a single message's content
  const renderMessageContent = (message: Message, index: number) => {
    // Process content with citations if available
    const rawContent = message.metadata?.citations?.length
      ? processMessageContentWithCitations(message.content, message.metadata.citations)
      : message.content;
    const content = sanitizeMarkdown(rawContent, { showWarning: false });
    const isLong = shouldLazyRender(content);
    const imageAttachments = (message.attachments || []).filter(a => a.type === 'image');
    const hasCitations = message.metadata?.citations && message.metadata.citations.length > 0;

    const imageRule = {
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
    };

    const handleLinkPress = createLinkPressHandler(message);

    return (
      <View key={message.id} style={index > 0 ? styles.messageSpacing : undefined}>
        {isLong ? (
          <LazyMarkdownRenderer
            content={content}
            style={markdownStyles}
            onLinkPress={handleLinkPress}
            rules={{ ...selectableMarkdownRules, ...imageRule }}
          />
        ) : (
          <Markdown
            style={markdownStyles}
            onLinkPress={handleLinkPress}
            rules={{ ...selectableMarkdownRules, ...imageRule }}
          >
            {content}
          </Markdown>
        )}
        {/* Image Attachments */}
        {imageAttachments.length > 0 && onOpenLightbox && (
          <View style={styles.imageAttachments}>
            {imageAttachments.map((attachment, idx) => (
              <CompareImageDisplay
                key={`${attachment.uri}-${idx}`}
                ai={ai}
                side={side}
                uri={attachment.uri}
                mimeType={attachment.mimeType}
                timestamp={message.timestamp}
                onOpenLightbox={onOpenLightbox}
                brandPalette={brandPalette}
              />
            ))}
          </View>
        )}
        {/* Citations */}
        {hasCitations && (
          <CitationList
            citations={message.metadata!.citations!}
            variant="compact"
            initialVisible={2}
            brandColor={accentColor}
            onCitationPress={(citation) => Linking.openURL(citation.url)}
          />
        )}
      </View>
    );
  };

  // Render streaming content
  const renderStreamingContent = () => {
    if (!streamingContent) return null;
    const content = sanitizeMarkdown(streamingContent, { showWarning: false });

    return (
      <View style={messages.length > 0 ? styles.messageSpacing : undefined}>
        <Markdown
          style={markdownStyles}
          onLinkPress={(url: string) => {
            Linking.openURL(url).catch(err => console.error('Failed to open URL:', err));
            return false;
          }}
          rules={selectableMarkdownRules}
        >
          {content}
        </Markdown>
      </View>
    );
  };

  return (
    <View style={[styles.pane, paneStyle]}>
      {/* AI Header */}
      <View style={styles.header}>
        <Typography
          variant="caption"
          weight="semibold"
          style={{ color: accentColor }}
        >
          {ai.name}
        </Typography>
      </View>

      {/* Expand Button - Floating in top-right corner */}
      {onExpand && (
        <TouchableOpacity
          onPress={onExpand}
          disabled={isDisabled}
          style={styles.expandButton}
        >
          <Ionicons
            name={isExpanded ? 'contract-outline' : 'expand-outline'}
            size={20}
            color={isDisabled ? theme.colors.text.disabled : theme.colors.text.primary}
          />
        </TouchableOpacity>
      )}

      {/* Scrollable Response Area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Render all messages directly */}
        {messages.map((message, index) => renderMessageContent(message, index))}

        {/* Streaming Content */}
        {renderStreamingContent()}

        {/* Image Generation Loading State */}
        {imageState?.isGenerating && imageState.phase !== 'done' && (
          <CompareImageGeneratingPane
            ai={ai}
            side={side}
            startTime={imageState.startTime}
            phase={imageState.phase}
            aspectRatio={imageState.aspectRatio}
            onCancel={() => onCancelImage?.()}
            onRetry={() => onRetryImage?.()}
            brandPalette={brandPalette}
          />
        )}

        {/* Typing Indicator */}
        <CompareTypingIndicator
          isVisible={isTyping && !streamingContent}
          accentColor={accentColor}
        />

        {/* Copy Button - inside scroll content */}
        {(messages.length > 0 || streamingContent) && (
          <TouchableOpacity
            onPress={handleCopy}
            accessibilityLabel="Copy all content"
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
        )}
      </ScrollView>

      {/* Continue Button */}
      <ContinueButton
        onPress={onContinueWithAI}
        isDisabled={isDisabled}
        side={side}
        accentColor={accentColor}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  expandButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    padding: 4,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  messageSpacing: {
    marginTop: 12,
  },
  imageAttachments: {
    marginTop: 8,
  },
  copyButton: {
    alignSelf: 'flex-end',
    marginTop: 12,
    borderRadius: 12,
    padding: 6,
  },
});
