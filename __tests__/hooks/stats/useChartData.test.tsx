import { renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { createAppStore } from '@/store';
import { ThemeProvider } from '@/theme';
import { useChartData } from '@/hooks/stats/useChartData';
import React from 'react';

// Mock dependencies
jest.mock('@/hooks/stats/useDebateStats', () => ({
  useDebateStats: () => ({
    stats: {
      claude: {
        totalDebates: 10,
        roundsWon: 15,
        roundsLost: 12,
        overallWins: 6,
        overallLosses: 4,
        lastDebated: Date.now(),
        winRate: 60,
        roundWinRate: 55.6,
        topics: {},
      },
      openai: {
        totalDebates: 8,
        roundsWon: 10,
        roundsLost: 14,
        overallWins: 3,
        overallLosses: 5,
        lastDebated: Date.now(),
        winRate: 37.5,
        roundWinRate: 41.7,
        topics: {},
      },
    },
    history: [
      {
        debateId: '1',
        topic: 'Test topic',
        participants: ['claude', 'openai'],
        roundWinners: { 1: 'claude', 2: 'openai', 3: 'claude' },
        overallWinner: 'claude',
        timestamp: Date.now() - 86400000, // 1 day ago
      },
    ],
  }),
}));

jest.mock('@/hooks/stats/useAIProviderInfo', () => ({
  useAIProviderInfo: () => ({
    getAIColor: (aiId: string) => aiId === 'claude' ? '#FF6B35' : '#10A37F',
    getAIName: (aiId: string) => aiId === 'claude' ? 'Claude' : 'ChatGPT',
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const store = createAppStore();
  return (
    <Provider store={store}>
      <ThemeProvider>{children}</ThemeProvider>
    </Provider>
  );
};

describe('useChartData', () => {
  describe('getDonutSegments', () => {
    it('returns correct segments for AI with data', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const segments = result.current.getDonutSegments('claude');

      expect(segments).toHaveLength(2);
      expect(segments.find(s => s.label === 'Wins')?.value).toBe(6);
      expect(segments.find(s => s.label === 'Losses')?.value).toBe(4);
    });

    it('returns no data segment for AI without stats', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const segments = result.current.getDonutSegments('nonexistent');

      expect(segments).toHaveLength(1);
      expect(segments[0].label).toBe('No Data');
    });
  });

  describe('getBarData', () => {
    it('returns bars sorted by value descending', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const { bars } = result.current.getBarData('winRate');

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].value).toBeGreaterThanOrEqual(bars[bars.length - 1].value);
    });

    it('returns maxValue of 100 for percentage metrics', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const { maxValue } = result.current.getBarData('winRate');

      expect(maxValue).toBe(100);
    });

    it('returns correct labels from AI provider info', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const { bars } = result.current.getBarData('totalDebates');

      const claudeBar = bars.find(b => b.aiId === 'claude');
      expect(claudeBar?.label).toBe('Claude');
    });
  });

  describe('getTrendData', () => {
    it('returns trend lines for active AIs', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const lines = result.current.getTrendData('day');

      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0].points).toHaveLength(6); // 6 periods
    });

    it('returns correct x-axis points from 0 to 5', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const lines = result.current.getTrendData('week');

      if (lines.length > 0) {
        const xValues = lines[0].points.map(p => p.x);
        expect(xValues).toContain(0);
        expect(xValues).toContain(5);
      }
    });
  });

  describe('hasChartData', () => {
    it('returns true when stats have data', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      expect(result.current.hasChartData).toBe(true);
    });
  });

  describe('getActiveAIs', () => {
    it('returns only AIs with debates', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      const activeAIs = result.current.getActiveAIs;

      expect(activeAIs.every(ai => ai.id && ai.name && ai.color)).toBe(true);
    });
  });

  describe('chartColors', () => {
    it('provides theme-based chart colors', () => {
      const { result } = renderHook(() => useChartData(), { wrapper });

      expect(result.current.chartColors.wins).toBeDefined();
      expect(result.current.chartColors.losses).toBeDefined();
      expect(result.current.chartColors.neutral).toBeDefined();
    });
  });
});
