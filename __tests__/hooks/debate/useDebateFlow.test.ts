import { act } from '@testing-library/react-native';
import { useDebateFlow } from '@/hooks/debate/useDebateFlow';
import { DebateStatus, type DebateEvent } from '@/services/debate';
import type { RootState } from '@/store';
import type { Message } from '@/types';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

type EventHandler = (event: DebateEvent) => void;

class MockOrchestrator {
  public session = {
    status: DebateStatus.ACTIVE,
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
});
