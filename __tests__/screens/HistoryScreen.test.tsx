import { Alert, Text } from 'react-native';
import { act } from '@testing-library/react-native';
import HistoryScreen from '@/screens/HistoryScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { showSheet, createAppStore } from '@/store';
import type { ChatSession } from '@/types';
import type {
  HistoryScreenNavigationProps,
  UseSessionActionsReturn,
  UseSessionHistoryReturn,
  UseSessionSearchReturn,
} from '@/types/history';
import type { UseSessionPaginationReturn } from '@/hooks/history/useSessionPagination';
import type useFeatureAccess from '@/hooks/useFeatureAccess';
import type {
  EmptyHistoryState,
  HistoryList,
  HistoryListSkeleton,
  HistorySearchBar,
  HistoryStats,
  SessionDetailPane,
} from '@/components/organisms/history';
import type { ErrorBoundary, Header, HeaderActions } from '@/components/organisms';
import type { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import type { Button, Typography } from '@/components/molecules';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockChatSession, createMockMessage } from '@test-utils/fixtures';
import { requireDefined } from '@test-utils/queries';

// Mock ErrorService
const mockShowSuccess = jest.fn();
const mockHandleWithToast = jest.fn();
jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
    showWarning: jest.fn(),
    showInfo: jest.fn(),
  },
}));

let sessionCounter = 1;

const createSession = (overrides: Partial<ChatSession> = {}): ChatSession => {
  const id = overrides.id ?? `session-${sessionCounter++}`;
  return createMockChatSession({
    id,
    selectedAIs: [],
    messages: [
      createMockMessage({
        id: `message-${sessionCounter}`,
        sender: 'You',
        senderType: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      }),
    ],
    isActive: false,
    createdAt: Date.now(),
    sessionType: 'chat',
    ...overrides,
  });
};

const makeHistoryState = (overrides: Partial<UseSessionHistoryReturn> = {}): UseSessionHistoryReturn => ({
  sessions: [createSession({})],
  isLoading: false,
  isRefreshing: false,
  error: null,
  refresh: jest.fn(),
  clearHistory: jest.fn(),
  ...overrides,
});

const makeSearchState = (
  overrides: Partial<UseSessionSearchReturn>,
  defaultSessions: ChatSession[]
): UseSessionSearchReturn => ({
  searchQuery: '',
  setSearchQuery: jest.fn(),
  filteredSessions: defaultSessions,
  searchMatches: [],
  hasActiveFilters: false,
  clearSearch: jest.fn(),
  ...overrides,
});

const makeActionsState = (overrides: Partial<UseSessionActionsReturn> = {}): UseSessionActionsReturn => ({
  deleteSession: jest.fn(),
  resumeSession: jest.fn(),
  shareSession: jest.fn(),
  archiveSession: jest.fn(),
  bulkDelete: jest.fn(),
  isProcessing: false,
  ...overrides,
});

const makePaginationState = (
  overrides: Partial<UseSessionPaginationReturn>,
  defaultSessions: ChatSession[]
): UseSessionPaginationReturn => ({
  currentPageSessions: defaultSessions,
  hasMorePages: false,
  isLoadingMore: false,
  currentPage: 1,
  totalPages: 1,
  loadMore: jest.fn(),
  resetPagination: jest.fn(),
  paginationInfo: { showing: defaultSessions.length, total: defaultSessions.length, pageSize: 20 },
  ...overrides,
});

type FeatureAccessState = Partial<ReturnType<typeof useFeatureAccess>>;

let sessionHistoryState: UseSessionHistoryReturn;
let sessionSearchState: UseSessionSearchReturn;
let sessionActionsState: UseSessionActionsReturn;
let sessionPaginationState: UseSessionPaginationReturn;
let featureAccessState: FeatureAccessState;

const mockUseSessionHistory = jest.fn<UseSessionHistoryReturn, []>();
const mockUseSessionSearch = jest.fn<UseSessionSearchReturn, [ChatSession[]]>();
const mockUseSessionActions = jest.fn<UseSessionActionsReturn, unknown[]>();
const mockUseSessionStats = jest.fn<undefined, [ChatSession[]]>();
const mockUseSessionPagination = jest.fn<UseSessionPaginationReturn, unknown[]>();

