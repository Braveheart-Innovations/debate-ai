import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { StatsEmptyState } from '@/components/organisms/stats/StatsEmptyState';

describe('StatsEmptyState', () => {
  it('renders default messaging', () => {
    const { getByText } = renderWithProviders(<StatsEmptyState />);

    expect(getByText('No debates yet!')).toBeTruthy();
    expect(getByText('Start Your First Debate')).toBeTruthy();
  });

  it('fires CTA handler when provided', () => {
    const onCTAPress = jest.fn();
    const { getByText } = renderWithProviders(
      <StatsEmptyState ctaText="Start" onCTAPress={onCTAPress} />
    );

    fireEvent.press(getByText('Start'));
    expect(onCTAPress).toHaveBeenCalled();
  });

  it('hides help text when disabled', () => {
    const { queryByText } = renderWithProviders(
      <StatsEmptyState showHelp={false} />
    );

    expect(queryByText(/Debates help you/)).toBeNull();
  });
});
