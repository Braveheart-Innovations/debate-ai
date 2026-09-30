import { ChatOrchestrator } from '@/services/chat/ChatOrchestrator';
import { addMessage, setTypingAI, updateMessage, type AppDispatch } from '@/store';
import {
  startStreaming,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  setProviderVerificationError,
} from '@/store/streamingSlice';
import {
  getStreamingContentSnapshot,
  resetStreamingContentStore,
} from '@/services/streaming/StreamingContentStore';
import type { AI, ChatSession, Message } from '@/types';
import type { AIService } from '@/services/aiAdapter';

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: {
    isActive: jest.fn(() => false),
    recordAssistantChunk: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordImageMarkdown: jest.fn(),
  },
}));

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  getCurrentTurnProviders: jest.fn(() => []),
  markProviderComplete: jest.fn(),
}));

jest.mock('@/config/personalities', () => ({
  getPersonality: jest.fn((id: string) => (
    id === 'default'
      ? {
          id: 'default',
          name: 'Default',
          systemPrompt: 'Default assistant',
          signatureMoves: [],
        }
      : {
          id: 'persona',
          name: 'Persona',
          systemPrompt: 'Stay helpful',
          debatePrompt: 'Debate politely',
          chatGuidance: 'Be concise',
          compareGuidance: 'Compare clearly',
          signatureMoves: ['Stay useful.'],
          tone: { formality: 0.3, humor: 0.8, energy: 0.7, empathy: 0.5, technicality: 0.4 },
          modelParameters: { temperature: 0.91 },
        }
  )),
}));

jest.mock('@/utils/expertMode', () => ({
  getExpertOverrides: jest.fn(() => ({ enabled: false })),
}));

const mockStreamingService = {
  streamResponse: jest.fn(),
};

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: jest.fn(() => mockStreamingService),
  isStreamInterruptedError: jest.fn(() => false),
}));

