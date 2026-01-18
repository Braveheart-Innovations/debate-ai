/**
 * PersonalityCard - Displays a personality in a clean, minimal card
 * Shows customization badge and handles tap to open panel
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

export const PersonalityCard: React.FC<PersonalityCardProps> = ({
  personality,
  onPress,
  isLocked = false,
  isSelected = false,
  testID,
}) => {
  const { theme } = useTheme();

  const isCustomized = personality.isCustomized && !isLocked;

  // Determine border color based on state
  const getBorderColor = () => {
    if (isSelected) return theme.colors.primary[500];
    if (isCustomized) return theme.colors.primary[400];
    return theme.colors.border;
  };

  // Determine border width based on state
  const getBorderWidth = () => {
    if (isSelected || isCustomized) return 2;
    return 1;
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: getBorderColor(),
          borderWidth: getBorderWidth(),
        },
        isLocked && styles.containerLocked,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLocked}
      testID={testID}
    >
      {/* Header with emoji and lock badge */}
      <View style={styles.header}>
        <Typography variant="heading" style={styles.emoji}>
          {personality.emoji}
        </Typography>

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

      {/* Content section */}
      <View style={styles.content}>
        {/* Name */}
        <Typography
          variant="body"
          weight="semibold"
          color={isLocked ? 'disabled' : 'primary'}
          numberOfLines={1}
        >
          {personality.name}
        </Typography>

        {/* Badge row - always reserve space for consistent card heights */}
        <View style={styles.badgeRow}>
          {isCustomized && (
            <View
              style={[
                styles.customizedBadge,
                { backgroundColor: theme.colors.primary[500] },
              ]}
            >
              <Typography
                variant="caption"
                style={styles.badgeText}
              >
                Customized
              </Typography>
            </View>
          )}
        </View>

        {/* Tagline */}
        <Typography
          variant="caption"
          color={isLocked ? 'disabled' : 'secondary'}
          style={styles.tagline}
          numberOfLines={2}
        >
          {personality.tagline}
        </Typography>
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
    padding: 16,
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
    marginBottom: 12,
  },
  emoji: {
    fontSize: 40,
  },
  lockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  content: {
    flex: 1,
  },
  badgeRow: {
    height: 22,
    marginTop: 2,
    marginBottom: 2,
    justifyContent: 'center',
  },
  customizedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  tagline: {
    marginTop: 0,
  },
  chevron: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -8,
  },
});
