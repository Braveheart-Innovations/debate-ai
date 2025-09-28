import reducer, {
  setLeftAI,
  setRightAI,
  swapAIs,
  startCompareStreaming,
  updateCompareStreamingContent,
  endCompareStreaming,
  compareStreamingError,
  clearCompareSession,
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

  it('handles streaming lifecycle per side', () => {
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

  it('clears session and streaming state', () => {
    const state = reducer(initialState, clearCompareSession());
    expect(state.leftAI).toBeNull();
    expect(state.messages).toHaveLength(0);
  });
});
