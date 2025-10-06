import { act } from '@testing-library/react-native';
import { useChatMessages } from '@/hooks/chat/useChatMessages';
import { ChatService } from '@/services/chat/ChatService';
import type { RootState } from '@/store';
import type { Message } from '@/types';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: overrides.id ?? 'msg-1',
  sender: overrides.sender ?? 'You',
  senderType: overrides.senderType ?? 'user',
  content: overrides.content ?? 'Hello',
  timestamp: overrides.timestamp ?? 1,
  ...overrides,
});

describe('useChatMessages', () => {
  const baseMessages: Message[] = [createMessage()];

  const baseState: Partial<RootState> = {
    chat: {
      currentSession: {
        id: 'session-1',
        selectedAIs: [],
        messages: baseMessages,
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
  } as Partial<RootState>;

  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
    jest.spyOn(ChatService, 'validateMessageContent').mockReturnValue({ isValid: true });
    jest.spyOn(ChatService, 'createUserMessage').mockImplementation((content: string, mentions: string[] = []) => ({
      id: `msg-${content}`,
      sender: 'You',
      senderType: 'user',
      content,
      mentions,
      timestamp: 2,
    } as Message));
    jest.spyOn(ChatService, 'hasMessages').mockImplementation(messages => messages.length > 0);
    jest.spyOn(ChatService, 'getLastUserMessage').mockImplementation(messages => messages.find(m => m.senderType === 'user') ?? null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds messages via sendMessage and derives stats', () => {
    const { result, store } = renderHookWithProviders(() => useChatMessages(), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.sendMessage('New message', ['claude']);
    });

    const messages = store.getState().chat.currentSession?.messages || [];
    expect(messages.map(m => m.content)).toContain('New message');
    expect(messages.find(m => m.content === 'New message')?.mentions).toEqual(['claude']);
    expect(result.current.hasMessages).toBe(true);
    expect(result.current.lastMessage?.content).toBe('New message');

    const stats = result.current.getMessageStats();
    expect(stats.totalMessages).toBeGreaterThan(0);
  });

  it('blocks invalid messages when validation fails', () => {
    (ChatService.validateMessageContent as jest.Mock).mockReturnValueOnce({ isValid: false, error: 'bad' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result, store } = renderHookWithProviders(() => useChatMessages(), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.sendMessage('');
    });

    expect(store.getState().chat.currentSession?.messages.length).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('Invalid message:', 'bad');

    errorSpy.mockRestore();
  });

  it('allows sending empty content when attachments are provided', () => {
    const { result, store } = renderHookWithProviders(() => useChatMessages(), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.sendMessage('', [], [{ type: 'image', uri: 'file://image.png', mimeType: 'image/png' }]);
    });

    expect(ChatService.validateMessageContent).not.toHaveBeenCalledWith('');
    const messages = store.getState().chat.currentSession?.messages || [];
    expect(messages[messages.length - 1].attachments?.[0].uri).toBe('file://image.png');
  });

  it('keeps flatList ref controls working', () => {
    const scrollToEnd = jest.fn();
    const scrollToIndex = jest.fn();

    const { result } = renderHookWithProviders(() => useChatMessages(), {
      preloadedState: baseState,
    });

    result.current.flatListRef.current = {
      scrollToEnd,
      scrollToIndex,
    } as unknown as never;

    act(() => {
      result.current.scrollToBottom();
    });
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });

    act(() => {
      result.current.scrollToMessage(0);
    });
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 0, animated: true, viewPosition: 0.5 });

    act(() => {
      result.current.scrollToMessage(99);
    });
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
  });
});
