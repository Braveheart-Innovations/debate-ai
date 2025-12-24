/**
 * CodeBlock - Syntax highlighted code block for markdown rendering
 * Provides language detection and theme-aware highlighting
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import CodeHighlighter from 'react-native-code-highlighter';
import {
  atomOneDark,
  atomOneLight,
} from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useTheme } from '@/theme';
import { Typography } from './Typography';

interface CodeBlockProps {
  /** Code content to highlight */
  code: string;
  /** Programming language (e.g., 'javascript', 'python', 'typescript') */
  language?: string;
}

/**
 * Syntax highlighted code block component
 *
 * @example
 * <CodeBlock code="const x = 1;" language="javascript" />
 *
 * @example
 * // Without language (plain text)
 * <CodeBlock code="some text" />
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const { theme, isDark } = useTheme();

  // Create theme-aware styles for the highlighter
  const highlighterStyle = useMemo(() => {
    const baseStyle = isDark ? atomOneDark : atomOneLight;
    return {
      ...baseStyle,
      hljs: {
        ...baseStyle.hljs,
        backgroundColor: 'transparent',
        padding: 0,
      },
    };
  }, [isDark]);

  const containerBg = isDark ? theme.colors.gray[800] : theme.colors.gray[100];
  const languageTagBg = isDark ? theme.colors.gray[700] : theme.colors.gray[200];
  const languageTagColor = isDark ? theme.colors.gray[300] : theme.colors.gray[600];

  // Clean up the code (remove trailing newline)
  const cleanCode = useMemo(() => {
    let processed = code;
    if (processed.endsWith('\n')) {
      processed = processed.slice(0, -1);
    }
    return processed;
  }, [code]);

  // Normalize language names
  const normalizedLanguage = useMemo(() => {
    if (!language) return undefined;
    const lang = language.toLowerCase().trim();
    // Map common aliases
    const aliases: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      rb: 'ruby',
      sh: 'bash',
      shell: 'bash',
      yml: 'yaml',
      md: 'markdown',
    };
    return aliases[lang] || lang;
  }, [language]);

  return (
    <View style={[styles.container, { backgroundColor: containerBg }]}>
      {normalizedLanguage && (
        <View style={[styles.languageTag, { backgroundColor: languageTagBg }]}>
          <Typography
            variant="caption"
            style={{ color: languageTagColor, fontSize: 11, textTransform: 'uppercase' }}
          >
            {normalizedLanguage}
          </Typography>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.codeContainer}>
          <CodeHighlighter
            hljsStyle={highlighterStyle}
            language={normalizedLanguage || 'plaintext'}
            textStyle={styles.codeText}
            scrollViewProps={{
              contentContainerStyle: { flexGrow: 1 },
            }}
          >
            {cleanCode}
          </CodeHighlighter>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  languageTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 6,
  },
  scrollView: {
    flex: 1,
  },
  codeContainer: {
    padding: 12,
    minWidth: '100%',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
});

export default CodeBlock;
