import AsyncStorage from '@react-native-async-storage/async-storage';
import StatsPersistenceService from '@/services/stats/StatsPersistenceService';
import { DebateStats, DebateRound } from '@/store/debateStatsSlice';

describe('StatsPersistenceService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockStats: DebateStats = {
    claude: {
      totalDebates: 5,
      roundsWon: 8,
      roundsLost: 7,
      overallWins: 3,
      overallLosses: 2,
      lastDebated: 1700000000000,
      winRate: 60,
      roundWinRate: 53.3,
      topics: {
        'AI Ethics': { participated: 2, won: 1 },
      },
    },
    gpt: {
      totalDebates: 5,
      roundsWon: 7,
      roundsLost: 8,
      overallWins: 2,
      overallLosses: 3,
      lastDebated: 1700000000000,
      winRate: 40,
      roundWinRate: 46.7,
      topics: {
        'AI Ethics': { participated: 2, won: 1 },
      },
    },
  };

  const mockHistory: DebateRound[] = [
    {
      debateId: 'debate-1',
      topic: 'AI Ethics',
      participants: ['claude', 'gpt'],
      roundWinners: { 1: 'claude', 2: 'gpt', 3: 'claude' },
      overallWinner: 'claude',
      timestamp: 1700000000000,
    },
  ];

  it('saves and loads stats correctly', async () => {
    await StatsPersistenceService.saveStats(mockStats, mockHistory);
    const loaded = await StatsPersistenceService.loadStats();

    expect(loaded).not.toBeNull();
    expect(loaded?.stats).toEqual(mockStats);
    expect(loaded?.history).toEqual(mockHistory);
  });

  it('returns null when no stats are stored', async () => {
    const loaded = await StatsPersistenceService.loadStats();
    expect(loaded).toBeNull();
  });

  it('clears stored stats', async () => {
    await StatsPersistenceService.saveStats(mockStats, mockHistory);
    await StatsPersistenceService.clearStats();
    const loaded = await StatsPersistenceService.loadStats();

    expect(loaded).toBeNull();
  });

  it('handles empty stats object', async () => {
    await StatsPersistenceService.saveStats({}, []);
    const loaded = await StatsPersistenceService.loadStats();

    expect(loaded).not.toBeNull();
    expect(loaded?.stats).toEqual({});
    expect(loaded?.history).toEqual([]);
  });

  it('overwrites existing stats when saving', async () => {
    await StatsPersistenceService.saveStats(mockStats, mockHistory);

    const newStats: DebateStats = {
      gemini: {
        totalDebates: 1,
        roundsWon: 2,
        roundsLost: 1,
        overallWins: 1,
        overallLosses: 0,
        lastDebated: 1700000001000,
        winRate: 100,
        roundWinRate: 66.7,
        topics: {},
      },
    };

    await StatsPersistenceService.saveStats(newStats, []);
    const loaded = await StatsPersistenceService.loadStats();

    expect(loaded?.stats).toEqual(newStats);
    expect(loaded?.history).toEqual([]);
  });

  it('handles corrupted JSON gracefully', async () => {
    // Manually set corrupted data
    await AsyncStorage.setItem('@debate_stats', 'not valid json');
    const loaded = await StatsPersistenceService.loadStats();

    expect(loaded).toBeNull();
  });
});
