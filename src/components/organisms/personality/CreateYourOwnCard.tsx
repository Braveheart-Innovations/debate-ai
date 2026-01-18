/**
 * CreateYourOwnCard - Teaser card for future custom personality feature
 * Shows a disabled "Coming Soon" card to balance the grid
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';

interface CreateYourOwnCardProps {
  /** Test ID for testing */
  testID?: string;
}

export const CreateYourOwnCard: React.FC<CreateYourOwnCardProps> = ({
  testID,
}) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.text.disabled,
        },
      ]}
      testID={testID}
    >
      {/* Coming Soon banner - diagonal overlay */}
      <View style={styles.bannerContainer}>
        <View
          style={[
            styles.banner,
            { backgroundColor: theme.colors.warning[500] },
          ]}
        >
          <Typography
            variant="caption"
            style={styles.bannerText}
          >
            COMING SOON
          </Typography>
        </View>
      </View>

      {/* Emoji */}
      <View style={styles.header}>
        <Typography variant="heading" style={styles.emoji}>
          ➕
        </Typography>
      </View>

      {/* Content section */}
      <View style={styles.content}>
        {/* Name */}
        <Typography
          variant="body"
          weight="semibold"
          color="disabled"
          numberOfLines={1}
        >
          Create Your Own
        </Typography>

        {/* Badge row placeholder - match PersonalityCard height */}
        <View style={styles.badgeRow} />

        {/* Tagline */}
        <Typography
          variant="caption"
          color="disabled"
          style={styles.tagline}
          numberOfLines={2}
        >
          Build a custom personality tailored to you
        </Typography>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    minHeight: 140,
    position: 'relative',
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.7,
    overflow: 'hidden',
  },
  bannerContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 100,
    height: 100,
    overflow: 'hidden',
  },
  banner: {
    position: 'absolute',
    top: 12,
    right: -30,
    width: 120,
    paddingVertical: 4,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
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
  content: {
    flex: 1,
  },
  badgeRow: {
    height: 22,
    marginTop: 2,
    marginBottom: 2,
  },
  tagline: {
    marginTop: 0,
  },
});
