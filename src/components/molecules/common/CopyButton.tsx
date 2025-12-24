/**
 * CopyButton - Reusable copy to clipboard button
 * Provides consistent copy functionality across message bubbles
 */

import React, { useState, useCallback } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme';

interface CopyButtonProps {
  /** Content to copy to clipboard */
  content: string;
  /** Position style - absolute (default) or relative */
  position?: 'absolute' | 'relative';
  /** Icon size in pixels */
  size?: number;
  /** Custom icon color (uses theme text color by default) */
  iconColor?: string;
  /** For user messages with inverse text */
  isUserMessage?: boolean;
}

/**
 * Copy button component for message bubbles
 *
 * @example
 * // Default absolute position in bottom-right corner
 * <CopyButton content={message.content} />
 *
 * @example
 * // For user messages with inverse text
 * <CopyButton content={message.content} isUserMessage />
 *
 * @example
 * // Custom position and color
 * <CopyButton content={text} position="relative" iconColor="#FFF" />
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  content,
  position = 'absolute',
  size = 16,
  iconColor,
  isUserMessage = false,
}) => {
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently fail
    }
  }, [content]);

  const backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const resolvedIconColor =
    iconColor || (isUserMessage ? theme.colors.text.inverse : theme.colors.text.primary);

  return (
    <TouchableOpacity
      onPress={handleCopy}
      accessibilityLabel="Copy message"
      accessibilityHint="Copies the message content to clipboard"
      accessibilityRole="button"
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      style={[
        styles.button,
        position === 'absolute' && styles.absolute,
        { backgroundColor },
      ]}
    >
      <Ionicons
        name={copied ? 'checkmark-outline' : 'copy-outline'}
        size={size}
        color={resolvedIconColor}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    padding: 6,
  },
  absolute: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
});

export default CopyButton;
