import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { APIConfigProgress } from '@/components/organisms/api-config/APIConfigProgress';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    ProgressBar: ({ percentage }: { percentage: number }) => (
      React.createElement(Text, { testID: 'progress-value' }, `Progress:${percentage}`)
    ),
    ClearKeysButton: ({
      onPress,
      isVisible,
      title,
      subtitle,
    }: {
      onPress: () => Promise<void>;
      isVisible: boolean;
      title: string;
      subtitle: string;
    }) => (
      isVisible
        ? React.createElement(
            TouchableOpacity,
            { onPress, testID: 'clear-keys-button' },
            React.createElement(Text, null, title),
            React.createElement(Text, null, subtitle)
          )
        : null
    ),
  };
});

describe('APIConfigProgress', () => {
  it('shows zero-state messaging when no services are connected', () => {
    const onClearAll = jest.fn().mockResolvedValue(undefined);
    const { getByText, queryByTestId } = renderWithProviders(
      <APIConfigProgress configuredCount={0} totalCount={4} onClearAll={onClearAll} />
    );

    expect(getByText('Connect your AI services to unlock their full potential')).toBeTruthy();
    expect(getByText('No services connected')).toBeTruthy();
    expect(queryByTestId('clear-keys-button')).toBeNull();
  });

  it('shows progress and triggers clear action when services are connected', () => {
    const onClearAll = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = renderWithProviders(
      <APIConfigProgress configuredCount={2} totalCount={2} onClearAll={onClearAll} />
    );

    expect(getByText('Progress:100')).toBeTruthy();
    expect(getByText('🎉 All services connected!')).toBeTruthy();

    fireEvent.press(getByTestId('clear-keys-button'));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
