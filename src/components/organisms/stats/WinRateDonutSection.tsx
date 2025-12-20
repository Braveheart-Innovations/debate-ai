import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { DonutChart, ChartLegend } from '@/components/molecules/charts';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { useChartData } from '@/hooks/stats/useChartData';
import { useAIProviderInfo } from '@/hooks/stats';

export interface WinRateDonutSectionProps {
  animated?: boolean;
  testID?: string;
}

/**
 * WinRateDonutSection - Displays donut charts showing win/loss breakdown per AI
 */
export const WinRateDonutSection: React.FC<WinRateDonutSectionProps> = ({
  animated = true,
  testID,
}) => {
  const { theme } = useTheme();
  const { getDonutSegments, getActiveAIs, hasChartData, chartColors } = useChartData();
  const { getAIInfo } = useAIProviderInfo();
  const [selectedAI, setSelectedAI] = useState<string | null>(null);

  const activeAIs = getActiveAIs;

  if (!hasChartData || activeAIs.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]} testID={testID}>
        <Typography variant="body" color="secondary" style={styles.emptyText}>
          Complete some debates to see win rate charts
        </Typography>
      </View>
    );
  }

  return (
    <Animated.View
      style={styles.container}
      entering={animated ? FadeInDown.delay(100).duration(400) : undefined}
      testID={testID}
    >
      <Typography variant="title" weight="semibold" style={styles.title}>
        Win Rates
      </Typography>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartsScrollContent}
      >
        {activeAIs.map((ai, index) => {
          const segments = getDonutSegments(ai.id);
          const aiInfo = getAIInfo(ai.id);
          const brandColor = typeof aiInfo.color === 'string' ? aiInfo.color : aiInfo.color[500];

          // Calculate win rate for center display
          const wins = segments.find(s => s.label === 'Wins')?.value || 0;
          const losses = segments.find(s => s.label === 'Losses')?.value || 0;
          const total = wins + losses;
          const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

          const isSelected = selectedAI === ai.id;

          return (
            <Animated.View
              key={ai.id}
              style={[
                styles.chartCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: isSelected ? brandColor : theme.colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              entering={animated ? FadeInDown.delay(200 + index * 100).duration(400) : undefined}
            >
              {/* AI Name */}
              <Typography
                variant="body"
                weight="bold"
                style={[styles.aiName, { color: brandColor }]}
                numberOfLines={1}
              >
                {ai.name}
              </Typography>

              {/* Donut Chart */}
              <DonutChart
                segments={segments}
                size={120}
                strokeWidth={14}
                animated={animated}
                onSegmentPress={() => setSelectedAI(isSelected ? null : ai.id)}
                centerContent={
                  <View style={styles.centerContent}>
                    <Typography variant="title" weight="bold">
                      {winRate}%
                    </Typography>
                    <Typography variant="caption" color="secondary">
                      Win Rate
                    </Typography>
                  </View>
                }
              />

              {/* Stats Summary */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Typography variant="body" weight="bold" style={{ color: chartColors.wins }}>
                    {wins}
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    Wins
                  </Typography>
                </View>
                <View style={styles.statItem}>
                  <Typography variant="body" weight="bold" style={{ color: chartColors.losses }}>
                    {losses}
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    Losses
                  </Typography>
                </View>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Legend */}
      <View style={styles.legendContainer}>
        <ChartLegend
          items={[
            { color: chartColors.wins, label: 'Wins' },
            { color: chartColors.losses, label: 'Losses' },
          ]}
          orientation="horizontal"
          showValues={false}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  title: {
    marginBottom: 16,
  },
  chartsScrollContent: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  chartCard: {
    width: 160,
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  aiName: {
    marginBottom: 8,
    textAlign: 'center',
  },
  centerContent: {
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  statItem: {
    alignItems: 'center',
  },
  legendContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
});

export default WinRateDonutSection;
