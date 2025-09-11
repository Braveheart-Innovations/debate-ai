import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { EntryExitAnimationFunction } from 'react-native-reanimated';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

export interface StatsCardProps {
  /** Brand color for the card border */
  borderColor?: string;
  /** Background color override */
  backgroundColor?: string;
  /** Card content */
  children: React.ReactNode;
  /** Animation entering prop from react-native-reanimated */
  entering?: EntryExitAnimationFunction;
  /** Additional styling */
  style?: object | object[];
}

/**
 * StatsCard - A styled container for displaying statistics
 * Used as a base card component for AI performance data
 */
export const StatsCard: React.FC<StatsCardProps> = ({
  borderColor,
  backgroundColor,
  children,
  entering,
  style,
}) => {
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={entering}
      style={[
        styles.card,
        {
          backgroundColor: backgroundColor || theme.colors.card,
          borderLeftColor: borderColor || theme.colors.primary[500],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

export interface StatsCardHeaderProps {
  /** Rank display (e.g., "#1", "#2") */
  rank?: React.ReactNode;
  /** AI name and info */
  title: React.ReactNode;
  /** Additional info like last debated date */
  subtitle?: React.ReactNode;
  /** Right side content like win rate */
  rightContent?: React.ReactNode;
}

/**
 * StatsCardHeader - Header section for stats cards
 * Contains rank, AI name, and win rate display
 */
export const StatsCardHeader: React.FC<StatsCardHeaderProps> = ({
  rank,
  title,
  subtitle,
  rightContent,
}) => {
  return (
    <View style={styles.header}>
      {rank && <View style={styles.rank}>{rank}</View>}
      <View style={styles.titleContainer}>
        {title}
        {subtitle}
      </View>
      {rightContent && <View style={styles.rightContent}>{rightContent}</View>}
    </View>
  );
};

export interface StatsCardRowProps {
  /** Row content - typically multiple StatItem components */
  children: React.ReactNode;
  /** Show divider above this row */
  showDivider?: boolean;
}

/**
 * StatsCardRow - Horizontal row for displaying multiple stats
 * Used for organizing stats like Debates, Wins, Losses
 */
export const StatsCardRow: React.FC<StatsCardRowProps> = ({
  children,
  showDivider,
}) => {
  const { theme } = useTheme();

  return (
    <>
      {showDivider && (
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
      )}
      <View style={styles.row}>{children}</View>
    </>
  );
};

export interface StatItemProps {
  /** Main value to display */
  value: string | number;
  /** Label for the value */
  label: string;
  /** Color for the value text */
  valueColor?: string;
  /** Typography variant for the value */
  valueVariant?: 'body' | 'title';
  /** Weight for the value text */
  valueWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
}

/**
 * StatItem - Individual statistic display
 * Shows a value with a label underneath
 */
export const StatItem: React.FC<StatItemProps> = ({
  value,
  label,
  valueColor,
  valueVariant = 'title',
  valueWeight = 'semibold',
}) => {
  return (
    <View style={styles.statItem}>
      <Typography
        variant={valueVariant}
        weight={valueWeight}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="secondary">
        {label}
      </Typography>
    </View>
  );
};

export interface WinRateDisplayProps {
  /** Overall win rate percentage */
  overallRate: number;
  /** Round win rate percentage */
  roundRate: number;
  /** Brand color for highlighting */
  color?: string;
}

/**
 * WinRateDisplay - Specialized component for showing win rates
 * Displays both overall and round win rates
 */
export const WinRateDisplay: React.FC<WinRateDisplayProps> = ({
  overallRate,
  roundRate,
  color,
}) => {
  return (
    <View style={styles.winRateContainer}>
      <Typography
        variant="title"
        weight="bold"
        style={color ? { color } : undefined}
      >
        {overallRate.toFixed(0)}%
      </Typography>
      <Typography variant="caption" color="secondary">
        Overall
      </Typography>
      <Typography
        variant="caption"
        weight="semibold"
        style={color ? { color, marginTop: 2 } : { marginTop: 2 }}
      >
        {roundRate.toFixed(0)}%
      </Typography>
      <Typography variant="caption" color="secondary">
        Rounds
      </Typography>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rank: {
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  rightContent: {
    alignItems: 'center',
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  winRateContainer: {
    alignItems: 'center',
    padding: 8,
  },
});
