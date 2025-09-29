import { ChatOrchestrator } from '@/services/chat/ChatOrchestrator';
import { addMessage, setTypingAI, updateMessage, type AppDispatch } from '@/store';
import {
  startStreaming,
  updateStreamingContent,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  setProviderVerificationError,
} from '@/store/streamingSlice';
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
  getPersonality: jest.fn(() => ({
    id: 'persona',
    name: 'Persona',
    systemPrompt: 'Stay helpful',
    debatePrompt: 'Debate politely',
    chatGuidance: 'Be concise',
  })),
}));

jest.mock('@/utils/expertMode', () => ({
  getExpertOverrides: jest.fn(() => ({ enabled: false })),
}));

const mockStreamingService = {
  streamResponse: jest.fn(),
};

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: jest.fn(() => mockStreamingService),
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
    streamingSpeed: 'instant' as const,
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
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: updateStreamingContent.type }));
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: endStreaming.type }));
    expect(service.sendMessage).not.toHaveBeenCalled();
    expect(adapter.getCapabilities).toHaveBeenCalled();
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
});
