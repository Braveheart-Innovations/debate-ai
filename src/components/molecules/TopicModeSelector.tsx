/**
 * Topic mode selector component
 * Allows choosing between preset, custom, and surprise topic modes
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { Typography } from './Typography';
import { GradientButton } from './GradientButton';
import { TopicMode } from '../../config/debate/debateSetupConfig';

export interface TopicModeSelectorProps {
  selectedMode: TopicMode;
  onModeSelect: (mode: TopicMode) => void;
  onSurpriseMe?: () => void;
  isPremium: boolean;
  disabled?: boolean;
}

interface ModeOption {
  mode: TopicMode;
  label: string;
  description: string;
  isPremiumFeature: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'preset',
    label: 'Preset Topics',
    description: 'Choose from curated debate topics',
    isPremiumFeature: false,
  },
  {
    mode: 'custom',
    label: 'Custom Topic',
    description: 'Enter your own debate topic',
    isPremiumFeature: false, // No longer gated
  },
];

export const TopicModeSelector: React.FC<TopicModeSelectorProps> = ({
  selectedMode,
  onModeSelect,
  onSurpriseMe,
  isPremium,
  disabled = false,
}) => {
  const { theme } = useTheme();

  const renderModeButton = (option: ModeOption) => {
    const isSelected = selectedMode === option.mode;
    const canSelect = !option.isPremiumFeature || isPremium;
    const isDisabled = disabled || !canSelect;

    return (
      <TouchableOpacity
        key={option.mode}
        onPress={() => onModeSelect(option.mode)}
        disabled={isDisabled}
        style={{
          flex: 1,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          backgroundColor: isSelected 
            ? theme.colors.primary[500] 
            : theme.colors.surface,
          borderWidth: 1,
          borderColor: isSelected 
            ? theme.colors.primary[500] 
            : theme.colors.border,
          opacity: isDisabled ? 0.6 : 1,
        }}
      >
        <Typography 
          variant="body" 
          weight="semibold" 
          align="center"
          style={{ 
            color: isSelected 
              ? '#fff' 
              : theme.colors.text.primary,
            marginBottom: 2,
          }}
        >
          {option.isPremiumFeature && !isPremium && '🔒 '}{option.label}
        </Typography>
        <Typography
          variant="caption"
          align="center"
          style={{
            color: isSelected 
              ? 'rgba(255, 255, 255, 0.8)' 
              : theme.colors.text.secondary,
          }}
        >
          {option.description}
        </Typography>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {/* Mode Toggle Buttons */}
      <View style={{ 
        flexDirection: 'row', 
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.sm,
      }}>
        {MODE_OPTIONS.map(renderModeButton)}
      </View>
      
      {/* Surprise Me Button - Always Visible */}
      {onSurpriseMe && (
        <GradientButton
          title="🎲 Surprise Me!"
          onPress={onSurpriseMe}
          gradient={theme.colors.gradients.ocean}
          fullWidth
          disabled={disabled}
        />
      )}
    </View>
  );
};
