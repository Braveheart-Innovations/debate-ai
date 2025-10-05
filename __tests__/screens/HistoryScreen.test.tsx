import React from 'react';
import { Alert } from 'react-native';
import { act } from '@testing-library/react-native';
import HistoryScreen from '@/screens/HistoryScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { showSheet, createAppStore } from '@/store';

let sessionCounter = 1;

const createSession = (overrides: Record<string, unknown> = {}) => {
  const {
    id = `session-${sessionCounter++}`,
    messages = [
      {
        id: `message-${sessionCounter}`,
        sender: 'You',
        senderType: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      },
    ],
    createdAt = Date.now(),
    sessionType = 'chat',
    ...rest
  } = overrides;

  return {
    id,
    selectedAIs: [],
    messages,
    isActive: false,
    createdAt,
    sessionType,
    ...rest,
  };
};

const makeHistoryState = (overrides: Record<string, unknown> = {}) => {
  const {
    sessions = [createSession({})],
    isLoading = false,
    error = null,
    refresh = jest.fn(),
    ...rest
  } = overrides;

  return { sessions, isLoading, error, refresh, ...rest };
};

const makeSearchState = (
  overrides: Record<string, unknown> = {},
  defaultSessions: Array<Record<string, unknown>>
) => {
  const {
    searchQuery = '',
    setSearchQuery = jest.fn(),
    filteredSessions = defaultSessions,
    clearSearch = jest.fn(),
    ...rest
  } = overrides;

  return { searchQuery, setSearchQuery, filteredSessions, clearSearch, ...rest };
};

const makeActionsState = (overrides: Record<string, unknown> = {}) => {
  const {
    deleteSession = jest.fn(),
    resumeSession = jest.fn(),
    ...rest
  } = overrides;

  return { deleteSession, resumeSession, ...rest };
};

const makePaginationState = (
  overrides: Record<string, unknown> = {},
  defaultSessions: Array<Record<string, unknown>>
) => {
  const {
    currentPageSessions = defaultSessions,
    hasMorePages = false,
    isLoadingMore = false,
    loadMore = jest.fn(),
    resetPagination = jest.fn(),
    ...rest
  } = overrides;

  return { currentPageSessions, hasMorePages, isLoadingMore, loadMore, resetPagination, ...rest };
};

let sessionHistoryState: ReturnType<typeof makeHistoryState>;
let sessionSearchState: ReturnType<typeof makeSearchState>;
let sessionActionsState: ReturnType<typeof makeActionsState>;
let sessionPaginationState: ReturnType<typeof makePaginationState>;
let featureAccessState: { isDemo: boolean };

const mockUseSessionHistory = jest.fn();
const mockUseSessionSearch = jest.fn();
const mockUseSessionActions = jest.fn();
const mockUseSessionStats = jest.fn();
const mockUseSessionPagination = jest.fn();

mockUseSessionStats.mockImplementation(() => undefined);

jest.mock('@/hooks/history', () => ({
  useSessionHistory: (...args: unknown[]) => mockUseSessionHistory(...args),
  useSessionSearch: (...args: unknown[]) => mockUseSessionSearch(...args),
  useSessionActions: (...args: unknown[]) => mockUseSessionActions(...args),
  useSessionStats: (...args: unknown[]) => mockUseSessionStats(...args),
  useSessionPagination: (...args: unknown[]) => mockUseSessionPagination(...args),
}));

let focusEffectCleanup: (() => void) | undefined;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const cleanup = cb();
    focusEffectCleanup = typeof cleanup === 'function' ? cleanup : undefined;
  },
}));

const mockUseFeatureAccess = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

const mockClearAllSessions = jest.fn();

jest.mock('@/services/chat', () => ({
  StorageService: {
    clearAllSessions: (...args: unknown[]) => mockClearAllSessions(...args),
  },
}));

let mockHeaderProps: any;
let mockHistorySearchProps: any;
let mockHistoryListProps: any;
let mockHistoryStatsProps: any;
let mockEmptyStateProps: any;
let mockDemoBannerProps: any;
let mockButtonRegistry: Map<string, any> = new Map();