mockUseSessionStats.mockImplementation(() => undefined);

jest.mock('@/hooks/history', () => ({
  useSessionHistory: () => mockUseSessionHistory(),
  useSessionSearch: (sessions: ChatSession[]) => mockUseSessionSearch(sessions),
  useSessionActions: (...args: unknown[]) => mockUseSessionActions(...args),
  useSessionStats: (sessions: ChatSession[]) => mockUseSessionStats(sessions),
  useSessionPagination: (...args: unknown[]) => mockUseSessionPagination(...args),
}));

let focusEffectCallback: (() => void | (() => void)) | undefined;
let focusEffectCleanup: (() => void) | undefined;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    focusEffectCallback = cb;
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      focusEffectCleanup = typeof cleanup === 'function' ? cleanup : undefined;
      return cleanup;
    }, [cb]);
  },
}));

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({
    timeBasedGreeting: 'History awaits',
    welcomeMessage: 'Your past conversations',
    greeting: {
      timeBasedGreeting: 'History awaits',
      welcomeMessage: 'Your past conversations',
    },
  }),
}));

const mockUseFeatureAccess = jest.fn<FeatureAccessState, unknown[]>();

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    isTablet: false,
    isLandscape: false,
    isPhone: true,
    isPortrait: true,
    width: 375,
    height: 812,
    responsive: <T,>(phone: T) => phone,
    rs: () => 16,
    fontSize: () => 16,
    gridColumns: (phone: number) => phone,
  }),
}));

const mockClearAllSessions = jest.fn();

jest.mock('@/services/chat', () => ({
  StorageService: {
    clearAllSessions: (...args: unknown[]) => mockClearAllSessions(...args),
  },
}));

// Prop captures for the stubbed children (read lazily by the jest.mock factories below).
const mockHeader = capturePropsOf<typeof Header>((props) => (
  <Text testID="history-header">{props.title}</Text>
));
const mockHistorySearchBar = capturePropsOf<typeof HistorySearchBar>(() => (
  <Text testID="history-search-bar">search-bar</Text>
));
const mockHistoryList = capturePropsOf<typeof HistoryList>((props) => (
  <>
    <Text testID="history-list">history-list</Text>
    {props.ListEmptyComponent ?? null}
  </>
));
const mockHistoryStats = capturePropsOf<typeof HistoryStats>((props) => (
  <Text testID="history-stats">{props.visible ? 'visible' : 'hidden'}</Text>
));
const mockEmptyHistoryState = capturePropsOf<typeof EmptyHistoryState>(() => (
  <Text testID="history-empty">empty</Text>
));
const mockHistoryListSkeleton = capturePropsOf<typeof HistoryListSkeleton>(() => (
  <Text testID="history-skeleton">skeleton</Text>
));
const mockSessionDetailPane = capturePropsOf<typeof SessionDetailPane>(() => (
  <Text testID="session-detail-pane">detail-pane</Text>
));
const mockHeaderActions = capturePropsOf<typeof HeaderActions>(() => (
  <Text testID="history-header-actions">actions</Text>
));
const mockErrorBoundary = capturePropsOf<typeof ErrorBoundary>((props) => <>{props.children}</>);
const mockDemoBanner = capturePropsOf<typeof DemoBanner>((props) => (
  <Text testID="history-demo-banner" onPress={props.onPress}>demo-banner</Text>
));
const mockButton = capturePropsOf<typeof Button>((props) => (
  <Text testID={`history-button-${props.title}`} onPress={props.onPress}>{props.title}</Text>
));
const mockTypography = capturePropsOf<typeof Typography>((props) => <Text>{props.children}</Text>);

/** Fails loudly when an optional prop the screen should always wire is missing. */
/** Latest props rendered for the Button with this title (buttons re-render per state change). */
const findButton = (label: string) => [...mockButton.calls].reverse().find((props) => props.title === label);

const pressButton = async (label: string) => {
  const button = findButton(label);
  if (!button) {
    throw new Error(`Button with title "${label}" not found`);
  }
  await act(async () => {
    button.onPress();
  });
};

