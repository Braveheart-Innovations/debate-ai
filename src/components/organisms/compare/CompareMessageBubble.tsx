import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '../../molecules';
import { Message } from '../../../types';
import { useTheme } from '../../../theme';

interface CompareMessageBubbleProps {
  message: Message;
  side: 'left' | 'right';
}

export const CompareMessageBubble: React.FC<CompareMessageBubbleProps> = ({ 
  message, 
  side 
}) => {
  const { theme, isDark } = useTheme();
  
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
    <View style={[styles.container, bubbleStyle]}>
      <View style={styles.header}>
        <Typography 
          variant="caption" 
          weight="semibold" 
          style={{ color: headerColor }}
        >
          {message.sender}
        </Typography>
      </View>
      <Typography variant="body" style={[styles.content, { color: bodyColor }]}>
        {message.content}
      </Typography>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10, // Compact padding
    width: '100%', // Use full width available
  },
  header: {
    marginBottom: 4,
  },
  content: {
    lineHeight: 20,
  },
});
