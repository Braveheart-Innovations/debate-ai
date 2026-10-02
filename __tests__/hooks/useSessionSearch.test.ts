import { act, renderHook } from '@testing-library/react-native';
import { useSessionSearch } from '@/hooks/history/useSessionSearch';
import {
  buildSessionList,
  createMockAIConfig,
  createMockSession,
} from '../../test-utils/hooks/historyFixtures';
import { createMockAIMessage } from '../../test-utils/fixtures';
import { requireDefined } from '../../test-utils/queries';
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
  const sessions: ChatSession[] = buildSessionList(3, index => {
    const ai = createMockAIConfig({ id: `ai-${index}`, name: `AI ${index}` });
    return {
      messages: [createMockAIMessage({ id: `m-${index}`, content: `Response ${index}` }, ai)],
      selectedAIs: [ai],
      topic: index === 1 ? 'AI Policy' : undefined,
    };
  });

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
    expect(requireDefined(result.current.searchStats, 'searchStats').filteredCount).toBe(1);

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.filteredSessions).toEqual(sessions);
  });

  it('supports advanced and smart search helpers', () => {
    const { result } = renderHook(() => useSessionSearch(sessions));

    const advancedSearch = requireDefined(result.current.advancedSearch, 'advancedSearch');
    const smartSearch = requireDefined(result.current.smartSearch, 'smartSearch');

    const advanced = advancedSearch({
      query: 'AI',
      aiProviders: ['claude'],
    });

    expect(mockFilterBySearchTerm).toHaveBeenCalledWith(expect.any(Array), 'AI');
    expect(mockFilterByOptions).toHaveBeenCalled();
    expect(Array.isArray(advanced)).toBe(true);

    const smart = smartSearch('policy');
    expect(mockSmartSearch).toHaveBeenCalledWith(sessions, 'policy');
    expect(smart).toEqual([sessions[0]]);

    const emptySmart = smartSearch('');
    expect(emptySmart).toEqual(sessions);

    const freshSession = createMockSession({ topic: 'New Topic' });
    const { result: resultWithNew } = renderHook(() => useSessionSearch([freshSession]));
    expect(requireDefined(resultWithNew.current.searchStats, 'searchStats').totalSessions).toBe(1);
  });
});
