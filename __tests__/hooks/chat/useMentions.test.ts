import { act } from '@testing-library/react-native';
import type { RootState } from '@/store';
import { useMentions } from '@/hooks/chat/useMentions';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

describe('useMentions', () => {
  const baseState: Partial<RootState> = {
    chat: {
      currentSession: {
        id: 'session-1',
        selectedAIs: [
          { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-opus' },
          { id: 'gpt-4', provider: 'openai', name: 'GPT-4', model: 'gpt-4o' },
        ],
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
  } as Partial<RootState>;

  it('provides mention suggestions and helpers', () => {
    const { result } = renderHookWithProviders(() => useMentions(), {
      preloadedState: baseState,
    });

    expect(result.current.suggestions.map(s => s.displayName)).toEqual(['Claude', 'GPT-4']);
    expect(result.current.detectMentionTrigger('Hello @c')).toBe(true);
    expect(result.current.hasMentions('Hi @claude')).toBe(true);
    expect(result.current.hasMentions('Hello there')).toBe(false);

    const filtered = result.current.filterSuggestions('Hello @g', baseState.chat!.currentSession!.selectedAIs);
    expect(filtered.map(s => s.displayName)).toEqual(['GPT-4']);

    const setInputText = jest.fn();
    act(() => {
      result.current.insertMention('Claude', 'Hi @cl', setInputText);
    });
    expect(setInputText).toHaveBeenCalledWith('Hi @claude ');

    const mentions = result.current.parseMentions('Hi @claude and @gpt-4');
    expect(mentions).toEqual(['claude', 'gpt']);
  });
});