jest.mock('@/components/organisms/history', () => ({
  get HistorySearchBar() {
    return mockHistorySearchBar.Stub;
  },
  get HistoryList() {
    return mockHistoryList.Stub;
  },
  get HistoryStats() {
    return mockHistoryStats.Stub;
  },
  get EmptyHistoryState() {
    return mockEmptyHistoryState.Stub;
  },
  get HistoryListSkeleton() {
    return mockHistoryListSkeleton.Stub;
  },
  get SessionDetailPane() {
    return mockSessionDetailPane.Stub;
  },
}));

jest.mock('@/components/organisms', () => ({
  get Header() {
    return mockHeader.Stub;
  },
  get HeaderActions() {
    return mockHeaderActions.Stub;
  },
  get ErrorBoundary() {
    return mockErrorBoundary.Stub;
  },
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  __esModule: true,
  get DemoBanner() {
    return mockDemoBanner.Stub;
  },
  get default() {
    return mockDemoBanner.Stub;
  },
}));

jest.mock('@/components/molecules', () => ({
  get Button() {
    return mockButton.Stub;
  },
  get Typography() {
    return mockTypography.Stub;
  },
}));

const alertSpy = jest.spyOn(Alert, 'alert');
const mockNavigate = jest.fn();
const navigation: HistoryScreenNavigationProps = {
  navigate: mockNavigate,
  goBack: jest.fn(),
  setParams: jest.fn(),
};

