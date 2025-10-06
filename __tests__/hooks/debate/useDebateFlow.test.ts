import { act } from '@testing-library/react-native';
import { useDebateFlow } from '@/hooks/debate/useDebateFlow';
import { DebateStatus, type DebateEvent, type DebateOrchestrator } from '@/services/debate';
import type { RootState } from '@/store';
import type { Message } from '@/types';
import { RecordController } from '@/services/demo/RecordController';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

jest.mock('@/services/demo/RecordController', () => {
  const recordControllerMock = {
    isActive: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordAssistantChunk: jest.fn(),
  };
  return {
    RecordController: recordControllerMock,
    default: recordControllerMock,
  };
});

type EventHandler = (event: DebateEvent) => void;

class MockOrchestrator {
  public session = {
    status: DebateStatus.PENDING,
    currentRound: 1,
    totalRounds: 3,
  };
  public startDebate = jest.fn(async () => undefined);
  private handlers = new Set<EventHandler>();

  addEventListener(handler: EventHandler) {
    this.handlers.add(handler);
  }

  removeEventListener(handler: EventHandler) {
    this.handlers.delete(handler);
  }

  emit(event: DebateEvent) {
    this.handlers.forEach(handler => handler(event));
  }

  getSession() {
    return this.session;
  }
}

