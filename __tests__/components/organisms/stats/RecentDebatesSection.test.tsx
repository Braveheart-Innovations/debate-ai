import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { PropsOf } from '@test-utils/mockComponents';
import type { DebateHistoryHeader, DebateHistoryItem, Typography } from '@/components/molecules';
import { useDebateStats } from '@/hooks/stats';
import { RecentDebatesSection } from '@/components/organisms/stats/RecentDebatesSection';

const mockDebateHistoryHeader = jest.fn((_props: PropsOf<typeof DebateHistoryHeader>) => <Text>Header</Text>);
const mockDebateHistoryItem = jest.fn((_props: PropsOf<typeof DebateHistoryItem>) => <Text>Item</Text>);

jest.mock('@/components/molecules', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DebateHistoryHeader: (props: PropsOf<typeof DebateHistoryHeader>) => mockDebateHistoryHeader(props),
    DebateHistoryItem: (props: PropsOf<typeof DebateHistoryItem>) => mockDebateHistoryItem(props),
    Typography: ({ children }: PropsOf<typeof Typography>) => React.createElement(Text, null, children),
  };
});

jest.mock('@/hooks/stats', () => ({
  useDebateStats: jest.fn(),
  useAIProviderInfo: jest.fn(() => ({ getAIInfo: jest.fn(() => ({ name: 'Claude', color: '#123' })) })),
  useStatsAnimations: jest.fn(() => ({
    getHistoryAnimation: jest.fn(() => ({ entering: undefined })),
    shouldUseAnimations: jest.fn(() => false),
    getSimpleAnimation: jest.fn(() => ({ entering: undefined })),
  })),
}));

jest.mock('@/services/stats', () => ({
  getRecentDebates: jest.fn(() => [{ debateId: 'd1' }]),
  transformDebateHistory: jest.fn(() => ([{
    debateId: 'd1',
    topic: 'Climate',
    timestamp: 123,
    winner: { name: 'Claude', color: '#123' },
  }])),
}));

type DebateStatsResult = ReturnType<typeof useDebateStats>;
type DebateHistoryEntry = DebateStatsResult['history'][number];

/** Full `useDebateStats` result for the given history (no per-AI stats). */
const createDebateStatsResult = (history: DebateHistoryEntry[]): DebateStatsResult => ({
  stats: {},
  history,
  currentDebate: undefined,
  hasStats: false,
  hasHistory: history.length > 0,
  totalActiveAIs: 0,
  totalDebates: 0,
  totalRounds: 0,
  preservedTopic: null,
  preservedTopicMode: 'preset',
});

describe('RecentDebatesSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no history', () => {
    jest.mocked(useDebateStats).mockReturnValue(createDebateStatsResult([]));

    const { toJSON } = renderWithProviders(<RecentDebatesSection />);
    expect(toJSON()).toBeNull();
  });

  it('renders debates when history available', () => {
    jest.mocked(useDebateStats).mockReturnValue(
      createDebateStatsResult([
        { debateId: 'd1', topic: 'Climate', participants: [], roundWinners: {}, timestamp: 123 },
      ])
    );

    renderWithProviders(<RecentDebatesSection showElapsedTime showCount />);

    expect(mockDebateHistoryHeader).toHaveBeenCalledWith(expect.objectContaining({ showCount: true, totalCount: 1 }));
    expect(mockDebateHistoryItem).toHaveBeenCalledWith(expect.objectContaining({
      debateId: 'd1',
      topic: 'Climate',
      showElapsedTime: true,
    }));
  });
});
