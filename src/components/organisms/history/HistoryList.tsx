import React, { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SessionCard, SwipeableActions, LoadMoreIndicator } from '@/components/molecules/history';
import { ChatSession } from '../../../types';
import { HistoryListProps } from '../../../types/history';

export const HistoryList: React.FC<HistoryListProps> = ({
  sessions,
  onSessionPress,
  onSessionDelete,
  searchTerm,
  refreshing = false,
  onRefresh,
  ListEmptyComponent,
  testID,
  onLoadMore,
  hasMorePages = false,
  isLoadingMore = false,
  totalSessions
}) => {

  const renderSession = useCallback(({ item, index }: { item: ChatSession; index: number }) => {
    const handleDelete = () => {
      onSessionDelete(item.id);
    };

    return (
      <Swipeable
        renderRightActions={() => (
          <SwipeableActions
            onDelete={handleDelete}
          />
        )}
        overshootRight={false}
        enableTrackpadTwoFingerGesture={false} // Disable for better performance
        shouldCancelWhenOutside={true} // Cancel swipe when scrolling
      >
        <SessionCard
          session={item}
          onPress={onSessionPress}
          searchTerm={searchTerm}
          isHighlighted={false}
          index={index}
          testID={`session-card-${item.id}`}
        />
      </Swipeable>
    );
  }, [onSessionPress, onSessionDelete, searchTerm]);

  const keyExtractor = useCallback((item: ChatSession) => item.id, []);

  // Only use getItemLayout for small lists to avoid memory overhead
  const getItemLayout = useCallback(
    (_data: ArrayLike<ChatSession> | null | undefined, index: number) => ({
      length: 88, // Approximate height of SessionCard + margin
      offset: 88 * index,
      index,
    }),
    []
  );
  
  // Conditionally use getItemLayout based on list size
  const shouldUseGetItemLayout = sessions.length < 50;

  const renderFooter = useCallback(() => {
    // Don't show footer if there are no sessions or if we're showing empty component
    if (sessions.length === 0) {
      return null;
    }

    // Only show load more if pagination is enabled
    if (!onLoadMore) {
      return null;
    }

    return (
      <LoadMoreIndicator
        isLoading={isLoadingMore}
        hasMore={hasMorePages}
        onLoadMore={onLoadMore}
        totalShowing={sessions.length}
        totalItems={totalSessions || sessions.length}
      />
    );
  }, [sessions.length, onLoadMore, isLoadingMore, hasMorePages, totalSessions]);

  const handleEndReached = useCallback(() => {
    if (hasMorePages && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMorePages, isLoadingMore, onLoadMore]);

  return (
    <FlatList
      data={sessions}
      keyExtractor={keyExtractor}
      renderItem={renderSession}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={renderFooter}
      showsVerticalScrollIndicator={false}
      refreshing={refreshing}
      onRefresh={onRefresh}
      testID={testID}
      // Pagination
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.2} // Trigger when 20% from the bottom
      // Performance optimizations - adjusted for better memory management
      removeClippedSubviews={sessions.length > 20} // Only for larger lists
      maxToRenderPerBatch={5} // Reduced batch size
      updateCellsBatchingPeriod={100} // Increased batching period
      initialNumToRender={8} // Show fewer items initially
      windowSize={5} // Reduced window size to save memory
      getItemLayout={shouldUseGetItemLayout ? getItemLayout : undefined}
      // Keyboard handling
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
  },
});
