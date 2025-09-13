import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { truncateTopic, formatTopicStats } from '@/services/stats';
import { BrandColor } from '@/constants/aiColors';

export interface TopicBadgeProps {
  /** Topic name */
  topic: string;
  /** Number of wins on this topic */
  wins: number;
  /** Number of participations on this topic */
  participations: number;
  /** Brand color for styling */
  color?: string | BrandColor;
  /** Maximum length for topic name */
  maxLength?: number;
  /** Show win/participation ratio */
  showStats?: boolean;
  /** Size variant */
  size?: 'small' | 'medium';
}

/**
 * TopicBadge - Displays topic performance in a styled badge
 * Shows topic name and win/participation statistics
 */
export const TopicBadge: React.FC<TopicBadgeProps> = ({
  topic,
  wins,
  participations,
  color,
  maxLength = 35,
  showStats = true,
  size = 'medium',
}) => {
  const { theme } = useTheme();

  // Use brand color or fallback to primary
  const brandColor = color || theme.colors.primary;
  const backgroundColor = typeof brandColor === 'object' 
    ? brandColor[50] || theme.colors.primary[50]
    : `${brandColor}20`;
  const textColor = typeof brandColor === 'object'
    ? brandColor[700] || theme.colors.primary[700]
    : brandColor;
  const statsColor = typeof brandColor === 'object'
    ? brandColor[600] || theme.colors.primary[600] 
    : brandColor;

  const truncatedTopic = truncateTopic(topic, maxLength);
  const statsText = showStats ? formatTopicStats(wins, participations) : '';

  const sizeStyles = size === 'small' ? styles.small : styles.medium;

  return (
    <View
      style={[
        styles.badge,
        sizeStyles,
        {
          backgroundColor,
        },
      ]}
    >
      <Typography
        variant={size === 'small' ? 'caption' : 'caption'}
        weight="medium"
        style={{ color: textColor }}
      >
        {truncatedTopic}
      </Typography>
      {showStats && (
        <Typography
          variant="caption"
          weight="bold"
          style={{ color: statsColor }}
        >
          {statsText}
        </Typography>
      )}
    </View>
  );
};

export interface TopicBadgeListProps {
  /** Array of topic data */
  topics: Array<{
    topic: string;
    wins: number;
    participations: number;
  }>;
  /** Brand color for all badges */
  color?: string | BrandColor;
  /** Maximum number of topics to show */
  maxTopics?: number;
  /** Size variant for all badges */
  size?: 'small' | 'medium';
  /** Show stats on badges */
  showStats?: boolean;
}

/**
 * TopicBadgeList - Container for multiple topic badges
 * Handles layout and consistent styling for topic lists
 */
export const TopicBadgeList: React.FC<TopicBadgeListProps> = ({
  topics,
  color,
  maxTopics = 3,
  size = 'medium',
  showStats = true,
}) => {
  const { theme } = useTheme();
  const displayTopics = topics.slice(0, maxTopics);

  if (displayTopics.length === 0) {
    return (
      <Typography variant="caption" color="secondary" style={{ fontStyle: 'italic' }}>
        No motions yet
      </Typography>
    );
  }

  return (
    <>
      <Typography
        variant="caption"
        weight="semibold"
        style={{ color: theme.colors.primary[500], marginBottom: 8 }}
      >
        Top Motions:
      </Typography>
      <View style={styles.container}>
        {displayTopics.map(({ topic, wins, participations }, index) => (
          <TopicBadge
            key={`${topic}-${index}`}
            topic={topic}
            wins={wins}
            participations={participations}
            color={color}
            size={size}
            showStats={showStats}
          />
        ))}
      </View>
    </>
  );
};

export interface TopicPerformanceProps {
  /** Topic name */
  topic: string;
  /** Wins */
  wins: number;
  /** Participations */
  participations: number;
  /** Win rate percentage */
  winRate?: number;
  /** Brand color */
  color?: string | BrandColor;
  /** Show detailed stats */
  showWinRate?: boolean;
}

/**
 * TopicPerformance - Detailed topic performance display
 * Shows more information than basic badge
 */
export const TopicPerformance: React.FC<TopicPerformanceProps> = ({
  topic,
  wins,
  participations,
  winRate,
  color,
  showWinRate = false,
}) => {
  const { theme } = useTheme();
  const brandColor = color || theme.colors.primary;
  const backgroundColor = typeof brandColor === 'object'
    ? brandColor[50] || theme.colors.primary[50]
    : `${brandColor}20`;
  const calculatedWinRate = winRate || (participations > 0 ? (wins / participations) * 100 : 0);

  return (
    <View
      style={[
        styles.performanceBadge,
        {
          backgroundColor,
          borderColor: typeof brandColor === 'object'
            ? brandColor[200] || theme.colors.primary[200]
            : brandColor,
        },
      ]}
    >
      <Typography
        variant="caption"
        weight="semibold"
        style={{ 
          color: typeof brandColor === 'object'
            ? brandColor[700] || theme.colors.primary[700]
            : brandColor
        }}
      >
        {truncateTopic(topic, 35)}
      </Typography>
      
      <View style={styles.performanceStats}>
        <Typography
          variant="caption"
          weight="bold"
          style={{ 
            color: typeof brandColor === 'object'
              ? brandColor[600] || theme.colors.primary[600]
              : brandColor
          }}
        >
          {formatTopicStats(wins, participations)}
        </Typography>
        
        {showWinRate && (
          <Typography
            variant="caption"
            weight="medium"
            style={{ 
              color: typeof brandColor === 'object'
                ? brandColor[500] || theme.colors.primary[500]
                : brandColor,
              marginLeft: 8,
            }}
          >
            ({calculatedWinRate.toFixed(0)}%)
          </Typography>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  medium: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  performanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
  },
  performanceStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
});
