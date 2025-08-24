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
  const { theme } = useTheme();
  
  const bubbleStyle = {
    backgroundColor: side === 'left' 
      ? theme.colors.warning[100]
      : theme.colors.info[100],
    borderColor: side === 'left'
      ? theme.colors.warning[300]
      : theme.colors.info[300],
  };

  return (
    <View style={[styles.container, bubbleStyle]}>
      <View style={styles.header}>
        <Typography 
          variant="caption" 
          weight="semibold" 
          color="primary"
        >
          {message.sender}
        </Typography>
      </View>
      <Typography variant="body" color="primary" style={styles.content}>
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