const pressButton = async (label: string) => {
  const button = mockButtonRegistry.get(label);
  if (!button) {
    throw new Error(`Button with title "${label}" not found`);
  }
  await act(async () => {
    button.onPress();
  });
};

jest.mock('@/components/organisms/history', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    HistorySearchBar: (props: any) => {
      mockHistorySearchProps = props;
      return React.createElement(Text, { testID: 'history-search-bar' }, 'search-bar');
    },
    HistoryList: (props: any) => {
      mockHistoryListProps = props;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(Text, { testID: 'history-list' }, 'history-list'),
        props.ListEmptyComponent ?? null,
      );
    },
    HistoryStats: (props: any) => {
      mockHistoryStatsProps = props;
      return React.createElement(Text, { testID: 'history-stats' }, props.visible ? 'visible' : 'hidden');
    },
    EmptyHistoryState: (props: any) => {
      mockEmptyStateProps = props;
      return React.createElement(Text, { testID: 'history-empty' }, 'empty');
    },
    HistoryListSkeleton: () => React.createElement(Text, { testID: 'history-skeleton' }, 'skeleton'),
  };
});

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Header: (props: any) => {
      mockHeaderProps = props;
      return React.createElement(Text, { testID: 'history-header' }, props.title);
    },
    HeaderActions: () => React.createElement(Text, { testID: 'history-header-actions' }, 'actions'),
    ErrorBoundary: ({ children }: any) => children,
  };
});

jest.mock('@/components/molecules/subscription/DemoBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoBanner: (props: any) => {
      mockDemoBannerProps = props;
      return React.createElement(Text, { testID: 'history-demo-banner', onPress: props.onPress }, 'demo-banner');
    },
    __esModule: true,
    default: (props: any) => {
      mockDemoBannerProps = props;
      return React.createElement(Text, { testID: 'history-demo-banner', onPress: props.onPress }, 'demo-banner');
    },
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Button: (props: any) => {
      mockButtonRegistry.set(props.title, props);
      return React.createElement(Text, { testID: `history-button-${props.title}`, onPress: props.onPress }, props.title);
    },
  };
});

const alertSpy = jest.spyOn(Alert, 'alert');
const navigation = { navigate: jest.fn() } as any;

const renderHistoryScreen = (options: {
  history?: Record<string, unknown>;
  search?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  pagination?: Record<string, unknown>;
  featureAccess?: { isDemo?: boolean };
  store?: ReturnType<typeof createAppStore>;
} = {}) => {
  sessionHistoryState = makeHistoryState(options.history ?? {});
  sessionSearchState = makeSearchState(options.search ?? {}, sessionHistoryState.sessions);
  sessionActionsState = makeActionsState(options.actions ?? {});
  sessionPaginationState = makePaginationState(options.pagination ?? {}, sessionSearchState.filteredSessions);
  featureAccessState = { isDemo: false, ...(options.featureAccess ?? {}) };

  mockUseSessionHistory.mockImplementation(() => sessionHistoryState);
  mockUseSessionSearch.mockImplementation(() => sessionSearchState);
  mockUseSessionActions.mockImplementation(() => sessionActionsState);
  mockUseSessionPagination.mockImplementation(() => sessionPaginationState);
  mockUseFeatureAccess.mockImplementation(() => featureAccessState);

  const store = options.store ?? createAppStore();
  const renderResult = renderWithProviders(<HistoryScreen navigation={navigation} />, { store });

  return { renderResult, store };
};

