/**
 * CodeBlock - Theme-aware code block for markdown rendering
 * Uses the app's theme system for consistent dark/light mode styling
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { Typography } from './Typography';

interface CodeBlockProps {
  /** Code content to display */
  code: string;
  /** Programming language (e.g., 'javascript', 'python', 'typescript') */
  language?: string;
}

/**
 * Theme-aware code block component
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

  // Clean up the code (remove trailing newline)
  const cleanCode = useMemo(() => {
    let processed = code;
    if (processed.endsWith('\n')) {
      processed = processed.slice(0, -1);
    }
    return processed;
  }, [code]);

  // Normalize language names for display
  const displayLanguage = useMemo(() => {
    if (!language) return undefined;
    const lang = language.toLowerCase().trim();
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

  // Theme-aware colors
  const containerBg = isDark ? theme.colors.gray[800] : theme.colors.gray[100];
  const languageTagBg = isDark ? theme.colors.gray[700] : theme.colors.gray[200];
  const languageTagColor = isDark ? theme.colors.gray[300] : theme.colors.gray[600];
  const codeColor = theme.colors.text.primary;

  return (
    <View style={[styles.container, { backgroundColor: containerBg }]}>
      {displayLanguage && (
        <View style={[styles.languageTag, { backgroundColor: languageTagBg }]}>
          <Typography
            variant="caption"
            style={{ color: languageTagColor, fontSize: 11, textTransform: 'uppercase' }}
          >
            {displayLanguage}
          </Typography>
        </View>
      )}
      <View style={styles.codeContent}>
        <Text
          style={[styles.codeText, { color: codeColor }]}
          selectable
        >
          {cleanCode}
        </Text>
      </View>
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
  codeContent: {
    padding: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
});

export default CodeBlock;
