import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { EmptyHistoryState } from '@/components/organisms/history/EmptyHistoryState';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement(Text, { ...props, testID: `ion-${name}` }, name),
    MaterialCommunityIcons: ({ name, ...props }: { name: string }) =>
      React.createElement(Text, { ...props, testID: `mc-${name}` }, name),
  };
});

jest.mock('@/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Button: ({ title, onPress, style }: { title: string; onPress: () => void; style?: any }) =>
      React.createElement(
        Text,
        { accessibilityRole: 'button', style, onPress },
        title
      ),
  };
});

describe('EmptyHistoryState', () => {
  it('renders no-results variant with search term and clears search', () => {
    const onClearSearch = jest.fn();
    const { getByText } = renderWithProviders(
      <EmptyHistoryState
        type="no-results"
        searchTerm="alpha"
        onClearSearch={onClearSearch}
      />
    );

    expect(getByText('No matches found')).toBeTruthy();
    expect(getByText('No conversations match "alpha"')).toBeTruthy();

    fireEvent.press(getByText('Clear Search'));
    expect(onClearSearch).toHaveBeenCalled();
  });

  it('renders loading-error variant and calls retry action', () => {
    const onRetry = jest.fn();
    const { getByText } = renderWithProviders(
      <EmptyHistoryState type="loading-error" onRetry={onRetry} />
    );

    fireEvent.press(getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('uses custom empty state configuration for no sessions', () => {
    const onStartChat = jest.fn();
    const { getByText, getByTestId } = renderWithProviders(
      <EmptyHistoryState
        type="no-sessions"
        onStartChat={onStartChat}
        emptyStateConfig={{
          icon: 'rocket-launch',
          iconLibrary: 'material-community',
          title: 'Nothing yet',
          message: 'Start chatting to populate history',
          actionText: 'Start Now',
        }}
      />
    );

    expect(getByTestId('mc-rocket-launch')).toBeTruthy();
    fireEvent.press(getByText('Start Now'));
    expect(onStartChat).toHaveBeenCalled();
  });
});
