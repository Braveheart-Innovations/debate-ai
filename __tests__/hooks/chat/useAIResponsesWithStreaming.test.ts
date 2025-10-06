import { act, waitFor } from '@testing-library/react-native';
import type { Message } from '@/types';
import type { RootState } from '@/store';
import { useAIResponsesWithStreaming } from '@/hooks/chat/useAIResponsesWithStreaming';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { ChatService } from '@/services/chat/ChatService';
import { ChatOrchestrator } from '@/services/chat';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { useAIService } from '@/providers/AIServiceProvider';

jest.mock('@/services/chat', () => {
  const actual = jest.requireActual('@/services/chat');
  return {
    ...actual,
    ChatOrchestrator: jest.fn(() => ({
      processUserMessage: jest.fn().mockResolvedValue(undefined),
      updateSession: jest.fn(),
    })),
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

const getOrchestratorInstance = () =>
  (ChatOrchestrator as jest.Mock).mock.results.at(-1)?.value as {
    processUserMessage: jest.Mock;
    updateSession: jest.Mock;
  };

describe('useAIResponsesWithStreaming', () => {
  beforeEach(() => {
    (ChatOrchestrator as jest.Mock).mockClear();
    (useAIService as jest.Mock).mockClear();
    (useFeatureAccess as jest.Mock).mockReturnValue({ isDemo: false });
  });

  it('enables streaming with preferences from state', async () => {
    const { result } = renderHookWithProviders(() => useAIResponsesWithStreaming(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(ChatOrchestrator).toHaveBeenCalled());

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    const orchestrator = getOrchestratorInstance();
    await waitFor(() => expect(orchestrator.processUserMessage).toHaveBeenCalled());
    expect(orchestrator.processUserMessage).toHaveBeenLastCalledWith(
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

    await waitFor(() => expect(ChatOrchestrator).toHaveBeenCalled());

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).toBeDefined();

    await act(async () => {
      await result.current.sendQuickStartResponses('Hi', 'Hi enriched');
    });

    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({ content: 'Hi' }),
        allowStreaming: true,
      })
    );

    const messages = store.getState().chat.currentSession?.messages ?? [];
    expect(messages.some(msg => msg.content === 'Hi')).toBe(true);
  });

  it('logs an error when AI service is not ready', async () => {
    (useAIService as jest.Mock).mockReturnValueOnce({ aiService: null, isInitialized: false });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHookWithProviders(() => useAIResponsesWithStreaming(), {
      preloadedState: baseState,
    });

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    expect(consoleSpy).toHaveBeenCalledWith('AI service not ready or no active session');
    consoleSpy.mockRestore();
  });

  it('passes resumption context when resuming conversations once', async () => {
    const messageHistory: Message[] = [
      baseMessage,
      { ...baseMessage, id: 'ai-1', sender: 'Claude', senderType: 'ai', content: 'Response', timestamp: 2 },
    ];

    const resumingState: Partial<RootState> = {
      ...baseState,
      chat: {
        ...baseState.chat!,
        currentSession: {
          ...baseState.chat!.currentSession!,
          messages: messageHistory,
        },
      },
    };

    const { result } = renderHookWithProviders(() => useAIResponsesWithStreaming(true), {
      preloadedState: resumingState,
    });

    await waitFor(() => expect(ChatOrchestrator).toHaveBeenCalled());

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).toBeDefined();

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    expect(
      orchestrator.processUserMessage.mock.calls.filter(call => call[0].resumptionContext?.isResuming)
    ).toHaveLength(1);
  });

  it('respects demo gating by disabling streaming', async () => {
    (useFeatureAccess as jest.Mock).mockReturnValueOnce({ isDemo: true });

    const { result } = renderHookWithProviders(() => useAIResponsesWithStreaming(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(ChatOrchestrator).toHaveBeenCalled());

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).toBeDefined();

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    expect(orchestrator.processUserMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDemo: true,
      })
    );
  });
});
