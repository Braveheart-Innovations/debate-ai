import reducer, {
  startStreaming,
  updateStreamingContent,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  clearCompletedStreams,
  cancelAllStreams,
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

  it('clears completed streams only', () => {
    // Start two streams
    let state = reducer(initialState, startStreaming({ messageId: 'm1', aiProvider: 'claude' }));
    state = reducer(state, startStreaming({ messageId: 'm2', aiProvider: 'openai' }));

    // End one stream
    state = reducer(state, endStreaming({ messageId: 'm1', finalContent: 'Done' }));
    expect(state.streamingMessages.m1.isStreaming).toBe(false);
    expect(state.streamingMessages.m2.isStreaming).toBe(true);

    // Clear completed streams - m1 should be removed, m2 should remain
    state = reducer(state, clearCompletedStreams());
    expect(state.streamingMessages.m1).toBeUndefined();
    expect(state.streamingMessages.m2).toBeDefined();
  });

  it('cancels all active streams', () => {
    // Start multiple streams
    let state = reducer(initialState, startStreaming({ messageId: 'm1', aiProvider: 'claude' }));
    state = reducer(state, startStreaming({ messageId: 'm2', aiProvider: 'openai' }));
    expect(state.streamingMessages.m1.isStreaming).toBe(true);
    expect(state.streamingMessages.m2.isStreaming).toBe(true);

    // Cancel all
    state = reducer(state, cancelAllStreams());
    expect(state.streamingMessages.m1.isStreaming).toBe(false);
    expect(state.streamingMessages.m1.error).toBe('Stream cancelled');
    expect(state.streamingMessages.m2.isStreaming).toBe(false);
    expect(state.streamingMessages.m2.error).toBe('Stream cancelled');
    expect(state.activeStreamCount).toBe(0);
  });

  it('updates existing provider streaming preference', () => {
    // First set a preference
    let state = reducer(initialState, setProviderStreamingPreference({ providerId: 'claude', enabled: true }));
    expect(state.streamingPreferences.claude.enabled).toBe(true);

    // Update the same preference (triggers else branch)
    state = reducer(state, setProviderStreamingPreference({ providerId: 'claude', enabled: false }));
    expect(state.streamingPreferences.claude.enabled).toBe(false);
  });
});