const renderHistoryScreen = (options: {
  history?: Partial<UseSessionHistoryReturn>;
  search?: Partial<UseSessionSearchReturn>;
  actions?: Partial<UseSessionActionsReturn>;
  pagination?: Partial<UseSessionPaginationReturn>;
  featureAccess?: FeatureAccessState;
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
    mockNavigate.mockClear();
    mockUseSessionHistory.mockReset();
    mockUseSessionSearch.mockReset();
    mockUseSessionActions.mockReset();
    mockUseSessionPagination.mockReset();
    mockUseFeatureAccess.mockReset();
    mockUseSessionStats.mockClear();
    mockClearAllSessions.mockReset();
    alertSpy.mockReset();
    mockShowSuccess.mockClear();
    mockHandleWithToast.mockClear();
    focusEffectCallback = undefined;
    focusEffectCleanup = undefined;
    [
      mockHeader,
      mockHeaderActions,
      mockErrorBoundary,
      mockHistorySearchBar,
      mockHistoryList,
      mockHistoryStats,
      mockEmptyHistoryState,
      mockHistoryListSkeleton,
      mockSessionDetailPane,
      mockDemoBanner,
      mockButton,
      mockTypography,
    ].forEach((capture) => capture.reset());
  });

  afterEach(() => {
    focusEffectCleanup?.();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders history data and wires list and search handlers', () => {
    renderHistoryScreen();

    expect(mockHistoryList.latest().sessions).toEqual(sessionSearchState.filteredSessions);
    expect(typeof mockHistoryList.latest().onSessionPress).toBe('function');
    expect(typeof mockHistoryList.latest().onSessionLongPress).toBe('function');
    expect(typeof mockHistoryList.latest().onSessionDelete).toBe('function');
    expect(mockHistoryList.latest().selectionMode).toBe(false);
    expect(mockHistoryList.latest().searchTerm).toBe(sessionSearchState.searchQuery);
    expect(mockHistoryList.latest().refreshing).toBe(sessionHistoryState.isRefreshing);
    expect(mockHistoryList.latest().onRefresh).toBe(sessionHistoryState.refresh);

    const [firstSession] = sessionSearchState.filteredSessions;
    mockHistoryList.latest().onSessionPress(firstSession);
    expect(sessionActionsState.resumeSession).toHaveBeenCalledWith(firstSession);

    mockHistoryList.latest().onSessionDelete('session-1');
    expect(sessionActionsState.deleteSession).toHaveBeenCalledWith('session-1');

    mockHistorySearchBar.latest().onChange('AI');
    expect(sessionSearchState.setSearchQuery).toHaveBeenCalledWith('AI');

    mockUseSessionStats.mock.calls.forEach(([sessions]) => {
      expect(sessions).toEqual(sessionHistoryState.sessions);
    });

    expect(mockButton.calls.map((props) => props.title)).toEqual(expect.arrayContaining(['All (1)', 'Chat (1)', 'Compare', 'Debate']));
  });

  it('resets pagination when search query or tab changes', async () => {
    const { renderResult } = renderHistoryScreen();
    expect(sessionPaginationState.resetPagination).toHaveBeenCalledTimes(1);

    jest.mocked(sessionPaginationState.resetPagination).mockClear();
    sessionSearchState.searchQuery = 'claude';

    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });

    expect(sessionPaginationState.resetPagination).toHaveBeenCalledTimes(1);

    jest.mocked(sessionPaginationState.resetPagination).mockClear();
    await pressButton('Chat (1)');

    expect(sessionPaginationState.resetPagination).toHaveBeenCalledTimes(1);
  });

  it('shows loading skeleton when history is loading', () => {
    renderHistoryScreen({ history: { isLoading: true } });

    expect(mockHeader.latest().title).toBe('The Archives');
    expect(mockHistoryList.calls).toHaveLength(0);
  });

  it('renders error state with retry handler', () => {
    renderHistoryScreen({ history: { error: new Error('boom'), isLoading: false } });

    expect(mockEmptyHistoryState.latest().type).toBe('loading-error');
    expect(mockEmptyHistoryState.latest().onRetry).toBe(sessionHistoryState.refresh);
  });

  it('refreshes sessions after focus effect delay', () => {
    renderHistoryScreen();
    expect(sessionHistoryState.refresh).not.toHaveBeenCalled();

    act(() => {
      const cleanup = focusEffectCallback?.();
      focusEffectCleanup = typeof cleanup === 'function' ? cleanup : undefined;
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(sessionHistoryState.refresh).toHaveBeenCalledTimes(1);
  });

  it('supports selecting visible history rows and bulk deleting them', async () => {
    const sessions = [
      createSession({ id: 'session-1' }),
      createSession({ id: 'session-2' }),
    ];
    const bulkDelete = jest.fn().mockResolvedValue(true);
    renderHistoryScreen({
      history: { sessions },
      search: { filteredSessions: sessions },
      actions: { bulkDelete },
    });

    await act(async () => {
      requireDefined(mockHistoryList.latest().onSessionLongPress, 'onSessionLongPress')(sessions[0]);
    });

    expect(mockHistoryList.latest().selectionMode).toBe(true);
    expect(requireDefined(mockHistoryList.latest().selectedSessionIds, 'selectedSessionIds').has('session-1')).toBe(true);
    expect(mockHistoryStats.latest().visible).toBe(false);

    await pressButton('Select Visible');
    expect(requireDefined(mockHistoryList.latest().selectedSessionIds, 'selectedSessionIds').has('session-2')).toBe(true);

    await pressButton('Delete (2)');
    expect(bulkDelete).toHaveBeenCalledWith(['session-1', 'session-2']);
    expect(mockHistoryList.latest().selectionMode).toBe(false);
  });

  it('preserves selected history rows when bulk delete is cancelled', async () => {
    const sessions = [
      createSession({ id: 'session-1' }),
      createSession({ id: 'session-2' }),
    ];
    const bulkDelete = jest.fn().mockResolvedValue(false);
    renderHistoryScreen({
      history: { sessions },
      search: { filteredSessions: sessions },
      actions: { bulkDelete },
    });

    await act(async () => {
      requireDefined(mockHistoryList.latest().onSessionLongPress, 'onSessionLongPress')(sessions[0]);
    });
    await pressButton('Select Visible');
    await pressButton('Delete (2)');

    expect(bulkDelete).toHaveBeenCalledWith(['session-1', 'session-2']);
    expect(mockHistoryList.latest().selectionMode).toBe(true);
    expect(requireDefined(mockHistoryList.latest().selectedSessionIds, 'selectedSessionIds').has('session-1')).toBe(true);
    expect(requireDefined(mockHistoryList.latest().selectedSessionIds, 'selectedSessionIds').has('session-2')).toBe(true);
  });

  it('shows demo indicators and dispatches subscription sheet', async () => {
    const store = createAppStore();
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    renderHistoryScreen({ featureAccess: { isDemo: true }, store });

    // Demo is now indicated by the thin banner under the header, not a header chip.
    expect(mockDemoBanner.latest().subtitle).toContain('Demo Mode');

    await act(async () => {
      requireDefined(mockDemoBanner.latest().onPress, 'onPress')();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('navigates to correct destinations when starting new sessions from empty state', async () => {
    renderHistoryScreen({ history: { sessions: [] }, search: { filteredSessions: [] } });

    mockNavigate.mockClear();
    requireDefined(mockEmptyHistoryState.latest().onStartChat, 'onStartChat')();
    expect(mockNavigate).toHaveBeenCalledWith('Home');

    mockNavigate.mockClear();
    await pressButton('Chat');

    requireDefined(mockEmptyHistoryState.latest().onStartChat, 'onStartChat')();
    expect(mockNavigate).toHaveBeenCalledWith('Home');

    mockNavigate.mockClear();
    await pressButton('Compare');

    requireDefined(mockEmptyHistoryState.latest().onStartChat, 'onStartChat')();
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'CompareTab' });

    mockNavigate.mockClear();
    await pressButton('Debate');

    requireDefined(mockEmptyHistoryState.latest().onStartChat, 'onStartChat')();
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'DebateTab' });
  });

  it('clears search from search bar and empty state controls', () => {
    renderHistoryScreen();

    act(() => {
      requireDefined(mockHistorySearchBar.latest().onClear, 'onClear')();
    });
    expect(sessionSearchState.clearSearch).toHaveBeenCalledTimes(1);

    act(() => {
      requireDefined(mockEmptyHistoryState.latest().onClearSearch, 'onClearSearch')();
    });
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

    expect(mockHistoryList.latest().sessions).toEqual(sessionPaginationState.currentPageSessions);
    expect(mockHistoryList.latest().onLoadMore).toBe(sessionPaginationState.loadMore);
    expect(mockHistoryList.latest().hasMorePages).toBe(true);
    expect(mockHistoryList.latest().isLoadingMore).toBe(true);
    expect(mockHistoryList.latest().totalSessions).toBe(longSessions.length);
  });

  it('disables pagination when under threshold', () => {
    const shortSessions = [createSession({ id: 'short-1' })];

    renderHistoryScreen({ history: { sessions: shortSessions }, search: { filteredSessions: shortSessions } });

    expect(mockHistoryList.latest().onLoadMore).toBeUndefined();
    expect(mockHistoryList.latest().hasMorePages).toBe(false);
    expect(mockHistoryList.latest().totalSessions).toBeUndefined();
  });

  it('updates history stats visibility based on search and session counts', async () => {
    const { renderResult } = renderHistoryScreen();

    expect(mockHistoryStats.latest().visible).toBe(true);

    sessionSearchState.searchQuery = 'filter';
    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });
    expect(mockHistoryStats.latest().visible).toBe(false);

    sessionSearchState.searchQuery = '';
    sessionHistoryState.sessions = [];
    sessionSearchState.filteredSessions = [];
    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });
    expect(mockHistoryStats.latest().visible).toBe(false);
  });

  it('sets empty state types for search results and tab-specific messaging', async () => {
    const { renderResult } = renderHistoryScreen({
      history: { sessions: [] },
      search: { filteredSessions: [], searchQuery: '' },
    });

    expect(mockEmptyHistoryState.latest().type).toBe('no-sessions');
    // The witty greeting is the title; the functional guidance is the message.
    expect(mockEmptyHistoryState.latest().emptyStateConfig).toMatchObject({
      title: 'History awaits',
      message: 'Your past conversations',
    });

    sessionSearchState.searchQuery = 'anthropic';
    sessionSearchState.filteredSessions = [];
    await act(async () => {
      renderResult.rerender(<HistoryScreen navigation={navigation} />);
    });

    expect(mockEmptyHistoryState.latest().type).toBe('no-results');

    await pressButton('Debate');
    expect(mockEmptyHistoryState.latest().emptyStateConfig).toMatchObject({ title: 'History awaits', message: 'Start a debate to see it here' });

    await pressButton('Compare');
    expect(mockEmptyHistoryState.latest().emptyStateConfig).toMatchObject({ title: 'History awaits', message: 'Compare AI responses to see them here' });

    await pressButton('Chat');
    expect(mockEmptyHistoryState.latest().emptyStateConfig).toMatchObject({ title: 'History awaits', message: 'Start a conversation to see it here' });
  });
});
