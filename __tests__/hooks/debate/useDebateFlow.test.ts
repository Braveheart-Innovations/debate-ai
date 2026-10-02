import { act } from '@testing-library/react-native';
import { useDebateFlow } from '@/hooks/debate/useDebateFlow';
import {
  DebateOrchestrator,
  DebateStatus,
  type DebateEventHandler,
  type DebateEvent,
  type DebateSession,
} from '@/services/debate';
import { AIService } from '@/services/aiAdapter';
import type { Message } from '@/types';
import { RecordController } from '@/services/demo/RecordController';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { createMockChatSession, createMockMessage } from '../../../test-utils/fixtures';
import type { RootStateOverrides } from '../../../test-utils/services/state';
import { getFormat, getPresetForFormat } from '@/config/debate/formats';
import {
  getStreamingContentSnapshot,
  resetStreamingContentStore,
} from '@/services/streaming/StreamingContentStore';

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

const createDebateSession = (overrides: Partial<DebateSession> = {}): DebateSession => {
  const preset = getPresetForFormat('oxford', 'short');
  return {
    id: 'debate-1',
    topic: 'AI',
    participants: [],
    personalities: {},
    startTime: 0,
    status: DebateStatus.IDLE,
    currentRound: 1,
    messageCount: 0,
    messageIndex: 0,
    currentAIIndex: 0,
    totalRounds: 3,
    totalMessages: preset.messages.length,
    civility: 3,
    format: getFormat('oxford'),
    preset,
    presetId: preset.id,
    stances: {},
    ...overrides,
  };
};

/**
 * A real DebateOrchestrator (no AI keys) whose session, lifecycle calls, and
 * event bus are stubbed so tests can drive the hook by emitting events.
 */
class MockOrchestrator {
  public readonly instance = new DebateOrchestrator(new AIService());
  public session = createDebateSession();
  private handlers = new Set<DebateEventHandler>();
  public startDebate = jest.spyOn(this.instance, 'startDebate').mockResolvedValue(undefined);
  public continueDebate = jest.spyOn(this.instance, 'continueDebate').mockImplementation(() => undefined);
  public submitAudienceQuestions = jest
    .spyOn(this.instance, 'submitAudienceQuestions')
    .mockImplementation(() => undefined);

  constructor() {
    jest.spyOn(this.instance, 'getSession').mockImplementation(() => this.session);
    jest.spyOn(this.instance, 'addEventListener').mockImplementation((handler) => {
      this.handlers.add(handler);
    });
    jest.spyOn(this.instance, 'removeEventListener').mockImplementation((handler) => {
      this.handlers.delete(handler);
    });
  }

  emit(event: DebateEvent) {
    this.handlers.forEach(handler => handler(event));
  }
}

