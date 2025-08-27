import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Box } from '../components/atoms';
import { Button, StorageIndicator } from '../components/molecules';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
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
  const [activeTab, setActiveTab] = useState<'all' | 'chat' | 'comparison' | 'debate'>('all');
  
  // Check if user is premium
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const isPremium = currentUser?.subscription === 'pro' || currentUser?.subscription === 'business';
  
  // Compose hooks for different concerns
  const { sessions, isLoading, error, refresh } = useSessionHistory();
  const { searchQuery, setSearchQuery, filteredSessions, clearSearch } = useSessionSearch(sessions);
  const { deleteSession, resumeSession } = useSessionActions(navigation);
  useSessionStats(sessions); // For future analytics features
  useSubscriptionLimits(sessions.length);
  
  // Filter sessions by type
  const typeFilteredSessions = useMemo(() => {
    if (activeTab === 'all') return filteredSessions;
    return filteredSessions.filter(session => {
      // Sessions without sessionType are treated as 'chat' for backward compatibility
      const type = session.sessionType || 'chat';
      return type === activeTab;
    });
  }, [filteredSessions, activeTab]);
  
  // Get counts for each type
  const sessionCounts = useMemo(() => {
    return sessions.reduce((counts, session) => {
      const type = session.sessionType || 'chat';
      counts[type] = (counts[type] || 0) + 1;
      counts.all = (counts.all || 0) + 1;
      return counts;
    }, { all: 0, chat: 0, comparison: 0, debate: 0 });
  }, [sessions]);
  
  // Memoize total message count to avoid expensive recalculation on every render
  const totalMessageCount = useMemo(() => {
    return sessions.reduce((sum, session) => sum + session.messages.length, 0);
  }, [sessions]);
  
  // Pagination for large datasets (only enable for non-premium users with 100+ sessions or search results)
  const shouldUsePagination = typeFilteredSessions.length > 100 || (!searchQuery && sessions.length > 100);
  const {
    currentPageSessions,
    hasMorePages,
    isLoadingMore,
    loadMore,
    resetPagination
  } = useSessionPagination({
    sessions: typeFilteredSessions,
    pageSize: 20,
    initialPageSize: 15
  });

  // Use paginated sessions if pagination is enabled, otherwise use all filtered sessions
  const displaySessions = shouldUsePagination ? currentPageSessions : typeFilteredSessions;

  // Reset pagination when search query or tab changes
  useEffect(() => {
    resetPagination();
  }, [searchQuery, activeTab, resetPagination]);

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
    if (searchQuery && typeFilteredSessions.length === 0) {
      return 'no-results';
    }
    return 'no-sessions';
  };

  // Handle navigation based on active tab
  const handleStartNew = () => {
    switch (activeTab) {
      case 'debate':
        navigation.navigate('MainTabs', { screen: 'DebateTab' });
        break;
      case 'comparison':
        navigation.navigate('MainTabs', { screen: 'CompareTab' });
        break;
      case 'chat':
      case 'all':
      default:
        navigation.navigate('Home');
        break;
    }
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

          {/* Storage indicator for free tier */}
          {!isPremium && (
            <StorageIndicator
              segments={[
                { 
                  count: sessionCounts.chat, 
                  limit: 3, 
                  color: theme.colors.primary[500], 
                  label: 'Chats' 
                },
                { 
                  count: sessionCounts.comparison, 
                  limit: 3, 
                  color: theme.colors.secondary[500], 
                  label: 'Compare' 
                },
                { 
                  count: sessionCounts.debate, 
                  limit: 3, 
                  color: theme.colors.warning[500], 
                  label: 'Debates' 
                },
              ]}
              onUpgrade={() => navigation.navigate('Premium')}
            />
          )}

          {/* Search bar */}
          <HistorySearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={handleClearSearch}
            placeholder="Search messages or AI names..."
          />

          {/* Type filter tabs */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
          >
            {(['all', 'chat', 'comparison', 'debate'] as const).map(tab => {
              const label = tab === 'comparison' ? 'Compare' : tab.charAt(0).toUpperCase() + tab.slice(1);
              const count = sessionCounts[tab];
              const isActive = activeTab === tab;
              // Calculate min width based on whether button is active and has count
              const minWidth = isActive && count > 0 ? 110 : 90;
              
              return (
                <Button
                  key={tab}
                  title={`${label}${count > 0 ? ` (${count})` : ''}`}
                  onPress={() => setActiveTab(tab)}
                  variant={isActive ? 'primary' : 'ghost'}
                  size="small"
                  style={{ minWidth, paddingHorizontal: 16 }}
                />
              );
            })}
          </ScrollView>

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
                onStartChat={handleStartNew}
                onRetry={refresh}
                onClearSearch={handleClearSearch}
                emptyStateConfig={
                  activeTab === 'debate' ? {
                    icon: 'sword-cross',
                    iconLibrary: 'material-community',
                    title: 'No debates yet',
                    message: 'Start a debate to see it here',
                    actionText: 'Start Debating'
                  } : activeTab === 'comparison' ? {
                    icon: 'git-compare-outline',
                    iconLibrary: 'ionicons',
                    title: 'No comparisons yet',
                    message: 'Compare AI responses to see them here',
                    actionText: 'Start Comparing'
                  } : activeTab === 'chat' ? {
                    icon: 'chatbubbles-outline',
                    iconLibrary: 'ionicons',
                    title: 'No chats yet',
                    message: 'Start a conversation to see it here',
                    actionText: 'Start Chatting'
                  } : undefined
                }
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