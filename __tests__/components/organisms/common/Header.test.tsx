import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { Header } from '@/components/organisms/common/Header';
import * as Haptics from 'expo-haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const Mock = (props: any) => React.createElement('svg', props, props.children);
  return {
    __esModule: true,
    default: Mock,
    Svg: Mock,
    Path: Mock,
    Defs: Mock,
    LinearGradient: Mock,
    Stop: Mock,
    Rect: Mock,
    G: Mock,
    Circle: Mock,
  };
});

jest.mock('@/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(
        TouchableOpacity,
        { onPress, testID: `button-${title}` },
        React.createElement(Text, null, title)
      )
    ),
    Badge: ({ label }: { label: string }) => React.createElement(Text, { testID: `badge-${label}` }, label),
  };
});

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title, subtitle, and back button triggers haptics', () => {
    const onBack = jest.fn();
    const { getByText, getByTestId } = renderWithProviders(
      <Header title="Session Overview" subtitle="Today" onBack={onBack} showBackButton />
    );

    expect(getByText('Session Overview')).toBeTruthy();
    expect(getByText('Today')).toBeTruthy();

    fireEvent.press(getByTestId('header-back-button'));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(onBack).toHaveBeenCalled();
  });

  it('renders action button and invokes callback', () => {
    const onAction = jest.fn();
    const { getByTestId } = renderWithProviders(
      <Header
        title="History"
        actionButton={{ label: 'Start', onPress: onAction, variant: 'primary' }}
      />
    );

    fireEvent.press(getByTestId('button-Start'));
    expect(onAction).toHaveBeenCalled();
  });

  it('shows session count and premium badge when provided', () => {
    const { getByText, getByTestId } = renderWithProviders(
      <Header
        title="History"
        sessionCount={{ current: 8, max: 10, isPremium: true }}
      />
    );

    expect(getByText('History')).toBeTruthy();
    expect(getByText('8 Sessions / 10')).toBeTruthy();
    expect(getByTestId('badge-Premium')).toBeTruthy();
  });

  it('falls back to greeting when gradient variant has no title', () => {
    const { getByText } = renderWithProviders(
      <Header title="" variant="gradient" />
    );

    expect(getByText(/Good (morning|afternoon|evening|night)/)).toBeTruthy();
  });
});
