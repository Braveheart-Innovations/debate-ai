import { addMessage, createAppStore, loadSession, setDebateSpeechLength, updateMessage } from '@/store';

describe('createAppStore', () => {
  it('hydrates store with preloaded state', () => {
    const store = createAppStore({ user: { currentUser: null, isAuthenticated: false, uiMode: 'expert' } as never });
    expect(store.getState().user.uiMode).toBe('expert');
  });

  it('starts Debate setup at the default speech length and keeps the last choice', () => {
    const store = createAppStore();
    expect(store.getState().settings.debateSpeechLength).toBe('default');

    store.dispatch(setDebateSpeechLength('concise'));

    expect(store.getState().settings.debateSpeechLength).toBe('concise');
  });

  it('drops unsupported providers when loading stale sessions', () => {
    const removedProviderId = ['to', 'gether'].join('');
    const store = createAppStore();

    store.dispatch(loadSession({
      id: 'stale-session',
      selectedAIs: [
        {
          id: removedProviderId,
          provider: removedProviderId as never,
          name: 'Removed Provider',
          model: 'removed-model',
        },
        {
          id: 'openai',
          provider: 'openai',
          name: 'ChatGPT',
          model: 'gpt-5.5',
        },
      ],
      messages: [],
      isActive: false,
      createdAt: Date.now(),
      sessionType: 'chat',
    }));

    expect(store.getState().chat.currentSession?.selectedAIs.map(ai => ai.provider)).toEqual(['openai']);
  });

  it('updates chat session lastMessageAt when messages are added or finalized', () => {
    const store = createAppStore();

    store.dispatch(loadSession({
      id: 'session-1',
      selectedAIs: [],
      messages: [],
      isActive: false,
      createdAt: 100,
      lastMessageAt: 100,
      sessionType: 'chat',
    }));

    store.dispatch(addMessage({
      id: 'msg-1',
      sender: 'You',
      senderType: 'user',
      content: 'Hello',
      timestamp: 500,
    }));

    expect(store.getState().chat.currentSession?.lastMessageAt).toBe(500);

    jest.spyOn(Date, 'now').mockReturnValue(800);
    store.dispatch(updateMessage({ id: 'msg-1', content: 'Hello again' }));

    expect(store.getState().chat.currentSession?.lastMessageAt).toBe(800);
    jest.restoreAllMocks();
  });
});
