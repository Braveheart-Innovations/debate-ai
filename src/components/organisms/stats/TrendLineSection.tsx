import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LineChart, ChartLegend } from '@/components/molecules/charts';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { useChartData, TrendPeriod } from '@/hooks/stats/useChartData';
import { useDebateStats } from '@/hooks/stats';

const PERIOD_OPTIONS: { label: string; value: TrendPeriod }[] = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
];

export interface TrendLineSectionProps {
  animated?: boolean;
  testID?: string;
}

/**
 * TrendLineSection - Displays line charts showing performance trends over time
 */
export const TrendLineSection: React.FC<TrendLineSectionProps> = ({
  animated = true,
  testID,
}) => {
  const { theme } = useTheme();
  const { getTrendData, hasChartData, getActiveAIs } = useChartData();
  const { history } = useDebateStats();
  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>('week');

  const activeAIs = getActiveAIs;
  const trendLines = getTrendData(selectedPeriod);

  // Check if there's meaningful trend data (at least 2 data points)
  const hasTrendData = trendLines.some(line =>
    line.points.filter(p => p.y > 0).length >= 2
  );

  if (!hasChartData || history.length < 2 || !hasTrendData) {
    return (
      <View style={[styles.container, styles.emptyContainer]} testID={testID}>
        <Typography variant="body" color="secondary" style={styles.emptyText}>
          Complete more debates to see performance trends over time
        </Typography>
      </View>
    );
  }

  // Generate x-axis labels based on period
  const getXLabels = (): string[] => {
    switch (selectedPeriod) {
      case 'day':
        return ['5d', '4d', '3d', '2d', '1d', 'Today'];
      case 'week':
        return ['5w', '4w', '3w', '2w', '1w', 'Now'];
      case 'month':
        return ['5m', '4m', '3m', '2m', '1m', 'Now'];
      default:
        return [];
    }
  };

  // Generate y-axis labels (win rate percentages)
  const yLabels = ['100%', '75%', '50%', '25%', '0%'];

  // Convert trend data to chart format
  const chartLines = trendLines.map(line => ({
    points: line.points,
    color: line.color,
    label: line.label,
    strokeWidth: 2,
  }));

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: theme.colors.card }]}
      entering={animated ? FadeInDown.delay(300).duration(400) : undefined}
      testID={testID}
    >
      <View style={styles.header}>
        <Typography variant="title" weight="semibold">
          Performance Trends
        </Typography>
      </View>

      {/* Period Selector */}
      <View style={styles.selectorContainer}>
        <View style={styles.periodButtons}>
          {PERIOD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodButton,
                {
                  backgroundColor:
                    selectedPeriod === option.value
                      ? theme.colors.primary[500]
                      : theme.colors.gray[100],
                },
              ]}
              onPress={() => setSelectedPeriod(option.value)}
              activeOpacity={0.7}
            >
              <Typography
                variant="caption"
                weight={selectedPeriod === option.value ? 'bold' : 'medium'}
                style={{
                  color:
                    selectedPeriod === option.value
                      ? '#FFFFFF'
                      : theme.colors.text.secondary,
                }}
              >
                {option.label}
              </Typography>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Description */}
      <Typography variant="caption" color="secondary" style={styles.description}>
        Win rate performance over the last 6 {selectedPeriod}s
      </Typography>

      {/* Line Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          lines={chartLines}
          width={320}
          height={200}
          showGrid={true}
          showDots={true}
          showArea={true}
          xLabels={getXLabels()}
          yLabels={yLabels}
          animated={animated}
        />
      </View>

      {/* Legend */}
      {activeAIs.length > 0 && (
        <View style={styles.legendContainer}>
          <ChartLegend
            items={trendLines.map((line) => ({
              color: line.color,
              label: line.label,
            }))}
            orientation="horizontal"
            showValues={false}
          />
        </View>
      )}

      {/* Info Note */}
      <View style={styles.infoContainer}>
        <Typography variant="caption" color="secondary" style={styles.infoText}>
          Trends show win rate changes based on completed debates
        </Typography>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  header: {
    marginBottom: 16,
  },
  selectorContainer: {
    marginBottom: 12,
  },
  periodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  description: {
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  legendContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  infoContainer: {
    marginTop: 12,
  },
  infoText: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default TrendLineSection;
