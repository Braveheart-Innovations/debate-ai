import { DebateOrchestrator, DebateStatus } from '@/services/debate/DebateOrchestrator';
import { DEBATE_CONSTANTS } from '@/config/debateConstants';
import { getPresetForFormat } from '@/config/debate/formats';
import { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import type { AIService } from '@/services/aiAdapter';
import type { AI, DebateVoiceConfig, Message } from '@/types';
import type { AdapterCapabilities, FormattedMessage, SendMessageResponse } from '@/services/ai/types/adapter.types';
import { setProviderVerificationError } from '@/store/streamingSlice';
import { createMockAIConfig, createMockUser } from '@test-utils/fixtures';
import { buildRootState } from '@test-utils/services/state';

// A realistic-length debate speech for stubs (above the assessTurn short-fragment floor).
const VALID_SPEECH = 'Cancel culture, properly understood, is communities choosing to withdraw their support from people who have caused real and demonstrable harm. That is a feature of free association, not a flaw, and the proposition has offered no principled reason why ordinary citizens should be compelled to keep platforming those who abuse their influence.';

/**
 * The AIService surface the orchestrator calls: getAdapter/sendMessage, plus
 * ensureAdapter when the service has it (fakes omit it to take the
 * getAdapter path). The fakes return lightweight adapter doubles, and
 * AIService is a class with private state, so a structural fake can only be
 * passed through this one narrowing cast (AIService is assignable to it).
 */
interface FakeAIService {
  getAdapter: (...args: never[]) => unknown;
  sendMessage: (...args: never[]) => unknown;
  ensureAdapter?: (...args: never[]) => unknown;
}
const asAIService = (fake: FakeAIService): AIService => fake as AIService;

const mockMergeAvailabilitiesStrict = jest.fn();
jest.mock('@/hooks/multimodal/useModalityAvailability', () => ({
  mergeAvailabilitiesStrict: (...args: unknown[]) => mockMergeAvailabilitiesStrict(...args),
}));

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
  isStreamInterruptedError: jest.fn(() => false),
}));

// The orchestrator only reads `store`; `createAppStore` stays real so
// buildRootState can derive a complete RootState for getState() stubs.
jest.mock('@/store', () => ({
  createAppStore: jest.requireActual<typeof import('@/store')>('@/store').createAppStore,
  store: {
    dispatch: jest.fn(),
    getState: jest.fn(),
  },
}));

const { store } = jest.requireMock<typeof import('@/store')>('@/store');

const buildDefaultState = () =>
  buildRootState({
    user: { currentUser: createMockUser({ subscription: 'free' }) },
    streaming: {
      streamingPreferences: {
        claude: { enabled: true, supported: true },
        'gpt-4': { enabled: true, supported: true },
      },
      globalStreamingEnabled: true,
      providerVerificationErrors: {},
    },
    settings: {
      expertMode: {},
    },
  });

const participants: AI[] = [
  createMockAIConfig({
    id: 'claude',
    provider: 'claude',
    name: 'Claude',
    model: 'claude-3-opus',
  }),
  createMockAIConfig({
    id: 'gpt-4',
    provider: 'openai',
    name: 'GPT-4',
    model: 'gpt-4.1-mini',
  }),
];

const debateAdapterCapabilities: AdapterCapabilities = {
  streaming: false,
  attachments: false,
  functionCalling: false,
  systemPrompt: true,
  maxTokens: 4096,
  contextWindow: 200000,
};

class FormattingDebateAdapter extends BaseAdapter {
  formattedHistories: FormattedMessage[][] = [];

  async sendMessage(
    _message: string,
    conversationHistory: Message[] = [],
  ): Promise<SendMessageResponse> {
    this.formattedHistories.push(this.formatHistory(conversationHistory));
    return {
      // Identity prefix (for history-isolation assertions) + realistic length so it clears the
      // assessTurn short-fragment floor and does not trigger a fallback.
      response: `${this.config.identityId || this.config.provider} response. ${VALID_SPEECH}`,
      modelUsed: this.config.model,
    };
  }

  getCapabilities(): AdapterCapabilities {
    return debateAdapterCapabilities;
  }
}

