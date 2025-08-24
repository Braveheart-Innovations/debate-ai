import React, { useEffect, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Box } from '../components/atoms';
import { useTheme } from '../theme';
import { useFocusEffect } from '@react-navigation/native';
import { 
  HistorySearchBar, 
  HistoryList, 
  HistoryStats, 
  EmptyHistoryState,
  HistoryListSkeleton 
} from '../components/organisms/history';
import { ErrorBoundary, Header, HeaderActions } from '../components/organisms';
import { 
  useSessionHistory, 
  useSessionSearch, 
  useSessionActions, 
  useSessionStats, 
  useSubscriptionLimits,
  useSessionPagination 
} from '../hooks/history';
import { HistoryScreenNavigationProps } from '../types/history';

interface HistoryScreenProps {
  navigation: HistoryScreenNavigationProps;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  // Compose hooks for different concerns
  const { sessions, isLoading, error, refresh } = useSessionHistory();
  const { searchQuery, setSearchQuery, filteredSessions, clearSearch } = useSessionSearch(sessions);
  const { deleteSession, resumeSession } = useSessionActions(navigation);
  useSessionStats(sessions); // For future analytics features
  useSubscriptionLimits(sessions.length);
  
  // Memoize total message count to avoid expensive recalculation on every render
  const totalMessageCount = useMemo(() => {
    return sessions.reduce((sum, session) => sum + session.messages.length, 0);
  }, [sessions]);
  
  // Pagination for large datasets (only enable for non-premium users with 100+ sessions or search results)
  const shouldUsePagination = filteredSessions.length > 100 || (!searchQuery && sessions.length > 100);
  const {
    currentPageSessions,
    hasMorePages,
    isLoadingMore,
    loadMore,
    resetPagination
  } = useSessionPagination({
    sessions: filteredSessions,
    pageSize: 20,
    initialPageSize: 15
  });

  // Use paginated sessions if pagination is enabled, otherwise use all filtered sessions
  const displaySessions = shouldUsePagination ? currentPageSessions : filteredSessions;

  // Reset pagination when search query changes
  useEffect(() => {
    resetPagination();
  }, [searchQuery, resetPagination]);

  // Refresh sessions when screen comes into focus (tab navigation)
  useFocusEffect(
    React.useCallback(() => {
      // Small delay to ensure storage is updated
      const timer = setTimeout(() => {
        refresh();
      }, 100);
      return () => clearTimeout(timer);
    }, [refresh])
  );

  // Handle loading state
  if (isLoading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ErrorBoundary>
          <Box style={{ flex: 1, backgroundColor: theme.colors.background }}>
            {/* Header with skeleton data */}
            <Header
              variant="gradient"
              title="Chat History"
              subtitle="Loading your conversation archive..."
              showTime={true}
              showDate={true}
              animated={true}
            />

            {/* Don't show search bar during loading */}

            {/* Skeleton loading */}
            <HistoryListSkeleton count={4} />
          </Box>
        </ErrorBoundary>
      </SafeAreaView>
    );
  }

  // Handle error state
  if (error) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <EmptyHistoryState
          type="loading-error"
          onRetry={refresh}
        />
      </SafeAreaView>
    );
  }

  // Determine empty state type
  const getEmptyStateType = () => {
    if (searchQuery && filteredSessions.length === 0) {
      return 'no-results';
    }
    return 'no-sessions';
  };

  // Handle navigation to start new chat
  const handleStartChat = () => {
    navigation.navigate('Home');
  };

  // Handle clear search
  const handleClearSearch = () => {
    clearSearch();
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ErrorBoundary>
        <Box style={{ flex: 1, backgroundColor: theme.colors.background }}>
          {/* Header with title and subtitle */}
          <Header
            variant="gradient"
            title="Chat History"
            subtitle="Your conversation archive"
            showTime={true}
            showDate={true}
            animated={true}
            rightElement={<HeaderActions variant="gradient" />}
          />

          {/* Search bar */}
          <HistorySearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={handleClearSearch}
            placeholder="Search messages or AI names..."
          />

          {/* Session list */}
          <HistoryList
            sessions={displaySessions}
            onSessionPress={resumeSession}
            onSessionDelete={deleteSession}
            searchTerm={searchQuery}
            refreshing={isLoading}
            onRefresh={refresh}
            testID="history-session-list"
            onLoadMore={shouldUsePagination ? loadMore : undefined}
            hasMorePages={shouldUsePagination ? hasMorePages : false}
            isLoadingMore={shouldUsePagination ? isLoadingMore : false}
            totalSessions={shouldUsePagination ? filteredSessions.length : undefined}
            ListEmptyComponent={
              <EmptyHistoryState
                type={getEmptyStateType()}
                searchTerm={searchQuery}
                onStartChat={handleStartChat}
                onRetry={refresh}
                onClearSearch={handleClearSearch}
              />
            }
          />

          {/* Stats bar - only show when there are sessions and no search */}
          <HistoryStats
            sessionCount={sessions.length}
            messageCount={totalMessageCount}
            visible={!searchQuery && sessions.length > 0}
          />
        </Box>
      </ErrorBoundary>
    </SafeAreaView>
  );
};

export default HistoryScreen;