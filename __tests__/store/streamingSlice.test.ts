import reducer, {
  startStreaming,
  updateStreamingContent,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  setProviderStreamingPreference,
  setGlobalStreaming,
  setProviderVerificationError,
  selectStreamingMessage,
  selectProviderStreamingEnabled,
} from '@/store/streamingSlice';
import type { RootState } from '@/store';

const initialState = reducer(undefined, { type: 'init' });

describe('streamingSlice', () => {
  it('tracks streaming lifecycle and metrics', () => {
    let state = reducer(initialState, startStreaming({ messageId: 'm1', aiProvider: 'claude' }));
    state = reducer(state, updateStreamingContent({ messageId: 'm1', chunk: 'Hello' }));
    expect(state.streamingMessages.m1.content).toBe('Hello');
    expect(state.streamingMessages.m1.cursorVisible).toBe(true);

    state = reducer(state, endStreaming({ messageId: 'm1', finalContent: 'Complete' }));
    expect(state.streamingMessages.m1.isStreaming).toBe(false);
    expect(state.totalStreamsCompleted).toBe(1);

    state = reducer(state, streamingError({ messageId: 'm1', error: 'timeout' }));
    expect(state.streamingMessages.m1.error).toBe('timeout');

    state = reducer(state, clearStreamingMessage('m1'));
    expect(state.streamingMessages.m1).toBeUndefined();
  });

  it('adjusts provider preferences and selectors respect verification errors', () => {
    let state = reducer(initialState, setProviderStreamingPreference({ providerId: 'claude', enabled: false }));
    state = reducer(state, setGlobalStreaming(true));
    state = reducer(state, setProviderVerificationError({ providerId: 'claude', hasError: true }));

    const rootState = { streaming: state } as RootState;
    expect(selectStreamingMessage('missing')(rootState)).toBeUndefined();
    expect(selectProviderStreamingEnabled('claude')(rootState)).toBe(false);
  });
});
