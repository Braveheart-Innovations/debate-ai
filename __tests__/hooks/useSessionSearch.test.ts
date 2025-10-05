import { act, renderHook } from '@testing-library/react-native';
import { useSessionSearch } from '@/hooks/history/useSessionSearch';
import { buildSessionList, createMockSession } from '../../test-utils/hooks/historyFixtures';
import type { ChatSession } from '@/types';

const mockFilterBySearchTerm = jest.fn();
const mockFindSearchMatches = jest.fn();
const mockFilterByOptions = jest.fn();
const mockSmartSearch = jest.fn();

jest.mock('@/services/history', () => ({
  sessionFilterService: {
    filterBySearchTerm: (...args: unknown[]) => mockFilterBySearchTerm(...args),
    findSearchMatches: (...args: unknown[]) => mockFindSearchMatches(...args),
    filterByOptions: (...args: unknown[]) => mockFilterByOptions(...args),
    smartSearch: (...args: unknown[]) => mockSmartSearch(...args),
  },
}));

describe('useSessionSearch', () => {
  const sessions: ChatSession[] = buildSessionList(3, index => ({
    messages: [{ id: `m-${index}`, role: 'assistant', content: `Response ${index}`, createdAt: 1 }],
    selectedAIs: [
      { id: `ai-${index}`, name: `AI ${index}`, provider: 'anthropic', model: 'claude' },
    ],
    topic: index === 1 ? 'AI Policy' : undefined,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockFilterBySearchTerm.mockReturnValue([sessions[1]]);
    mockFindSearchMatches.mockReturnValue([{ sessionId: sessions[1].id, matches: [] }]);
    mockFilterByOptions.mockImplementation((current) => current);
    mockSmartSearch.mockReturnValue([sessions[0]]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces search input and surfaces filtered results', () => {
    const { result } = renderHook(() => useSessionSearch(sessions));

    expect(result.current.filteredSessions).toEqual(sessions);
    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.setSearchQuery('policy');
    });

    expect(result.current.isSearching).toBe(true);

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(mockFilterBySearchTerm).toHaveBeenCalledWith(sessions, 'policy', expect.any(Object));
    expect(result.current.filteredSessions).toEqual([sessions[1]]);
    expect(result.current.searchMatches).toHaveLength(1);
    expect(result.current.hasActiveFilters).toBe(true);
    expect(result.current.searchStats.filteredCount).toBe(1);

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.filteredSessions).toEqual(sessions);
  });

  it('supports advanced and smart search helpers', () => {
    const { result } = renderHook(() => useSessionSearch(sessions));

    const advanced = result.current.advancedSearch({
      query: 'AI',
      aiProviders: ['anthropic'],
    });

    expect(mockFilterBySearchTerm).toHaveBeenCalledWith(expect.any(Array), 'AI');
    expect(mockFilterByOptions).toHaveBeenCalled();
    expect(Array.isArray(advanced)).toBe(true);

    const smart = result.current.smartSearch('policy');
    expect(mockSmartSearch).toHaveBeenCalledWith(sessions, 'policy');
    expect(smart).toEqual([sessions[0]]);

    const emptySmart = result.current.smartSearch('');
    expect(emptySmart).toEqual(sessions);

    const freshSession = createMockSession({ topic: 'New Topic' });
    const { result: resultWithNew } = renderHook(() => useSessionSearch([freshSession]));
    expect(resultWithNew.current.searchStats.totalSessions).toBe(1);
  });
});
