import { AIService, PERSONALITIES } from '@/services/aiAdapter';
import { AdapterFactory } from '@/services/ai';
import { ChatOrchestrator } from '@/services/chat/ChatOrchestrator';
import type { AIService as AIServiceType } from '@/services/aiAdapter';
import type { AI, ChatSession, Message } from '@/types';
import type { AppDispatch } from '@/store';

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
  PersonalityOption: {},
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

describe('Model selection flow hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AIService normalizes deprecated and alias model overrides before calling adapters', async () => {
    const adapter = {
      config: { model: 'claude-sonnet-5-5', isDebateMode: false },
      setTemporaryPersonality: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ response: 'ok', modelUsed: 'claude-sonnet-5-5' }),
    };
    const createSpy = jest.spyOn(AdapterFactory, 'create').mockReturnValue(adapter as never);
    const service = new AIService({ claude: 'key' });

    await service.sendMessage(
      'claude',
      'Hello',
      [],
      PERSONALITIES.neutral,
      undefined,
      undefined,
      'claude-3-7-sonnet-20250219'
    );
    expect(adapter.config.model).toBe('claude-sonnet-5-5');
    expect(adapter.sendMessage).toHaveBeenLastCalledWith('Hello', [], undefined, undefined, 'claude-sonnet-5-5');

    await service.sendMessage(
      'claude',
      'Hello again',
      [],
      PERSONALITIES.neutral,
      undefined,
      undefined,
      'claude-latest'
    );
    expect(adapter.config.model).toBe('claude-sonnet-5-5');
    expect(adapter.sendMessage).toHaveBeenLastCalledWith('Hello again', [], undefined, undefined, 'claude-sonnet-5-5');

    createSpy.mockRestore();
  });

  it('ChatOrchestrator normalizes selected models for streaming and non-streaming paths', async () => {
    const baseAI: AI = {
      id: 'claude',
      provider: 'claude',
      name: 'Claude',
      model: 'claude-3-7-sonnet-20250219',
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

    const adapter = {
      config: {},
      getCapabilities: jest.fn(() => ({ streaming: true })),
      setTemporaryPersonality: jest.fn(),
    };
    const service = {
      getAdapter: jest.fn(() => adapter),
      sendMessage: jest.fn().mockResolvedValue({ response: 'fallback', modelUsed: 'claude-sonnet-5-5' }),
      setPersonality: jest.fn(),
    } as unknown as AIServiceType;
    const dispatch = jest.fn() as unknown as AppDispatch;

    mockStreamingService.streamResponse.mockImplementation(async (_config, onChunk, onComplete) => {
      onChunk?.('chunk');
      onComplete?.('done');
    });

    const orchestrator = new ChatOrchestrator(service, dispatch);
    orchestrator.updateSession(session);
    jest
      .spyOn(ChatOrchestrator.prototype as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);

    await orchestrator.processUserMessage({
      userMessage,
      existingMessages: session.messages,
      mentions: [],
      aiPersonalities: { claude: 'persona' },
      selectedModels: { claude: 'gpt-5' },
      apiKeys: { claude: 'key-1' },
      expertModeConfigs: {},
      streamingPreferences: { claude: { enabled: true } },
      globalStreamingEnabled: true,
      allowStreaming: true,
      attachments: undefined,
      resumptionContext: undefined,
      enrichedPrompt: undefined,
      isDemo: false,
    });

    expect(mockStreamingService.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          model: 'claude-sonnet-5-5',
          personality: expect.objectContaining({
            id: 'persona',
            systemPrompt: expect.stringContaining('Chat mode contract'),
          }),
        }),
        modelOverride: 'claude-sonnet-5-5',
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );

    adapter.getCapabilities.mockReturnValue({ streaming: false });
    await orchestrator.processUserMessage({
      userMessage,
      existingMessages: session.messages,
      mentions: [],
      aiPersonalities: { claude: 'persona' },
      selectedModels: { claude: 'claude-3-7-sonnet-20250219' },
      apiKeys: { claude: 'key-1' },
      expertModeConfigs: {},
      streamingPreferences: { claude: { enabled: false } },
      globalStreamingEnabled: true,
      allowStreaming: false,
      attachments: undefined,
      resumptionContext: undefined,
      enrichedPrompt: undefined,
      isDemo: false,
    });

    expect(service.sendMessage).toHaveBeenLastCalledWith(
      'claude',
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        id: 'persona',
        systemPrompt: expect.stringContaining('Chat mode contract'),
      }),
      undefined,
      undefined,
      'claude-sonnet-5-5'
    );
  });
});
