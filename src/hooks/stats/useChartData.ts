import { useMemo, useCallback } from 'react';
import { useDebateStats } from './useDebateStats';
import { useAIProviderInfo } from './useAIProviderInfo';
import { useTheme } from '../../theme';

export interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

export interface BarData {
  aiId: string;
  value: number;
  color: string;
  label: string;
}

export interface TrendPoint {
  x: number;
  y: number;
  label: string;
}

export interface TrendLine {
  aiId: string;
  points: TrendPoint[];
  color: string;
  label: string;
}

export type ChartMetric = 'winRate' | 'totalDebates' | 'roundsWon' | 'roundWinRate';
export type TrendPeriod = 'day' | 'week' | 'month';

/**
 * Custom hook for transforming debate stats into chart-ready data formats
 */
export const useChartData = () => {
  const { stats, history } = useDebateStats();
  const { getAIColor, getAIName } = useAIProviderInfo();
  const { theme } = useTheme();

  /**
   * Get donut chart segments for a specific AI's win/loss breakdown
   */
  const getDonutSegments = useCallback((aiId: string): DonutSegment[] => {
    const aiStats = stats[aiId];

    if (!aiStats || aiStats.totalDebates === 0) {
      return [
        { value: 1, color: theme.colors.gray[300], label: 'No Data' }
      ];
    }

    const segments: DonutSegment[] = [];

    if (aiStats.overallWins > 0) {
      segments.push({
        value: aiStats.overallWins,
        color: theme.colors.success[500],
        label: 'Wins',
      });
    }

    if (aiStats.overallLosses > 0) {
      segments.push({
        value: aiStats.overallLosses,
        color: theme.colors.error[500],
        label: 'Losses',
      });
    }

    // If somehow no wins or losses (shouldn't happen), show neutral
    if (segments.length === 0) {
      segments.push({
        value: 1,
        color: theme.colors.gray[400],
        label: 'No Results',
      });
    }

    return segments;
  }, [stats, theme.colors]);

  /**
   * Get bar chart data comparing all AIs by a specific metric
   */
  const getBarData = useCallback((metric: ChartMetric): { bars: BarData[]; maxValue: number } => {
    const bars: BarData[] = [];
    let maxValue = 0;

    Object.entries(stats).forEach(([aiId, aiStats]) => {
      if (aiStats.totalDebates === 0) return;

      let value: number;
      switch (metric) {
        case 'winRate':
          value = aiStats.winRate;
          break;
        case 'totalDebates':
          value = aiStats.totalDebates;
          break;
        case 'roundsWon':
          value = aiStats.roundsWon;
          break;
        case 'roundWinRate':
          value = aiStats.roundWinRate;
          break;
        default:
          value = 0;
      }

      const color = getAIColor(aiId);
      const colorValue = typeof color === 'string' ? color : color[500] || theme.colors.primary[500];

      bars.push({
        aiId,
        value,
        color: colorValue,
        label: getAIName(aiId),
      });

      if (value > maxValue) {
        maxValue = value;
      }
    });

    // Sort by value descending
    bars.sort((a, b) => b.value - a.value);

    // For percentage metrics, max should be 100
    if (metric === 'winRate' || metric === 'roundWinRate') {
      maxValue = 100;
    }

    return { bars, maxValue };
  }, [stats, getAIColor, getAIName, theme.colors.primary]);

  /**
   * Group debates by time period for trend analysis
   */
  const groupDebatesByPeriod = useCallback((period: TrendPeriod) => {
    const now = Date.now();
    const periodMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    // Get debates from the last 6 periods
    const lookbackMs = periodMs[period] * 6;
    const relevantDebates = history.filter(d => now - d.timestamp < lookbackMs);

    // Group by period bucket
    const buckets: Map<number, typeof history> = new Map();

    relevantDebates.forEach(debate => {
      const bucketIndex = Math.floor((now - debate.timestamp) / periodMs[period]);
      const existing = buckets.get(bucketIndex) || [];
      buckets.set(bucketIndex, [...existing, debate]);
    });

    return { buckets, periodMs: periodMs[period] };
  }, [history]);

  /**
   * Get trend line data for performance over time
   */
  const getTrendData = useCallback((period: TrendPeriod, aiIds?: string[]): TrendLine[] => {
    const { buckets } = groupDebatesByPeriod(period);

    // Determine which AIs to track
    const trackedAIs = aiIds || Object.keys(stats).filter(id => stats[id].totalDebates > 0);

    if (trackedAIs.length === 0) {
      return [];
    }

    const lines: TrendLine[] = [];
    const periodLabels = {
      day: ['Today', '1d ago', '2d ago', '3d ago', '4d ago', '5d ago'],
      week: ['This week', '1w ago', '2w ago', '3w ago', '4w ago', '5w ago'],
      month: ['This month', '1m ago', '2m ago', '3m ago', '4m ago', '5m ago'],
    };

    trackedAIs.forEach(aiId => {
      const points: TrendPoint[] = [];
      const color = getAIColor(aiId);
      const colorValue = typeof color === 'string' ? color : color[500] || theme.colors.primary[500];

      // Calculate win rate for each period bucket (0 = most recent)
      for (let i = 5; i >= 0; i--) {
        const debates = buckets.get(i) || [];
        const aiDebates = debates.filter(d => d.participants.includes(aiId));

        let winRate = 0;
        if (aiDebates.length > 0) {
          const wins = aiDebates.filter(d => d.overallWinner === aiId).length;
          winRate = (wins / aiDebates.length) * 100;
        }

        points.push({
          x: 5 - i, // Reverse so newer periods are on the right
          y: winRate,
          label: periodLabels[period][i],
        });
      }

      lines.push({
        aiId,
        points,
        color: colorValue,
        label: getAIName(aiId),
      });
    });

    return lines;
  }, [stats, groupDebatesByPeriod, getAIColor, getAIName, theme.colors.primary]);

  /**
   * Get comparison data between two specific AIs
   */
  const getComparisonData = useCallback((ai1Id: string, ai2Id: string) => {
    const ai1Stats = stats[ai1Id];
    const ai2Stats = stats[ai2Id];

    if (!ai1Stats || !ai2Stats) {
      return null;
    }

    const ai1Color = getAIColor(ai1Id);
    const ai2Color = getAIColor(ai2Id);

    return {
      ai1: {
        id: ai1Id,
        name: getAIName(ai1Id),
        color: typeof ai1Color === 'string' ? ai1Color : ai1Color[500],
        stats: ai1Stats,
      },
      ai2: {
        id: ai2Id,
        name: getAIName(ai2Id),
        color: typeof ai2Color === 'string' ? ai2Color : ai2Color[500],
        stats: ai2Stats,
      },
    };
  }, [stats, getAIColor, getAIName]);

  /**
   * Get all AIs with stats for chart display
   */
  const getActiveAIs = useMemo(() => {
    return Object.entries(stats)
      .filter(([, aiStats]) => aiStats.totalDebates > 0)
      .map(([aiId]) => ({
        id: aiId,
        name: getAIName(aiId),
        color: (() => {
          const c = getAIColor(aiId);
          return typeof c === 'string' ? c : c[500] || theme.colors.primary[500];
        })(),
      }));
  }, [stats, getAIName, getAIColor, theme.colors.primary]);

  /**
   * Check if there's enough data for charts
   */
  const hasChartData = useMemo(() => {
    return Object.values(stats).some(s => s.totalDebates > 0);
  }, [stats]);

  return {
    // Segment generators
    getDonutSegments,
    getBarData,
    getTrendData,
    getComparisonData,

    // Utilities
    getActiveAIs,
    hasChartData,

    // Theme colors for charts
    chartColors: {
      wins: theme.colors.success[500],
      losses: theme.colors.error[500],
      neutral: theme.colors.gray[400],
      grid: theme.colors.gray[300],
      axis: theme.colors.text.secondary,
      background: theme.colors.card,
    },
  };
};
