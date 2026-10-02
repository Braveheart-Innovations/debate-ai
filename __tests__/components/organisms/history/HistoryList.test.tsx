import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HistoryList } from '@/components/organisms/history/HistoryList';
import type { ChatSession, AIConfig } from '@/types';

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Swipeable: ({ children, renderRightActions }: any) =>
      React.createElement(
        View,
        null,
        children,
        renderRightActions
          ? React.createElement(
              View,
              { testID: 'swipe-actions' },
              renderRightActions()
            )
          : null
      ),
  };
});

const mockSessionCard = jest.fn(({ session, onPress, onLongPress, isSelected, selectionMode, testID }: any) => (
  <TouchableOpacity
    testID={testID}
    onPress={() => onPress(session)}
    onLongPress={() => onLongPress?.(session)}
  >
    <Text>{`${session.id}:${selectionMode ? 'selecting' : 'normal'}:${isSelected ? 'selected' : 'unselected'}`}</Text>
  </TouchableOpacity>
));

const mockSwipeableActions = jest.fn(({ onDelete }: any) => (
  <Text testID="swipe-delete" onPress={onDelete}>
    delete
  </Text>
));

const mockLoadMoreIndicator = jest.fn(
  ({ onLoadMore, hasMore, isLoading }: { onLoadMore: () => void; hasMore?: boolean; isLoading?: boolean }) =>
    hasMore
      ? (
          <Text testID="load-more" onPress={onLoadMore}>
            {isLoading ? 'Loading…' : 'Load more'}
          </Text>
        )
      : null
);

jest.mock('@/components/molecules/history', () => ({
  SessionCard: (props: any) => mockSessionCard(props),
  SwipeableActions: (props: any) => mockSwipeableActions(props),
  LoadMoreIndicator: (props: any) => mockLoadMoreIndicator(props),
}));

const sampleAI: AIConfig = {
  id: 'ai-1',
  provider: 'claude',
  name: 'Claude',
  model: 'haiku',
};

const sessions: ChatSession[] = [
  {
    id: 'session-1',
    selectedAIs: [sampleAI],
    messages: [],
    isActive: false,
    createdAt: 1,
  },
  {
    id: 'session-2',
    selectedAIs: [sampleAI],
    messages: [],
    isActive: false,
    createdAt: 2,
  },
];

describe('HistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders sessions and handles press callbacks', () => {
    const onSessionPress = jest.fn();
    const onDelete = jest.fn();

    const { getByTestId, getAllByTestId } = renderWithProviders(
      <HistoryList
        sessions={sessions}
        onSessionPress={onSessionPress}
        onSessionDelete={onDelete}
        searchTerm=""
        testID="history-list"
      />
    );

    fireEvent.press(getByTestId('session-card-session-1'));
    expect(onSessionPress).toHaveBeenCalledWith(sessions[0]);

    const deleteButtons = getAllByTestId('swipe-delete');
    fireEvent.press(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('session-1');
  });

  it('invokes onLoadMore when nearing end and has more pages', () => {
    const onLoadMore = jest.fn();

    const { getByTestId } = renderWithProviders(
      <HistoryList
        sessions={sessions}
        onSessionPress={jest.fn()}
        onSessionDelete={jest.fn()}
        searchTerm=""
        testID="history-list"
        onLoadMore={onLoadMore}
        hasMorePages
      />
    );

    fireEvent.press(getByTestId('load-more'));
    expect(onLoadMore).toHaveBeenCalled();

    fireEvent(getByTestId('history-list'), 'onEndReached');
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('passes selection state and disables swipe actions in selection mode', () => {
    const onLongPress = jest.fn();

    const { getByTestId, queryAllByTestId } = renderWithProviders(
      <HistoryList
        sessions={sessions}
        onSessionPress={jest.fn()}
        onSessionLongPress={onLongPress}
        onSessionDelete={jest.fn()}
        selectedSessionIds={new Set(['session-2'])}
        selectionMode
        searchTerm=""
        testID="history-list"
      />
    );

    expect(queryAllByTestId('swipe-delete')).toHaveLength(0);
    expect(mockSessionCard).toHaveBeenCalledWith(expect.objectContaining({
      session: sessions[1],
      isSelected: true,
      selectionMode: true,
    }));

    fireEvent(getByTestId('session-card-session-1'), 'longPress');
    expect(onLongPress).toHaveBeenCalledWith(sessions[0]);
  });
});
