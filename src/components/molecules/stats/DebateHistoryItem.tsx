import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { EntryExitAnimationFunction } from 'react-native-reanimated';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { formatDateTime, formatTimeElapsed } from '@/services/stats';
import { AIInfo } from '@/types/stats';
import { BrandColor } from '@/constants/aiColors';

export interface DebateHistoryItemProps {
  /** Debate ID for key purposes */
  debateId: string;
  /** Topic of the debate */
  topic: string;
  /** Timestamp of the debate */
  timestamp: number;
  /** Winner information (name and color) */
  winner: AIInfo | null;
  /** Show elapsed time instead of full date */
  showElapsedTime?: boolean;
  /** Maximum length for topic display */
  maxTopicLength?: number;
  /** Animation entering prop */
  entering?: EntryExitAnimationFunction;
  /** Additional styling */
  style?: object | object[];
}

/**
 * DebateHistoryItem - Single debate history entry
 * Displays debate topic, timestamp, and winner with appropriate styling
 */
export const DebateHistoryItem: React.FC<DebateHistoryItemProps> = ({
  topic,
  timestamp,
  winner,
  showElapsedTime = false,
  maxTopicLength = 60,
  entering,
  style,
}) => {
  const { theme } = useTheme();

  const formattedTime = showElapsedTime 
    ? formatTimeElapsed(timestamp)
    : formatDateTime(timestamp);

  const displayTopic = topic.length > maxTopicLength 
    ? `${topic.slice(0, maxTopicLength)}...` 
    : topic;

  const getWinnerColor = (color: string | BrandColor) => {
    if (typeof color === 'object') {
      return color[600] || theme.colors.primary[600];
    }
    return color;
  };

  const winnerColor = winner ? getWinnerColor(winner.color) : theme.colors.primary[600];

  return (
    <Animated.View
      entering={entering}
      style={[
        styles.item,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <Typography variant="caption" color="secondary">
        {formattedTime}
      </Typography>
      
      <Typography 
        variant="caption" 
        weight="medium" 
        style={styles.topic}
      >
        "{displayTopic}"
      </Typography>
      
      {winner && (
        <Typography
          variant="caption"
          weight="bold"
          style={{
            ...styles.winner,
            color: winnerColor
          }}
        >
          🏆 Winner: {winner.name}
        </Typography>
      )}
    </Animated.View>
  );
};

export interface CompactDebateHistoryItemProps {
  /** Topic of the debate */
  topic: string;
  /** Winner information */
  winner: AIInfo | null;
  /** Show only essential information */
  showWinnerOnly?: boolean;
}

/**
 * CompactDebateHistoryItem - Minimal debate history entry
 * For use in condensed lists or previews
 */
export const CompactDebateHistoryItem: React.FC<CompactDebateHistoryItemProps> = ({
  topic,
  winner,
  showWinnerOnly = false,
}) => {
  const { theme } = useTheme();
  const displayTopic = topic.length > 30 ? `${topic.slice(0, 30)}...` : topic;
  const getWinnerColor = (color: string | BrandColor) => {
    if (typeof color === 'object') {
      return color[600] || theme.colors.primary[600];
    }
    return color;
  };

  const winnerColor = winner ? getWinnerColor(winner.color) : theme.colors.primary[600];

  return (
    <View style={styles.compactItem}>
      {!showWinnerOnly && (
        <Typography variant="caption" color="secondary" style={styles.compactTopic}>
          {displayTopic}
        </Typography>
      )}
      
      {winner && (
        <Typography
          variant="caption"
          weight="semibold"
          style={{ color: winnerColor }}
        >
          {winner.name}
        </Typography>
      )}
    </View>
  );
};

export interface DebateHistoryListProps {
  /** Array of debate history items */
  debates: Array<{
    debateId: string;
    topic: string;
    timestamp: number;
    winner: AIInfo | null;
  }>;
  /** Maximum number of items to show */
  maxItems?: number;
  /** Show elapsed time instead of full dates */
  showElapsedTime?: boolean;
  /** Use compact layout */
  compact?: boolean;
  /** Animation function for staggered entrance */
  getAnimation?: (index: number) => EntryExitAnimationFunction;
}

/**
 * DebateHistoryList - Container for multiple debate history items
 * Handles layout, animations, and consistent styling
 */
export const DebateHistoryList: React.FC<DebateHistoryListProps> = ({
  debates,
  maxItems = 5,
  showElapsedTime = false,
  compact = false,
  getAnimation,
}) => {
  const displayDebates = debates.slice(0, maxItems);

  if (displayDebates.length === 0) {
    return (
      <Typography variant="caption" color="secondary" style={{ fontStyle: 'italic' }}>
        No debate history yet
      </Typography>
    );
  }

  return (
    <View style={compact ? styles.compactList : styles.list}>
      {displayDebates.map((debate, index) => {
        if (compact) {
          return (
            <CompactDebateHistoryItem
              key={debate.debateId}
              topic={debate.topic}
              winner={debate.winner}
            />
          );
        }

        return (
          <DebateHistoryItem
            key={debate.debateId}
            debateId={debate.debateId}
            topic={debate.topic}
            timestamp={debate.timestamp}
            winner={debate.winner}
            showElapsedTime={showElapsedTime}
            entering={getAnimation?.(index)}
          />
        );
      })}
    </View>
  );
};

export interface DebateHistoryHeaderProps {
  /** Total number of debates */
  totalCount?: number;
  /** Show count in header */
  showCount?: boolean;
}

/**
 * DebateHistoryHeader - Header for debate history sections
 */
export const DebateHistoryHeader: React.FC<DebateHistoryHeaderProps> = ({
  totalCount,
  showCount = false,
}) => {
  return (
    <Typography variant="title" weight="semibold" style={styles.header}>
      📜 Recent Debates
      {showCount && totalCount && (
        <Typography variant="caption" color="secondary">
          {' '}({totalCount})
        </Typography>
      )}
    </Typography>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  topic: {
    marginTop: 4,
  },
  winner: {
    marginTop: 8,
  },
  compactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  compactTopic: {
    flex: 1,
    marginRight: 8,
  },
  list: {
    marginTop: 8,
  },
  compactList: {
    marginTop: 8,
    gap: 4,
  },
  header: {
    marginTop: 24,
    marginBottom: 16,
  },
});
