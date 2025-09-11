/**
 * DebateTypingIndicator Molecule Component
 * Typing indicator specifically for debate mode
 * Uses the TypingDots atom for consistent animation
 */

import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { TypingDots } from '@/components/atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

export interface DebateTypingIndicatorProps {
  aiName: string;
}

export const DebateTypingIndicator: React.FC<DebateTypingIndicatorProps> = ({ aiName }) => {
  const { theme } = useTheme();
  
  return (
    <Animated.View 
      entering={FadeIn.duration(200)}
      style={[{
        marginHorizontal: 16,
        marginBottom: theme.spacing.sm,
      }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Typography variant="body" color="brand" style={{ fontStyle: 'italic' }}>
          {aiName} is thinking
        </Typography>
        <TypingDots />
      </View>
    </Animated.View>
  );
};
