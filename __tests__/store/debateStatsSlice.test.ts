import reducer, {
  startDebate,
  recordRoundWinner,
  recordOverallWinner,
  clearStats,
  preserveTopic,
  clearPreservedTopic,
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
});
