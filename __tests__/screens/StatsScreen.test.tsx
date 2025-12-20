import React from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

const mockUseDebateStats = jest.fn();

const mockStatsEmptyState = jest.fn(
  ({ onCTAPress, title }: { onCTAPress: () => void; title: string }) => (
    <Text testID="stats-empty" onPress={onCTAPress}>
      {title}
    </Text>
  ),
);

const mockStatsLeaderboard = jest.fn(() => <Text testID="stats-leaderboard">Leaderboard</Text>);
const mockRecentDebatesSection = jest.fn(() => <Text testID="recent-debates">Recent Debates</Text>);
const mockWinRateDonutSection = jest.fn(() => <Text testID="win-rate-donut">Win Rate Donuts</Text>);
const mockPerformanceBarSection = jest.fn(() => <Text testID="performance-bar">Performance Bars</Text>);
const mockTrendLineSection = jest.fn(() => <Text testID="trend-line">Trend Lines</Text>);
const mockHeader = jest.fn(({ title, onBack }: { title: string; onBack?: () => void }) => (
  <View>
    {onBack && (
      <TouchableOpacity testID="back-button" onPress={onBack}>
        <Text>Back</Text>
      </TouchableOpacity>
    )}
    <Text>{title}</Text>
  </View>
));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: any }) => (
      <View style={style}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/hooks/stats', () => ({
  useDebateStats: (...args: unknown[]) => mockUseDebateStats(...args),
}));

jest.mock('@/components/organisms', () => ({
  Header: (props: any) => mockHeader(props),
  StatsEmptyState: (props: any) => mockStatsEmptyState(props),
  StatsLeaderboard: (props: any) => mockStatsLeaderboard(props),
  RecentDebatesSection: (props: any) => mockRecentDebatesSection(props),
  WinRateDonutSection: (props: any) => mockWinRateDonutSection(props),
  PerformanceBarSection: (props: any) => mockPerformanceBarSection(props),
  TrendLineSection: (props: any) => mockTrendLineSection(props),
}));

const StatsScreen = require('@/screens/StatsScreen').default;

describe('StatsScreen', () => {
  const navigation = { goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the empty state when there is no history or stats', () => {
    mockUseDebateStats.mockReturnValue({
      history: [],
      stats: {
        claude: { totalDebates: 0, roundsWon: 0, roundsLost: 0 },
      },
    });

    const { getByTestId, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    expect(getByTestId('stats-empty')).toBeTruthy();
    expect(queryByTestId('stats-leaderboard')).toBeNull();
    expect(queryByTestId('recent-debates')).toBeNull();
    expect(queryByTestId('win-rate-donut')).toBeNull();

    fireEvent.press(getByTestId('stats-empty'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockStatsEmptyState).toHaveBeenCalledWith(
      expect.objectContaining({
        showCTA: true,
        onCTAPress: expect.any(Function),
      }),
    );
  });

  it('renders all chart sections and leaderboard when stats exist', () => {
    mockUseDebateStats.mockReturnValue({
      history: [{ debateId: 'd1' }],
      stats: {
        claude: { totalDebates: 3, roundsWon: 2, roundsLost: 1 },
      },
    });

    const { getByTestId, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    // Chart sections should be visible
    expect(getByTestId('win-rate-donut')).toBeTruthy();
    expect(getByTestId('performance-bar')).toBeTruthy();
    expect(getByTestId('trend-line')).toBeTruthy();

    // Leaderboard and recent debates should be visible
    expect(getByTestId('stats-leaderboard')).toBeTruthy();
    expect(getByTestId('recent-debates')).toBeTruthy();

    // Empty state should not be visible
    expect(queryByTestId('stats-empty')).toBeNull();

    expect(mockStatsLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'winRate' }),
    );
    expect(mockRecentDebatesSection).toHaveBeenCalledWith(
      expect.objectContaining({ maxDebates: 5 }),
    );
    expect(mockWinRateDonutSection).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true }),
    );
    expect(mockPerformanceBarSection).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, maxBars: 6 }),
    );
    expect(mockTrendLineSection).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true }),
    );
  });

  it('shows chart sections and recent debates without leaderboard when stats inactive but history exists', () => {
    mockUseDebateStats.mockReturnValue({
      history: [{ debateId: 'solo-history' }],
      stats: {
        claude: { totalDebates: 0, roundsWon: 0, roundsLost: 0 },
      },
    });

    const { getByTestId, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    // Chart sections should be visible (even with history only)
    expect(getByTestId('win-rate-donut')).toBeTruthy();
    expect(getByTestId('performance-bar')).toBeTruthy();
    expect(getByTestId('trend-line')).toBeTruthy();

    // Recent debates should be visible
    expect(getByTestId('recent-debates')).toBeTruthy();

    // Leaderboard should NOT be visible (no active stats)
    expect(queryByTestId('stats-leaderboard')).toBeNull();

    // Empty state should NOT be visible
    expect(queryByTestId('stats-empty')).toBeNull();
    expect(mockStatsEmptyState).not.toHaveBeenCalled();
  });

  it('invokes navigation goBack via header back button', () => {
    mockUseDebateStats.mockReturnValue({
      history: [],
      stats: {
        claude: { totalDebates: 0, roundsWon: 0, roundsLost: 0 },
      },
    });

    const { getByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    fireEvent.press(getByTestId('back-button'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('renders Header with gradient variant and correct title', () => {
    mockUseDebateStats.mockReturnValue({
      history: [],
      stats: {},
    });

    renderWithProviders(<StatsScreen navigation={navigation} />);

    expect(mockHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'gradient',
        title: 'AI Performance Stats',
        showBackButton: true,
        onBack: expect.any(Function),
      }),
    );
  });
});
