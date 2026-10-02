import { act } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { useSessionActions } from '@/hooks/history/useSessionActions';
import {
  createMockAIConfig,
  createMockMessage,
  createMockSession,
} from '../../test-utils/hooks/historyFixtures';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import type { ChatSession } from '@/types';
import type { HistoryScreenNavigationProps } from '@/types/history';

// Comparison sessions carry divergence flags the hook reads off the session at runtime.
type ComparisonSession = ChatSession & { hasDiverged: boolean; continuedWithAI?: string };

const comparisonAIs = [
  createMockAIConfig({ id: 'left', name: 'Lefty', provider: 'claude', model: 'claude' }),
  createMockAIConfig({ id: 'right', name: 'Righty', provider: 'openai', model: 'gpt4' }),
];

// Mock ErrorService
const mockHandleWithToast = jest.fn();
const mockShowInfo = jest.fn();

jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
    showInfo: (...args: unknown[]) => mockShowInfo(...args),
    showSuccess: jest.fn(),
    showWarning: jest.fn(),
  },
}));

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
  const actual = jest.requireActual<typeof import('@/store')>('@/store');
  return {
    ...actual,
    loadSession: (...args: unknown[]) => {
      mockLoadSession(...args);
      return { type: 'chat/loadSession', payload: args[0] };
    },
  };
});

describe('useSessionActions', () => {
  const navigation: HistoryScreenNavigationProps = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureAccess.mockReturnValue({ isDemo: false });
    mockHandleWithToast.mockClear();
    mockShowInfo.mockClear();
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

    // Error is now shown via ErrorService.handleWithToast instead of Alert.alert
    expect(mockHandleWithToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to delete the conversation. Please try again.' }),
      { feature: 'history' }
    );

    await expect(deletePromise).resolves.toBeUndefined();

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
    const comparisonSession: ComparisonSession = {
      ...createMockSession({ sessionType: 'comparison', selectedAIs: comparisonAIs }),
      hasDiverged: true,
      continuedWithAI: 'Claude',
    };

    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(comparisonSession);
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    act(() => {
      buttons?.find(btn => btn.text === 'Resume Chat')?.onPress?.();
    });

    expect(mockLoadSession).toHaveBeenCalledWith({
      ...comparisonSession,
      sessionType: 'chat',
    });

    alertSpy.mockRestore();
  });

  it('resumes comparison sessions that have not diverged', () => {
    const comparisonSession: ComparisonSession = {
      ...createMockSession({
        sessionType: 'comparison',
        selectedAIs: comparisonAIs,
        messages: [
          createMockMessage({
            id: 'message-compare',
            content: 'Compare output please',
            timestamp: 1700000000000,
          }),
        ],
      }),
      hasDiverged: false,
    };

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
      createMockMessage({
        id: 'host-1',
        sender: 'Debate Host',
        senderType: 'ai',
        content: '"The future of AI" Opening remarks...'
      }),
      createMockMessage({
        id: 'host-2',
        sender: 'Debate Host',
        senderType: 'ai',
        content: 'OVERALL WINNER: Claude!'
      }),
    ];

    const debateSession: ChatSession = createMockSession({
      sessionType: 'debate',
      selectedAIs: [
        createMockAIConfig({ id: 'claude', name: 'Claude', provider: 'claude', model: 'claude-3' }),
        createMockAIConfig({ id: 'gpt4', name: 'GPT-4', provider: 'openai', model: 'gpt-4' }),
      ],
      messages: debateHostMessages,
    });

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
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const messages = Array.from({ length: 12 }, (_, index) => createMockMessage({
      id: `msg-${index}`,
      sender: index % 2 === 0 ? 'You' : 'Claude',
      senderType: index % 2 === 0 ? 'user' : 'ai',
      content: `Message ${index}`,
      timestamp: 1700000000000 + index,
    }));
    const session = createMockSession({
      id: 'share-1',
      selectedAIs: [createMockAIConfig({ id: 'claude', name: 'Claude', provider: 'claude', model: 'claude-3' })],
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
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const session = createMockSession();

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    await act(async () => {
      await result.current.shareSession(session);
    });

    expect(shareSpy).toHaveBeenCalled();
    // Error is now shown via ErrorService.handleWithToast instead of Alert.alert
    expect(mockHandleWithToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to share the conversation. Please try again.' }),
      { feature: 'history' }
    );
    expect(result.current.isProcessing).toBe(false);

    shareSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('shows placeholder messaging for archive and resets processing', async () => {
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    await act(async () => {
      await result.current.archiveSession('session-archive');
    });

    // Info message is now shown via ErrorService.showInfo instead of Alert.alert
    expect(mockShowInfo).toHaveBeenCalledWith(
      'Session archiving will be available in a future update.',
      'history'
    );
    expect(result.current.isProcessing).toBe(false);
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

    await expect(bulkPromise).resolves.toBe(true);
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

    // Error is now shown via ErrorService.handleWithToast instead of Alert.alert
    expect(mockHandleWithToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to delete some conversations. Please try again.' }),
      { feature: 'history' }
    );

    await act(async () => {
      await bulkPromise;
    });

    await expect(bulkPromise).resolves.toBe(false);
    expect(result.current.isProcessing).toBe(false);

    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('returns false when bulk delete confirmation is cancelled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    const bulkPromise = result.current.bulkDelete(['a', 'b']);
    const [, , buttons] = alertSpy.mock.calls[0];

    act(() => {
      buttons?.find(btn => btn.text === 'Cancel')?.onPress?.();
    });

    await expect(bulkPromise).resolves.toBe(false);
    expect(mockDeleteSession).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
