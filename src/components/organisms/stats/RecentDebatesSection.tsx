import React from 'react';
import { View, StyleSheet } from 'react-native';
import { 
  DebateHistoryItem,
  DebateHistoryHeader,
  Typography,
} from '@/components/molecules';
import { useTheme } from '@/theme';
import { useDebateStats, useAIProviderInfo, useStatsAnimations } from '@/hooks/stats';
import { getRecentDebates, transformDebateHistory } from '@/services/stats';
import { BrandColor } from '@/constants/aiColors';

export interface RecentDebatesSectionProps {
  /** Maximum number of debates to show */
  maxDebates?: number;
  /** Show elapsed time instead of full dates */
  showElapsedTime?: boolean;
  /** Enable animations */
  enableAnimations?: boolean;
  /** Show count in header */
  showCount?: boolean;
  /** Custom header title */
  headerTitle?: string;
}

/**
 * RecentDebatesSection - Complete recent debates display
 * Shows recent debate history with animations and formatting
 */
export const RecentDebatesSection: React.FC<RecentDebatesSectionProps> = ({
  maxDebates = 5,
  showElapsedTime = false,
  enableAnimations = true,
  showCount = false,
  headerTitle,
}) => {
  const { history, hasHistory } = useDebateStats();
  const { getAIInfo } = useAIProviderInfo();
  const { getHistoryAnimation, shouldUseAnimations, getSimpleAnimation } = useStatsAnimations();

  if (!hasHistory) {
    return null; // Let parent handle empty state
  }

  const recentDebates = getRecentDebates(history, maxDebates);
  const formattedDebates = transformDebateHistory(recentDebates, getAIInfo);
  const useAnimations = enableAnimations && shouldUseAnimations(formattedDebates.length);

  return (
    <View style={styles.container}>
      {headerTitle ? (
        <Typography variant="title" weight="semibold" style={styles.customHeader}>
          {headerTitle}
        </Typography>
      ) : (
        <DebateHistoryHeader 
          totalCount={showCount ? history.length : undefined}
          showCount={showCount}
        />
      )}
      
      <View style={styles.list}>
        {formattedDebates.map((debate, index) => {
          const animation = useAnimations 
            ? getHistoryAnimation(index) 
            : getSimpleAnimation();

          return (
            <DebateHistoryItem
              key={debate.debateId}
              debateId={debate.debateId}
              topic={debate.topic}
              timestamp={debate.timestamp}
              winner={debate.winner}
              showElapsedTime={showElapsedTime}
              entering={animation.entering}
            />
          );
        })}
      </View>
    </View>
  );
};

export interface CompactRecentDebatesProps {
  /** Maximum number of debates to show */
  maxDebates?: number;
  /** Show only winners */
  winnersOnly?: boolean;
}

/**
 * CompactRecentDebates - Minimal recent debates display
 * For use in dashboard or overview screens
 */
export const CompactRecentDebates: React.FC<CompactRecentDebatesProps> = ({
  maxDebates = 3,
  winnersOnly = false,
}) => {
  const { theme } = useTheme();
  const { history, hasHistory } = useDebateStats();
  const { getAIInfo } = useAIProviderInfo();

  if (!hasHistory) {
    return (
      <Typography variant="caption" color="secondary" style={styles.emptyText}>
        No recent debates
      </Typography>
    );
  }

  const recentDebates = getRecentDebates(history, maxDebates);
  const formattedDebates = transformDebateHistory(recentDebates, getAIInfo);

  return (
    <View style={styles.compactContainer}>
      {formattedDebates.map((debate) => (
        <View key={debate.debateId} style={styles.compactItem}>
          {!winnersOnly && (
            <Typography variant="caption" color="secondary" numberOfLines={1}>
              {debate.topic.length > 40 ? `${debate.topic.slice(0, 40)}...` : debate.topic}
            </Typography>
          )}
          {debate.winner && (
            <Typography
              variant="caption"
              weight="semibold"
              style={{ 
                color: debate.winner.color && typeof debate.winner.color === 'object'
                  ? (debate.winner.color as BrandColor)[600] || theme.colors.primary[600]
                  : debate.winner.color,
                marginTop: winnersOnly ? 0 : 2,
              }}
            >
              🏆 {debate.winner.name}
            </Typography>
          )}
        </View>
      ))}
    </View>
  );
};

