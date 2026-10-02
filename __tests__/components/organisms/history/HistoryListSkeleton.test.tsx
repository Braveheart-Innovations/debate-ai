import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HistoryListSkeleton } from '@/components/organisms/history/HistoryListSkeleton';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Box } from '@/components/atoms';

jest.mock('@/components/atoms', () => ({
  Box: ({ children, style }: PropsOf<typeof Box>) => {
    const React = require('react') as typeof import('react');
    const { View, StyleSheet } = jest.requireActual<typeof import('react-native')>('react-native');
    const flat = StyleSheet.flatten(style);
    const isSkeletonCard = flat?.marginBottom === 12 && flat?.padding === 16;
    return React.createElement(
      View,
      { testID: isSkeletonCard ? 'history-skeleton-card' : undefined, style },
      children
    );
  },
}));

describe('HistoryListSkeleton', () => {
  it('renders up to four skeleton cards by default', () => {
    const { getAllByTestId } = renderWithProviders(<HistoryListSkeleton />);
    expect(getAllByTestId('history-skeleton-card')).toHaveLength(4);
  });

  it('respects provided count when below limit', () => {
    const { getAllByTestId } = renderWithProviders(<HistoryListSkeleton count={2} />);
    expect(getAllByTestId('history-skeleton-card')).toHaveLength(2);
  });
});
