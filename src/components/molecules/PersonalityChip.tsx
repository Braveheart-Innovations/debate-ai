/**
 * Personality chip component for selection and display
 * Used in personality selection interfaces
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { Typography } from './Typography';
import { Personality } from '../../types/debate';

export interface PersonalityChipProps {
  personality: Personality;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: string;
  showIcon?: boolean;
}

const PERSONALITY_ICONS: Record<string, string> = {
  default: '🤖',
  prof_sage: '🎓',
  brody: '🏈',
  bestie: '💖',
  zen: '🧘',
  skeptic: '🔍',
  scout: '📖',
  devlin: '😈',
  george: '🎤',
  pragmatist: '🧭',
  enforcer: '📎',
  traditionalist: '🧱',
};

export const PersonalityChip: React.FC<PersonalityChipProps> = ({
  personality,
  isSelected,
  onPress,
  disabled = false,
  size = 'medium',
  color,
  showIcon = true,
}) => {
  const { theme } = useTheme();

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

  const icon = showIcon ? PERSONALITY_ICONS[personality.id] || '🤖' : '';

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
        {icon && `${icon} `}{personality.name}
        {personality.isPremium && !isSelected && ' 🔒'}
      </Typography>
    </TouchableOpacity>
  );
};
