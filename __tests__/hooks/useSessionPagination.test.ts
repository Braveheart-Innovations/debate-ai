import { act, renderHook } from '@testing-library/react-native';
import { useSessionPagination } from '@/hooks/history/useSessionPagination';
import { buildSessionList } from '../../test-utils/hooks/historyFixtures';

describe('useSessionPagination', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns all sessions when below pagination threshold', () => {
    const sessions = buildSessionList(3);
    const { result } = renderHook(() => useSessionPagination({ sessions }));

    expect(result.current.currentPageSessions).toHaveLength(3);
    expect(result.current.hasMorePages).toBe(false);
    expect(result.current.paginationInfo.total).toBe(3);
  });

  it('paginates sessions and resets correctly', () => {
    jest.useFakeTimers();
    const sessions = buildSessionList(12, index => ({ messages: Array(index + 1).fill({}).map((_, i) => ({ id: `msg-${index}-${i}`, role: 'user', content: 'hi', createdAt: Date.now() })) }));

    const { result } = renderHook(() => useSessionPagination({ sessions, pageSize: 4, initialPageSize: 4 }));

    expect(result.current.currentPageSessions).toHaveLength(4);
    expect(result.current.hasMorePages).toBe(true);

    act(() => {
      result.current.loadMore();
      jest.advanceTimersByTime(300);
    });

    expect(result.current.currentPageSessions).toHaveLength(8);
    expect(result.current.currentPage).toBe(2);
    expect(result.current.isLoadingMore).toBe(false);

    act(() => {
      result.current.resetPagination();
    });

    expect(result.current.currentPage).toBe(1);
    expect(result.current.currentPageSessions).toHaveLength(4);
  });
});
