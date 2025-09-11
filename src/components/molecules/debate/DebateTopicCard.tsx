/**
 * Individual topic card component for debate setup
 * Extracted from DebateSetupScreen for reusability
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';

export interface DebateTopicCardProps {
  topic: string;
  isSelected: boolean;
  onPress: () => void;
  index: number;
  disabled?: boolean;
  isPremium?: boolean;
}

export const DebateTopicCard: React.FC<DebateTopicCardProps> = ({ 
  topic, 
  isSelected, 
  onPress, 
  index,
  disabled = false,
  isPremium = false,
}) => {
  const { theme } = useTheme();
  
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={{
          backgroundColor: isSelected 
            ? theme.colors.primary[100] 
            : theme.colors.surface,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: isSelected 
            ? theme.colors.primary[500] 
            : theme.colors.border,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Typography 
          variant="body" 
          weight={isSelected ? 'semibold' : 'medium'}
          style={{ 
            color: isSelected 
              ? theme.colors.primary[700] 
              : theme.colors.text.primary 
          }}
        >
          {isPremium && '⭐ '}{topic}
        </Typography>
      </TouchableOpacity>
    </Animated.View>
  );
};
