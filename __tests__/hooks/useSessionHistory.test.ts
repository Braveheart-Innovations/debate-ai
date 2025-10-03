import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import type { ChatSession } from '@/types';

const mockGetAllSessions = jest.fn<Promise<ChatSession[]>, []>();
const mockClearAllSessions = jest.fn<Promise<void>, []>();

jest.mock('@/services/chat', () => ({
  StorageService: {
    getAllSessions: () => mockGetAllSessions(),
    clearAllSessions: () => mockClearAllSessions(),
  },
}));

const { useSessionHistory } = require('@/hooks/history/useSessionHistory');

describe('useSessionHistory', () => {
  const baseSession: ChatSession = {
    id: 'session-1',
    selectedAIs: [
      {
        id: 'ai-1',
        provider: 'claude',
        name: 'Claude',
        model: 'claude-3-haiku',
      },
    ],
    messages: [],
    isActive: false,
    createdAt: 1700000000000,
    lastMessageAt: 1700000005000,
    sessionType: 'chat',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockGetAllSessions.mockReset();
    mockClearAllSessions.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('loads sessions on mount', async () => {
    const sessions: ChatSession[] = [{ ...baseSession }];
    mockGetAllSessions.mockResolvedValueOnce(sessions);

    const { result } = renderHookWithProviders(() => useSessionHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.error).toBeNull();
    expect(mockGetAllSessions).toHaveBeenCalledTimes(1);
  });

  it('refresh fetches sessions again and updates state', async () => {
    const initialSessions: ChatSession[] = [{ ...baseSession, id: 'session-1' }];
    const refreshedSessions: ChatSession[] = [{ ...baseSession, id: 'session-2' }];
    mockGetAllSessions.mockResolvedValueOnce(initialSessions);
    mockGetAllSessions.mockResolvedValueOnce(refreshedSessions);

    const { result } = renderHookWithProviders(() => useSessionHistory());

    await waitFor(() => expect(result.current.sessions).toEqual(initialSessions));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.sessions).toEqual(refreshedSessions));
    expect(mockGetAllSessions).toHaveBeenCalledTimes(2);
  });

  it('clears history and resets sessions to empty array', async () => {
    mockGetAllSessions.mockResolvedValueOnce([{ ...baseSession }]);
    mockClearAllSessions.mockResolvedValueOnce(undefined);

    const { result } = renderHookWithProviders(() => useSessionHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.clearHistory();
    });

    expect(mockClearAllSessions).toHaveBeenCalledTimes(1);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces errors when clearing history fails', async () => {
    const error = new Error('Failed to clear history');
    const existingSessions: ChatSession[] = [{ ...baseSession }];
    mockGetAllSessions.mockResolvedValueOnce(existingSessions);
    mockClearAllSessions.mockRejectedValueOnce(error);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHookWithProviders(() => useSessionHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.clearHistory();
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBe(error);
    expect(mockClearAllSessions).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.error).toEqual(error));
    expect(result.current.sessions).toEqual(existingSessions);

    errorSpy.mockRestore();
  });
});
