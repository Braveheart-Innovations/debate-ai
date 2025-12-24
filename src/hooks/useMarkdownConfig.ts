/**
 * useMarkdownConfig - Hook to get consistent markdown configuration
 * Provides styles, rules, and link handler for markdown rendering
 */

import { useMemo, useCallback } from 'react';
import { Linking } from 'react-native';
import { createMarkdownStyles, type MarkdownStyles, type MarkdownRules } from '@/components/molecules/common/LazyMarkdownRenderer';
import { selectableMarkdownRules } from '@/utils/markdownSelectable';
import { useTheme } from '@/theme';

interface UseMarkdownConfigResult {
  /** Markdown styles based on current theme */
  styles: MarkdownStyles;
  /** Selectable markdown rules for text selection support */
  rules: MarkdownRules;
  /** Link press handler that opens URLs */
  onLinkPress: (url: string) => boolean;
}

/**
 * Hook to get consistent markdown configuration for message bubbles
 *
 * @example
 * const { styles, rules, onLinkPress } = useMarkdownConfig();
 *
 * <Markdown style={styles} rules={rules} onLinkPress={onLinkPress}>
 *   {content}
 * </Markdown>
 */
export const useMarkdownConfig = (): UseMarkdownConfigResult => {
  const { theme, isDark } = useTheme();

  const styles = useMemo(
    () => createMarkdownStyles(theme, isDark),
    [theme, isDark]
  );

  const onLinkPress = useCallback((url: string) => {
    Linking.openURL(url).catch(err =>
      console.error('Failed to open URL:', err)
    );
    return false; // Return false to prevent default handling
  }, []);

  return {
    styles,
    rules: selectableMarkdownRules,
    onLinkPress,
  };
};

export default useMarkdownConfig;
