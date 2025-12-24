/**
 * useAIBrandColor - Hook to get AI provider brand colors
 * Extracts repeated AI color logic from message bubble components
 */

import { useMemo } from 'react';
import { AI_BRAND_COLORS } from '@/constants/aiColors';
import { useTheme } from '@/theme';

export interface AIBrandColorResult {
  /** Light mode background color (50 shade) */
  light: string;
  /** Dark mode background color (surface color) */
  dark: string;
  /** Border/accent color (500 shade) */
  border: string;
  /** Text accent color (600 shade) */
  text: string;
}

/**
 * Maps an AI sender name to their brand color key
 */
const getAIBrandKey = (senderName: string): keyof typeof AI_BRAND_COLORS | null => {
  // Handle formats like "Claude (Philosopher)" or just "Claude"
  const aiName = senderName.split(' (')[0].toLowerCase();

  const mapping: Record<string, keyof typeof AI_BRAND_COLORS> = {
    chatgpt: 'openai',
    openai: 'openai',
    claude: 'claude',
    gemini: 'gemini',
    perplexity: 'perplexity',
    mistral: 'mistral',
    cohere: 'cohere',
    together: 'together',
    deepseek: 'deepseek',
    grok: 'grok',
    nomi: 'nomi',
    replika: 'replika',
  };

  // Check for direct match
  if (mapping[aiName]) {
    return mapping[aiName];
  }

  // Check for character.ai (partial match)
  if (aiName.includes('character')) {
    return 'characterai';
  }

  return null;
};

/**
 * Hook to get AI provider brand colors for message bubbles
 *
 * @param senderName - The sender name from the message (e.g., "Claude", "ChatGPT (Philosopher)")
 * @returns AI brand colors or null if not recognized
 *
 * @example
 * const aiColor = useAIBrandColor(message.sender);
 * if (aiColor) {
 *   // Use aiColor.light, aiColor.dark, aiColor.border, aiColor.text
 * }
 */
export const useAIBrandColor = (senderName: string): AIBrandColorResult | null => {
  const { theme } = useTheme();

  return useMemo(() => {
    const brandKey = getAIBrandKey(senderName);

    if (!brandKey || !(brandKey in AI_BRAND_COLORS)) {
      return null;
    }

    const brandColors = AI_BRAND_COLORS[brandKey];
    return {
      light: brandColors[50],
      dark: theme.colors.surface,
      border: brandColors[500],
      text: brandColors[600],
    };
  }, [senderName, theme.colors.surface]);
};

export default useAIBrandColor;
