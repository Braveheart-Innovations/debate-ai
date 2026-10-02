import { act, waitFor } from '@testing-library/react-native';
import type { Message } from '@/types';
import { useAIResponsesWithStreaming } from '@/hooks/chat/useAIResponsesWithStreaming';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import type { RootStateOverrides } from '../../../test-utils/services/state';
import {
  createMockAIConfig,
  createMockAttachment,
  createMockChatSession,
  createMockMessage,
} from '../../../test-utils/fixtures';
import { ChatOrchestrator } from '@/services/chat';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { useAIService } from '@/providers/AIServiceProvider';
import { createMockFeatureAccess } from '@test-utils/fixtures';

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

jest.mock('@/hooks/usePersonality', () => ({
  usePersonality: () => ({
    isLoading: false,
    settings: { customizations: {}, lastSyncedAt: 0, version: 1 },
    getPersonality: jest.fn().mockReturnValue(null),
    getAllPersonalities: jest.fn().mockReturnValue([]),
    isCustomized: jest.fn().mockReturnValue(false),
    getCustomization: jest.fn().mockReturnValue(null),
    updateCustomization: jest.fn(),
    updateTone: jest.fn(),
    updateDebateProfile: jest.fn(),
    updateModelParameters: jest.fn(),
    toggleCustomization: jest.fn(),
    resetToDefaults: jest.fn(),
    resetAll: jest.fn(),
    reload: jest.fn(),
  }),
  usePersonalityById: () => null,
}));

const baseMessage: Message = createMockMessage({ id: 'user-1', timestamp: 1 });

const buildState = (messages: Message[] = []): RootStateOverrides => ({
  chat: {
    currentSession: createMockChatSession({
      selectedAIs: [createMockAIConfig({ model: 'claude-3-opus' })],
      messages,
      createdAt: 0,
    }),
    aiPersonalities: { claude: 'default' },
    selectedModels: { claude: 'claude-3-opus' },
  },
  settings: {
    theme: 'light',
    hasCompletedOnboarding: true,
  },
  streaming: {
    streamingPreferences: { claude: { enabled: true, supported: true } },
    globalStreamingEnabled: true,
  },
});

const baseState = buildState();

const featureAccess = (isDemo: boolean): ReturnType<typeof useFeatureAccess> =>
  createMockFeatureAccess(
    isDemo
      ? {}
      : { membershipStatus: 'premium', canAccessLiveAI: true, isPremium: true, isDemo: false }
  );

const getOrchestratorInstance = () => jest.mocked(ChatOrchestrator).mock.results.at(-1)?.value;

describe('useAIResponsesWithStreaming', () => {
  beforeEach(() => {
    jest.mocked(ChatOrchestrator).mockClear();
    jest.mocked(useAIService).mockClear();
    jest.mocked(useFeatureAccess).mockReturnValue(featureAccess(false));
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
        streamingPreferences: { claude: { enabled: true, supported: true } },
        globalStreamingEnabled: true,
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

  it('carries staged attachments on the quick start message and orchestrator call', async () => {
    const attachment = createMockAttachment({
      uri: 'file://a.png',
      base64: 'abc',
      fileName: 'a.png',
    });
    const { result, store } = renderHookWithProviders(() => useAIResponsesWithStreaming(), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(ChatOrchestrator).toHaveBeenCalled());
    const orchestrator = getOrchestratorInstance();

    await act(async () => {
      await result.current.sendQuickStartResponses('Read this', 'Read this', [attachment]);
    });

    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          content: 'Read this',
          attachments: [attachment],
        }),
        attachments: [attachment],
      })
    );

    const messages = store.getState().chat.currentSession?.messages ?? [];
    expect(messages.find(msg => msg.content === 'Read this')?.attachments).toEqual([attachment]);
  });

  it('logs an error when AI service is not ready', async () => {
    jest.mocked(useAIService).mockReturnValueOnce({
      aiService: null,
      isInitialized: false,
      isLoading: false,
      error: null,
      reinitialize: jest.fn(),
    });
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

  it('does not inject provider resumption context for normal chat history resume', async () => {
    const messageHistory: Message[] = [
      baseMessage,
      { ...baseMessage, id: 'ai-1', sender: 'Claude', senderType: 'ai', content: 'Response', timestamp: 2 },
    ];

    const resumingState = buildState(messageHistory);

    const { result } = renderHookWithProviders(() => useAIResponsesWithStreaming(true), {
      preloadedState: resumingState,
    });

    await waitFor(() => expect(ChatOrchestrator).toHaveBeenCalled());

    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).toBeDefined();

    await act(async () => {
      await result.current.sendAIResponses(baseMessage);
    });

    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        existingMessages: messageHistory,
        resumptionContext: undefined,
      })
    );
  });

  it('respects demo gating by disabling streaming', async () => {
    jest.mocked(useFeatureAccess).mockReturnValueOnce(featureAccess(true));

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
