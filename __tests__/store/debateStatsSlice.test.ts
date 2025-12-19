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
});
