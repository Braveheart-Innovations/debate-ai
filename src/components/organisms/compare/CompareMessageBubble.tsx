import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography } from '../../molecules';
import { Message } from '../../../types';
import { useTheme } from '../../../theme';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import useFeatureAccess from '@/hooks/useFeatureAccess';

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
        <Typography variant="body" style={[styles.content, { color: bodyColor }]} selectable>
          {message.content}
        </Typography>
        {/* Copy button */}
        <TouchableOpacity
          onPress={async () => {
            try {
              await Clipboard.setStringAsync(message.content || '');
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