describe('ChatOrchestrator', () => {
  const baseAI: AI = {
    id: 'claude',
    provider: 'claude',
    name: 'Claude',
    model: 'claude-3-opus',
  } as AI;
  const session: ChatSession = {
    id: 'session-1',
    selectedAIs: [baseAI],
    messages: [],
    isActive: true,
    createdAt: Date.now(),
    sessionType: 'chat',
  };

  const userMessage: Message = {
    id: 'msg-user',
    sender: 'You',
    senderType: 'user',
    content: 'Hello team',
    timestamp: Date.now(),
  };

  const buildParams = (overrides: Partial<Parameters<ChatOrchestrator['processUserMessage']>[0]> = {}) => ({
    userMessage,
    existingMessages: session.messages,
    mentions: [],
    aiPersonalities: { claude: 'persona' },
    selectedModels: { claude: 'claude-3-opus' },
    apiKeys: { claude: 'key-1' },
    expertModeConfigs: {},
    streamingPreferences: { claude: { enabled: true } },
    globalStreamingEnabled: true,
    allowStreaming: true,
    attachments: undefined,
    resumptionContext: undefined,
    enrichedPrompt: undefined,
    isDemo: false,
    ...overrides,
  });

  const createAdapter = () => ({
    config: {},
    getCapabilities: jest.fn(() => ({ streaming: true })),
    setTemporaryPersonality: jest.fn(),
    debugGetSystemPrompt: jest.fn(() => 'adapter prompt'),
  });

  const mockAIService = () => {
    const adapter = createAdapter();
    const service = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: 'fallback' }),
      setPersonality: jest.fn(),
    } as unknown as AIService;
    return { adapter, service };
  };

  const dispatchMock = jest.fn();
  const dispatch = dispatchMock as unknown as AppDispatch;

  beforeEach(() => {
    jest.clearAllMocks();
    dispatchMock.mockClear();
    (session.messages as Message[]).length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetStreamingContentStore();
  });

  it('streams responses when streaming is allowed and api key provided', async () => {
    const { adapter, service } = mockAIService();
    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      onChunk?.('chunk');
      onComplete?.('final');
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    await orchestrator.processUserMessage(buildParams());

    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: addMessage.type }));
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: startStreaming.type }));
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: endStreaming.type }));
    const startAction = dispatchMock.mock.calls
      .map(call => call[0])
      .find(action => action?.type === startStreaming.type);
    expect(getStreamingContentSnapshot(startAction.payload.messageId)).toMatchObject({
      content: 'final',
      isStreaming: false,
      status: 'completed',
    });
    expect(service.sendMessage).not.toHaveBeenCalled();
    expect(adapter.getCapabilities).toHaveBeenCalled();
    expect(service.setPersonality).toHaveBeenCalledWith('claude', expect.objectContaining({
      id: 'persona',
      systemPrompt: expect.stringContaining('Stay helpful'),
    }));
    expect(mockStreamingService.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          identityId: 'claude',
          personality: expect.objectContaining({
            id: 'persona',
            systemPrompt: expect.stringContaining('Stay helpful'),
          }),
          parameters: { temperature: 0.91 },
        }),
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('clears a reused adapter personality when default is selected', async () => {
    const { service } = mockAIService();
    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      onChunk?.('chunk');
      onComplete?.('final');
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    await orchestrator.processUserMessage(buildParams({ aiPersonalities: { claude: 'default' } }));

    expect(service.setPersonality).toHaveBeenCalledWith('claude', undefined);
    expect(mockStreamingService.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          personality: undefined,
          parameters: undefined,
        }),
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('falls back to non-streaming when streaming throws verification error', async () => {
    const { adapter, service } = mockAIService();
    mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
      onError?.(new Error('organization must be verified to stream'));
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    await orchestrator.processUserMessage(buildParams());

    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: streamingError.type }));
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: clearStreamingMessage.type }));
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: updateMessage.type }));
    expect(dispatchMock).toHaveBeenCalledWith(setProviderVerificationError({ providerId: 'claude', hasError: true }));
    expect(service.sendMessage).toHaveBeenCalledTimes(1);
    expect(adapter.getCapabilities).toHaveBeenCalled();
  });

  it('uses non-streaming path when streaming disabled and toggles typing indicators', async () => {
    const { adapter, service } = mockAIService();
    adapter.getCapabilities.mockReturnValue({ streaming: false });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    await orchestrator.processUserMessage(
      buildParams({ allowStreaming: false, streamingPreferences: { claude: { enabled: false } }, apiKeys: {} })
    );

    expect(dispatchMock).toHaveBeenCalledWith(setTypingAI({ ai: 'Claude', isTyping: true }));
    expect(dispatchMock).toHaveBeenCalledWith(setTypingAI({ ai: 'Claude', isTyping: false }));
    expect(service.sendMessage).toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: startStreaming.type }));
  });

  it('keeps resumed chat sessions out of debate mode despite stale debate marker text', async () => {
    const { service } = mockAIService();
    const staleHistory: Message[] = [
      {
        id: 'old-user',
        sender: 'You',
        senderType: 'user',
        content: '[DEBATE MODE] Previous corrupted marker',
        timestamp: Date.now() - 1000,
      },
    ];
    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      onChunk?.('chunk');
      onComplete?.('final');
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession({ ...session, sessionType: 'chat', messages: staleHistory });
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    await orchestrator.processUserMessage(buildParams({
      existingMessages: staleHistory,
    }));

    expect(mockStreamingService.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          isDebateMode: false,
        }),
        message: expect.not.stringContaining('[DEBATE MODE ACTIVE]'),
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('does not persist citation-only empty non-streaming answers', async () => {
    const { adapter, service } = mockAIService();
    adapter.getCapabilities.mockReturnValue({ streaming: false });
    (service.sendMessage as jest.Mock).mockResolvedValue({
      response: '  ',
      metadata: {
        citations: [{ index: 1, url: 'https://example.com' }],
      },
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    await orchestrator.processUserMessage(
      buildParams({ allowStreaming: false, streamingPreferences: { claude: { enabled: false } }, apiKeys: {} })
    );

    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
      type: addMessage.type,
      payload: expect.objectContaining({
        content: 'Claude returned source citations but no answer text. Please retry the request.',
        metadata: expect.objectContaining({
          citations: undefined,
        }),
      }),
    }));
  });

  it('uses demo api key when isDemo is true, ignoring stored api keys', async () => {
    const { service } = mockAIService();
    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      onChunk?.('chunk');
      onComplete?.('final');
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    // Call with isDemo: true and actual API keys - should use 'demo' instead
    await orchestrator.processUserMessage(
      buildParams({ isDemo: true, apiKeys: { claude: 'actual-key-123' } })
    );

    // Verify streamResponse was called with 'demo' as the API key, not 'actual-key-123'
    expect(mockStreamingService.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          apiKey: 'demo',
        }),
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('uses actual api key when isDemo is false', async () => {
    const { service } = mockAIService();
    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      onChunk?.('chunk');
      onComplete?.('final');
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);

    // Call with isDemo: false - should use actual API key
    await orchestrator.processUserMessage(
      buildParams({ isDemo: false, apiKeys: { claude: 'actual-key-123' } })
    );

    // Verify streamResponse was called with actual API key
    expect(mockStreamingService.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          apiKey: 'actual-key-123',
        }),
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  describe('multi-AI rounds', () => {
    const gemini = { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-x' } as AI;
    const chatgpt = { id: 'chatgpt', provider: 'openai', name: 'ChatGPT', model: 'gpt-x' } as AI;
    const claude = { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-x' } as AI;
    const trio: ChatSession = { ...session, selectedAIs: [gemini, chatgpt, claude] };
    const replies: Record<string, string> = {
      gemini: 'Coffee dehydrates you.',
      chatgpt: "Gemini overreached: coffee isn't meaningfully dehydrating.",
      claude: 'Agreed with ChatGPT, and here is more.',
    };

    const trioParams = (overrides: Partial<Parameters<ChatOrchestrator['processUserMessage']>[0]> = {}) => buildParams({
      aiPersonalities: {},
      selectedModels: {},
      apiKeys: { google: 'k', openai: 'k', claude: 'k' },
      streamingPreferences: {},
      userMessage: { ...userMessage, content: 'Is coffee bad for you?' },
      ...overrides,
    });

    const setup = () => {
      const { adapter, service } = mockAIService();
      (service as unknown as { getApiKey: jest.Mock }).getApiKey = jest.fn().mockResolvedValue('k');
      mockStreamingService.streamResponse.mockImplementation(async (config, _onChunk, onComplete) => {
        onComplete?.(replies[config.adapterConfig.identityId]);
      });
      const orchestrator = new ChatOrchestrator(service, dispatch);
      orchestrator.updateSession(trio);
      jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);
      return { adapter, service, orchestrator };
    };

    const streamCalls = () => mockStreamingService.streamResponse.mock.calls.map(call => call[0]);

    it("shows the third AI the whole round, labeled by speaker, not as its own words", async () => {
      const { orchestrator } = setup();
      await orchestrator.processUserMessage(trioParams());

      const calls = streamCalls();
      expect(calls.map(c => c.adapterConfig.identityId)).toEqual(['gemini', 'chatgpt', 'claude']);

      // Every responder gets the same prior-round history; this round lives in the turn prompt.
      calls.forEach(c => expect(c.conversationHistory).toEqual([]));

      const third = calls[2];
      expect(third.adapterConfig.groupChat).toEqual({ selfName: 'Claude', participants: ['Gemini', 'ChatGPT', 'Claude'] });
      expect(third.adapterConfig.isDebateMode).toBe(false);
      expect(third.message).toBe(
        "[User] Is coffee bad for you?\n\n"
        + '[Gemini] Coffee dehydrates you.\n\n'
        + "[ChatGPT] Gemini overreached: coffee isn't meaningfully dehydrating.\n\n"
        + "(Your turn, Claude: you're replying 3rd of 3, after Gemini and ChatGPT. Answer the user, engaging with the earlier replies where useful.)"
      );
      expect(calls[0].message).toContain("you're replying first; ChatGPT and Claude will reply after you.");
      expect(calls[1].message).toContain('[User] Is coffee bad for you?');
    });

    it('rotates the opener next round and passes prior replies with speaker identity', async () => {
      const { orchestrator } = setup();
      await orchestrator.processUserMessage(trioParams());
      const round1 = dispatchMock.mock.calls
        .map(call => call[0])
        .filter(action => action.type === addMessage.type)
        .map(action => action.payload as Message);
      const finalized = round1.map(m => ({ ...m, content: replies[m.metadata?.aiId as string] }));
      mockStreamingService.streamResponse.mockClear();

      const history = [{ ...userMessage, content: 'Is coffee bad for you?' }, ...finalized];
      await orchestrator.processUserMessage(trioParams({
        existingMessages: history,
        userMessage: { ...userMessage, id: 'u2', content: 'What about tea?' },
      }));

      const calls = streamCalls();
      expect(calls.map(c => c.adapterConfig.identityId)).toEqual(['chatgpt', 'claude', 'gemini']);
      expect(calls[0].conversationHistory.map((m: Message) => m.metadata?.aiId ?? 'user'))
        .toEqual(['user', 'gemini', 'chatgpt', 'claude']);
    });

    it('limits the round to mentioned AIs', async () => {
      const { orchestrator } = setup();
      await orchestrator.processUserMessage(trioParams({ mentions: ['claude'] }));

      const calls = streamCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].message).toBe('[User] Is coffee bad for you?\n\n(Your turn, Claude. Answer the user directly.)');
    });

    it('leaves failed turns out of later prompts', async () => {
      const { orchestrator } = setup();
      mockStreamingService.streamResponse.mockImplementation(async (config, _onChunk, onComplete) => {
        if (config.adapterConfig.identityId === 'gemini') throw new Error('boom');
        onComplete?.(replies[config.adapterConfig.identityId]);
      });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await orchestrator.processUserMessage(trioParams());

      const third = streamCalls()[2];
      expect(third.message).not.toContain('[Gemini]');
      expect(third.message).toContain("you're replying 3rd of 3, after ChatGPT.");
    });

    it('strips an echoed self-label from the reply', async () => {
      const { orchestrator } = setup();
      mockStreamingService.streamResponse.mockImplementation(async (config, _onChunk, onComplete) => {
        onComplete?.(`[${config.adapterConfig.identityId === 'claude' ? 'Claude' : 'X'}] hi`);
      });
      await orchestrator.processUserMessage(trioParams({ mentions: ['claude'] }));

      expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
        type: updateMessage.type,
        payload: expect.objectContaining({ content: 'hi' }),
      }));
    });

    it('configures shared adapters for group chat on the non-streaming path', async () => {
      const { adapter, service, orchestrator } = setup();
      adapter.getCapabilities.mockReturnValue({ streaming: false });
      (adapter.config as Record<string, unknown>).isDebateMode = true;
      await orchestrator.processUserMessage(trioParams({ allowStreaming: false, mentions: ['claude'] }));

      expect(adapter.config).toMatchObject({
        isDebateMode: false,
        groupChat: { selfName: 'Claude', participants: ['Gemini', 'ChatGPT', 'Claude'] },
      });
      expect(service.sendMessage).toHaveBeenCalledWith(
        'claude',
        expect.stringContaining('[User] Is coffee bad for you?'),
        [],
        false,
        undefined,
        undefined,
        expect.any(String),
      );
    });

    it('keeps single-AI chat prompts unchanged', async () => {
      const { service } = mockAIService();
      mockStreamingService.streamResponse.mockImplementation(async (_config, _onChunk, onComplete) => onComplete?.('ok'));
      const orchestrator = new ChatOrchestrator(service, dispatch);
      orchestrator.updateSession(session);
      jest.spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep').mockResolvedValue(undefined);
      await orchestrator.processUserMessage(buildParams());

      const call = streamCalls()[0];
      expect(call.message).toBe('Hello team');
      expect(call.adapterConfig.groupChat).toBeUndefined();
    });
  });
});
