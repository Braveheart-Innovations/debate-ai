/**
 * ArgumentStyleSelect - Button group for selecting argument style
 * Options: Logical | Emotional | Balanced
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Typography } from '@/components/molecules/common/Typography';
import { useTheme } from '@/theme';
import { PersonalityDebateProfile } from '@/types/personality';

type ArgumentStyle = PersonalityDebateProfile['argumentStyle'];

interface ArgumentStyleSelectProps {
  /** Currently selected style */
  value: ArgumentStyle;
  /** Callback when style changes */
  onValueChange: (style: ArgumentStyle) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

interface StyleOption {
  value: ArgumentStyle;
  label: string;
  icon: string;
  description: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    value: 'logical',
    label: 'Logical',
    icon: '🧠',
    description: 'Evidence-based reasoning',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    icon: '⚖️',
    description: 'Mix of logic and emotion',
  },
  {
    value: 'emotional',
    label: 'Emotional',
    icon: '💡',
    description: 'Narrative and appeals',
  },
];

export const ArgumentStyleSelect: React.FC<ArgumentStyleSelectProps> = ({
  value,
  onValueChange,
  disabled = false,
  testID,
}) => {
  const { theme } = useTheme();

  const handleSelect = (style: ArgumentStyle) => {
    if (disabled || style === value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(style);
  };

  return (
    <View style={styles.container} testID={testID}>
      <Typography
        variant="body"
        weight="medium"
        color={disabled ? 'disabled' : 'primary'}
        style={styles.label}
      >
        Argument Style
      </Typography>

      <View style={styles.optionsContainer}>
        {STYLE_OPTIONS.map((option) => {
          const isSelected = value === option.value;

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                {
                  backgroundColor: isSelected
                    ? theme.colors.primary[500]
                    : theme.colors.surface,
                  borderColor: isSelected
                    ? theme.colors.primary[500]
                    : theme.colors.border,
                },
                disabled && styles.optionDisabled,
              ]}
              onPress={() => handleSelect(option.value)}
              disabled={disabled}
              activeOpacity={0.7}
              testID={`${testID}-${option.value}`}
            >
              <Typography
                variant="caption"
                style={styles.icon}
              >
                {option.icon}
              </Typography>
              <Typography
                variant="caption"
                weight={isSelected ? 'semibold' : 'medium'}
                color={isSelected ? 'inverse' : (disabled ? 'disabled' : 'primary')}
              >
                {option.label}
              </Typography>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Description of selected style */}
      <Typography
        variant="caption"
        color={disabled ? 'disabled' : 'secondary'}
        style={styles.description}
      >
        {STYLE_OPTIONS.find(o => o.value === value)?.description}
      </Typography>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 10,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 20,
    marginBottom: 4,
  },
  description: {
    marginTop: 8,
    textAlign: 'center',
  },
});
