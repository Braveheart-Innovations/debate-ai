import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useChatSession } from '@/hooks/chat/useChatSession';
import { StorageService } from '@/services/chat';
import type { RootState } from '@/store';
import type { ChatSession } from '@/types';

describe('useChatSession', () => {
  const baseAuthState: RootState['auth'] = {
    user: null,
    isAuthenticated: false,
    isPremium: false,
    authLoading: false,
    authModalVisible: false,
    userProfile: null,
    isAnonymous: false,
    lastAuthMethod: null,
    socialAuthLoading: false,
    socialAuthError: null,
  };

  const baseChatState: RootState['chat'] = {
    currentSession: null,
    sessions: [],
    typingAIs: [],
    isLoading: false,
    aiPersonalities: {},
    selectedModels: {},
  };

  const createSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
    id: overrides.id ?? 'session-1',
    selectedAIs: overrides.selectedAIs ?? [
      {
        id: 'ai-1',
        name: 'Alpha',
        provider: 'claude',
        model: 'claude-3-opus',
      },
    ],
    messages: overrides.messages ?? [],
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? 123,
    lastMessageAt: overrides.lastMessageAt,
    sessionType: overrides.sessionType ?? 'chat',
    topic: overrides.topic,
    debateConfig: overrides.debateConfig,
  });

  let loadSessionSpy: jest.SpyInstance;
  let saveSessionSpy: jest.SpyInstance;
  let enforceLimitsSpy: jest.SpyInstance;

  beforeEach(() => {
    loadSessionSpy = jest.spyOn(StorageService, 'loadSession');
    saveSessionSpy = jest.spyOn(StorageService, 'saveSession');
    enforceLimitsSpy = jest.spyOn(StorageService, 'enforceStorageLimits');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads a stored session and exposes derived values', async () => {
    const storedSession = createSession({ id: 'stored-session', selectedAIs: [] });
    loadSessionSpy.mockResolvedValue(storedSession);

    const { result, store } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.loadSession('stored-session');
    });

    expect(loadSessionSpy).toHaveBeenCalledWith('stored-session');
    expect(store.getState().chat.currentSession?.id).toBe('stored-session');
    expect(result.current.sessionId).toBe('stored-session');
    expect(result.current.selectedAIs).toEqual([]);
    expect(result.current.isActive).toBe(true);
  });

  it('silently ignores missing sessions when loading fails to find data', async () => {
    loadSessionSpy.mockResolvedValue(null);

    const { result, store } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.loadSession('missing-session');
    });

    expect(store.getState().chat.currentSession).toBeNull();
    expect(result.current.sessionId).toBeNull();
  });

  it('logs an error if storage throws while loading a session', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadSessionSpy.mockRejectedValue(new Error('boom'));

    const { result } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.loadSession('broken');
    });

    expect(consoleSpy).toHaveBeenCalledWith('Error loading session:', expect.any(Error));
  });

  it('enforces limits and saves when persisting a new chat session', async () => {
    const session = createSession();
    loadSessionSpy.mockResolvedValueOnce(null);
    enforceLimitsSpy.mockResolvedValue({ deleted: false });
    saveSessionSpy.mockResolvedValue(undefined);

    const { result } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState, currentSession: session },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.saveSession();
    });

    expect(loadSessionSpy).toHaveBeenCalledWith(session.id);
    expect(enforceLimitsSpy).toHaveBeenCalledWith('chat', false, true);
    expect(saveSessionSpy).toHaveBeenCalledWith(session);
  });

  it('skips enforcement for existing sessions but still saves', async () => {
    const session = createSession({ id: 'existing-session' });
    loadSessionSpy.mockResolvedValueOnce({ ...session });
    saveSessionSpy.mockResolvedValue(undefined);

    const { result } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState, currentSession: session },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.saveSession();
    });

    expect(loadSessionSpy).toHaveBeenCalledWith('existing-session');
    expect(enforceLimitsSpy).not.toHaveBeenCalled();
    expect(saveSessionSpy).toHaveBeenCalledWith(session);
  });

  it('treats debate sessions as transient and skips persistence', async () => {
    const session = createSession({ id: 'debate-session', sessionType: 'debate' });

    const { result } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState, currentSession: session },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.saveSession();
    });

    expect(loadSessionSpy).not.toHaveBeenCalled();
    expect(enforceLimitsSpy).not.toHaveBeenCalled();
    expect(saveSessionSpy).not.toHaveBeenCalled();
  });

  it('returns early when no active session exists', async () => {
    const { result } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState, currentSession: null },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.saveSession();
    });

    expect(loadSessionSpy).not.toHaveBeenCalled();
    expect(saveSessionSpy).not.toHaveBeenCalled();
  });

  it('logs errors thrown while saving sessions', async () => {
    const session = createSession();
    loadSessionSpy.mockResolvedValueOnce(null);
    enforceLimitsSpy.mockResolvedValue({ deleted: false });
    saveSessionSpy.mockRejectedValueOnce(new Error('save-failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState, currentSession: session },
        auth: { ...baseAuthState },
      },
    });

    await act(async () => {
      await result.current.saveSession();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Error saving session:', expect.any(Error));
  });

  it('dispatches endSession to clear the active session', () => {
    const session = createSession();

    const { result, store } = renderHookWithProviders(() => useChatSession(), {
      preloadedState: {
        chat: { ...baseChatState, currentSession: session },
        auth: { ...baseAuthState },
      },
    });

    act(() => {
      result.current.endSession();
    });

    expect(store.getState().chat.currentSession).toBeNull();
    expect(result.current.sessionId).toBeNull();
    expect(result.current.selectedAIs).toEqual([]);
    expect(result.current.isActive).toBe(false);
  });
});