describe('DebateOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(store.getState).mockReturnValue(buildDefaultState());
    mockStreamingService.streamResponse.mockReset();
    mockStreamingService.cancelAllStreams.mockReset();
    mockStreamingService.cancelStream.mockReset();
    // Default: web search not supported
    mockMergeAvailabilitiesStrict.mockReturnValue({
      webSearch: { supported: false },
      imageUpload: { supported: false },
      documentUpload: { supported: false },
      imageGeneration: { supported: false },
      videoGeneration: { supported: false },
    });
  });

  it('throws when debate setup validation fails', async () => {
    const orchestrator = new DebateOrchestrator(asAIService({
      getAdapter: jest.fn(),
      sendMessage: jest.fn(),
    }));

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
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
      onError?.(new Error('Streaming requires organization verification'));
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const session = await orchestrator.initializeDebate('AI ethics', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
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

  it('marks exhausted streamed provider failures as retryable paused turns', async () => {
    const googleParticipants: AI[] = [
      createMockAIConfig({
        id: 'google-pro',
        provider: 'google',
        name: 'Gemini Pro',
        model: 'gemini-3.5-flash',
      }),
      participants[1],
    ];
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: true })),
      sendMessage: jest.fn().mockRejectedValue(new Error('Invalid API key')),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };

    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn(),
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
      onError?.(new Error('Gemini error (400): invalid model name'));
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const completedEvents: Array<Record<string, unknown>> = [];
    const continuationEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'stream_completed') completedEvents.push(event.data);
      if (event.type === 'continuation_required') continuationEvents.push(event.data);
    });

    await orchestrator.initializeDebate('AI ethics', googleParticipants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
    await orchestrator.startDebate([]);

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(completedEvents[0]).toEqual(expect.objectContaining({
      lifecycle: expect.objectContaining({
        status: 'failed',
        retryable: true,
      }),
    }));
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      continueAction: 'retry_message',
      retryMessageId: completedEvents[0].messageId,
      buttonLabel: 'Retry Turn',
    }));
  });

  it('treats fallback error placeholder text as a retryable paused turn', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const googleParticipants: AI[] = [
      createMockAIConfig({
        id: 'gemini-2',
        provider: 'google',
        name: 'Gemini 2',
        model: 'gemini-3.5-flash',
      }),
      participants[1],
    ];
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: true })),
      sendMessage: jest.fn().mockResolvedValue({
        response: DEBATE_CONSTANTS.MESSAGES.ERROR('Gemini 2'),
      }),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };

    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn(),
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
      onError?.(new Error('Network connection failed'));
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const completedEvents: Array<Record<string, unknown>> = [];
    const continuationEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'stream_completed') completedEvents.push(event.data);
      if (event.type === 'continuation_required') continuationEvents.push(event.data);
    });

    await orchestrator.initializeDebate('AI ethics', googleParticipants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
    await orchestrator.startDebate([]);

    expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(completedEvents[0]).toEqual(expect.objectContaining({
      finalContent: expect.stringContaining('Gemini 2 could not finish this turn'),
      lifecycle: expect.objectContaining({
        status: 'failed',
        retryable: true,
      }),
    }));
    expect(String(completedEvents[0].finalContent)).not.toContain('Continuing');
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      continueAction: 'retry_message',
      retryMessageId: completedEvents[0].messageId,
      buttonLabel: 'Retry Turn',
    }));
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE);

    setTimeoutSpy.mockRestore();
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
      onComplete?.(VALID_SPEECH);
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));

    await orchestrator.initializeDebate('Climate policy', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
    await orchestrator.startDebate([]);

    expect(aiService.sendMessage).not.toHaveBeenCalled();
    expect(streamChunks).toHaveLength(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE);

    setTimeoutSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('emits typing while a streaming turn is being prepared', async () => {
    jest.useFakeTimers();
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

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
      onComplete?.('Prepared response');
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orchestrator.addEventListener(event => events.push({ type: event.type, data: event.data }));

    await orchestrator.initializeDebate('Climate policy', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
    await orchestrator.startDebate([]);

    const eventTypes = events.map(event => event.type);
    expect(events.find(event => event.type === 'typing_started')?.data).toEqual(expect.objectContaining({
      aiName: 'Claude',
      messageIndex: 0,
      messageLabel: 'Affirmative Constructive (AC)',
      phase: 'constructive',
    }));
    expect(eventTypes.indexOf('typing_started')).toBeLessThan(eventTypes.indexOf('message_added'));
    expect(eventTypes.indexOf('typing_started')).toBeLessThan(eventTypes.indexOf('stream_started'));
    expect(eventTypes.indexOf('typing_stopped')).toBeGreaterThan(eventTypes.indexOf('stream_started'));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('passes selected debate personality and model parameters into the adapter', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: true })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => 'adapter prompt'),
    };

    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn(),
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
      onComplete?.(VALID_SPEECH);
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    await orchestrator.initializeDebate('AI regulation should be stricter.', participants, { claude: 'george' }, { formatId: 'lincoln_douglas', rounds: 3, civility: 5 });
    await orchestrator.startDebate([]);

    expect(adapter.setTemporaryPersonality).toHaveBeenCalledWith(expect.objectContaining({
      id: 'george',
      systemPrompt: expect.stringContaining('PG-13 observational satirist'),
    }));
    expect(adapter.setTemporaryPersonality).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining('Affirmative (FOR)'),
    }));
    expect(adapter.config.parameters).toEqual(expect.objectContaining({
      temperature: 0.9,
      maxTokens: expect.any(Number),
    }));
    expect(adapter.config).toHaveProperty('parameters.maxTokens', 6144);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('maps legacy rounds values to selected presets', async () => {
    const orchestrator = new DebateOrchestrator(asAIService({
      getAdapter: jest.fn(),
      sendMessage: jest.fn(),
    }));

    const session = await orchestrator.initializeDebate('Climate policy', participants, {}, {
      formatId: 'policy',
      rounds: 5,
    });
    const policyStandard = getPresetForFormat('policy', 'standard');

    expect(session.presetId).toBe('standard');
    expect(session.preset).toEqual(policyStandard);
    expect(session.totalMessages).toBe(policyStandard.messages.length);
    expect(session.totalRounds).toBe(policyStandard.voteCount);
  });

  it('runs the Oxford short opening sequence from preset messages', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
    });

    await orchestrator.executeDebateMessage(0, []);
    await orchestrator.executeDebateMessage(1, []);

    expect(aiService.sendMessage.mock.calls[0][0]).toBe('claude');
    expect(aiService.sendMessage.mock.calls[0][1]).toContain('Turn: Affirmative Opening Statement');
    expect(aiService.sendMessage.mock.calls[0][1]).toContain('Length guidance: Keep this as a compact opening');
    expect(aiService.sendMessage.mock.calls[0][1]).not.toContain('words maximum');
    expect(aiService.sendMessage.mock.calls[1][0]).toBe('openai');
    expect(aiService.sendMessage.mock.calls[1][1]).toContain('Turn: Negative Opening Statement');

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requires opening audience stance before an Oxford debate starts', async () => {
    jest.useFakeTimers();
    const aiService = {
      getAdapter: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const votingEvents: Array<Record<string, unknown>> = [];
    const typingEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'voting_started' || event.type === 'voting_completed') {
        votingEvents.push(event.data);
      }
      if (event.type === 'typing_started') {
        typingEvents.push(event.data);
      }
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
    });
    await orchestrator.startDebate([]);

    expect(aiService.sendMessage).not.toHaveBeenCalled();
    expect(votingEvents[0]).toEqual(expect.objectContaining({
      voteKind: 'audience_stance',
      audienceVoteStage: 'initial',
      votingLabel: 'Opening Audience Stance',
    }));

    await orchestrator.recordVote(0, 'undecided');

    expect(votingEvents[1]).toEqual(expect.objectContaining({
      voteKind: 'audience_stance',
      audienceVoteStage: 'initial',
    }));
    expect(typingEvents[0]).toEqual(expect.objectContaining({
      aiName: 'Claude',
      messageIndex: 0,
      messageLabel: 'Affirmative Opening Statement',
      phase: 'opening',
    }));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('emits a podcast intro interstitial after the opening audience stance', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const mcAdapter = {
      config: {} as Record<string, unknown>,
      sendMessage: jest.fn().mockResolvedValue({ response: "Welcome to tonight's debate.", modelUsed: 'gpt-5' }),
      setTemporaryPersonality: jest.fn(),
    };
    const turnAdapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn((provider: string) => (provider === 'claude' ? turnAdapter : undefined)),
      ensureAdapter: jest.fn(async (adapterId: string) => (
        adapterId.startsWith('podcast-mc:') ? mcAdapter : turnAdapter
      )),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH, modelUsed: 'claude-3-opus' }),
    };
    const voiceConfig: DebateVoiceConfig = {
      enabled: true,
      providerId: 'elevenlabs',
      debaterVoices: {},
      podcast: {
        enabled: true,
        scriptMode: 'byok_ai',
        outputMode: 'playlist',
        mc: {
          id: 'mc-1',
          provider: 'openai',
          name: 'Podcast MC',
          model: 'gpt-5',
        },
        mcVoice: {
          voiceId: 'voice-host',
          voiceName: 'Host Voice',
        },
      },
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    orchestrator.addEventListener(event => events.push({ type: event.type, data: event.data }));

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
      voiceConfig,
    });
    await orchestrator.startDebate([]);

    expect(mcAdapter.sendMessage).not.toHaveBeenCalled();
    expect(aiService.sendMessage).not.toHaveBeenCalled();
    expect(events.some((event) => (
      event.type === 'message_added' &&
      Boolean((event.data.message as Message | undefined)?.metadata?.debateInterstitial?.kind === 'intro')
    ))).toBe(false);
    expect(events[1]).toEqual(expect.objectContaining({
      type: 'voting_started',
      data: expect.objectContaining({
        voteKind: 'audience_stance',
        audienceVoteStage: 'initial',
      }),
    }));

    await orchestrator.recordVote(0, 'undecided');

    const voteCompletedIndex = events.findIndex((event) => (
      event.type === 'voting_completed' &&
      event.data.audienceVoteStage === 'initial'
    ));
    const introIndex = events.findIndex((event) => (
      event.type === 'message_added' &&
      (event.data.message as Message | undefined)?.metadata?.debateInterstitial?.kind === 'intro'
    ));
    expect(voteCompletedIndex).toBeGreaterThan(-1);
    expect(introIndex).toBeGreaterThan(voteCompletedIndex);

    const introMessage = events[introIndex].data.message as Message;
    expect(aiService.ensureAdapter).toHaveBeenCalledWith('podcast-mc:mc-1:gpt-5', 'openai', 'gpt-5');
    expect(mcAdapter.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Write one concise podcast host interstitial'),
      [],
      undefined,
      undefined,
      'gpt-5'
    );
    expect(mcAdapter.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      setTimeoutSpy.mock.invocationCallOrder[0]
    );
    expect(introMessage.content).toBe("Welcome to tonight's debate.");
    expect(introMessage.metadata?.debateInterstitial).toMatchObject({
      kind: 'intro',
      flowStep: 'podcast_intro',
      generatedByProvider: 'openai',
      generatedByModel: 'gpt-5',
      usedTemplateFallback: false,
    });
    expect(aiService.sendMessage).not.toHaveBeenCalled();
    expect(events.slice(introIndex + 1).some((event) => event.type === 'typing_started')).toBe(false);
    expect(setTimeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE
    );

    await jest.advanceTimersByTimeAsync(DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);

    expect(aiService.sendMessage).toHaveBeenCalledWith(
      'claude',
      expect.any(String),
      [],
      expect.any(Object),
      undefined,
      expect.objectContaining({ maxTokens: 1536 }),
      'claude-sonnet-5-5'
    );
    expect(mcAdapter.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      aiService.sendMessage.mock.invocationCallOrder[0]
    );

    const typingIndex = events.findIndex((event, index) => (
      index > introIndex && event.type === 'typing_started'
    ));
    expect(typingIndex).toBeGreaterThan(introIndex);
    expect(events[typingIndex]).toEqual(expect.objectContaining({
      type: 'typing_started',
      data: expect.objectContaining({
        messageIndex: 0,
        messageLabel: 'Affirmative Opening Statement',
      }),
    }));
    expect(events[typingIndex + 1]).toEqual(expect.objectContaining({
      type: 'message_added',
      data: expect.objectContaining({
        message: expect.objectContaining({
          senderType: 'ai',
          content: VALID_SPEECH,
        }),
      }),
    }));

    setTimeoutSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps same-provider podcast MC and debater adapter parameters isolated', async () => {
    jest.useFakeTimers();
    const mcAdapter = {
      config: {} as Record<string, unknown>,
      sendMessage: jest.fn().mockResolvedValue({ response: "Welcome to tonight's debate.", modelUsed: 'gpt-5' }),
      setTemporaryPersonality: jest.fn(),
    };
    const debaterAdapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH, modelUsed: 'gpt-5' }),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(),
      ensureAdapter: jest.fn(async (adapterId: string) => (
        adapterId.startsWith('podcast-mc:') ? mcAdapter : debaterAdapter
      )),
      sendMessage: jest.fn(),
    };
    const sameProviderParticipants: AI[] = [
      createMockAIConfig({
        id: 'openai-debater-1',
        provider: 'openai',
        name: 'ChatGPT',
        model: 'gpt-5',
      }),
      participants[0],
    ];
    const voiceConfig: DebateVoiceConfig = {
      enabled: true,
      providerId: 'elevenlabs',
      debaterVoices: {},
      podcast: {
        enabled: true,
        scriptMode: 'byok_ai',
        outputMode: 'playlist',
        mc: {
          id: 'mc-1',
          provider: 'openai',
          name: 'Podcast MC',
          model: 'gpt-5',
        },
        mcVoice: {
          voiceId: 'voice-host',
          voiceName: 'Host Voice',
        },
      },
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const addedMessages: Message[] = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'message_added') {
        addedMessages.push(event.data.message as Message);
      }
    });

    await orchestrator.initializeDebate('AI ethics', sameProviderParticipants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 3,
      voiceConfig,
    });
    await orchestrator.startDebate([]);

    expect(mcAdapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(debaterAdapter.sendMessage).not.toHaveBeenCalled();
    expect(aiService.ensureAdapter).toHaveBeenCalledWith('podcast-mc:mc-1:gpt-5', 'openai', 'gpt-5');
    expect(mcAdapter.config).not.toHaveProperty('parameters');

    await jest.advanceTimersByTimeAsync(DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);

    expect(aiService.ensureAdapter).toHaveBeenCalledWith('openai-debater-1', 'openai', 'gpt-5');
    expect(debaterAdapter.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Turn: Affirmative Constructive (AC)'),
      [],
      undefined,
      undefined,
      'gpt-5'
    );
    expect(debaterAdapter.config.parameters).toEqual(expect.objectContaining({
      maxTokens: 1536,
    }));
    expect(debaterAdapter.config.parameters).not.toEqual(expect.objectContaining({
      maxTokens: 1024,
    }));
    expect(mcAdapter.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      debaterAdapter.sendMessage.mock.invocationCallOrder[0]
    );
    expect(addedMessages.find((message) => message.senderType === 'ai')?.metadata).toEqual(expect.objectContaining({
      aiId: 'openai-debater-1',
      providerId: 'openai',
    }));
    expect(aiService.sendMessage).not.toHaveBeenCalled();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps same-provider debater histories separated by logical aiId', async () => {
    jest.useFakeTimers();
    const firstAdapter = new FormattingDebateAdapter({
      provider: 'openai',
      identityId: 'openai-slot-1',
      apiKey: 'key',
      model: 'gpt-5',
    });
    const secondAdapter = new FormattingDebateAdapter({
      provider: 'openai',
      identityId: 'openai-slot-2',
      apiKey: 'key',
      model: 'gpt-5',
    });
    const adapters: Record<string, FormattingDebateAdapter> = {
      'openai-slot-1': firstAdapter,
      'openai-slot-2': secondAdapter,
    };
    const aiService = {
      getAdapter: jest.fn(),
      ensureAdapter: jest.fn(async (adapterId: string) => adapters[adapterId]),
      sendMessage: jest.fn(),
    };
    const sameProviderParticipants: AI[] = [
      createMockAIConfig({
        id: 'openai-slot-1',
        provider: 'openai',
        name: 'ChatGPT 1',
        model: 'gpt-5',
      }),
      createMockAIConfig({
        id: 'openai-slot-2',
        provider: 'openai',
        name: 'ChatGPT 2',
        model: 'gpt-5',
      }),
    ];
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const addedMessages: Message[] = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'message_added') {
        addedMessages.push(event.data.message as Message);
      }
    });

    await orchestrator.initializeDebate('AI ethics', sameProviderParticipants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 3,
    });

    await orchestrator.executeDebateMessage(0, []);
    const firstMessage = addedMessages.find((message) => message.senderType === 'ai');
    expect(firstMessage?.metadata).toEqual(expect.objectContaining({
      aiId: 'openai-slot-1',
      providerId: 'openai',
    }));

    await orchestrator.executeDebateMessage(1, firstMessage ? [firstMessage] : []);
    const secondMessage = addedMessages.filter((message) => message.senderType === 'ai')[1];

    expect(secondAdapter.formattedHistories[0]).toEqual([
      { role: 'user', content: `[ChatGPT 1 (Default)] openai-slot-1 response. ${VALID_SPEECH}` },
    ]);
    expect(secondMessage?.metadata).toEqual(expect.objectContaining({
      aiId: 'openai-slot-2',
      providerId: 'openai',
    }));
    expect(aiService.ensureAdapter).toHaveBeenCalledWith('openai-slot-1', 'openai', 'gpt-5');
    expect(aiService.ensureAdapter).toHaveBeenCalledWith('openai-slot-2', 'openai', 'gpt-5');
    expect(aiService.sendMessage).not.toHaveBeenCalled();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('retries an empty streamed first AI response with non-streaming fallback', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: true })),
      sendMessage: jest.fn().mockResolvedValue({
        response: VALID_SPEECH,
        modelUsed: 'claude-sonnet-5-5',
      }),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn(),
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
      onComplete?.('');
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const streamErrors: Array<Record<string, unknown>> = [];
    const completedEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'stream_error') streamErrors.push(event.data);
      if (event.type === 'stream_completed') completedEvents.push(event.data);
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 3,
    });
    await orchestrator.startDebate([]);

    expect(streamErrors[0]).toEqual(expect.objectContaining({
      error: 'Streaming returned an empty response',
      aiProvider: 'claude',
      messageIndex: 0,
    }));
    expect(adapter.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Turn: Affirmative Constructive (AC)'),
      [],
      undefined,
      undefined,
      'claude-sonnet-5-5'
    );
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]).toEqual(expect.objectContaining({
      finalContent: VALID_SPEECH,
      aiProvider: 'claude',
      messageIndex: 0,
    }));
    expect(aiService.sendMessage).not.toHaveBeenCalled();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not pass podcast MC copy as opening debater history', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: true })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: "Welcome to tonight's debate.", modelUsed: 'gpt-5' }),
    };
    const voiceConfig: DebateVoiceConfig = {
      enabled: true,
      providerId: 'elevenlabs',
      debaterVoices: {},
      podcast: {
        enabled: true,
        scriptMode: 'byok_ai',
        outputMode: 'playlist',
        mc: {
          id: 'mc-1',
          provider: 'openai',
          name: 'Podcast MC',
          model: 'gpt-5',
        },
        mcVoice: {
          voiceId: 'voice-host',
          voiceName: 'Host Voice',
        },
      },
    };

    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
      onComplete?.(VALID_SPEECH);
    });

    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 3,
      voiceConfig,
    });
    await orchestrator.startDebate([]);

    expect(mockStreamingService.streamResponse).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);

    const streamConfig = mockStreamingService.streamResponse.mock.calls[0][0] as { conversationHistory: Message[] };
    expect(streamConfig.conversationHistory).toEqual([]);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps pre-vote MC interstitials neutral when generated podcast copy judges a side', async () => {
    jest.useFakeTimers();
    const aiService = {
      getAdapter: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({
        response: 'The Affirmative is clearly stronger and already winning this debate.',
        modelUsed: 'gpt-5',
      }),
    };
    const voiceConfig: DebateVoiceConfig = {
      enabled: true,
      providerId: 'elevenlabs',
      debaterVoices: {},
      podcast: {
        enabled: true,
        scriptMode: 'byok_ai',
        outputMode: 'playlist',
        mc: {
          id: 'mc-1',
          provider: 'openai',
          name: 'Podcast MC',
          model: 'gpt-5',
        },
        mcVoice: {
          voiceId: 'voice-host',
          voiceName: 'Host Voice',
        },
      },
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const mcMessages: Message[] = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'message_added') {
        const message = event.data.message as Message | undefined;
        if (message?.metadata?.debateInterstitial) {
          mcMessages.push(message);
        }
      }
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
      voiceConfig,
    });
    await orchestrator.startDebate([]);
    expect(mcMessages).toHaveLength(0);

    await orchestrator.recordVote(0, 'undecided');

    expect(mcMessages[0].metadata?.debateInterstitial).toMatchObject({
      kind: 'intro',
      usedTemplateFallback: true,
    });
    expect(mcMessages[0].content).not.toContain('clearly stronger');
    expect(mcMessages[0].content).not.toContain('already winning');

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('pauses Oxford audience debates after speech pairs until the user continues', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const continuationEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required') {
        continuationEvents.push(event.data);
      }
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
    });

    await orchestrator.executeDebateMessage(0, []);
    expect(continuationEvents).toHaveLength(0);

    jest.clearAllTimers();
    setTimeoutSpy.mockClear();

    await orchestrator.executeDebateMessage(1, []);

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      title: 'Opening speeches complete',
      buttonLabel: 'Continue Debate',
      isFinalReview: false,
      completedMessageIndex: 1,
      nextMessageIndex: 2,
    }));
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    orchestrator.continueDebate();

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.ACTIVE);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION);

    setTimeoutSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requires explicit Oxford final review before showing the final audience vote', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const continuationEvents: Array<Record<string, unknown>> = [];
    const votingEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required') {
        continuationEvents.push(event.data);
      }
      if (event.type === 'voting_started') {
        votingEvents.push(event.data);
      }
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
    });

    await orchestrator.executeDebateMessage(5, []);

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      title: 'Closing speeches complete',
      buttonLabel: 'Cast Final Vote',
      isFinalReview: true,
      completedMessageIndex: 5,
    }));
    expect(votingEvents).toHaveLength(0);

    orchestrator.continueDebate();

    expect(votingEvents[0]).toEqual(expect.objectContaining({
      voteKind: 'audience_stance',
      audienceVoteStage: 'final',
      votingLabel: 'Final Audience Vote',
    }));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requires explicit review before showing a checkpoint vote', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const continuationEvents: Array<Record<string, unknown>> = [];
    const votingEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required') {
        continuationEvents.push(event.data);
      }
      if (event.type === 'voting_started') {
        votingEvents.push(event.data);
      }
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 3,
    });

    await orchestrator.executeDebateMessage(1, []);

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      title: 'Ready to vote: Value constructives',
      buttonLabel: 'Cast Vote',
      isFinalReview: false,
      completedMessageIndex: 1,
      continueAction: 'vote',
      voteRound: 1,
      isFinalRoundVote: false,
    }));
    expect(votingEvents).toHaveLength(0);

    orchestrator.continueDebate();

    expect(votingEvents[0]).toEqual(expect.objectContaining({
      round: 1,
      isFinalRound: false,
      isOverallVote: false,
      votingLabel: 'Value constructives',
    }));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requires explicit review before showing the final checkpoint vote', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const continuationEvents: Array<Record<string, unknown>> = [];
    const votingEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required') {
        continuationEvents.push(event.data);
      }
      if (event.type === 'voting_started') {
        votingEvents.push(event.data);
      }
    });

    await orchestrator.initializeDebate('AI ethics', participants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 3,
    });

    await orchestrator.executeDebateMessage(4, []);

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      title: 'Ready for final vote: 2AR ballot',
      buttonLabel: 'Cast Final Vote',
      isFinalReview: true,
      completedMessageIndex: 4,
      continueAction: 'vote',
      voteRound: 4,
      isFinalRoundVote: true,
    }));
    expect(votingEvents).toHaveLength(0);

    orchestrator.continueDebate();

    expect(votingEvents[0]).toEqual(expect.objectContaining({
      round: 4,
      isFinalRound: true,
      isOverallVote: false,
      votingLabel: '2AR ballot',
    }));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('maps Oxford full speeches across 2v2 proposition and opposition slots', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const teamParticipants: AI[] = [
      participants[0],
      participants[1],
      createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' }),
      createMockAIConfig({ id: 'grok', provider: 'grok', name: 'Grok', model: 'grok-4' }),
    ];
    const orchestrator = new DebateOrchestrator(asAIService(aiService));

    await orchestrator.initializeDebate('AI ethics', teamParticipants, {}, {
      formatId: 'oxford',
      rounds: 5,
    });

    await orchestrator.executeDebateMessage(0, []);
    await orchestrator.executeDebateMessage(1, []);
    await orchestrator.executeDebateMessage(2, []);
    await orchestrator.executeDebateMessage(3, []);

    expect(aiService.sendMessage.mock.calls.map((call) => call[0])).toEqual([
      'claude',
      'openai',
      'google',
      'grok',
    ]);
    expect(aiService.sendMessage.mock.calls[2][1]).toContain('Turn: Second Affirmative First Argument');
    expect(aiService.sendMessage.mock.calls[3][1]).toContain('Turn: Second Negative First Argument');
    expect(aiService.sendMessage.mock.calls[2][1]).toContain('Role brief: You are the Second Affirmative speaker for Affirmative (FOR).');
    expect(aiService.sendMessage.mock.calls[2][1]).toContain('Teammate: Claude.');
    expect(aiService.sendMessage.mock.calls[2][1]).toContain('Opposing team: GPT-4, Grok.');
    expect(aiService.sendMessage.mock.calls[2][1]).toContain('Audience context: the user casts an opening stance');
    expect(adapter.setTemporaryPersonality).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining('Your team role: Second Affirmative speaker'),
    }));
    expect(adapter.setTemporaryPersonality).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining('Teammate on Affirmative (FOR): Claude'),
    }));
    expect(adapter.setTemporaryPersonality).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining('Opposing team: GPT-4, Grok'),
    }));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not request audience questions for Oxford 1v1 or 2v2 presets', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const teamParticipants: AI[] = [
      participants[0],
      participants[1],
      createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' }),
      createMockAIConfig({ id: 'grok', provider: 'grok', name: 'Grok', model: 'grok-4' }),
    ];
    const questionEvents: Array<Record<string, unknown>> = [];

    const oneOnOne = new DebateOrchestrator(asAIService(aiService));
    oneOnOne.addEventListener(event => {
      if (event.type === 'audience_questions_requested') questionEvents.push(event.data);
    });
    await oneOnOne.initializeDebate('AI ethics', participants, {}, {
      formatId: 'oxford',
      rounds: 3,
    });
    await oneOnOne.executeDebateMessage(3, []);

    const twoOnTwo = new DebateOrchestrator(asAIService(aiService));
    twoOnTwo.addEventListener(event => {
      if (event.type === 'audience_questions_requested') questionEvents.push(event.data);
    });
    await twoOnTwo.initializeDebate('AI ethics', teamParticipants, {}, {
      formatId: 'oxford',
      rounds: 5,
    });
    await twoOnTwo.executeDebateMessage(3, []);

    expect(questionEvents).toHaveLength(0);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requests required audience questions after Oxford Q&A first arguments and injects them into answer turns', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const teamParticipants: AI[] = [
      participants[0],
      participants[1],
      createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' }),
      createMockAIConfig({ id: 'grok', provider: 'grok', name: 'Grok', model: 'grok-4' }),
    ];
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const continuationEvents: Array<Record<string, unknown>> = [];
    const questionEvents: Array<Record<string, unknown>> = [];
    const hostMessages: Message[] = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required') {
        continuationEvents.push(event.data);
      }
      if (event.type === 'audience_questions_requested') {
        questionEvents.push(event.data);
      }
      if (event.type === 'message_added') {
        const message = event.data.message as Message | undefined;
        if (message?.sender === 'Debate Host') {
          hostMessages.push(message);
        }
      }
    });

    await orchestrator.initializeDebate('AI ethics', teamParticipants, {}, {
      formatId: 'oxford',
      rounds: 7,
    });

    await orchestrator.executeDebateMessage(0, []);
    await orchestrator.executeDebateMessage(1, []);
    await orchestrator.executeDebateMessage(2, []);

    jest.clearAllTimers();
    setTimeoutSpy.mockClear();
    continuationEvents.length = 0;

    await orchestrator.executeDebateMessage(3, []);

    expect(orchestrator.getSession()?.status).toBe(DebateStatus.PAUSED_FOR_REVIEW);
    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      title: 'Audience questions',
      buttonLabel: 'Continue to Questions',
      isFinalReview: false,
      completedMessageIndex: 3,
      nextMessageIndex: 4,
      continueAction: 'audience_questions',
    }));
    expect(questionEvents).toHaveLength(0);
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    orchestrator.continueDebate();

    expect(questionEvents[0]).toEqual(expect.objectContaining({
      title: 'Audience questions',
      completedMessageIndex: 3,
      nextMessageIndex: 4,
      required: true,
    }));

    orchestrator.submitAudienceQuestions({
      aff: '  How would your side pay for this?  ',
      neg: 'Why is the status quo enough?',
    });

    expect(orchestrator.getSession()?.audienceQuestions).toEqual({
      aff: 'How would your side pay for this?',
      neg: 'Why is the status quo enough?',
    });
    const audienceQuestionMessage = hostMessages.find((message) => (
      message.content.includes('Audience questions submitted:')
    ));
    expect(audienceQuestionMessage?.content).toContain('Affirmative: How would your side pay for this?');
    expect(audienceQuestionMessage?.content).toContain('Negative: Why is the status quo enough?');
    expect(audienceQuestionMessage?.metadata?.debateAudienceQuestions).toEqual({
      aff: 'How would your side pay for this?',
      neg: 'Why is the status quo enough?',
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION);

    await orchestrator.executeDebateMessage(4, []);
    await orchestrator.executeDebateMessage(5, []);

    const affirmativeQuestionPrompt = aiService.sendMessage.mock.calls.find((call) => (
      String(call[1]).includes('Turn: Affirmative Audience Question Response')
    ))?.[1];
    const negativeQuestionPrompt = aiService.sendMessage.mock.calls.find((call) => (
      String(call[1]).includes('Turn: Negative Audience Question Response')
    ))?.[1];

    expect(affirmativeQuestionPrompt).toContain('Audience question for your side: "How would your side pay for this?"');
    expect(affirmativeQuestionPrompt).not.toContain('Why is the status quo enough?');
    expect(negativeQuestionPrompt).toContain('Audience question for your side: "Why is the status quo enough?"');
    expect(negativeQuestionPrompt).not.toContain('How would your side pay for this?');

    setTimeoutSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('includes the same speaker earlier argument in Oxford Q&A summary prompts as anti-repeat context', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const teamParticipants: AI[] = [
      participants[0],
      participants[1],
      createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' }),
      createMockAIConfig({ id: 'grok', provider: 'grok', name: 'Grok', model: 'grok-4' }),
    ];
    const earlierArgument: Message = {
      id: 'msg-earlier-gemini',
      sender: 'Gemini (Default)',
      senderType: 'ai',
      content: 'The affirmative first argument focused on funding, implementation risk, and public trust.',
      timestamp: 10,
      metadata: {
        aiId: 'gemini',
        providerId: 'google',
        debateSpeech: {
          formatId: 'oxford',
          presetId: 'long',
          messageIndex: 2,
          totalMessages: 8,
          phase: 'rebuttal',
          speaker: 'aff',
          speakerSlot: 1,
          label: 'Affirmative First Argument',
        },
      },
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));

    await orchestrator.initializeDebate('AI ethics', teamParticipants, {}, {
      formatId: 'oxford',
      rounds: 7,
    });
    await orchestrator.executeDebateMessage(6, [earlierArgument]);

    expect(aiService.sendMessage).toHaveBeenCalledWith(
      'google',
      expect.stringContaining('Turn: Affirmative Summary Speech'),
      expect.any(Array),
      expect.any(Object),
      undefined,
      expect.objectContaining({ maxTokens: 6144 }),
      'gemini-3.5-flash'
    );
    const summaryPrompt = aiService.sendMessage.mock.calls[0][1] as string;
    expect(summaryPrompt).toContain('Earlier speech by you to avoid repeating');
    expect(summaryPrompt).toContain('funding, implementation risk, and public trust');
    expect(summaryPrompt).toContain('Do not restate that speech');

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('adds MC audience question interstitials before podcast Q&A answers', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH, modelUsed: 'gpt-5' }),
    };
    const teamParticipants: AI[] = [
      participants[0],
      participants[1],
      createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' }),
      createMockAIConfig({ id: 'grok', provider: 'grok', name: 'Grok', model: 'grok-4' }),
    ];
    const voiceConfig: DebateVoiceConfig = {
      enabled: true,
      providerId: 'elevenlabs',
      debaterVoices: {},
      podcast: {
        enabled: true,
        scriptMode: 'byok_ai',
        outputMode: 'playlist',
        mc: {
          id: 'mc-1',
          provider: 'openai',
          name: 'Podcast MC',
          model: 'gpt-5',
        },
        mcVoice: {
          voiceId: 'voice-host',
          voiceName: 'Host Voice',
        },
      },
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const messageEvents: Message[] = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'message_added' && event.data.message) {
        messageEvents.push(event.data.message as Message);
      }
    });

    await orchestrator.initializeDebate('AI ethics', teamParticipants, {}, {
      formatId: 'oxford',
      rounds: 7,
      voiceConfig,
    });
    await orchestrator.executeDebateMessage(3, []);
    orchestrator.continueDebate();
    orchestrator.submitAudienceQuestions({
      aff: 'How would your side pay for this?',
      neg: 'Why is the status quo enough?',
    });

    await orchestrator.executeDebateMessage(4, []);
    expect(messageEvents.find((message) => (
      message.metadata?.debateSpeech?.label === 'Affirmative Audience Question Response'
    ))).toBeUndefined();
    await jest.advanceTimersByTimeAsync(DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);

    await orchestrator.executeDebateMessage(5, []);
    expect(messageEvents.find((message) => (
      message.metadata?.debateSpeech?.label === 'Negative Audience Question Response'
    ))).toBeUndefined();
    await jest.advanceTimersByTimeAsync(DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);

    const audienceQuestionCues = messageEvents.filter((message) => (
      message.metadata?.debateInterstitial?.kind === 'audience_question'
    ));
    expect(audienceQuestionCues).toHaveLength(2);
    expect(audienceQuestionCues[0].content).toContain('Claude');
    expect(audienceQuestionCues[0].content).toContain('How would your side pay for this?');
    expect(audienceQuestionCues[1].content).toContain('GPT-4');
    expect(audienceQuestionCues[1].content).toContain('Why is the status quo enough?');

    const affCueIndex = messageEvents.indexOf(audienceQuestionCues[0]);
    const affAnswerIndex = messageEvents.findIndex((message) => (
      message.metadata?.debateSpeech?.label === 'Affirmative Audience Question Response'
    ));
    const negCueIndex = messageEvents.indexOf(audienceQuestionCues[1]);
    const negAnswerIndex = messageEvents.findIndex((message) => (
      message.metadata?.debateSpeech?.label === 'Negative Audience Question Response'
    ));

    expect(affCueIndex).toBeGreaterThanOrEqual(0);
    expect(affCueIndex).toBeLessThan(affAnswerIndex);
    expect(negCueIndex).toBeGreaterThanOrEqual(0);
    expect(negCueIndex).toBeLessThan(negAnswerIndex);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps final Oxford review and final audience vote after Q&A summaries', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const teamParticipants: AI[] = [
      participants[0],
      participants[1],
      createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' }),
      createMockAIConfig({ id: 'grok', provider: 'grok', name: 'Grok', model: 'grok-4' }),
    ];
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const continuationEvents: Array<Record<string, unknown>> = [];
    const votingEvents: Array<Record<string, unknown>> = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required') {
        continuationEvents.push(event.data);
      }
      if (event.type === 'voting_started') {
        votingEvents.push(event.data);
      }
    });

    await orchestrator.initializeDebate('AI ethics', teamParticipants, {}, {
      formatId: 'oxford',
      rounds: 7,
    });
    await orchestrator.executeDebateMessage(3, []);
    orchestrator.continueDebate();
    orchestrator.submitAudienceQuestions({
      aff: 'What is your strongest tradeoff?',
      neg: 'What evidence would change your mind?',
    });

    continuationEvents.length = 0;
    await orchestrator.executeDebateMessage(7, []);

    expect(continuationEvents[0]).toEqual(expect.objectContaining({
      title: 'Closing speeches complete',
      buttonLabel: 'Cast Final Vote',
      isFinalReview: true,
      completedMessageIndex: 7,
    }));

    orchestrator.continueDebate();

    expect(votingEvents[0]).toEqual(expect.objectContaining({
      voteKind: 'audience_stance',
      audienceVoteStage: 'final',
      votingLabel: 'Final Audience Vote',
    }));

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses Lincoln-Douglas standard cross-examination roles', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));
    const addedMessages: Message[] = [];
    orchestrator.addEventListener(event => {
      if (event.type === 'message_added' && event.data.message) {
        addedMessages.push(event.data.message as Message);
      }
    });

    await orchestrator.initializeDebate('Resolved: privacy is more important than security.', participants, {}, {
      formatId: 'lincoln_douglas',
      rounds: 5,
    });

    await orchestrator.executeDebateMessage(1, []);
    await orchestrator.executeDebateMessage(2, []);

    expect(aiService.sendMessage.mock.calls[0][0]).toBe('openai');
    expect(aiService.sendMessage.mock.calls[0][1]).toContain('Turn: Cross-Examination (CX)');
    expect(aiService.sendMessage.mock.calls[0][1]).toContain('Ask pointed questions');
    expect(aiService.sendMessage.mock.calls[1][0]).toBe('claude');
    expect(aiService.sendMessage.mock.calls[1][1]).toContain('Answer directly');
    expect(addedMessages[0]?.metadata?.debateSpeech).toMatchObject({
      formatId: 'lincoln_douglas',
      presetId: 'standard',
      messageIndex: 1,
      totalMessages: 9,
      phase: 'cross_examination',
      speaker: 'neg',
      cxRole: 'questioner',
      label: 'Cross-Examination (CX)',
    });
    expect(addedMessages[1]?.metadata?.debateSpeech).toMatchObject({
      messageIndex: 2,
      speaker: 'aff',
      cxRole: 'answerer',
      label: 'Cross-Examination (CX)',
    });

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses Policy standard cross-examination and rebuttal ordering', async () => {
    jest.useFakeTimers();
    const adapter = {
      config: {} as Record<string, unknown>,
      getCapabilities: jest.fn(() => ({ streaming: false })),
      setTemporaryPersonality: jest.fn(),
      debugGetSystemPrompt: jest.fn(() => ''),
    };
    const aiService = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: VALID_SPEECH }),
    };
    const orchestrator = new DebateOrchestrator(asAIService(aiService));

    await orchestrator.initializeDebate('The city should adopt congestion pricing.', participants, {}, {
      formatId: 'policy',
      rounds: 5,
    });

    await orchestrator.executeDebateMessage(4, []);
    await orchestrator.executeDebateMessage(12, []);

    expect(aiService.sendMessage.mock.calls[0][0]).toBe('claude');
    expect(aiService.sendMessage.mock.calls[0][1]).toContain('Turn: CX after 1NC');
    expect(aiService.sendMessage.mock.calls[0][1]).toContain('Ask pointed questions');
    expect(aiService.sendMessage.mock.calls[1][0]).toBe('openai');
    expect(aiService.sendMessage.mock.calls[1][1]).toContain('Turn: 1NR');
    expect(orchestrator.getSession()?.messageIndex).toBe(12);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('web search support', () => {
    it('enables webSearchEnabled when both participants support web search', async () => {
      mockMergeAvailabilitiesStrict.mockReturnValue({
        webSearch: { supported: true },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const orchestrator = new DebateOrchestrator(asAIService({
        getAdapter: jest.fn(),
        sendMessage: jest.fn(),
      }));

      const session = await orchestrator.initializeDebate('AI ethics', participants);

      expect(session.webSearchEnabled).toBe(true);
      expect(mockMergeAvailabilitiesStrict).toHaveBeenCalledWith([
        { provider: 'claude', model: 'claude-sonnet-5-5' },
        { provider: 'openai', model: 'gpt-4.1-mini' },
      ]);
    });

    it('disables webSearchEnabled when participants do not support web search', async () => {
      mockMergeAvailabilitiesStrict.mockReturnValue({
        webSearch: { supported: false },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const orchestrator = new DebateOrchestrator(asAIService({
        getAdapter: jest.fn(),
        sendMessage: jest.fn(),
      }));

      const session = await orchestrator.initializeDebate('AI ethics', participants);

      expect(session.webSearchEnabled).toBe(false);
    });

    it('sets adapter.config.webSearchEnabled when streaming with web search enabled', async () => {
      jest.useFakeTimers();

      mockMergeAvailabilitiesStrict.mockReturnValue({
        webSearch: { supported: true },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const adapter = {
        config: {} as Record<string, unknown>,
        getCapabilities: jest.fn(() => ({ streaming: true })),
        setTemporaryPersonality: jest.fn(),
        debugGetSystemPrompt: jest.fn(() => ''),
      };

      const aiService = {
        getAdapter: jest.fn(() => adapter),
        sendMessage: jest.fn(),
      };

      mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
        onComplete?.(VALID_SPEECH);
      });

      const orchestrator = new DebateOrchestrator(asAIService(aiService));
      await orchestrator.initializeDebate('AI ethics', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
      await orchestrator.startDebate([]);

      expect(adapter.config.webSearchEnabled).toBe(true);

      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('does not set adapter.config.webSearchEnabled when web search is disabled', async () => {
      jest.useFakeTimers();

      mockMergeAvailabilitiesStrict.mockReturnValue({
        webSearch: { supported: false },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const adapter = {
        config: {} as Record<string, unknown>,
        getCapabilities: jest.fn(() => ({ streaming: true })),
        setTemporaryPersonality: jest.fn(),
        debugGetSystemPrompt: jest.fn(() => ''),
      };

      const aiService = {
        getAdapter: jest.fn(() => adapter),
        sendMessage: jest.fn(),
      };

      mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
        onComplete?.(VALID_SPEECH);
      });

      const orchestrator = new DebateOrchestrator(asAIService(aiService));
      await orchestrator.initializeDebate('AI ethics', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
      await orchestrator.startDebate([]);

      expect(adapter.config.webSearchEnabled).toBe(false);

      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('clears sticky adapter webSearchEnabled after a search-enabled debate', async () => {
      jest.useFakeTimers();

      const adapter = {
        config: {} as Record<string, unknown>,
        getCapabilities: jest.fn(() => ({ streaming: true })),
        setTemporaryPersonality: jest.fn(),
        debugGetSystemPrompt: jest.fn(() => ''),
      };

      const aiService = {
        getAdapter: jest.fn(() => adapter),
        sendMessage: jest.fn(),
      };

      mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => {
        onComplete?.(VALID_SPEECH);
      });

      mockMergeAvailabilitiesStrict.mockReturnValueOnce({
        webSearch: { supported: true },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const first = new DebateOrchestrator(asAIService(aiService));
      await first.initializeDebate('AI ethics', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
      await first.startDebate([]);
      expect(adapter.config.webSearchEnabled).toBe(true);

      mockMergeAvailabilitiesStrict.mockReturnValueOnce({
        webSearch: { supported: false },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const second = new DebateOrchestrator(asAIService(aiService));
      await second.initializeDebate('AI ethics', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
      await second.startDebate([]);
      expect(adapter.config.webSearchEnabled).toBe(false);

      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('preserves web search metadata and citations when streaming falls back', async () => {
      jest.useFakeTimers();

      mockMergeAvailabilitiesStrict.mockReturnValue({
        webSearch: { supported: true },
        imageUpload: { supported: false },
        documentUpload: { supported: false },
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const adapter = {
        config: {} as Record<string, unknown>,
        getCapabilities: jest.fn(() => ({ streaming: true })),
        setTemporaryPersonality: jest.fn(),
        debugGetSystemPrompt: jest.fn(() => ''),
      };
      const citations = [{ index: 1, url: 'https://example.com/source', title: 'Source' }];

      const aiService = {
        getAdapter: jest.fn(() => adapter),
        sendMessage: jest.fn().mockResolvedValue({
          response: VALID_SPEECH + ' [1]',
          metadata: { citations },
        }),
      };

      mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
        onError?.(new Error('Streaming requires organization verification'));
      });

      const orchestrator = new DebateOrchestrator(asAIService(aiService));
      const completedEvents: Array<Record<string, unknown>> = [];
      const addedMessages: Array<Record<string, unknown>> = [];
      orchestrator.addEventListener(event => {
        if (event.type === 'stream_completed') completedEvents.push(event.data);
        if (event.type === 'message_added') addedMessages.push(event.data);
      });

      await orchestrator.initializeDebate('AI ethics', participants, {}, { formatId: 'lincoln_douglas', rounds: 3 });
      await orchestrator.startDebate([]);

    expect(aiService.sendMessage).toHaveBeenCalledWith(
      'claude',
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        id: 'debate_default',
        systemPrompt: expect.stringContaining('[DEBATE MODE]'),
      }),
      undefined,
      expect.objectContaining({ maxTokens: 6144 }),
      'claude-sonnet-5-5'
    );
      expect(completedEvents[0]).toEqual(expect.objectContaining({
        webSearchEnabled: true,
        citations,
      }));
      expect(addedMessages[0].message).toEqual(expect.objectContaining({
        metadata: expect.objectContaining({ webSearchEnabled: true }),
      }));

      jest.clearAllTimers();
      jest.useRealTimers();
    });
  });
});