export interface DebateHistoryStatsProps {
  /** Show detailed statistics */
  showDetails?: boolean;
}

/**
 * DebateHistoryStats - Statistics summary for debate history
 * Shows overview metrics for the debate history section
 */
export const DebateHistoryStats: React.FC<DebateHistoryStatsProps> = ({
  showDetails = false,
}) => {
  const { history, hasHistory, totalDebates, totalRounds } = useDebateStats();
  const { getAIInfo } = useAIProviderInfo();

  if (!hasHistory) {
    return null;
  }

  // Calculate additional stats
  const averageRoundsPerDebate = totalRounds / totalDebates;
  const recentDebates = getRecentDebates(history, 10);
  const recentWinners = recentDebates
    .map(debate => debate.overallWinner ? getAIInfo(debate.overallWinner) : null)
    .filter(Boolean);

  const uniqueRecentWinners = Array.from(
    new Set(recentWinners.map(winner => winner?.name))
  ).length;

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statRow}>
        <View style={styles.statItem}>
          <Typography variant="body" weight="semibold">
            {totalDebates}
          </Typography>
          <Typography variant="caption" color="secondary">
            Total Debates
          </Typography>
        </View>
        
        <View style={styles.statItem}>
          <Typography variant="body" weight="semibold">
            {totalRounds}
          </Typography>
          <Typography variant="caption" color="secondary">
            Total Rounds
          </Typography>
        </View>
        
        {showDetails && (
          <>
            <View style={styles.statItem}>
              <Typography variant="body" weight="semibold">
                {averageRoundsPerDebate.toFixed(1)}
              </Typography>
              <Typography variant="caption" color="secondary">
                Avg Rounds
              </Typography>
            </View>
            
            <View style={styles.statItem}>
              <Typography variant="body" weight="semibold">
                {uniqueRecentWinners}
              </Typography>
              <Typography variant="caption" color="secondary">
                Recent Winners
              </Typography>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

export interface DebateTimelineProps {
  /** Number of recent debates to show in timeline */
  timelineLength?: number;
}

/**
 * DebateTimeline - Visual timeline of recent debates
 * Shows debate progression with winners
 */
export const DebateTimeline: React.FC<DebateTimelineProps> = ({
  timelineLength = 5,
}) => {
  const { theme } = useTheme();
  const { history, hasHistory } = useDebateStats();
  const { getAIInfo } = useAIProviderInfo();

  if (!hasHistory) {
    return null;
  }

  const recentDebates = getRecentDebates(history, timelineLength);
  const formattedDebates = transformDebateHistory(recentDebates, getAIInfo);

  return (
    <View style={styles.timeline}>
      {formattedDebates.map((debate, index) => (
        <View key={debate.debateId} style={styles.timelineItem}>
          <View style={[
            styles.timelineDot,
            { 
              backgroundColor: (() => {
                if (debate.winner?.color) {
                  return typeof debate.winner.color === 'object'
                    ? (debate.winner.color as BrandColor)[500] || theme.colors.primary[500]
                    : debate.winner.color;
                }
                return theme.colors.primary[500];
              })()
            }
          ]} />
          {index < formattedDebates.length - 1 && (
            <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} />
          )}
          <View style={styles.timelineContent}>
            <Typography variant="caption" weight="medium" numberOfLines={1}>
              {debate.topic.slice(0, 30)}...
            </Typography>
            {debate.winner && (
              <Typography variant="caption" color="secondary">
                {debate.winner.name}
              </Typography>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  customHeader: {
    marginBottom: 16,
  },
  list: {
    marginTop: 8,
  },
  compactContainer: {
    gap: 8,
  },
  compactItem: {
    padding: 8,
    backgroundColor: 'transparent',
  },
  emptyText: {
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  statsContainer: {
    padding: 16,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  timeline: {
    paddingLeft: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    marginRight: 12,
  },
  timelineLine: {
    position: 'absolute',
    left: 3.5,
    top: 12,
    width: 1,
    height: 20,
  },
  timelineContent: {
    flex: 1,
  },
});
