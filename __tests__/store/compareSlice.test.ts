import reducer, {
  setLeftAI,
  setRightAI,
  swapAIs,
  startCompareStreaming,
  updateCompareStreamingContent,
  endCompareStreaming,
  compareStreamingError,
  clearCompareSession,
  addCompareMessage,
  clearMessages,
  startCompareSession,
  setCompareOrientation,
  toggleSyncScroll,
  selectIsComparing,
  selectSelectedAIs,
} from '@/store/compareSlice';
import type { AIConfig } from '@/types';

const initialState = reducer(undefined, { type: 'init' });

describe('compareSlice', () => {
  const left: AIConfig = { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3' };
  const right: AIConfig = { id: 'gpt', provider: 'openai', name: 'GPT-4o', model: 'gpt-4o' };

  it('assigns and swaps AIs while clearing streamed content', () => {
    let state = reducer(initialState, setLeftAI(left));
    state = reducer(state, setRightAI(right));
    expect(state.leftAI).toEqual(left);
    expect(state.rightAI).toEqual(right);

    state = reducer(state, swapAIs());
    expect(state.leftAI).toEqual(right);
    expect(state.leftContent).toBe('');
  });

  it('handles streaming lifecycle per side - left', () => {
    let state = reducer(initialState, startCompareStreaming({ promptId: 'p1', side: 'left' }));
    expect(state.leftStreaming).toBe(true);
    expect(state.leftContent).toBe('');

    state = reducer(state, updateCompareStreamingContent({ promptId: 'p1', side: 'left', chunk: 'Hello' }));
    expect(state.leftContent).toBe('Hello');

    state = reducer(state, endCompareStreaming({ promptId: 'p1', side: 'left', finalContent: 'Done' }));
    expect(state.leftStreaming).toBe(false);
    expect(state.leftContent).toBe('Done');

    state = reducer(state, compareStreamingError({ promptId: 'p1', side: 'left', error: 'Timeout' }));
    expect(state.leftContent).toMatch(/Timeout/);
  });

  it('handles streaming lifecycle per side - right', () => {
    let state = reducer(initialState, startCompareStreaming({ promptId: 'p2', side: 'right' }));
    expect(state.rightStreaming).toBe(true);
    expect(state.rightContent).toBe('');

    state = reducer(state, updateCompareStreamingContent({ promptId: 'p2', side: 'right', chunk: 'World' }));
    expect(state.rightContent).toBe('World');

    state = reducer(state, endCompareStreaming({ promptId: 'p2', side: 'right', finalContent: 'Complete' }));
    expect(state.rightStreaming).toBe(false);
    expect(state.rightContent).toBe('Complete');

    state = reducer(state, compareStreamingError({ promptId: 'p2', side: 'right', error: 'Network error' }));
    expect(state.rightContent).toMatch(/Network error/);
  });

  it('handles streaming lifecycle for both sides', () => {
    let state = reducer(initialState, startCompareStreaming({ promptId: 'p3', side: 'both' }));
    expect(state.leftStreaming).toBe(true);
    expect(state.rightStreaming).toBe(true);
    expect(state.leftContent).toBe('');
    expect(state.rightContent).toBe('');
  });

  it('clears session and streaming state', () => {
    const state = reducer(initialState, clearCompareSession());
    expect(state.leftAI).toBeNull();
    expect(state.messages).toHaveLength(0);
  });

  it('adds and clears messages', () => {
    const message = {
      id: 'msg1',
      role: 'user' as const,
      content: 'Test message',
      timestamp: Date.now(),
    };
    let state = reducer(initialState, addCompareMessage(message));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(message);

    state = reducer(state, clearMessages());
    expect(state.messages).toHaveLength(0);
    expect(state.leftContent).toBe('');
    expect(state.rightContent).toBe('');
  });

  it('starts a compare session', () => {
    const state = reducer(initialState, startCompareSession());
    expect(state.currentSession).not.toBeNull();
    expect(state.currentSession?.id).toMatch(/^session_/);
    expect(state.currentSession?.startedAt).toBeGreaterThan(0);
  });

  it('sets compare orientation', () => {
    let state = reducer(initialState, setCompareOrientation('landscape'));
    expect(state.orientation).toBe('landscape');

    state = reducer(state, setCompareOrientation('portrait'));
    expect(state.orientation).toBe('portrait');
  });

  it('toggles sync scroll', () => {
    const defaultSyncScroll = initialState.syncScroll;
    let state = reducer(initialState, toggleSyncScroll());
    expect(state.syncScroll).toBe(!defaultSyncScroll);

    state = reducer(state, toggleSyncScroll());
    expect(state.syncScroll).toBe(defaultSyncScroll);
  });

  describe('selectors', () => {
    it('selectIsComparing returns true when left is streaming', () => {
      const state = reducer(initialState, startCompareStreaming({ promptId: 'p1', side: 'left' }));
      expect(selectIsComparing({ compare: state })).toBe(true);
    });

    it('selectIsComparing returns true when right is streaming', () => {
      const state = reducer(initialState, startCompareStreaming({ promptId: 'p1', side: 'right' }));
      expect(selectIsComparing({ compare: state })).toBe(true);
    });

    it('selectIsComparing returns false when neither is streaming', () => {
      expect(selectIsComparing({ compare: initialState })).toBe(false);
    });

    it('selectSelectedAIs returns selected AIs', () => {
      let state = reducer(initialState, setLeftAI(left));
      state = reducer(state, setRightAI(right));

      const selected = selectSelectedAIs({ compare: state });
      expect(selected.left).toEqual(left);
      expect(selected.right).toEqual(right);
    });
  });
});
