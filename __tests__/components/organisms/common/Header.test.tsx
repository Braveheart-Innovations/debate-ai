import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { Text, useWindowDimensions } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { Header } from '@/components/organisms/common/Header';
import * as Haptics from 'expo-haptics';
import { createMockWindowSize } from '@test-utils/fixtures';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const Mock = (props: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('svg', props, props.children);
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

// jest.setup.ts mocks the hook module that react-native's `useWindowDimensions` getter returns.
const mockUseWindowDimensions = jest.mocked(useWindowDimensions);
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

jest.mock('@/hooks/home/useGreeting', () => ({
  useGreeting: () => ({
    timeBasedGreeting: 'The symposium awaits',
    welcomeMessage: 'Where ideas converge',
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWindowDimensions.mockReturnValue(createMockWindowSize(375, 812));
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

  it('falls back to default greeting when gradient variant has no title', () => {
    const { getByText } = renderWithProviders(
      <Header title="" variant="gradient" />
    );

    expect(getByText('The symposium awaits')).toBeTruthy();
  });

  it('uses one top row for gradient date and right actions', () => {
    const { getByTestId } = renderWithProviders(
      <Header
        title="This isn't healthy"
        variant="gradient"
        showDate
        rightElement={<Text testID="header-right-actions">Actions</Text>}
      />
    );

    expect(getByTestId('header-gradient-top-row')).toHaveStyle({
      top: 4,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
    });
    expect(getByTestId('header-right-actions')).toBeTruthy();
  });

  it('renders a slim gradient bar with the tab-name title and right actions', () => {
    const { getByTestId, getByText } = renderWithProviders(
      <Header
        testID="slim-gradient-header"
        variant="gradient"
        slim
        title="Create"
        rightElement={<Text testID="header-right-actions">Actions</Text>}
      />
    );

    expect(getByTestId('header-slim-row')).toBeTruthy();
    expect(getByText('Create')).toBeTruthy();
    expect(getByTestId('header-right-actions')).toBeTruthy();
    expect(getByTestId('slim-gradient-header')).toHaveStyle({ minHeight: 52 });
  });

  it('renders a slim gradient bar with only the right actions, no greeting', () => {
    const { getByTestId, queryByText } = renderWithProviders(
      <Header
        testID="slim-gradient-header"
        variant="gradient"
        slim
        rightElement={<Text testID="header-right-actions">Actions</Text>}
      />
    );

    expect(getByTestId('header-slim-row')).toBeTruthy();
    expect(getByTestId('header-right-actions')).toBeTruthy();
    // The greeting is moved to the body, so the slim bar shows no greeting text.
    expect(queryByText('The symposium awaits')).toBeNull();
    expect(getByTestId('slim-gradient-header')).toHaveStyle({ minHeight: 52 });
  });

  it('keeps standard phone gradient headers compact', () => {
    const { getByTestId } = renderWithProviders(
      <Header
        testID="standard-gradient-header"
        title="Time for reflection"
        subtitle="Or avoidance. Your call."
        variant="gradient"
        showDate
        rightElement={<Text testID="header-right-actions">Actions</Text>}
      />
    );

    expect(getByTestId('standard-gradient-header')).toHaveStyle({
      minHeight: 132,
    });
  });

  it('reserves badge room without deepening every phone gradient header', () => {
    const { getByTestId } = renderWithProviders(
      <Header
        testID="normal-gradient-header"
        title="Time for reflection"
        subtitle="Or avoidance. Your call."
        variant="gradient"
        showDate
        showDemoBadge
        rightElement={<Text testID="header-right-actions">Actions</Text>}
      />
    );

    expect(getByTestId('normal-gradient-header')).toHaveStyle({
      minHeight: 140,
    });
  });

  it('keeps iPad gradient title and subtitle inside the header bounds', () => {
    mockUseWindowDimensions.mockReturnValue(createMockWindowSize(820, 1180));

    const { getByTestId } = renderWithProviders(
      <Header
        testID="ipad-gradient-header"
        title="Create"
        subtitle="Image, Video, and Audio Generation"
        variant="gradient"
        showDate
        rightElement={<Text testID="header-right-actions">Actions</Text>}
      />
    );

    expect(getByTestId('ipad-gradient-header')).toHaveStyle({
      minHeight: 140,
    });
  });

  it('keeps debate motion titles to two lines when subtitle is present', () => {
    const motion =
      'ICE actions in Minneapolis prove the current administration has no respect for due process';
    const { getByText, getByTestId } = renderWithProviders(
      <Header
        testID="motion-gradient-header"
        title={`Motion: ${motion}`}
        subtitle="ChatGPT vs Claude"
        variant="gradient"
        showBackButton
        onBack={jest.fn()}
      />
    );

    expect(getByText(motion).props.numberOfLines).toBe(2);
    expect(getByText('ChatGPT vs Claude')).toBeTruthy();
    expect(getByTestId('motion-gradient-header')).toHaveStyle({
      minHeight: 156,
    });
  });
});
