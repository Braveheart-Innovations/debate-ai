import reducer, {
  startDebate,
  recordRoundWinner,
  recordOverallWinner,
  clearStats,
  preserveTopic,
  clearPreservedTopic,
  restoreStats,
} from '@/store/debateStatsSlice';

const initialState = reducer(undefined, { type: 'init' });

describe('debateStatsSlice', () => {
  it('initializes current debate and participants', () => {
    const state = reducer(initialState, startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt'] }));
    expect(state.currentDebate?.debateId).toBe('debate-1');
    expect(Object.keys(state.stats)).toEqual(['claude', 'gpt']);
  });

  it('tracks round winners and overall results', () => {
    let state = reducer(initialState, startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt'] }));
    state = reducer(state, recordRoundWinner({ round: 1, winnerId: 'claude' }));
    expect(state.currentDebate?.roundWinners[1]).toBe('claude');
    expect(state.stats.claude.roundsWon).toBe(1);
    expect(state.stats.gpt.roundsLost).toBe(1);

    state = reducer(state, recordOverallWinner({ winnerId: 'claude' }));
    expect(state.currentDebate).toBeUndefined();
    expect(state.stats.claude.overallWins).toBe(1);
    expect(state.history).toHaveLength(1);
  });

  it('preserves and clears topic selections', () => {
    let state = reducer(initialState, preserveTopic({ topic: 'AI', mode: 'custom' }));
    expect(state.preservedTopic).toBe('AI');
    expect(state.preservedTopicMode).toBe('custom');

    state = reducer(state, clearPreservedTopic());
    expect(state.preservedTopic).toBeNull();
  });

  it('clears statistics', () => {
    const cleared = reducer(
      { ...initialState, stats: { claude: { totalDebates: 1 } as never }, history: [{ debateId: 'debate-1' } as never] },
      clearStats(),
    );
    expect(cleared.stats).toEqual({});
    expect(cleared.history).toEqual([]);
  });

  it('preserves existing stats when starting new debate with same participants', () => {
    // Start first debate and record a win
    let state = reducer(initialState, startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt'] }));
    state = reducer(state, recordRoundWinner({ round: 1, winnerId: 'claude' }));
    state = reducer(state, recordOverallWinner({ winnerId: 'claude' }));

    // Stats should be recorded
    expect(state.stats.claude.overallWins).toBe(1);
    expect(state.stats.claude.roundsWon).toBe(1);

    // Start a second debate with same participants - stats should persist
    state = reducer(state, startDebate({ debateId: 'debate-2', topic: 'Climate', participants: ['claude', 'gpt'] }));

    // Stats from previous debate should still be there
    expect(state.stats.claude.overallWins).toBe(1);
    expect(state.stats.claude.roundsWon).toBe(1);
    expect(state.currentDebate?.debateId).toBe('debate-2');
  });

  it('does not update stats when no current debate exists', () => {
    // recordRoundWinner without starting debate should be a no-op
    const state = reducer(initialState, recordRoundWinner({ round: 1, winnerId: 'claude' }));
    expect(state.currentDebate).toBeUndefined();
    expect(state.stats).toEqual({});
  });

  it('handles recordOverallWinner without current debate', () => {
    const state = reducer(initialState, recordOverallWinner({ winnerId: 'claude' }));
    expect(state.currentDebate).toBeUndefined();
    expect(state.stats).toEqual({});
  });

  it('restores stats and history from persisted data', () => {
    const persistedStats = {
      claude: {
        totalDebates: 3,
        roundsWon: 5,
        roundsLost: 4,
        overallWins: 2,
        overallLosses: 1,
        lastDebated: 1700000000000,
        winRate: 66.7,
        roundWinRate: 55.6,
        topics: { 'AI Ethics': { participated: 1, won: 1 } },
      },
    };

    const persistedHistory = [
      {
        debateId: 'debate-1',
        topic: 'AI Ethics',
        participants: ['claude', 'gpt'],
        roundWinners: { 1: 'claude' },
        overallWinner: 'claude',
        timestamp: 1700000000000,
      },
    ];

    const state = reducer(
      initialState,
      restoreStats({ stats: persistedStats, history: persistedHistory as never[] })
    );

    expect(state.stats).toEqual(persistedStats);
    expect(state.history).toEqual(persistedHistory);
    expect(state.currentDebate).toBeUndefined();
  });

  it('restoreStats overwrites existing stats', () => {
    // Start with some existing data
    let state = reducer(initialState, startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt'] }));
    state = reducer(state, recordRoundWinner({ round: 1, winnerId: 'claude' }));
    state = reducer(state, recordOverallWinner({ winnerId: 'claude' }));

    expect(state.stats.claude.overallWins).toBe(1);
    expect(state.history).toHaveLength(1);

    // Restore different data
    const newStats = {
      gemini: {
        totalDebates: 10,
        roundsWon: 15,
        roundsLost: 15,
        overallWins: 5,
        overallLosses: 5,
        lastDebated: 1700000001000,
        winRate: 50,
        roundWinRate: 50,
        topics: {},
      },
    };

    state = reducer(state, restoreStats({ stats: newStats, history: [] }));

    expect(state.stats).toEqual(newStats);
    expect(state.history).toEqual([]);
    expect(state.stats.claude).toBeUndefined();
  });
});
