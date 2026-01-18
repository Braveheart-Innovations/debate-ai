/**
 * PersonalityCard - Displays a personality with mini trait bars
 * Shows customization indicator and handles tap to open panel
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { MergedPersonality } from '@/contexts/PersonalityContext';

interface PersonalityCardProps {
  /** The merged personality to display */
  personality: MergedPersonality;
  /** Callback when card is tapped */
  onPress: () => void;
  /** Whether the card is locked (for demo users) */
  isLocked?: boolean;
  /** Whether the personality is currently selected for an AI */
  isSelected?: boolean;
  /** Test ID for testing */
  testID?: string;
}

interface MiniTraitBarProps {
  value: number;
  color: string;
}

const MiniTraitBar: React.FC<MiniTraitBarProps> = ({ value, color }) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.miniTraitBar,
        { backgroundColor: theme.colors.border },
      ]}
    >
      <View
        style={[
          styles.miniTraitFill,
          {
            backgroundColor: color,
            width: `${value * 100}%`,
          },
        ]}
      />
    </View>
  );
};

export const PersonalityCard: React.FC<PersonalityCardProps> = ({
  personality,
  onPress,
  isLocked = false,
  isSelected = false,
  testID,
}) => {
  const { theme } = useTheme();

  const traitColors = [
    theme.colors.primary[400], // formality
    theme.colors.warning[500], // humor
    theme.colors.success[500], // energy
    theme.colors.error[400],   // empathy
    theme.colors.info[500],    // technicality
  ];

  const traitValues = [
    personality.mergedTone.formality,
    personality.mergedTone.humor,
    personality.mergedTone.energy,
    personality.mergedTone.empathy,
    personality.mergedTone.technicality,
  ];

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isSelected ? theme.colors.primary[500] : theme.colors.border,
          borderWidth: isSelected ? 2 : 1,
        },
        isLocked && styles.containerLocked,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLocked}
      testID={testID}
    >
      {/* Emoji and Name */}
      <View style={styles.header}>
        <View style={styles.emojiContainer}>
          <Typography variant="heading" style={styles.emoji}>
            {personality.emoji}
          </Typography>
          {/* Customized indicator dot */}
          {personality.isCustomized && (
            <View
              style={[
                styles.customizedDot,
                { backgroundColor: theme.colors.primary[500] },
              ]}
            />
          )}
        </View>

        {/* Lock icon for demo users */}
        {isLocked && (
          <View
            style={[
              styles.lockBadge,
              { backgroundColor: theme.colors.warning[100] },
            ]}
          >
            <Ionicons
              name="lock-closed"
              size={12}
              color={theme.colors.warning[700]}
            />
          </View>
        )}
      </View>

      {/* Name */}
      <Typography
        variant="body"
        weight="semibold"
        color={isLocked ? 'disabled' : 'primary'}
        style={styles.name}
        numberOfLines={1}
      >
        {personality.name}
      </Typography>

      {/* Tagline */}
      <Typography
        variant="caption"
        color={isLocked ? 'disabled' : 'secondary'}
        style={styles.tagline}
        numberOfLines={2}
      >
        {personality.tagline}
      </Typography>

      {/* Mini trait bars */}
      <View style={styles.traitsContainer}>
        {traitValues.map((value, index) => (
          <MiniTraitBar
            key={index}
            value={value}
            color={isLocked ? theme.colors.text.disabled : traitColors[index]}
          />
        ))}
      </View>

      {/* Chevron indicator */}
      {!isLocked && (
        <View style={styles.chevron}>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.colors.text.secondary}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    minHeight: 140,
    position: 'relative',
  },
  containerLocked: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  emojiContainer: {
    position: 'relative',
  },
  emoji: {
    fontSize: 32,
  },
  customizedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  lockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  name: {
    marginBottom: 2,
  },
  tagline: {
    marginBottom: 8,
    minHeight: 32,
  },
  traitsContainer: {
    flexDirection: 'row',
    gap: 3,
  },
  miniTraitBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniTraitFill: {
    height: '100%',
    borderRadius: 2,
  },
  chevron: {
    position: 'absolute',
    right: 8,
    top: '50%',
    marginTop: -8,
  },
});
