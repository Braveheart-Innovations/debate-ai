import { act } from '@testing-library/react-native';
import type { RootState } from '@/store';
import { useQuickStart } from '@/hooks/chat/useQuickStart';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: jest.fn(() => ({
    aiService: { id: 'service' },
    isInitialized: true,
    isLoading: false,
    error: null,
    reinitialize: jest.fn(),
  })),
}));

describe('useQuickStart', () => {
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
      aiPersonalities: {},
      selectedModels: {},
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

  it('auto-sends quick start prompt when enabled', async () => {
    const sendQuickStartResponses = jest.fn().mockResolvedValue(undefined);
    const setInputText = jest.fn();
    const handleSendMessage = jest.fn();

    const { result } = renderHookWithProviders(() => useQuickStart({
      initialPrompt: 'Enriched prompt',
      userPrompt: 'Hello there',
      autoSend: true,
    }), {
      preloadedState: baseState,
    });

    expect(result.current.shouldAutoSend).toBe(true);

    await act(async () => {
      result.current.handleQuickStart(sendQuickStartResponses, setInputText, handleSendMessage);
    });

    expect(sendQuickStartResponses).toHaveBeenCalledWith('Hello there', 'Enriched prompt');
    expect(setInputText).not.toHaveBeenCalled();
    expect(handleSendMessage).not.toHaveBeenCalled();
  });

  it('prefills input and schedules send when autoSend is false', () => {
    jest.useFakeTimers();

    const sendQuickStartResponses = jest.fn();
    const setInputText = jest.fn();
    const handleSendMessage = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHookWithProviders(() => useQuickStart({
      initialPrompt: 'Draft this response',
      autoSend: false,
    }), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.handleQuickStart(sendQuickStartResponses, setInputText, handleSendMessage);
    });

    expect(setInputText).toHaveBeenCalledWith('Draft this response');
    expect(sendQuickStartResponses).not.toHaveBeenCalled();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(handleSendMessage).toHaveBeenCalledWith('Draft this response');

    act(() => {
      result.current.resetQuickStart();
    });

    expect(result.current.initialPromptSent).toBe(false);
    jest.useRealTimers();
  });
});
