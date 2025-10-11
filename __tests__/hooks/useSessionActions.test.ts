import { act } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { useSessionActions } from '@/hooks/history/useSessionActions';
import { createMockSession } from '../../test-utils/hooks/historyFixtures';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import type { ChatSession } from '@/types';

const mockUseFeatureAccess = jest.fn();
const mockShowTrialCTA = jest.fn();
const mockDeleteSession = jest.fn();
const mockLoadSession = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => mockUseFeatureAccess(),
}));

jest.mock('@/utils/demoGating', () => ({
  showTrialCTA: (...args: unknown[]) => mockShowTrialCTA(...args),
}));

jest.mock('@/services/chat', () => ({
  StorageService: {
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  },
}));

jest.mock('@/store', () => {
  const actual = jest.requireActual('@/store');
  return {
    ...actual,
    loadSession: (...args: unknown[]) => {
      mockLoadSession(...args);
      return { type: 'chat/loadSession', payload: args[0] };
    },
  };
});

describe('useSessionActions', () => {
  const navigation = { navigate: jest.fn() } as unknown as Parameters<typeof useSessionActions>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureAccess.mockReturnValue({ isDemo: false });
  });

  it('confirms deletion and triggers refresh', async () => {
    mockDeleteSession.mockResolvedValue(undefined);
    const onRefresh = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHookWithProviders(() => useSessionActions(navigation, onRefresh));

    const deletePromise = result.current.deleteSession('session-1');
    const [, , buttons] = alertSpy.mock.calls[0];
    await act(async () => {
      await buttons?.find(btn => btn.text === 'Delete')?.onPress?.();
    });

    await expect(deletePromise).resolves.toBeUndefined();
    expect(mockDeleteSession).toHaveBeenCalledWith('session-1');
    expect(onRefresh).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('cancels deletion without touching storage', async () => {
    mockDeleteSession.mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    const deletePromise = result.current.deleteSession('session-cancel');
    const [, , buttons] = alertSpy.mock.calls[0];

    act(() => {
      buttons?.find(btn => btn.text === 'Cancel')?.onPress?.();
    });

    await expect(deletePromise).resolves.toBeUndefined();
    expect(mockDeleteSession).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('surfaces deletion errors to the user', async () => {
    mockDeleteSession.mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    const deletePromise = result.current.deleteSession('session-2');
    const [, , initialButtons] = alertSpy.mock.calls[0];
    await act(async () => {
      await initialButtons?.find(btn => btn.text === 'Delete')?.onPress?.();
    });

    const [, errorMessage, errorButtons] = alertSpy.mock.calls[1];
    expect(errorMessage).toContain('Failed to delete the conversation');
    errorButtons?.find(btn => btn.text === 'OK')?.onPress?.();

    await expect(deletePromise).resolves.toBeUndefined();
    expect(alertSpy).toHaveBeenCalledTimes(2);

    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('gates resume in demo mode', () => {
    mockUseFeatureAccess.mockReturnValue({ isDemo: true });
    const session = createMockSession();

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(session);
    });

    expect(mockShowTrialCTA).toHaveBeenCalled();
    expect(mockLoadSession).not.toHaveBeenCalled();
  });

  it('provides comparison resume options for divergent sessions', () => {
    mockUseFeatureAccess.mockReturnValue({ isDemo: false });
    const comparisonSession: ChatSession = {
      ...createMockSession({ sessionType: 'comparison' }),
      hasDiverged: true,
      continuedWithAI: 'Claude',
      selectedAIs: [
        { id: 'left', name: 'Lefty', provider: 'anthropic', model: 'claude' },
        { id: 'right', name: 'Righty', provider: 'openai', model: 'gpt4' },
      ],
    } as ChatSession & { hasDiverged: boolean; continuedWithAI: string };

    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(comparisonSession);
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    act(() => {
      buttons?.find(btn => btn.text === 'Resume Chat')?.onPress?.();
    });

    expect(mockLoadSession).toHaveBeenCalledWith(comparisonSession);

    alertSpy.mockRestore();
  });

  it('resumes comparison sessions that have not diverged', () => {
    const comparisonSession = {
      ...createMockSession({ sessionType: 'comparison' }),
      hasDiverged: false,
      selectedAIs: [
        { id: 'left', name: 'Lefty', provider: 'anthropic', model: 'claude' },
        { id: 'right', name: 'Righty', provider: 'openai', model: 'gpt4' },
      ],
      messages: [
        {
          id: 'message-compare',
          sender: 'You',
          senderType: 'user',
          content: 'Compare output please',
          timestamp: 1700000000000,
        },
      ],
    } as unknown as ChatSession & { hasDiverged: boolean };

    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(comparisonSession);
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    act(() => {
      buttons?.find(btn => btn.text === 'Continue Comparison')?.onPress?.();
    });

    expect(mockLoadSession).toHaveBeenCalledWith(comparisonSession);
    expect(navigation.navigate).toHaveBeenCalledWith('CompareSession', expect.objectContaining({ sessionId: comparisonSession.id }));

    alertSpy.mockRestore();
  });

  it('summarises debates when resuming debate sessions', () => {
    const debateHostMessages = [
      {
        id: 'host-1',
        sender: 'Debate Host',
        senderType: 'ai' as const,
        content: '"The future of AI" Opening remarks...'
      },
      {
        id: 'host-2',
        sender: 'Debate Host',
        senderType: 'ai' as const,
        content: 'OVERALL WINNER: Claude!'
      }
    ];

    const debateSession: ChatSession = {
      ...createMockSession({ sessionType: 'debate' }),
      selectedAIs: [
        { id: 'claude', name: 'Claude', provider: 'anthropic', model: 'claude-3' },
        { id: 'gpt4', name: 'GPT-4', provider: 'openai', model: 'gpt-4' },
      ],
      messages: debateHostMessages as unknown as ChatSession['messages'],
    };

    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(debateSession);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Debate Results');
    expect(message).toContain('Motion: The future of AI');
    expect(message).toContain('🏆 Winner: Claude');

    act(() => {
      buttons?.find(btn => btn.text === 'View Transcript')?.onPress?.();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('DebateTranscript', { session: debateSession });

    act(() => {
      buttons?.find(btn => btn.text === 'Rematch')?.onPress?.();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', expect.objectContaining({
      screen: 'DebateTab',
    }));

    alertSpy.mockRestore();
  });

  it('resumes chat sessions directly when allowed', () => {
    const chatSession = createMockSession({ id: 'chat-123', sessionType: 'chat' });
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(chatSession);
    });

    expect(mockLoadSession).toHaveBeenCalledWith(chatSession);
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ sessionId: 'chat-123' }));
  });

  it('exports sessions for sharing, trimming to the last 10 messages', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({} as never);
    const messages = Array.from({ length: 12 }, (_, index) => ({
      id: `msg-${index}`,
      sender: index % 2 === 0 ? 'You' : 'Claude',
      senderType: index % 2 === 0 ? 'user' : 'ai',
      content: `Message ${index}`,
      timestamp: 1700000000000 + index,
    }));
    const session = createMockSession({
      id: 'share-1',
      selectedAIs: [
        { id: 'claude', name: 'Claude', provider: 'anthropic', model: 'claude-3' },
      ],
      messages,
    });

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    await act(async () => {
      await result.current.shareSession(session);
    });

    expect(shareSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('Symposium AI Conversation'),
      message: expect.stringContaining('[Showing last 10 of 12 messages]'),
    }));
    expect(result.current.isProcessing).toBe(false);

    shareSpy.mockRestore();
  });

  it('handles share failures gracefully', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockRejectedValue(new Error('fail'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const session = createMockSession();

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    await act(async () => {
      await result.current.shareSession(session);
    });

    expect(shareSpy).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Error', expect.stringContaining('Failed to share'), expect.any(Array));
    expect(result.current.isProcessing).toBe(false);

    shareSpy.mockRestore();
    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('shows placeholder messaging for archive and resets processing', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    await act(async () => {
      await result.current.archiveSession('session-archive');
    });

    expect(alertSpy).toHaveBeenCalledWith('Coming Soon', expect.stringContaining('Session archiving'), [{ text: 'OK' }]);
    expect(result.current.isProcessing).toBe(false);

    alertSpy.mockRestore();
  });

  it('bulk deletes sessions and refreshes the list', async () => {
    mockDeleteSession.mockResolvedValue(undefined);
    const onRefresh = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHookWithProviders(() => useSessionActions(navigation, onRefresh));

    const bulkPromise = result.current.bulkDelete(['a', 'b']);
    const [, , buttons] = alertSpy.mock.calls[0];
    await act(async () => {
      await buttons?.find(btn => btn.text === 'Delete All')?.onPress?.();
    });

    await act(async () => {
      await bulkPromise;
    });

    expect(mockDeleteSession).toHaveBeenNthCalledWith(1, 'a');
    expect(mockDeleteSession).toHaveBeenNthCalledWith(2, 'b');
    expect(onRefresh).toHaveBeenCalled();
    expect(result.current.isProcessing).toBe(false);

    alertSpy.mockRestore();
  });

  it('handles bulk delete errors and resolves promise', async () => {
    mockDeleteSession
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    const bulkPromise = result.current.bulkDelete(['first', 'second']);
    const [, , buttons] = alertSpy.mock.calls[0];

    await act(async () => {
      await buttons?.find(btn => btn.text === 'Delete All')?.onPress?.();
    });

    const [, errorMessage, errorButtons] = alertSpy.mock.calls[1];
    expect(errorMessage).toContain('Failed to delete some conversations');

    act(() => {
      errorButtons?.find(btn => btn.text === 'OK')?.onPress?.();
    });

    await act(async () => {
      await bulkPromise;
    });

    expect(result.current.isProcessing).toBe(false);

    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
