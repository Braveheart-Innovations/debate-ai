import { act } from '@testing-library/react-native';
import { useDebateMessages } from '@/hooks/debate/useDebateMessages';
import type { RootState } from '@/store';
import type { Message } from '@/types';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

describe('useDebateMessages', () => {
  const message = (id: string, sender: string, senderType: 'user' | 'ai', timestamp: number): Message => ({
    id,
    sender,
    senderType,
    content: `${sender} message`,
    timestamp,
  });

  const baseState: Partial<RootState> = {
    chat: {
      currentSession: {
        id: 'debate-session',
        selectedAIs: [],
        messages: [
          message('1', 'Debate Host', 'user', 100),
          message('2', 'Claude', 'ai', 200),
          message('3', 'Claude', 'ai', 300),
        ],
        isActive: true,
        createdAt: 0,
        sessionType: 'debate',
      },
      sessions: [],
      typingAIs: ['Claude'],
      isLoading: false,
      aiPersonalities: {},
      selectedModels: {},
    },
  } as Partial<RootState>;

  it('filters messages by debate start time and tracks typing indicators', () => {
    const { result } = renderHookWithProviders(() => useDebateMessages(450), { preloadedState: baseState });

    expect(result.current.messages.map(m => m.id)).toEqual(['2', '3']);
    expect(result.current.typingAIs).toEqual(['Claude']);
    expect(result.current.messageCount).toBe(2);

    act(() => {
      result.current.addHostMessage('Welcome to the debate');
    });

    const updatedMessages = result.current.getDebateMessages();
    expect(updatedMessages.some(m => m.content === 'Welcome to the debate')).toBe(true);

    act(() => {
      result.current.addHostMessage('Welcome to the debate');
    });

    expect(result.current.getDebateMessages().filter(m => m.content === 'Welcome to the debate')).toHaveLength(1);
  });
});
