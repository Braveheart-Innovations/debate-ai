/**
 * LazyMarkdownRenderer - Shared component for rendering long markdown content with lazy loading
 * Provides consistent markdown rendering across Chat, Compare, and Debate modes
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, TouchableOpacity } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { splitForLazyRender } from '@/utils/markdown';

// Type for markdown styles
export type MarkdownStyles = {
  [key: string]: TextStyle | ViewStyle;
};

// Type for markdown node
export interface MarkdownNode {
  key?: string;
  attributes?: Record<string, unknown>;
  children?: MarkdownNode[];
  content?: string;
  type?: string;
}

// Type for markdown rules - more flexible to match react-native-markdown-display
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MarkdownRules = Record<string, any>;

interface LazyMarkdownRendererProps {
  content: string;
  style: MarkdownStyles;
  onLinkPress?: (url: string) => boolean;
  rules?: MarkdownRules;
  chunkSize?: number;
  loadMoreText?: string;
}

export const LazyMarkdownRenderer: React.FC<LazyMarkdownRendererProps> = ({
  content,
  style,
  onLinkPress,
  rules,
  chunkSize = 10000,
  loadMoreText = 'Load more',
}) => {
  const [renderedChunks, setRenderedChunks] = useState(1);
  const chunks = useMemo(() => splitForLazyRender(content, chunkSize), [content, chunkSize]);
  const { theme } = useTheme();

  const loadMore = useCallback(() => {
    setRenderedChunks(prev => Math.min(prev + 1, chunks.length));
  }, [chunks.length]);

  useEffect(() => {
    // Reset when content changes
    setRenderedChunks(1);
  }, [content]);

  const defaultOnLinkPress = useCallback((_url: string) => {
    // Default link handler can be overridden
    return false;
  }, []);

  return (
    <View>
      {chunks.slice(0, renderedChunks).map((chunk, index) => (
        <Markdown
          key={`chunk-${index}`}
          style={style}
          onLinkPress={onLinkPress || defaultOnLinkPress}
          rules={rules}
        >
          {chunk}
        </Markdown>
      ))}
      {renderedChunks < chunks.length && (
        <TouchableOpacity
          onPress={loadMore}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: theme.colors.primary[100],
            borderRadius: 8,
            marginTop: 12,
            alignSelf: 'center',
          }}
        >
          <Typography variant="body" weight="medium" style={{ color: theme.colors.primary[700] }}>
            {loadMoreText} ({chunks.length - renderedChunks} chunks remaining)
          </Typography>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * Creates standard markdown styles for message bubbles
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMarkdownStyles = (theme: any, isDark: boolean): MarkdownStyles => ({
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.text.primary,
  },
  heading1: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    marginBottom: 8,
    color: theme.colors.text.primary,
  },
  heading2: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    marginBottom: 6,
    color: theme.colors.text.primary,
  },
  heading3: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    marginBottom: 4,
    color: theme.colors.text.primary,
  },
  strong: {
    fontWeight: 'bold' as const,
    color: theme.colors.text.primary,
  },
  em: {
    fontStyle: 'italic' as const,
    color: theme.colors.text.primary,
  },
  link: {
    color: theme.colors.primary[600],
    textDecorationLine: 'none' as const,
    fontSize: 15,
    fontWeight: '600' as const,
    paddingHorizontal: 2,
  },
  code_inline: {
    backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100],
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  code_block: {
    backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100],
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: 'monospace',
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  list_item: {
    marginBottom: 4,
    color: theme.colors.text.primary,
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
  },
});