describe('HistoryScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sessionCounter = 1;
    mockButtonRegistry = new Map();
    navigation.navigate.mockClear();
    mockUseSessionHistory.mockReset();
    mockUseSessionSearch.mockReset();
    mockUseSessionActions.mockReset();
    mockUseSessionPagination.mockReset();
    mockUseFeatureAccess.mockReset();
    mockUseSessionStats.mockClear();
    mockClearAllSessions.mockReset();
    alertSpy.mockReset();
    focusEffectCleanup = undefined;
    mockHeaderProps = undefined;
    mockHistorySearchProps = undefined;
    mockHistoryListProps = undefined;
    mockHistoryStatsProps = undefined;
    mockEmptyStateProps = undefined;
    mockDemoBannerProps = undefined;
  });

  afterEach(() => {
    focusEffectCleanup?.();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders history data and wires list and search handlers', () => {
    renderHistoryScreen();

    expect(mockHistoryListProps.sessions).toEqual(sessionSearchState.filteredSessions);
    expect(typeof mockHistoryListProps.onSessionPress).toBe('function');
    expect(typeof mockHistoryListProps.onSessionDelete).toBe('function');
    expect(mockHistoryListProps.searchTerm).toBe(sessionSearchState.searchQuery);
    expect(mockHistoryListProps.refreshing).toBe(sessionHistoryState.isLoading);
    expect(mockHistoryListProps.onRefresh).toBe(sessionHistoryState.refresh);

    mockHistoryListProps.onSessionPress('session-1');
    expect(sessionActionsState.resumeSession).toHaveBeenCalledWith('session-1');

    mockHistoryListProps.onSessionDelete('session-1');
    expect(sessionActionsState.deleteSession).toHaveBeenCalledWith('session-1');

    mockHistorySearchProps.onChange('AI');
    expect(sessionSearchState.setSearchQuery).toHaveBeenCalledWith('AI');

    mockUseSessionStats.mock.calls.forEach(([sessions]) => {
      expect(sessions).toEqual(sessionHistoryState.sessions);
    });

    expect(Array.from(mockButtonRegistry.keys())).toEqual(expect.arrayContaining(['All (1)', 'Chat (1)', 'Compare', 'Debate']));
  });

  it('resets pagination when search query or tab changes', async () => {
    const { renderResult } = renderHistoryScreen();
    expect(sessionPaginationState.resetPagination).toHaveBeenCalledTimes(1);

    sessionPaginationState.resetPagination.mockClear();
    sessionSearchState.searchQuery = 'claude';

    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });

    expect(sessionPaginationState.resetPagination).toHaveBeenCalledTimes(1);

    sessionPaginationState.resetPagination.mockClear();
    await pressButton('Chat (1)');

    expect(sessionPaginationState.resetPagination).toHaveBeenCalledTimes(1);
  });

  it('shows loading skeleton when history is loading', () => {
    renderHistoryScreen({ history: { isLoading: true } });

    expect(mockHeaderProps.title).toBe('Chat History');
    expect(mockHistoryListProps).toBeUndefined();
  });

  it('renders error state with retry handler', () => {
    renderHistoryScreen({ history: { error: new Error('boom'), isLoading: false } });

    expect(mockEmptyStateProps.type).toBe('loading-error');
    expect(mockEmptyStateProps.onRetry).toBe(sessionHistoryState.refresh);
  });

  it('refreshes sessions after focus effect delay', () => {
    renderHistoryScreen();
    expect(sessionHistoryState.refresh).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(sessionHistoryState.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears all storage via header action and shows success alert', async () => {
    mockClearAllSessions.mockResolvedValueOnce(undefined);
    renderHistoryScreen();

    await act(async () => {
      mockHeaderProps.actionButton.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const destructiveButton = buttons.find((btn: any) => btn.style === 'destructive');

    await act(async () => {
      await destructiveButton.onPress();
    });

    expect(mockClearAllSessions).toHaveBeenCalledTimes(1);
    expect(sessionHistoryState.refresh).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenLastCalledWith('Success', 'All storage has been cleared.');
  });

  it('handles storage clear failures gracefully', async () => {
    mockClearAllSessions.mockRejectedValueOnce(new Error('fail'));
    renderHistoryScreen();

    await act(async () => {
      mockHeaderProps.actionButton.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const destructiveButton = buttons.find((btn: any) => btn.style === 'destructive');

    alertSpy.mockClear();

    await act(async () => {
      await destructiveButton.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to clear storage.');
  });

  it('shows demo indicators and dispatches subscription sheet', async () => {
    const store = createAppStore();
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    renderHistoryScreen({ featureAccess: { isDemo: true }, store });

    expect(mockHeaderProps.showDemoBadge).toBe(true);
    expect(mockDemoBannerProps.subtitle).toContain('Demo Mode');

    await act(async () => {
      mockDemoBannerProps.onPress();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('navigates to correct destinations when starting new sessions from empty state', async () => {
    renderHistoryScreen({ history: { sessions: [] }, search: { filteredSessions: [] } });

    navigation.navigate.mockClear();
    mockEmptyStateProps.onStartChat();
    expect(navigation.navigate).toHaveBeenCalledWith('Home');

    navigation.navigate.mockClear();
    await pressButton('Chat');

    mockEmptyStateProps.onStartChat();
    expect(navigation.navigate).toHaveBeenCalledWith('Home');

    navigation.navigate.mockClear();
    await pressButton('Compare');

    mockEmptyStateProps.onStartChat();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'CompareTab' });

    navigation.navigate.mockClear();
    await pressButton('Debate');

    mockEmptyStateProps.onStartChat();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'DebateTab' });
  });

  it('clears search from search bar and empty state controls', () => {
    renderHistoryScreen();

    mockHistorySearchProps.onClear();
    expect(sessionSearchState.clearSearch).toHaveBeenCalledTimes(1);

    mockEmptyStateProps.onClearSearch();
    expect(sessionSearchState.clearSearch).toHaveBeenCalledTimes(2);
  });

  it('enables pagination controls when filtered sessions exceed threshold', () => {
    const longSessions = Array.from({ length: 120 }, (_, index) => createSession({ id: `session-${index}` }));

    renderHistoryScreen({
      history: { sessions: longSessions },
      search: { filteredSessions: longSessions },
      pagination: {
        currentPageSessions: longSessions.slice(0, 20),
        hasMorePages: true,
        isLoadingMore: true,
      },
    });

    expect(mockHistoryListProps.sessions).toEqual(sessionPaginationState.currentPageSessions);
    expect(mockHistoryListProps.onLoadMore).toBe(sessionPaginationState.loadMore);
    expect(mockHistoryListProps.hasMorePages).toBe(true);
    expect(mockHistoryListProps.isLoadingMore).toBe(true);
    expect(mockHistoryListProps.totalSessions).toBe(longSessions.length);
  });

  it('disables pagination when under threshold', () => {
    const shortSessions = [createSession({ id: 'short-1' })];

    renderHistoryScreen({ history: { sessions: shortSessions }, search: { filteredSessions: shortSessions } });

    expect(mockHistoryListProps.onLoadMore).toBeUndefined();
    expect(mockHistoryListProps.hasMorePages).toBe(false);
    expect(mockHistoryListProps.totalSessions).toBeUndefined();
  });

  it('updates history stats visibility based on search and session counts', async () => {
    const { renderResult } = renderHistoryScreen();

    expect(mockHistoryStatsProps.visible).toBe(true);

    sessionSearchState.searchQuery = 'filter';
    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });
    expect(mockHistoryStatsProps.visible).toBe(false);

    sessionSearchState.searchQuery = '';
    sessionHistoryState.sessions = [];
    sessionSearchState.filteredSessions = [];
    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });
    expect(mockHistoryStatsProps.visible).toBe(false);
  });

  it('sets empty state types for search results and tab-specific messaging', async () => {
    const { renderResult } = renderHistoryScreen({
      history: { sessions: [] },
      search: { filteredSessions: [], searchQuery: '' },
    });

    expect(mockEmptyStateProps.type).toBe('no-sessions');
    expect(mockEmptyStateProps.emptyStateConfig).toBeUndefined();

    sessionSearchState.searchQuery = 'anthropic';
    sessionSearchState.filteredSessions = [];
    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });

    expect(mockEmptyStateProps.type).toBe('no-results');

    await pressButton('Debate');
    expect(mockEmptyStateProps.emptyStateConfig).toMatchObject({ title: 'No debates yet' });

    await pressButton('Compare');
    expect(mockEmptyStateProps.emptyStateConfig).toMatchObject({ title: 'No comparisons yet' });

    await pressButton('Chat');
    expect(mockEmptyStateProps.emptyStateConfig).toMatchObject({ title: 'No chats yet' });
  });
});
