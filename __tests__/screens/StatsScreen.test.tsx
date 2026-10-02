import React from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import StatsScreen from '@/screens/StatsScreen';

const mockUseDebateStats = jest.fn();
const mockUseStatsRollups = jest.fn();

const mockStatsEmptyState = jest.fn(
  ({ onCTAPress, title }: { onCTAPress: () => void; title: string }) => (
    <Text testID="stats-empty" onPress={onCTAPress}>
      {title}
    </Text>
  ),
);

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
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: object | object[] }) => (
      <View style={style}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/hooks/stats', () => ({
  useDebateStats: (...args: unknown[]) => mockUseDebateStats(...args),
  useStatsRollups: (...args: unknown[]) => mockUseStatsRollups(...args),
}));

jest.mock('@/components/organisms', () => ({
  Header: (props: { title: string; onBack?: () => void }) => mockHeader(props),
  StatsEmptyState: (props: { onCTAPress: () => void; title: string }) => mockStatsEmptyState(props),
}));

jest.mock('@/components/molecules/charts', () => ({
  ChartLegend: () => {
    const { Text } = require('react-native');
    return <Text testID="chart-legend">Legend</Text>;
  },
  LineChart: () => {
    const { Text } = require('react-native');
    return <Text testID="line-chart">Line Chart</Text>;
  },
}));

const createEntry = (overrides = {}) => ({
  id: 'provider:claude',
  level: 'provider',
  providerId: 'claude',
  providerName: 'Claude',
  label: 'Claude',
  shortLabel: 'Claude',
  totalDebates: 3,
  roundsWon: 4,
  roundsLost: 2,
  overallWins: 2,
  overallLosses: 1,
  lastDebated: Date.now(),
  winRate: 66.7,
  roundWinRate: 66.7,
  topics: {},
  sourceParticipantIds: ['claude-debater-slot-1'],
  uniqueDebates: 3,
  topTopics: [],
  strengths: ['Positive overall record'],
  weaknesses: ['Small sample size'],
  color: '#FF7F00',
  ...overrides,
});

const createRollupReturn = (overrides = {}) => {
  const providerEntry = createEntry();
  const modelEntry = createEntry({
    id: 'model:claude:claude-sonnet-4-6',
    level: 'model',
    modelId: 'claude-sonnet-4-6',
    modelName: 'Claude Sonnet 4.6',
    label: 'Claude / Claude Sonnet 4.6',
    shortLabel: 'Claude Sonnet 4.6',
  });

  return {
    entries: [providerEntry],
    entriesWithColors: [providerEntry],
    providerRollups: [providerEntry],
    modelRollups: [modelEntry],
    summary: {
      totalDebates: 3,
      totalEntries: 3,
      totalRounds: 6,
      providerCount: 1,
      modelCount: 1,
      topPerformer: providerEntry,
      roundLeader: providerEntry,
      averageWinRate: 66.7,
      competitiveBalance: 100,
    },
    insights: [
      {
        id: 'top-performer',
        title: 'Claude leads',
        detail: '67% win rate across 3 entries.',
        tone: 'success',
      },
    ],
    getBarData: jest.fn(() => ({
      bars: [
        {
          id: providerEntry.id,
          value: providerEntry.winRate,
          color: providerEntry.color,
          label: providerEntry.shortLabel,
        },
      ],
      maxValue: 100,
    })),
    getTrendData: jest.fn(() => []),
    hasRollups: true,
    ...overrides,
  };
};

const createEmptyRollupReturn = () => ({
  entries: [],
  entriesWithColors: [],
  providerRollups: [],
  modelRollups: [],
  summary: {
    totalDebates: 0,
    totalEntries: 0,
    totalRounds: 0,
    providerCount: 0,
    modelCount: 0,
    topPerformer: null,
    roundLeader: null,
    averageWinRate: 0,
    competitiveBalance: 0,
  },
  insights: [],
  getBarData: jest.fn(() => ({ bars: [], maxValue: 1 })),
  getTrendData: jest.fn(() => []),
  hasRollups: false,
});

