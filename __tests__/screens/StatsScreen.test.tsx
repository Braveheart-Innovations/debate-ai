import React from 'react';
import { Text, View } from 'react-native';
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

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    GradientButton: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Text testID="back-button" onPress={onPress}>
        {title}
      </Text>
    ),
    Typography: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
  };
});

jest.mock('@/components/organisms', () => ({
  StatsEmptyState: (props: any) => mockStatsEmptyState(props),
  StatsLeaderboard: (props: any) => mockStatsLeaderboard(props),
  RecentDebatesSection: (props: any) => mockRecentDebatesSection(props),
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

    fireEvent.press(getByTestId('stats-empty'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockStatsEmptyState).toHaveBeenCalledWith(
      expect.objectContaining({
        showCTA: true,
        onCTAPress: expect.any(Function),
      }),
    );
  });

  it('renders leaderboard and recent debates when stats exist', () => {
    mockUseDebateStats.mockReturnValue({
      history: [{ debateId: 'd1' }],
      stats: {
        claude: { totalDebates: 3, roundsWon: 2, roundsLost: 1 },
      },
    });

    const { getByTestId, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    expect(getByTestId('stats-leaderboard')).toBeTruthy();
    expect(getByTestId('recent-debates')).toBeTruthy();
    expect(queryByTestId('stats-empty')).toBeNull();

    expect(mockStatsLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'winRate' }),
    );
    expect(mockRecentDebatesSection).toHaveBeenCalledWith(
      expect.objectContaining({ maxDebates: 5 }),
    );
  });

  it('shows recent debates without leaderboard when stats inactive but history exists', () => {
    mockUseDebateStats.mockReturnValue({
      history: [{ debateId: 'solo-history' }],
      stats: {
        claude: { totalDebates: 0, roundsWon: 0, roundsLost: 0 },
      },
    });

    const { getByTestId, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    expect(getByTestId('recent-debates')).toBeTruthy();
    expect(queryByTestId('stats-leaderboard')).toBeNull();
    expect(queryByTestId('stats-empty')).toBeNull();
    expect(mockStatsEmptyState).not.toHaveBeenCalled();
  });

  it('invokes navigation goBack via header button', () => {
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
});