describe('useDebateFlow', () => {
  const recordController = RecordController as jest.Mocked<typeof RecordController>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const initialMessages: Message[] = [
    { id: 'user-1', sender: 'You', senderType: 'user', content: 'Let us debate', timestamp: 1 },
  ];

  const baseState: Partial<RootState> = {
    chat: {
      currentSession: {
        id: 'debate-session',
        selectedAIs: [],
        messages: initialMessages,
        isActive: true,
        createdAt: 0,
        sessionType: 'debate',
      },
      sessions: [],
      typingAIs: [],
      isLoading: false,
      aiPersonalities: {},
      selectedModels: {},
    },
  } as Partial<RootState>;

  it('links orchestrator events to redux state and starts debate once', async () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateFlow(orchestrator as unknown as never), {
      preloadedState: baseState,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isDebateActive).toBe(false);

    act(() => {
      orchestrator.emit({ type: 'debate_started', data: { session: orchestrator.session }, timestamp: Date.now() });
    });

    expect(result.current.isDebateActive).toBe(true);
    expect(result.current.maxRounds).toBe(3);

    act(() => {
      orchestrator.emit({ type: 'round_changed', data: { round: 2 }, timestamp: Date.now() });
    });
    expect(result.current.currentRound).toBe(2);

    act(() => {
      orchestrator.emit({ type: 'stream_started', data: { messageId: 'm1', aiProvider: 'claude' }, timestamp: Date.now() });
    });
    expect(store.getState().streaming.streamingMessages.m1).toBeDefined();

    await act(async () => {
      await result.current.startDebate();
      await result.current.startDebate();
    });

    expect(orchestrator.startDebate).toHaveBeenCalledTimes(1);
    expect(orchestrator.startDebate).toHaveBeenCalledWith(initialMessages);

    act(() => {
      orchestrator.emit({ type: 'debate_ended', data: {}, timestamp: Date.now() });
    });
    expect(result.current.isDebateEnded).toBe(true);
  });

  it('handles message, typing, streaming, and error events', () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateFlow(orchestrator as unknown as never), {
      preloadedState: baseState,
    });

    recordController.isActive.mockReturnValue(false);

    act(() => {
      orchestrator.emit({
        type: 'message_added',
        data: {
          message: {
            id: 'ai-silent',
            sender: 'Claude',
            senderType: 'ai',
            content: 'First pass',
            timestamp: Date.now(),
            metadata: { providerId: 'claude' },
          },
        },
        timestamp: Date.now(),
      });
    });
    expect(recordController.recordAssistantMessage).not.toHaveBeenCalled();

    recordController.isActive.mockReturnValue(true);

    act(() => {
      orchestrator.emit({
        type: 'message_added',
        data: {
          message: {
            id: 'ai-1',
            sender: 'Claude',
            senderType: 'ai',
            content: 'Rebuttal',
            timestamp: Date.now(),
            metadata: { providerId: 'claude' },
          },
        },
        timestamp: Date.now(),
      });
    });

    const messages = store.getState().chat.currentSession?.messages || [];
    expect(messages.find(m => m.id === 'ai-1')?.content).toBe('Rebuttal');
    expect(recordController.recordAssistantMessage).toHaveBeenCalledWith('claude', 'Rebuttal');

    act(() => {
      orchestrator.emit({ type: 'typing_started', data: { aiName: 'Claude' }, timestamp: Date.now() });
    });
    expect(store.getState().chat.typingAIs).toContain('Claude');

    act(() => {
      orchestrator.emit({ type: 'typing_stopped', data: { aiName: 'Claude' }, timestamp: Date.now() });
    });
    expect(store.getState().chat.typingAIs).not.toContain('Claude');

    act(() => {
      orchestrator.emit({ type: 'stream_started', data: { messageId: 'stream-1', aiProvider: 'claude' }, timestamp: Date.now() });
    });
    expect(store.getState().streaming.streamingMessages['stream-1']).toMatchObject({ isStreaming: true, aiProvider: 'claude' });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    recordController.recordAssistantChunk.mockImplementationOnce(() => {
      throw new Error('capture failed');
    });

    act(() => {
      orchestrator.emit({ type: 'stream_chunk', data: { messageId: 'stream-1', chunk: 'Hello ', aiProvider: 'claude' }, timestamp: Date.now() });
    });
    expect(warnSpy).toHaveBeenCalled();

    act(() => {
      orchestrator.emit({ type: 'stream_chunk', data: { messageId: 'stream-1', chunk: 'world', aiProvider: 'claude' }, timestamp: Date.now() });
    });
    expect(recordController.recordAssistantChunk).toHaveBeenCalledWith('claude', 'world');
    expect(store.getState().streaming.streamingMessages['stream-1'].chunksReceived).toBe(2);

    act(() => {
      orchestrator.emit({ type: 'stream_error', data: { messageId: 'stream-1', error: 'network' }, timestamp: Date.now() });
    });
    expect(store.getState().streaming.streamingMessages['stream-1'].error).toBe('network');

    act(() => {
      orchestrator.emit({ type: 'stream_started', data: { messageId: 'ai-1', aiProvider: 'claude' }, timestamp: Date.now() });
    });

    act(() => {
      orchestrator.emit({
        type: 'stream_completed',
        data: { messageId: 'ai-1', finalContent: 'Final rebuttal', modelUsed: 'claude-3' },
        timestamp: Date.now(),
      });
    });

    const updatedMessage = store.getState().chat.currentSession?.messages.find(m => m.id === 'ai-1');
    expect(updatedMessage?.content).toBe('Final rebuttal');
    expect(updatedMessage?.metadata?.modelUsed).toBe('claude-3');
    expect(store.getState().streaming.streamingMessages['ai-1'].isStreaming).toBe(false);

    act(() => {
      orchestrator.emit({ type: 'error_occurred', data: { error: { message: 'boom' } }, timestamp: Date.now() });
    });
    expect(result.current.error).toBe('boom');

    warnSpy.mockRestore();
  });

  it('handles start errors, retries, and early exits', async () => {
    const orchestrator = new MockOrchestrator();
    orchestrator.startDebate.mockRejectedValueOnce(new Error('start failed'));
    const { result } = renderHookWithProviders(() => useDebateFlow(orchestrator as unknown as never), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.startDebate();
    });

    expect(result.current.error).toBe('start failed');
    expect(result.current.isDebateActive).toBe(false);
    expect(orchestrator.startDebate).toHaveBeenCalledTimes(1);

    orchestrator.startDebate.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.startDebate();
      await result.current.startDebate();
    });

    expect(orchestrator.startDebate).toHaveBeenCalledTimes(2);
    expect(result.current.isDebateActive).toBe(true);

    const { result: nullResult } = renderHookWithProviders(() => useDebateFlow(null), {
      preloadedState: baseState,
    });

    await act(async () => {
      await nullResult.current.startDebate();
    });

    expect(nullResult.current.isDebateActive).toBe(false);
    expect(nullResult.current.error).toBeNull();
  });

  it('syncs session state, rounds, and resets when orchestrator changes', async () => {
    const orchestratorA = new MockOrchestrator();
    orchestratorA.session.status = DebateStatus.ACTIVE;
    orchestratorA.session.currentRound = 2;
    orchestratorA.session.totalRounds = 4;

    const orchestratorB = new MockOrchestrator();
    orchestratorB.session.status = DebateStatus.COMPLETED;
    orchestratorB.session.currentRound = 5;
    orchestratorB.session.totalRounds = 5;

    let current: MockOrchestrator | null = orchestratorA;

    const { result, rerender } = renderHookWithProviders(() => useDebateFlow(current as unknown as DebateOrchestrator | null), {
      preloadedState: baseState,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isDebateActive).toBe(false);

    act(() => {
      orchestratorA.emit({ type: 'debate_started', data: { session: orchestratorA.session }, timestamp: Date.now() });
    });

    expect(result.current.isDebateActive).toBe(true);
    expect(result.current.currentRound).toBe(2);
    expect(result.current.maxRounds).toBe(4);

    orchestratorA.session.totalRounds = 6;

    act(() => {
      orchestratorA.emit({ type: 'round_changed', data: { round: 3 }, timestamp: Date.now() });
    });

    expect(result.current.currentRound).toBe(3);
    expect(result.current.maxRounds).toBe(6);

    current = orchestratorB;

    await act(async () => {
      rerender();
      await Promise.resolve();
    });

    expect(result.current.isDebateActive).toBe(false);
    expect(result.current.isDebateEnded).toBe(false);
    expect(result.current.currentRound).toBe(1);

    act(() => {
      orchestratorB.emit({ type: 'debate_started', data: { session: orchestratorB.session }, timestamp: Date.now() });
    });

    expect(result.current.currentRound).toBe(5);
    expect(result.current.maxRounds).toBe(5);

    orchestratorB.startDebate.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.startDebate();
    });

    expect(orchestratorB.startDebate).toHaveBeenCalledTimes(1);

    act(() => {
      orchestratorB.emit({ type: 'debate_ended', data: {}, timestamp: Date.now() });
    });

    expect(result.current.isDebateEnded).toBe(true);
  });
});
