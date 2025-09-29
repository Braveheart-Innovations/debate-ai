import { DebateOrchestrator, DebateStatus } from '@/services/debate/DebateOrchestrator';
import { DEBATE_CONSTANTS } from '@/config/debateConstants';
import type { AI, Message } from '@/types';
import { setProviderVerificationError } from '@/store/streamingSlice';

jest.mock('@/services/chat/StorageService', () => ({
  StorageService: {
    enforceStorageLimits: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockStreamingService = {
  streamResponse: jest.fn(),
  cancelStream: jest.fn(),
  cancelAllStreams: jest.fn(),
};

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: jest.fn(() => mockStreamingService),
}));

jest.mock('@/store', () => ({
  store: {
    dispatch: jest.fn(),
    getState: jest.fn(),
  },
}));

const { store } = jest.requireMock('@/store');

const defaultState = {
  user: { currentUser: { subscription: 'free' } },
  streaming: {
    streamingPreferences: {
      claude: { enabled: true },
      'gpt-4': { enabled: true },
    },
    globalStreamingEnabled: true,
    streamingSpeed: 'natural',
    providerVerificationErrors: {},
  },
  settings: {
    expertMode: {},
  },
};

const participants: AI[] = [
  {
    id: 'claude',
    provider: 'claude',
    name: 'Claude',
    model: 'claude-3-opus',
  } as AI,
  {
    id: 'gpt-4',
    provider: 'openai',
    name: 'GPT-4',
    model: 'gpt-4.1-mini',
  } as AI,
];

describe('DebateOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.getState.mockReturnValue(defaultState);
    mockStreamingService.streamResponse.mockReset();
    mockStreamingService.cancelAllStreams.mockReset();
    mockStreamingService.cancelStream.mockReset();
  });

  it('throws when debate setup validation fails', async () => {
    const orchestrator = new DebateOrchestrator({
      getAdapter: jest.fn(),
      sendMessage: jest.fn(),
    } as unknown as Parameters<typeof DebateOrchestrator>[0]);

    await expect(
      orchestrator.initializeDebate('Missing opponent', [participants[0]])
    ).rejects.toThrow('Invalid debate setup');
  });

  it('enables streaming fallback with verification error and schedules next turn', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {},
      getCapabilities: jest.fn(() => ({ streaming: true })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };

    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: 'Recovered after verification error' }),
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
      onError?.(new Error('Streaming requires organization verification'));
    });

    const orchestrator = new DebateOrchestrator(aiService as unknown as Parameters<typeof DebateOrchestrator>[0]);
    const session = await orchestrator.initializeDebate('AI ethics', participants, {}, { rounds: 1 });
    expect(session.status).toBe(DebateStatus.ACTIVE);

    const events: string[] = [];
    orchestrator.addEventListener(event => events.push(event.type));

    await orchestrator.startDebate([]);

    expect(aiService.sendMessage).toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalledWith(
      setProviderVerificationError({ providerId: 'claude', hasError: true })
    );
    expect(events).toContain('stream_error');
    expect(events).toContain('stream_completed');

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('schedules next turn after successful streaming', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const adapter = {
      config: {},
      getCapabilities: jest.fn(() => ({ streaming: true })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };

    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn(),
    };

    const streamChunks: string[] = [];
    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      if (onChunk) {
        onChunk('partial');
        streamChunks.push('partial');
      }
      onComplete?.('finalized');
    });

    const orchestrator = new DebateOrchestrator(aiService as unknown as Parameters<typeof DebateOrchestrator>[0]);

    await orchestrator.initializeDebate('Climate policy', participants, {}, { rounds: 1 });
    await orchestrator.startDebate([]);

    expect(aiService.sendMessage).not.toHaveBeenCalled();
    expect(streamChunks).toHaveLength(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE);

    setTimeoutSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
