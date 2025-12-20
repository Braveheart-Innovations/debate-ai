import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart, ChartLegend } from '@/components/molecules/charts';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { useChartData, ChartMetric } from '@/hooks/stats/useChartData';

const METRIC_OPTIONS: { label: string; value: ChartMetric }[] = [
  { label: 'Win Rate', value: 'winRate' },
  { label: 'Debates', value: 'totalDebates' },
  { label: 'Rounds Won', value: 'roundsWon' },
];

export interface PerformanceBarSectionProps {
  animated?: boolean;
  maxBars?: number;
  testID?: string;
}

/**
 * PerformanceBarSection - Displays bar charts comparing AI performance metrics
 */
export const PerformanceBarSection: React.FC<PerformanceBarSectionProps> = ({
  animated = true,
  maxBars = 6,
  testID,
}) => {
  const { theme, isDark } = useTheme();
  const { getBarData, hasChartData } = useChartData();
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('winRate');

  const { bars, maxValue } = getBarData(selectedMetric);
  const displayBars = bars.slice(0, maxBars);

  if (!hasChartData || displayBars.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]} testID={testID}>
        <Typography variant="body" color="secondary" style={styles.emptyText}>
          Complete some debates to see performance comparisons
        </Typography>
      </View>
    );
  }

  const getMetricLabel = (metric: ChartMetric): string => {
    switch (metric) {
      case 'winRate':
        return 'Win Rate (%)';
      case 'totalDebates':
        return 'Total Debates';
      case 'roundsWon':
        return 'Rounds Won';
      case 'roundWinRate':
        return 'Round Win Rate (%)';
      default:
        return '';
    }
  };

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: theme.colors.card }]}
      entering={animated ? FadeInDown.delay(200).duration(400) : undefined}
      testID={testID}
    >
      <View style={styles.header}>
        <Typography variant="title" weight="semibold">
          Performance Comparison
        </Typography>
      </View>

      {/* Metric Selector */}
      <View style={styles.selectorContainer}>
        <View style={styles.metricButtons}>
          {METRIC_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.metricButton,
                {
                  backgroundColor:
                    selectedMetric === option.value
                      ? theme.colors.primary[500]
                      : isDark ? theme.colors.gray[700] : theme.colors.gray[200],
                },
              ]}
              onPress={() => setSelectedMetric(option.value)}
              activeOpacity={0.7}
            >
              <Typography
                variant="caption"
                weight={selectedMetric === option.value ? 'bold' : 'medium'}
                style={{
                  color:
                    selectedMetric === option.value
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

      {/* Metric Label */}
      <Typography variant="caption" color="secondary" style={styles.metricLabel}>
        {getMetricLabel(selectedMetric)}
      </Typography>

      {/* Bar Chart */}
      <View style={styles.chartContainer}>
        <BarChart
          bars={displayBars}
          maxValue={maxValue}
          orientation="horizontal"
          width={300}
          height={displayBars.length * 48 + 16}
          showLabels={true}
          showValues={true}
          animated={animated}
          barRadius={6}
          spacing={12}
        />
      </View>

      {/* Legend */}
      {displayBars.length > 0 && (
        <View style={styles.legendContainer}>
          <ChartLegend
            items={displayBars.map((bar) => ({
              color: bar.color,
              label: bar.label,
              value:
                selectedMetric === 'winRate' || selectedMetric === 'roundWinRate'
                  ? `${bar.value.toFixed(1)}%`
                  : bar.value,
            }))}
            orientation="vertical"
            showValues={false}
          />
        </View>
      )}
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
  metricButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  metricLabel: {
    marginBottom: 12,
  },
  chartContainer: {
    alignItems: 'center',
  },
  legendContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
});

export default PerformanceBarSection;
