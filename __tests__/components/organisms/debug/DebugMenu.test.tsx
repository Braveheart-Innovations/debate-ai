import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebugMenu } from '@/components/organisms/debug';

// Mock child components
jest.mock('@/components/organisms/debug/LogViewer', () => ({
  LogViewer: () => {
    const { Text } = require('react-native');
    return <Text>LogViewer</Text>;
  },
}));

jest.mock('@/components/organisms/debug/NetworkInspector', () => ({
  NetworkInspector: () => {
    const { Text } = require('react-native');
    return <Text>NetworkInspector</Text>;
  },
}));

jest.mock('@/components/organisms/debug/StateInspector', () => ({
  StateInspector: () => {
    const { Text } = require('react-native');
    return <Text>StateInspector</Text>;
  },
}));

jest.mock('@/components/organisms/debug/FeatureFlags', () => ({
  FeatureFlags: () => {
    const { Text } = require('react-native');
    return <Text>FeatureFlags</Text>;
  },
}));

// Mock atoms and molecules
jest.mock('@/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(Text, props, children),
  };
});

describe('DebugMenu', () => {
  it('does not render when visible is false', () => {
    const { queryByText } = renderWithProviders(
      <DebugMenu visible={false} onClose={jest.fn()} />
    );

    expect(queryByText('Debug Menu')).toBeNull();
  });

  it('renders when visible is true', () => {
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={jest.fn()} />
    );

    expect(getByText('Debug Menu')).toBeTruthy();
  });

  it('shows all tabs', () => {
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={jest.fn()} />
    );

    expect(getByText('Logs')).toBeTruthy();
    expect(getByText('Network')).toBeTruthy();
    expect(getByText('State')).toBeTruthy();
    expect(getByText('Flags')).toBeTruthy();
  });

  it('shows LogViewer by default', () => {
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={jest.fn()} />
    );

    expect(getByText('LogViewer')).toBeTruthy();
  });

  it('switches to Network tab when clicked', () => {
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={jest.fn()} />
    );

    fireEvent.press(getByText('Network'));

    expect(getByText('NetworkInspector')).toBeTruthy();
  });

  it('switches to State tab when clicked', () => {
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={jest.fn()} />
    );

    fireEvent.press(getByText('State'));

    expect(getByText('StateInspector')).toBeTruthy();
  });

  it('switches to Flags tab when clicked', () => {
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={jest.fn()} />
    );

    fireEvent.press(getByText('Flags'));

    expect(getByText('FeatureFlags')).toBeTruthy();
  });

  it('calls onClose when Close button is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <DebugMenu visible={true} onClose={onClose} />
    );

    fireEvent.press(getByText('Close'));

    expect(onClose).toHaveBeenCalled();
  });
});