describe('StatsScreen', () => {
  const navigation = { goBack: jest.fn() };
  let requestAnimationFrameSpy: jest.SpyInstance;
  let cancelAnimationFrameSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(global, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    mockUseDebateStats.mockReturnValue({
      history: [],
      stats: {},
    });
    mockUseStatsRollups.mockReturnValue(createEmptyRollupReturn());
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('shows the empty state when there is no history or rollup data', () => {
    const { getByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    expect(getByTestId('stats-empty')).toBeTruthy();

    fireEvent.press(getByTestId('stats-empty'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockStatsEmptyState).toHaveBeenCalledWith(
      expect.objectContaining({
        showCTA: true,
        onCTAPress: expect.any(Function),
      }),
    );
  });

  it('renders provider rollups when stats exist', () => {
    mockUseDebateStats.mockReturnValue({
      history: [{ debateId: 'd1', topic: 'Motion', participants: [], roundWinners: {}, timestamp: Date.now() }],
      stats: {},
    });
    mockUseStatsRollups.mockReturnValue(createRollupReturn());

    const { getByText, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    expect(getByText('Provider Comparison')).toBeTruthy();
    expect(getByText('Provider Profiles')).toBeTruthy();
    expect(getByText('Claude leads')).toBeTruthy();
    expect(queryByTestId('stats-empty')).toBeNull();
    expect(mockUseStatsRollups).toHaveBeenCalledWith('provider');
  });

  it('switches to model rollups', () => {
    mockUseDebateStats.mockReturnValue({
      history: [{ debateId: 'd1', topic: 'Motion', participants: [], roundWinners: {}, timestamp: Date.now() }],
      stats: {},
    });
    mockUseStatsRollups.mockImplementation((level: string) => {
      const providerEntry = createEntry();
      const modelEntry = createEntry({
        id: 'model:claude:claude-sonnet-4-6',
        level: 'model',
        modelId: 'claude-sonnet-4-6',
        modelName: 'Claude Sonnet 4.6',
        label: 'Claude / Claude Sonnet 4.6',
        shortLabel: 'Claude Sonnet 4.6',
      });

      return createRollupReturn({
        entriesWithColors: level === 'model' ? [modelEntry] : [providerEntry],
        summary: {
          ...createRollupReturn().summary,
          topPerformer: level === 'model' ? modelEntry : providerEntry,
          roundLeader: level === 'model' ? modelEntry : providerEntry,
        },
      });
    });

    const { getByText } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    fireEvent.press(getByText('Models'));
    expect(getByText('Model Comparison')).toBeTruthy();
    expect(getByText('Model Profiles')).toBeTruthy();
    expect(mockUseStatsRollups).toHaveBeenCalledWith('model');
  });

  it('shows recent outcomes when history exists without completed rollups', () => {
    mockUseDebateStats.mockReturnValue({
      history: [
        {
          debateId: 'd1',
          topic: 'Motion',
          participants: ['claude-debater-slot-1'],
          roundWinners: {},
          overallWinner: 'claude-debater-slot-1',
          timestamp: Date.now(),
        },
      ],
      stats: {},
    });

    const { getByText, queryByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    expect(getByText('Recent Outcomes')).toBeTruthy();
    expect(queryByTestId('stats-empty')).toBeNull();
  });

  it('invokes navigation goBack via header back button', () => {
    const { getByTestId } = renderWithProviders(
      <StatsScreen navigation={navigation} />,
    );

    fireEvent.press(getByTestId('back-button'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('renders Header with gradient variant and correct title', () => {
    renderWithProviders(<StatsScreen navigation={navigation} />);

    expect(mockHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'gradient',
        title: 'Performance Stats',
        showBackButton: true,
        onBack: expect.any(Function),
      }),
    );
  });
});
