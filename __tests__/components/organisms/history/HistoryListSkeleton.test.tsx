import type { ReactNode } from 'react';
import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HistoryListSkeleton } from '@/components/organisms/history/HistoryListSkeleton';

jest.mock('@/components/atoms', () => ({
  Box: ({ children, style }: { children: ReactNode; style?: any }) => {
    const React = require('react');
    const { View } = require('react-native');
    const styleArray = Array.isArray(style) ? style : [style];
    const isSkeletonCard = styleArray.some((s) => s?.marginBottom === 12 && s?.padding === 16);
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