describe('useDebateFlow', () => {
  const recordController = jest.mocked(RecordController);

  beforeEach(() => {
    jest.clearAllMocks();
    resetStreamingContentStore();
  });

  afterEach(() => {
    resetStreamingContentStore();
  });

  const initialMessages: Message[] = [
    createMockMessage({ id: 'user-1', content: 'Let us debate', timestamp: 1 }),
  ];

  const baseState: RootStateOverrides = {
    chat: {
      currentSession: createMockChatSession({
        id: 'debate-session',
        selectedAIs: [],
        messages: initialMessages,
        createdAt: 0,
        sessionType: 'debate',
      }),
    },
  };

  it('links orchestrator events to redux state and starts debate once', async () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateFlow(orchestrator.instance), {
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
    expect(result.current.totalMessages).toBe(6);
    expect(result.current.currentMessageIndex).toBe(0);
    expect(result.current.currentTurnLabel).toBe('Affirmative Opening Statement');

    act(() => {
      orchestrator.emit({ type: 'round_changed', data: { round: 2 }, timestamp: Date.now() });
    });
    expect(result.current.currentRound).toBe(2);

    act(() => {
      orchestrator.emit({
        type: 'typing_started',
        data: {
          aiName: 'Claude',
          messageIndex: 2,
          messageLabel: 'Affirmative Floor Speech',
          phase: 'rebuttal',
        },
        timestamp: Date.now(),
      });
    });
    expect(store.getState().chat.typingAIs).toContain('Claude');
    expect(result.current.currentMessageIndex).toBe(2);
    expect(result.current.currentTurnLabel).toBe('Affirmative Floor Speech');

    act(() => {
      orchestrator.emit({ type: 'typing_stopped', data: { aiName: 'Claude' }, timestamp: Date.now() });
    });
    expect(store.getState().chat.typingAIs).not.toContain('Claude');

    act(() => {
      orchestrator.emit({
        type: 'stream_started',
        data: {
          messageId: 'm1',
          aiProvider: 'claude',
          messageIndex: 1,
          messageLabel: 'Cross-Examination (CX)',
          phase: 'cross_examination',
          cxRole: 'questioner',
        },
        timestamp: Date.now(),
      });
    });
    expect(store.getState().streaming.streamingMessages.m1).toBeDefined();
    expect(result.current.currentMessageIndex).toBe(1);
    expect(result.current.currentTurnLabel).toBe('Cross-Examination (CX) · questioning');

    act(() => {
      orchestrator.emit({
        type: 'voting_started',
        data: { round: 2, votingLabel: 'Cross-Examination' },
        timestamp: Date.now(),
      });
    });
    expect(result.current.currentTurnLabel).toBe('Vote: Cross-Examination');

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
    const { result, store } = renderHookWithProviders(() => useDebateFlow(orchestrator.instance), {
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
    expect(getStreamingContentSnapshot('stream-1')).toMatchObject({
      content: 'Hello world',
      chunksReceived: 2,
      isStreaming: true,
    });

    act(() => {
      orchestrator.emit({ type: 'stream_error', data: { messageId: 'stream-1', error: 'network' }, timestamp: Date.now() });
    });
    expect(store.getState().streaming.streamingMessages['stream-1'].error).toBe('network');
    expect(getStreamingContentSnapshot('stream-1')).toMatchObject({
      error: 'network',
      isStreaming: false,
      status: 'failed',
    });

    act(() => {
      orchestrator.emit({ type: 'stream_started', data: { messageId: 'ai-1', aiProvider: 'claude' }, timestamp: Date.now() });
    });

    act(() => {
      orchestrator.emit({
        type: 'stream_completed',
        data: { messageId: 'ai-1', finalContent: 'Final rebuttal', modelUsed: 'claude-3', webSearchEnabled: true },
        timestamp: Date.now(),
      });
    });

    const updatedMessage = store.getState().chat.currentSession?.messages.find(m => m.id === 'ai-1');
    expect(updatedMessage?.content).toBe('Final rebuttal');
    expect(updatedMessage?.metadata?.modelUsed).toBe('claude-3');
    expect(updatedMessage?.metadata?.webSearchEnabled).toBe(true);
    expect(store.getState().streaming.streamingMessages['ai-1'].isStreaming).toBe(false);

    act(() => {
      orchestrator.emit({ type: 'error_occurred', data: { error: { message: 'boom' } }, timestamp: Date.now() });
    });
    expect(result.current.error).toBe('boom');

    warnSpy.mockRestore();
  });

  it('surfaces continuation prompts and resumes the orchestrator on request', () => {
    const orchestrator = new MockOrchestrator();
    const { result } = renderHookWithProviders(() => useDebateFlow(orchestrator.instance), {
      preloadedState: baseState,
    });

    act(() => {
      orchestrator.emit({
        type: 'continuation_required',
        data: {
          title: 'Opening speeches complete',
          message: 'Review the last two speeches or finish any voice clips before the next round begins.',
          buttonLabel: 'Continue Debate',
          isFinalReview: false,
          completedMessageIndex: 1,
          nextMessageIndex: 2,
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.isDebateActive).toBe(true);
    expect(result.current.currentMessageIndex).toBe(1);
    expect(result.current.currentTurnLabel).toBe('Opening speeches complete');
    expect(result.current.continuation).toEqual(expect.objectContaining({
      title: 'Opening speeches complete',
      buttonLabel: 'Continue Debate',
      isFinalReview: false,
      nextMessageIndex: 2,
    }));

    act(() => {
      result.current.continueDebate();
    });

    expect(orchestrator.continueDebate).toHaveBeenCalledTimes(1);
    expect(result.current.continuation).toBeNull();
  });

  it('surfaces audience question prompts and submits questions to the orchestrator', () => {
    const orchestrator = new MockOrchestrator();
    const { result } = renderHookWithProviders(() => useDebateFlow(orchestrator.instance), {
      preloadedState: baseState,
    });

    act(() => {
      orchestrator.emit({
        type: 'audience_questions_requested',
        data: {
          title: 'Audience questions',
          message: 'Enter one question for each side.',
          completedMessageIndex: 3,
          nextMessageIndex: 4,
          affirmativeLabel: 'Affirmative',
          negativeLabel: 'Negative',
          required: true,
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.isDebateActive).toBe(true);
    expect(result.current.currentMessageIndex).toBe(3);
    expect(result.current.currentTurnLabel).toBe('Audience questions');
    expect(result.current.continuation).toBeNull();
    expect(result.current.audienceQuestionsPrompt).toEqual(expect.objectContaining({
      title: 'Audience questions',
      nextMessageIndex: 4,
      required: true,
    }));

    act(() => {
      result.current.submitAudienceQuestions({
        aff: 'Question for aff?',
        neg: 'Question for neg?',
      });
    });

    expect(orchestrator.submitAudienceQuestions).toHaveBeenCalledWith({
      aff: 'Question for aff?',
      neg: 'Question for neg?',
    });
    expect(result.current.audienceQuestionsPrompt).toBeNull();
  });

  it('handles start errors, retries, and early exits', async () => {
    const orchestrator = new MockOrchestrator();
    orchestrator.startDebate.mockRejectedValueOnce(new Error('start failed'));
    const { result } = renderHookWithProviders(() => useDebateFlow(orchestrator.instance), {
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

    const { result, rerender } = renderHookWithProviders(
      ({ orchestrator }: { orchestrator: DebateOrchestrator | null }) => useDebateFlow(orchestrator),
      {
        initialProps: { orchestrator: orchestratorA.instance },
        preloadedState: baseState,
      }
    );

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

    await act(async () => {
      rerender({ orchestrator: orchestratorB.instance });
      await Promise.resolve();
    });

    expect(result.current.isDebateActive).toBe(false);
    expect(result.current.isDebateEnded).toBe(false);
    expect(result.current.currentRound).toBe(1);
    expect(result.current.currentMessageIndex).toBe(0);
    expect(result.current.totalMessages).toBe(0);

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
