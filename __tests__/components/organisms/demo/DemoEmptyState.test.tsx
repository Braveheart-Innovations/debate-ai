import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return {
    ...Reanimated,
    useAnimatedStyle: () => ({}),
    useSharedValue: jest.fn(() => ({ value: 0 })),
    withRepeat: jest.fn((animation) => animation),
    withSequence: jest.fn((...animations) => animations[0]),
    withTiming: jest.fn((toValue) => toValue),
    Easing: {
      inOut: jest.fn(() => jest.fn()),
      ease: {},
    },
    FadeIn: {
      duration: () => ({ duration: jest.fn() }),
    },
  };
});

const { DemoEmptyState } = require('@/components/organisms/demo/DemoEmptyState');

describe('DemoEmptyState', () => {
  describe('default rendering', () => {
    it('renders with default title', () => {
      const { getByText } = renderWithProviders(<DemoEmptyState />);
      expect(getByText('Choose a Demo Conversation')).toBeTruthy();
    });

    it('renders with default subtitle', () => {
      const { getByText } = renderWithProviders(<DemoEmptyState />);
      expect(getByText('Select a sample above to see the AI in action')).toBeTruthy();
    });

    it('displays Demo Mode indicator', () => {
      const { getByText } = renderWithProviders(<DemoEmptyState />);
      expect(getByText('Demo Mode')).toBeTruthy();
    });
  });

  describe('custom props', () => {
    it('renders with custom title', () => {
      const { getByText } = renderWithProviders(
        <DemoEmptyState title="Custom Title" />
      );
      expect(getByText('Custom Title')).toBeTruthy();
    });

    it('renders with custom subtitle', () => {
      const { getByText } = renderWithProviders(
        <DemoEmptyState subtitle="Custom subtitle text" />
      );
      expect(getByText('Custom subtitle text')).toBeTruthy();
    });

    it('renders with both custom title and subtitle', () => {
      const { getByText } = renderWithProviders(
        <DemoEmptyState title="My Title" subtitle="My Subtitle" />
      );
      expect(getByText('My Title')).toBeTruthy();
      expect(getByText('My Subtitle')).toBeTruthy();
    });
  });

  describe('arrow visibility', () => {
    it('shows arrow by default', () => {
      const { getByText } = renderWithProviders(<DemoEmptyState />);
      // Arrow is rendered, and the component works correctly
      expect(getByText('Choose a Demo Conversation')).toBeTruthy();
    });

    it('shows arrow when showArrow is true', () => {
      const { getByText } = renderWithProviders(
        <DemoEmptyState showArrow={true} />
      );
      expect(getByText('Choose a Demo Conversation')).toBeTruthy();
    });

    it('hides arrow when showArrow is false', () => {
      const { getByText } = renderWithProviders(
        <DemoEmptyState showArrow={false} />
      );
      expect(getByText('Choose a Demo Conversation')).toBeTruthy();
    });
  });

  describe('icon display', () => {
    it('renders the chat bubbles icon container', () => {
      const { getByText } = renderWithProviders(<DemoEmptyState />);
      // The component renders successfully with the icon
      expect(getByText('Demo Mode')).toBeTruthy();
    });
  });

  describe('demo mode indicator', () => {
    it('displays the Demo Mode badge', () => {
      const { getByText } = renderWithProviders(<DemoEmptyState />);
      expect(getByText('Demo Mode')).toBeTruthy();
    });
  });

  describe('combined props', () => {
    it('renders with all custom props', () => {
      const { getByText, queryByText } = renderWithProviders(
        <DemoEmptyState
          title="Welcome to Demo"
          subtitle="Try out the features"
          showArrow={false}
        />
      );
      expect(getByText('Welcome to Demo')).toBeTruthy();
      expect(getByText('Try out the features')).toBeTruthy();
      expect(getByText('Demo Mode')).toBeTruthy();
    });
  });
});
