import { act } from '@testing-library/react-native';
import type { Message } from '@/types';
import type { RootState } from '@/store';
import { useAIResponsesWithStreaming } from '@/hooks/chat/useAIResponsesWithStreaming';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

const orchestratorInstances: Array<{ processUserMessage: jest.Mock; updateSession: jest.Mock }> = [];

jest.mock('@/services/chat', () => {
  const actual = jest.requireActual('@/services/chat');
  return {
    ...actual,
    ChatOrchestrator: jest.fn(() => {
      const instance = {
        processUserMessage: jest.fn().mockResolvedValue(undefined),
        updateSession: jest.fn(),
      };
      orchestratorInstances.push(instance);
      return instance;
    }),
  };
});

jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: jest.fn(() => ({
    aiService: { id: 'service' },
    isInitialized: true,
    isLoading: false,
    error: null,
    reinitialize: jest.fn(),
  })),
}));

jest.mock('@/hooks/useFeatureAccess', () => jest.fn(() => ({ isDemo: false })));

const getOrchestratorInstance = (index = 0) => orchestratorInstances[index];

describe('useAIResponsesWithStreaming', () => {
  const baseMessage: Message = {
    id: 'user-1',
    sender: 'You',
    senderType: 'user',
    content: 'Hello',
    timestamp: 1,
  };

  const baseState: Partial<RootState> = {
    chat: {
      currentSession: {
        id: 'session-1',
        selectedAIs: [{ id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-opus' }],
        messages: [],
        isActive: true,
        createdAt: 0,
        sessionType: 'chat',
      },
      sessions: [],
      typingAIs: [],
      isLoading: false,
      aiPersonalities: { claude: 'default' },
      selectedModels: { claude: 'claude-3-opus' },
    },
    settings: {
      theme: 'light',
      fontSize: 'medium',
      apiKeys: {},
      expertMode: {},
      verifiedProviders: [],
      verificationTimestamps: {},
      verificationModels: {},
      hasCompletedOnboarding: true,
    },
    streaming: {
      streamingPreferences: { claude: { enabled: true } },
      globalStreamingEnabled: true,
      streamingSpeed: 'instant',
      streamingMessages: {},
      activeStreamCount: 0,
      totalStreamsCompleted: 0,
      providerVerificationErrors: {},
    },
  } as Partial<RootState>;

  beforeEach(() => {
    orchestratorInstances.length = 0;
  });

  it('enables streaming with preferences from state', async () => {
    const { result } = renderHookWithProviders(() => useAIResponsesWithStreaming(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).toBeDefined();
    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        allowStreaming: true,
        streamingPreferences: { claude: { enabled: true } },
        globalStreamingEnabled: true,
        streamingSpeed: 'instant',
      })
    );
  });

  it('sends quick start responses with streaming context', async () => {
    const { result, store } = renderHookWithProviders(() => useAIResponsesWithStreaming(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.sendQuickStartResponses('Hi', 'Hi enriched');
    });

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({ content: 'Hi' }),
        allowStreaming: true,
      })
    );

    const messages = store.getState().chat.currentSession?.messages ?? [];
    expect(messages.some(msg => msg.content === 'Hi')).toBe(true);
  });
});
