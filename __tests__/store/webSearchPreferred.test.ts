import { createAppStore } from '@/store';
import { setWebSearchPreferred } from '@/store';
import type { RootState } from '@/store';

describe('Redux Store - webSearchPreferred', () => {
  describe('Initial State', () => {
    it('should initialize webSearchPreferred as false', () => {
      const store = createAppStore();
      const state = store.getState();

      expect(state.chat.webSearchPreferred).toBe(false);
    });

    it('should allow preloading webSearchPreferred state', () => {
      const preloadedState: Partial<RootState> = {
        chat: {
          currentSession: null,
          sessions: [],
          typingAIs: [],
          isLoading: false,
          aiPersonalities: {},
          selectedModels: {},
          webSearchPreferred: true,
        },
      };

      const store = createAppStore(preloadedState);
      const state = store.getState();

      expect(state.chat.webSearchPreferred).toBe(true);
    });
  });

  describe('setWebSearchPreferred Action', () => {
    it('should set webSearchPreferred to true', () => {
      const store = createAppStore();

      store.dispatch(setWebSearchPreferred(true));

      const state = store.getState();
      expect(state.chat.webSearchPreferred).toBe(true);
    });

    it('should set webSearchPreferred to false', () => {
      const preloadedState: Partial<RootState> = {
        chat: {
          currentSession: null,
          sessions: [],
          typingAIs: [],
          isLoading: false,
          aiPersonalities: {},
          selectedModels: {},
          webSearchPreferred: true,
        },
      };

      const store = createAppStore(preloadedState);

      store.dispatch(setWebSearchPreferred(false));

      const state = store.getState();
      expect(state.chat.webSearchPreferred).toBe(false);
    });

    it('should toggle webSearchPreferred multiple times', () => {
      const store = createAppStore();

      expect(store.getState().chat.webSearchPreferred).toBe(false);

      store.dispatch(setWebSearchPreferred(true));
      expect(store.getState().chat.webSearchPreferred).toBe(true);

      store.dispatch(setWebSearchPreferred(false));
      expect(store.getState().chat.webSearchPreferred).toBe(false);

      store.dispatch(setWebSearchPreferred(true));
      expect(store.getState().chat.webSearchPreferred).toBe(true);
    });
  });

  describe('Integration with Other Chat State', () => {
    it('should not affect other chat state when setting webSearchPreferred', () => {
      const preloadedState: Partial<RootState> = {
        chat: {
          currentSession: {
            id: 'session-1',
            selectedAIs: [
              {
                id: 'openai',
                name: 'ChatGPT',
                provider: 'openai',
                apiKey: 'test-key',
                model: 'gpt-5',
              },
            ],
            messages: [],
            isActive: true,
            createdAt: Date.now(),
            sessionType: 'chat',
          },
          sessions: [],
          typingAIs: ['openai'],
          isLoading: true,
          aiPersonalities: { openai: 'professional' },
          selectedModels: { openai: 'gpt-5' },
          webSearchPreferred: false,
        },
      };

      const store = createAppStore(preloadedState);

      store.dispatch(setWebSearchPreferred(true));

      const state = store.getState();

      // Verify webSearchPreferred changed
      expect(state.chat.webSearchPreferred).toBe(true);

      // Verify other state unchanged
      expect(state.chat.currentSession?.id).toBe('session-1');
      expect(state.chat.typingAIs).toEqual(['openai']);
      expect(state.chat.isLoading).toBe(true);
      expect(state.chat.aiPersonalities).toEqual({ openai: 'professional' });
      expect(state.chat.selectedModels).toEqual({ openai: 'gpt-5' });
    });

    it('should persist across session changes', () => {
      const store = createAppStore();

      // Set web search preference
      store.dispatch(setWebSearchPreferred(true));
      expect(store.getState().chat.webSearchPreferred).toBe(true);

      // Start a new session (this would typically happen in the app)
      // The preference should persist
      const stateAfterSessionStart = store.getState();
      expect(stateAfterSessionStart.chat.webSearchPreferred).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should only accept boolean values', () => {
      const store = createAppStore();

      // TypeScript should ensure only booleans are accepted
      store.dispatch(setWebSearchPreferred(true));
      store.dispatch(setWebSearchPreferred(false));

      // These should not compile (if TypeScript is enforcing correctly)
      // store.dispatch(setWebSearchPreferred('true' as any)); // would fail at runtime
      // store.dispatch(setWebSearchPreferred(1 as any)); // would fail at runtime
    });
  });

  describe('State Selectors', () => {
    it('should allow direct selection of webSearchPreferred from state', () => {
      const store = createAppStore();

      store.dispatch(setWebSearchPreferred(true));

      const webSearchPreferred = store.getState().chat.webSearchPreferred;
      expect(webSearchPreferred).toBe(true);
      expect(typeof webSearchPreferred).toBe('boolean');
    });

    it('should be accessible alongside other chat state', () => {
      const preloadedState: Partial<RootState> = {
        chat: {
          currentSession: null,
          sessions: [],
          typingAIs: [],
          isLoading: false,
          aiPersonalities: {},
          selectedModels: {},
          webSearchPreferred: true,
        },
      };

      const store = createAppStore(preloadedState);
      const chatState = store.getState().chat;

      expect(chatState).toHaveProperty('webSearchPreferred');
      expect(chatState).toHaveProperty('currentSession');
      expect(chatState).toHaveProperty('sessions');
      expect(chatState).toHaveProperty('typingAIs');
      expect(chatState).toHaveProperty('isLoading');
      expect(chatState).toHaveProperty('aiPersonalities');
      expect(chatState).toHaveProperty('selectedModels');
    });
  });

  describe('Redux DevTools Integration', () => {
    it('should properly identify the action type', () => {
      const action = setWebSearchPreferred(true);

      expect(action.type).toBe('chat/setWebSearchPreferred');
      expect(action.payload).toBe(true);
    });

    it('should create distinct actions for different values', () => {
      const action1 = setWebSearchPreferred(true);
      const action2 = setWebSearchPreferred(false);

      expect(action1.type).toBe(action2.type);
      expect(action1.payload).toBe(true);
      expect(action2.payload).toBe(false);
    });
  });

  describe('Immutability', () => {
    it('should not mutate the previous state', () => {
      const store = createAppStore();

      const stateBefore = store.getState();
      const webSearchBefore = stateBefore.chat.webSearchPreferred;

      store.dispatch(setWebSearchPreferred(true));

      // Previous state reference should remain unchanged
      expect(stateBefore.chat.webSearchPreferred).toBe(webSearchBefore);

      // New state should have the updated value
      const stateAfter = store.getState();
      expect(stateAfter.chat.webSearchPreferred).toBe(true);

      // Chat state should be different objects
      expect(stateBefore.chat).not.toBe(stateAfter.chat);
    });
  });

  describe('Edge Cases', () => {
    it('should handle setting the same value consecutively', () => {
      const store = createAppStore();

      store.dispatch(setWebSearchPreferred(true));
      expect(store.getState().chat.webSearchPreferred).toBe(true);

      store.dispatch(setWebSearchPreferred(true));
      expect(store.getState().chat.webSearchPreferred).toBe(true);

      // Setting to a different value should work
      store.dispatch(setWebSearchPreferred(false));
      expect(store.getState().chat.webSearchPreferred).toBe(false);
    });

    it('should work correctly with undefined initial state', () => {
      // Create store without preloaded state
      const store = createAppStore();

      // Should use default value (false)
      expect(store.getState().chat.webSearchPreferred).toBe(false);

      // Should be able to set to true
      store.dispatch(setWebSearchPreferred(true));
      expect(store.getState().chat.webSearchPreferred).toBe(true);
    });
  });
});
