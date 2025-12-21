import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
  getStringAsync: jest.fn(),
}));
jest.mock('react-native-markdown-display', () => 'Markdown');
jest.mock('@/utils/markdown', () => ({
  sanitizeMarkdown: jest.fn((text) => text),
  shouldLazyRender: jest.fn(() => false),
}));
jest.mock('@/hooks/streaming/useStreamingMessage', () => ({
  useStreamingMessage: jest.fn(() => ({
    displayedContent: 'Test message',
    isStreaming: false,
  })),
}));
jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn((cb) => cb()),
    withTiming: jest.fn((value) => value),
    Easing: { out: jest.fn() },
    default: { View },
  };
});
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
    GlassCard: ({ children }: any) => children,
    Button: ({ title }: any) => React.createElement(Text, null, title),
  };
});

const { DebateMessageBubble } = require('@/components/molecules/debate/DebateMessageBubble');

describe('DebateMessageBubble', () => {
  const mockMessage = {
    id: '1',
    aiId: 'claude',
    role: 'assistant' as const,
    content: 'Test message content',
    timestamp: Date.now(),
    sender: 'Claude (Analytical)',
    metadata: {},
  };

  beforeEach(() => {
    // Default to phone dimensions
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <DebateMessageBubble message={mockMessage} />
    );
    expect(result).toBeTruthy();
  });

  describe('responsive width', () => {
    it('renders correctly on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812 });

      const result = renderWithProviders(
        <DebateMessageBubble message={mockMessage} />
      );
      expect(result).toBeTruthy();
    });

    it('renders correctly on tablet portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const result = renderWithProviders(
        <DebateMessageBubble message={mockMessage} />
      );
      expect(result).toBeTruthy();
    });

    it('renders correctly on tablet landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const result = renderWithProviders(
        <DebateMessageBubble message={mockMessage} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('host messages', () => {
    const hostMessage = {
      id: '2',
      aiId: 'system',
      role: 'system' as const,
      content: 'Welcome to the debate',
      timestamp: Date.now(),
      sender: 'Debate Host',
      metadata: {},
    };

    it('renders host message on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812 });

      const result = renderWithProviders(
        <DebateMessageBubble message={hostMessage} />
      );
      expect(result).toBeTruthy();
    });

    it('renders host message on tablet', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const result = renderWithProviders(
        <DebateMessageBubble message={hostMessage} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('side alignment', () => {
    it('renders left-aligned message', () => {
      const result = renderWithProviders(
        <DebateMessageBubble message={mockMessage} side="left" />
      );
      expect(result).toBeTruthy();
    });

    it('renders right-aligned message', () => {
      const result = renderWithProviders(
        <DebateMessageBubble message={mockMessage} side="right" />
      );
      expect(result).toBeTruthy();
    });

    it('renders center-aligned message', () => {
      const result = renderWithProviders(
        <DebateMessageBubble message={mockMessage} side="center" />
      );
      expect(result).toBeTruthy();
    });
  });
});
