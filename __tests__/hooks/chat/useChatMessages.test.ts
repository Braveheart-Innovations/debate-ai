import { act } from '@testing-library/react-native';
import { useChatMessages } from '@/hooks/chat/useChatMessages';
import { ChatService } from '@/services/chat/ChatService';
import type { RootState } from '@/store';
import type { Message } from '@/types';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

describe('useChatMessages', () => {
  const baseMessages: Message[] = [
    { id: '1', sender: 'You', senderType: 'user', content: 'Hello', timestamp: 1 },
  ];

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
    jest.spyOn(ChatService, 'createUserMessage').mockImplementation((content: string) => ({
      id: `msg-${content}`,
      sender: 'You',
      senderType: 'user',
      content,
      timestamp: 2,
    } as Message));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds messages via sendMessage and derives stats', () => {
    const { result, store } = renderHookWithProviders(() => useChatMessages(), {
      preloadedState: baseState,
    });

    act(() => {
      result.current.sendMessage('New message');
    });

    const messages = store.getState().chat.currentSession?.messages || [];
    expect(messages.map(m => m.content)).toContain('New message');
    expect(result.current.hasMessages).toBe(true);
    expect(result.current.lastMessage?.content).toBe('New message');

    const stats = result.current.getMessageStats();
    expect(stats.totalMessages).toBeGreaterThan(0);
  });
});
