import React from 'react';
import { View, StyleSheet } from 'react-native';
import { EntryExitAnimationFunction } from 'react-native-reanimated';
import { 
  StatsCard,
  StatsCardHeader,
  StatsCardRow,
  StatItem,
  WinRateDisplay,
  RankBadge,
  Typography,
} from '@/components/molecules';
import { useTheme } from '@/theme';
import { useSortedStats, useAIProviderInfo, useStatsAnimations } from '@/hooks/stats';
import { formatDate } from '@/services/stats';
import { AIInfo, AIStats } from '@/types/stats';
import { BrandColor } from '@/constants/aiColors';

export interface StatsLeaderboardProps {
  sortBy?: 'winRate' | 'totalDebates' | 'roundWinRate';
  maxItems?: number;
  enableAnimations?: boolean;
}

export const StatsLeaderboard: React.FC<StatsLeaderboardProps> = ({
  sortBy = 'winRate',
  maxItems,
  enableAnimations = true,
}) => {
  const { sortedStats, isEmpty } = useSortedStats(sortBy);
  const { getAIInfo } = useAIProviderInfo();
  const { getLeaderboardAnimation, shouldUseAnimations, getSimpleAnimation } = useStatsAnimations();

  const displayStats = maxItems ? sortedStats.slice(0, maxItems) : sortedStats;
  const useAnimations = enableAnimations && shouldUseAnimations(displayStats.length);

  if (isEmpty) return null;

  return (
    <View style={styles.container}>
      <Typography variant="title" weight="semibold" style={styles.title}>
        🏆 Leaderboard
      </Typography>
      {displayStats.map((item, index) => {
        const aiInfo = getAIInfo(item.aiId);
        const animation = useAnimations ? getLeaderboardAnimation(index) : getSimpleAnimation();
        return (
          <StatsLeaderboardItem
            key={item.aiId}
            rank={item.rank}
            aiId={item.aiId}
            aiInfo={aiInfo}
            stats={item.stats}
            entering={animation.entering}
          />
        );
      })}
    </View>
  );
};

export interface StatsLeaderboardItemProps {
  rank: number;
  aiId: string;
  aiInfo: AIInfo;
  stats: AIStats;
  entering?: EntryExitAnimationFunction;
}

export const StatsLeaderboardItem: React.FC<StatsLeaderboardItemProps> = ({
  rank,
  aiInfo,
  stats,
  entering,
}) => {
  const { theme } = useTheme();
  const brandColor: BrandColor = typeof aiInfo.color === 'object' 
    ? (aiInfo.color as BrandColor)
    : { 50: '#F0F0F0', 100: '#E0E0E0', 200: '#D0D0D0', 300: '#C0C0C0', 400: '#B0B0B0', 500: aiInfo.color, 600: '#909090', 700: '#808080', 800: '#707070', 900: '#606060' };

  return (
    <StatsCard borderColor={brandColor[500]} entering={entering}>
      <StatsCardHeader
        rank={<RankBadge rank={rank} />}
        title={<Typography variant="body" weight="bold" style={{ color: brandColor[600] }}>{aiInfo.name}</Typography>}
        subtitle={<Typography variant="caption" color="secondary">Last debated: {formatDate(stats.lastDebated)}</Typography>}
        rightContent={<WinRateDisplay overallRate={stats.winRate} roundRate={stats.roundWinRate} color={brandColor[500]} />}
      />
      <StatsCardRow>
        <StatItem value={stats.totalDebates} label="Debates" />
        <StatItem value={stats.overallWins} label="Wins" valueColor={theme.colors.success[600]} />
        <StatItem value={stats.overallLosses} label="Losses" valueColor={theme.colors.error[600]} />
      </StatsCardRow>
      <StatsCardRow showDivider>
        <StatItem value={stats.totalDebates * 3} label="Rounds Played" valueVariant="body" />
        <StatItem value={stats.roundsWon} label="Rounds Won" valueColor={theme.colors.success[500]} valueVariant="body" />
        <StatItem value={stats.roundsLost} label="Rounds Lost" valueColor={theme.colors.error[500]} valueVariant="body" />
      </StatsCardRow>
    </StatsCard>
  );
};

export interface LeaderboardHeaderProps {
  sortBy: 'winRate' | 'totalDebates' | 'roundWinRate';
  onSortChange?: (sort: 'winRate' | 'totalDebates' | 'roundWinRate') => void;
  totalAIs?: number;
  showSortControls?: boolean;
}

export const LeaderboardHeader: React.FC<LeaderboardHeaderProps> = ({ onSortChange, totalAIs, showSortControls = false }) => {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Typography variant="title" weight="semibold">🏆 Leaderboard</Typography>
        {totalAIs && (<Typography variant="caption" color="secondary">({totalAIs} AIs)</Typography>)}
      </View>
      {showSortControls && onSortChange && (
        <View style={styles.sortControls}>
          <Typography variant="caption" color="secondary" style={styles.sortLabel}>Sort by:</Typography>
        </View>
      )}
    </View>
  );
};

export interface CompactLeaderboardProps {
  maxItems?: number;
  minimal?: boolean;
}

export const CompactLeaderboard: React.FC<CompactLeaderboardProps> = ({ maxItems = 3, minimal = false }) => {
  const { theme } = useTheme();
  const { sortedStats, isEmpty } = useSortedStats('winRate');
  const { getAIInfo } = useAIProviderInfo();
  if (isEmpty) return null;
  const displayStats = sortedStats.slice(0, maxItems);
  return (
    <View style={styles.compactContainer}>
      {displayStats.map((item) => {
        const aiInfo = getAIInfo(item.aiId);
        const brandColor: BrandColor = typeof aiInfo.color === 'object' 
          ? (aiInfo.color as BrandColor)
          : { 50: '#F0F0F0', 100: '#E0E0E0', 200: '#D0D0D0', 300: '#C0C0C0', 400: '#B0B0B0', 500: aiInfo.color, 600: '#909090', 700: '#808080', 800: '#707070', 900: '#606060' };
        return (
          <View key={item.aiId} style={[styles.compactItem, { borderColor: brandColor[300] || theme.colors.primary[300] }]}>
            <RankBadge rank={item.rank} size="small" />
            <View style={styles.compactInfo}>
              <Typography variant="caption" weight="semibold" style={{ color: brandColor[600] || theme.colors.primary[600] }}>
                {aiInfo.name}
              </Typography>
              {!minimal && (
                <Typography variant="caption" color="secondary">
                  {item.stats.winRate.toFixed(0)}% • {item.stats.totalDebates} debates
                </Typography>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { marginBottom: 16 },
  header: { marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortControls: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  sortLabel: { marginRight: 8 },
  compactContainer: { gap: 8 },
  compactItem: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 6, borderWidth: 1 },
  compactInfo: { flex: 1, marginLeft: 8 },
});

