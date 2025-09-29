import { act } from '@testing-library/react-native';
import type { Message } from '@/types';
import type { RootState } from '@/store';
import { useAIResponses } from '@/hooks/chat/useAIResponses';
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

function getOrchestratorInstance(index = 0) {
  return orchestratorInstances[index];
}

describe('useAIResponses', () => {
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
  } as Partial<RootState>;

  beforeEach(() => {
    orchestratorInstances.length = 0;
  });

  it('passes non-streaming parameters to orchestrator', async () => {
    const { result } = renderHookWithProviders(() => useAIResponses(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.sendAIResponses(baseMessage, 'enriched', []);
    });

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).toBeDefined();
    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: baseMessage,
        enrichedPrompt: 'enriched',
        streamingPreferences: {},
        allowStreaming: false,
        globalStreamingEnabled: false,
      })
    );
  });

  it('injects resumption context on first call when resuming', async () => {
    const stateWithHistory: Partial<RootState> = {
      ...baseState,
      chat: {
        ...baseState.chat!,
        currentSession: {
          ...baseState.chat!.currentSession!,
          messages: [
            {
              id: 'msg-1',
              sender: 'You',
              senderType: 'user',
              content: 'Original prompt',
              timestamp: 0,
            },
          ],
        },
      },
    };

    const { result } = renderHookWithProviders(() => useAIResponses(true), {
      preloadedState: stateWithHistory,
    });

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        resumptionContext: expect.objectContaining({ isResuming: true }),
      })
    );
  });

  it('sends quick start responses and appends user message to store', async () => {
    const { result, store } = renderHookWithProviders(() => useAIResponses(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.sendQuickStartResponses('Hi', 'Hi enriched');
    });

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({ content: 'Hi' }),
        enrichedPrompt: 'Hi enriched',
      })
    );

    const messages = store.getState().chat.currentSession?.messages ?? [];
    expect(messages.some(msg => msg.content === 'Hi')).toBe(true);
  });
});
