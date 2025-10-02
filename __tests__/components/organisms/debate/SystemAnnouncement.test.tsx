import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SystemAnnouncement } from '@/components/organisms/debate/SystemAnnouncement';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ...require('react-native-reanimated/mock'),
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      springify: () => ({ damping: () => ({}) }),
      duration: () => ({}),
    },
    FadeOut: {
      duration: () => ({}),
    },
    useSharedValue: () => ({ value: 1 }),
    useAnimatedStyle: (fn: any) => fn(),
    withSpring: (value: any) => value,
  };
});

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('SystemAnnouncement', () => {
  it('renders content text', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test announcement" />
    );

    expect(getByText('Test announcement')).toBeTruthy();
  });

  it('renders label when provided', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" label="ROUND 1" />
    );

    expect(getByText('ROUND 1')).toBeTruthy();
  });

  it('renders custom icon when provided', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" icon="🎉" />
    );

    expect(getByText('🎉')).toBeTruthy();
  });

  it('renders default icon for debate-start type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="debate-start" content="Test" />
    );

    expect(getByText('🥊')).toBeTruthy();
  });

  it('renders default icon for exchange-winner type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="exchange-winner" content="Test" />
    );

    expect(getByText('🎯')).toBeTruthy();
  });

  it('renders default icon for debate-complete type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="debate-complete" content="Test" />
    );

    expect(getByText('🏁')).toBeTruthy();
  });

  it('renders default icon for overall-winner type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="overall-winner" content="Test" />
    );

    expect(getByText('🏆')).toBeTruthy();
  });

  it('renders without icon for topic type', () => {
    const { queryByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" />
    );

    // Topic type has no default icon
    expect(queryByText('📢')).toBeNull();
  });

  it('handles different animation types', () => {
    const { toJSON: slideUp } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" animation="slide-up" />
    );

    const { toJSON: scale } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" animation="scale" />
    );

    const { toJSON: fade } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" animation="fade" />
    );

    expect(slideUp).toBeTruthy();
    expect(scale).toBeTruthy();
    expect(fade).toBeTruthy();
  });
});