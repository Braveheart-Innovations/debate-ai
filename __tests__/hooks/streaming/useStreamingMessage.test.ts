import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useStreamingMessage } from '@/hooks/streaming/useStreamingMessage';
import type { RootState } from '@/store';

const buildStreamingState = (overrideMessages: RootState['streaming']['streamingMessages']) => ({
  streamingMessages: overrideMessages,
  streamingPreferences: {
    claude: { enabled: true, supported: true },
    openai: { enabled: true, supported: true },
    google: { enabled: true, supported: true },
    mistral: { enabled: true, supported: true },
    perplexity: { enabled: true, supported: true },
    cohere: { enabled: true, supported: true },
    together: { enabled: true, supported: true },
    deepseek: { enabled: true, supported: true },
    grok: { enabled: true, supported: true },
  },
  globalStreamingEnabled: true,
  streamingSpeed: 'natural',
  activeStreamCount: 0,
  totalStreamsCompleted: 0,
  providerVerificationErrors: {},
});

describe('useStreamingMessage', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes streaming state and dispatches content updates', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const messageId = 'stream-1';
    const preloadedState: Partial<RootState> = {
      streaming: buildStreamingState({
        [messageId]: {
          messageId,
          content: 'Hello',
          isStreaming: true,
          startTime: Date.now(),
          aiProvider: 'claude',
          cursorVisible: true,
          chunksReceived: 1,
          bytesReceived: 5,
        },
      }),
    } as Partial<RootState>;

    const { result, store } = renderHookWithProviders(() => useStreamingMessage(messageId), {
      preloadedState,
    });

    expect(result.current.content).toBe('Hello');
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.chunksReceived).toBe(1);
    expect(result.current.bytesReceived).toBe(5);

    act(() => {
      result.current.appendChunk(' there');
    });

    const updated = store.getState().streaming.streamingMessages[messageId];
    expect(updated.content).toBe('Hello there');
    expect(updated.chunksReceived).toBe(2);

    jest.setSystemTime(new Date('2024-01-01T00:00:05Z'));

    act(() => {
      result.current.completeStream('Finished response');
    });

    const completed = store.getState().streaming.streamingMessages[messageId];
    expect(completed.isStreaming).toBe(false);
    expect(completed.content).toBe('Finished response');
    expect(result.current.streamDuration).toBe(5000);

    act(() => {
      result.current.handleError('network');
    });

    const errored = store.getState().streaming.streamingMessages[messageId];
    expect(errored.error).toBe('network');
    expect(result.current.cursorVisible).toBe(false);

    act(() => {
      result.current.clearStream();
    });

    expect(store.getState().streaming.streamingMessages[messageId]).toBeUndefined();
  });

  it('automatically clears completed streams after timeout', () => {
    jest.useFakeTimers();
    const messageId = 'completed-stream';
    const now = Date.now();

    const preloadedState: Partial<RootState> = {
      streaming: buildStreamingState({
        [messageId]: {
          messageId,
          content: 'Done',
          isStreaming: false,
          startTime: now - 1000,
          endTime: now,
          aiProvider: 'openai',
          cursorVisible: false,
          chunksReceived: 4,
          bytesReceived: 20,
        },
      }),
    } as Partial<RootState>;

    const { store } = renderHookWithProviders(() => useStreamingMessage(messageId), {
      preloadedState,
    });

    expect(store.getState().streaming.streamingMessages[messageId]).toBeDefined();

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(store.getState().streaming.streamingMessages[messageId]).toBeUndefined();
  });
});
