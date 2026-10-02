import type { ReactNode } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAIConfig, createMockChatSession } from '@test-utils/fixtures';
import { HistoryList } from '@/components/organisms/history/HistoryList';
import type {
  LoadMoreIndicator,
  SessionCard,
  SwipeableActions,
} from '@/components/molecules/history';

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  // HistoryList's renderRightActions ignores the gesture args, so the stub calls it bare.
  return {
    Swipeable: ({
      children,
      renderRightActions,
    }: {
      children?: ReactNode;
      renderRightActions?: () => ReactNode;
    }) =>
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

const mockSessionCard = capturePropsOf<typeof SessionCard>(
  ({ session, onPress, onLongPress, isSelected, selectionMode, testID }) => (
    <TouchableOpacity
      testID={testID}
      onPress={() => onPress(session)}
      onLongPress={() => onLongPress?.(session)}
    >
      <Text>{`${session.id}:${selectionMode ? 'selecting' : 'normal'}:${isSelected ? 'selected' : 'unselected'}`}</Text>
    </TouchableOpacity>
  )
);

const mockSwipeableActions = capturePropsOf<typeof SwipeableActions>(({ onDelete }) => (
  <Text testID="swipe-delete" onPress={onDelete}>
    delete
  </Text>
));

const mockLoadMoreIndicator = capturePropsOf<typeof LoadMoreIndicator>(
  ({ onLoadMore, hasMore, isLoading }) =>
    hasMore
      ? (
          <Text testID="load-more" onPress={onLoadMore}>
            {isLoading ? 'Loading…' : 'Load more'}
          </Text>
        )
      : null
);

jest.mock('@/components/molecules/history', () => ({
  get SessionCard() {
    return mockSessionCard.Stub;
  },
  get SwipeableActions() {
    return mockSwipeableActions.Stub;
  },
  get LoadMoreIndicator() {
    return mockLoadMoreIndicator.Stub;
  },
}));

const sampleAI = createMockAIConfig({
  id: 'ai-1',
  provider: 'claude',
  name: 'Claude',
  model: 'haiku',
});

const sessions = [
  createMockChatSession({
    id: 'session-1',
    selectedAIs: [sampleAI],
    messages: [],
    isActive: false,
    createdAt: 1,
  }),
  createMockChatSession({
    id: 'session-2',
    selectedAIs: [sampleAI],
    messages: [],
    isActive: false,
    createdAt: 2,
  }),
];

describe('HistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionCard.reset();
    mockSwipeableActions.reset();
    mockLoadMoreIndicator.reset();
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
    expect(mockSessionCard.calls).toContainEqual(expect.objectContaining({
      session: sessions[1],
      isSelected: true,
      selectionMode: true,
    }));

    fireEvent(getByTestId('session-card-session-1'), 'longPress');
    expect(onLongPress).toHaveBeenCalledWith(sessions[0]);
  });
});
