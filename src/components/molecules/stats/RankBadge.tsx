import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { formatRank } from '@/services/stats';

export interface RankBadgeProps {
  /** Rank number (1, 2, 3, etc.) */
  rank: number;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Show rank with special styling for top 3 */
  highlightTopThree?: boolean;
  /** Custom background color */
  backgroundColor?: string;
  /** Custom text color */
  textColor?: string;
  /** Show crown icon for #1 */
  showCrown?: boolean;
}

/**
 * RankBadge - Displays AI ranking with optional styling for top performers
 * Supports different sizes and special highlighting for podium positions
 */
export const RankBadge: React.FC<RankBadgeProps> = ({
  rank,
  size = 'medium',
  highlightTopThree = true,
  backgroundColor,
  textColor,
  showCrown = true,
}) => {
  const { theme } = useTheme();

  // Get colors based on rank for top 3
  const getRankColors = () => {
    if (!highlightTopThree || rank > 3) {
      return {
        background: backgroundColor || theme.colors.surface,
        text: textColor || theme.colors.text.primary,
        border: theme.colors.border,
      };
    }

    switch (rank) {
      case 1:
        return {
          background: backgroundColor || theme.colors.warning[100],
          text: textColor || theme.colors.warning[800],
          border: theme.colors.warning[300],
        };
      case 2:
        return {
          background: backgroundColor || theme.colors.gray[100],
          text: textColor || theme.colors.gray[700],
          border: theme.colors.gray[300],
        };
      case 3:
        return {
          background: backgroundColor || theme.colors.warning[100],
          text: textColor || theme.colors.warning[800],
          border: theme.colors.warning[300],
        };
      default:
        return {
          background: backgroundColor || theme.colors.surface,
          text: textColor || theme.colors.text.primary,
          border: theme.colors.border,
        };
    }
  };

  const colors = getRankColors();
  const sizeStyles = getSizeStyles(size);

  const displayText = rank === 1 && showCrown ? `👑 ${formatRank(rank)}` : formatRank(rank);

  return (
    <View
      style={[
        styles.badge,
        sizeStyles.container,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      <Typography
        variant={sizeStyles.textVariant}
        weight="bold"
        style={{ color: colors.text }}
      >
        {displayText}
      </Typography>
    </View>
  );
};

export interface TopThreeRankBadgeProps {
  /** Rank number (should be 1, 2, or 3) */
  rank: 1 | 2 | 3;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
}

/**
 * TopThreeRankBadge - Specialized badge for podium positions
 * Always highlights with appropriate colors and medals/crown
 */
export const TopThreeRankBadge: React.FC<TopThreeRankBadgeProps> = ({
  rank,
  size = 'medium',
}) => {
  return (
    <RankBadge
      rank={rank}
      size={size}
      highlightTopThree={true}
      showCrown={false} // Use medal instead
    />
  );
};

export interface SimpleRankBadgeProps {
  /** Rank number */
  rank: number;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
}

/**
 * SimpleRankBadge - Basic rank display without special highlighting
 * Uses consistent styling regardless of rank position
 */
export const SimpleRankBadge: React.FC<SimpleRankBadgeProps> = ({
  rank,
  size = 'medium',
}) => {
  return (
    <RankBadge
      rank={rank}
      size={size}
      highlightTopThree={false}
      showCrown={false}
    />
  );
};

// Helper function to get size-specific styles
const getSizeStyles = (size: 'small' | 'medium' | 'large') => {
  switch (size) {
    case 'small':
      return {
        container: styles.small,
        textVariant: 'caption' as const,
      };
    case 'large':
      return {
        container: styles.large,
        textVariant: 'title' as const,
      };
    case 'medium':
    default:
      return {
        container: styles.medium,
        textVariant: 'body' as const,
      };
  }
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  medium: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  large: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
