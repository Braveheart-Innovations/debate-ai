/**
 * Personality chip component for selection and display
 * Used in personality selection interfaces
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';
import { Personality } from '@/types/debate';
import { getPersonality } from '@/config/personalities';

export interface PersonalityChipProps {
  personality: Personality;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

export const PersonalityChip: React.FC<PersonalityChipProps> = ({
  personality,
  isSelected,
  onPress,
  disabled = false,
  size = 'medium',
  color,
}) => {
  const { theme } = useTheme();
  const personaMeta = getPersonality(personality.id);
  const icon = personaMeta?.emoji ?? '🤖';
  const tagline = personaMeta?.tagline ?? personality.description;

  const sizeStyles = {
    small: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.sm,
      fontSize: 12,
    },
    medium: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      fontSize: 14,
    },
    large: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.lg,
      fontSize: 16,
    },
  };

  const chipColor = color || (isSelected ? theme.colors.primary[500] : theme.colors.surface);
  const textColor = isSelected ? '#fff' : theme.colors.text.primary;
  const borderColor = isSelected ? chipColor : theme.colors.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: chipColor,
        borderWidth: 1,
        borderColor: borderColor,
        opacity: disabled ? 0.6 : 1,
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isSelected ? 0.2 : 0.1,
        shadowRadius: 2,
        elevation: isSelected ? 2 : 1,
        ...sizeStyles[size],
      }}
    >
      <Typography 
        variant="caption" 
        weight={isSelected ? 'bold' : 'medium'}
        style={{ 
          color: textColor,
          fontSize: sizeStyles[size].fontSize,
        }}
      >
        {`${icon} ${personality.name}`}
      </Typography>
      <Typography
        variant="caption"
        style={{
          marginTop: 2,
          fontSize: Math.max(10, sizeStyles[size].fontSize - 2),
          color: isSelected ? '#F4F4F5' : theme.colors.text.secondary,
        }}
      >
        {tagline}
      </Typography>
    </TouchableOpacity>
  );
};
