import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HistoryStats } from '@/components/organisms/history/HistoryStats';

describe('HistoryStats', () => {
  it('returns null when not visible', () => {
    const { toJSON } = renderWithProviders(
      <HistoryStats visible={false} sessionCount={0} messageCount={0} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders stats text and handles press when provided', () => {
    const onPress = jest.fn();

    const { getByText } = renderWithProviders(
      <HistoryStats
        visible
        sessionCount={2}
        messageCount={5}
        onPress={onPress}
      />
    );

    const text = getByText('2 conversations • 5 total messages');
    fireEvent.press(text);
    expect(onPress).toHaveBeenCalled();
  });
});
