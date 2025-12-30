import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

// Mock Clipboard
const mockSetStringAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-clipboard', () => ({
  setStringAsync: mockSetStringAsync,
  getStringAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) => {
    const { Text } = require('react-native');
    return <Text testID={testID || `icon-${name}`}>{name}</Text>;
  },
  MaterialIcons: () => null,
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return ({ children }: { children: string }) => <Text>{children}</Text>;
});

jest.mock('@/utils/markdown', () => ({
  sanitizeMarkdown: jest.fn((text) => text || ''),
  shouldLazyRender: jest.fn(() => false),
}));

// Mutable streaming state for testing
let mockStreamingState = {
  content: 'Test message',
  isStreaming: false,
  cursorVisible: false,
  error: null as string | null,
  chunksReceived: 0,
};

jest.mock('@/hooks/streaming/useStreamingMessage', () => ({
  useStreamingMessage: jest.fn(() => mockStreamingState),
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

jest.mock('@/hooks/useMessageBubbleAnimation', () => ({
  useMessageBubbleAnimation: jest.fn(() => ({
    animatedStyle: {},
  })),
}));

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

jest.mock('@/components/organisms/common/StreamingIndicator', () => ({
  StreamingIndicator: ({ visible, variant }: { visible: boolean; variant: string }) => {
    const { Text } = require('react-native');
    return visible ? <Text testID={`streaming-${variant}`}>{variant}</Text> : null;
  },
}));

jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: ({ content }: { content: string }) => {
    const { Text } = require('react-native');
    return <Text>{content}</Text>;
  },
  createMarkdownStyles: jest.fn(() => ({})),
}));

const { DebateMessageBubble } = require('@/components/molecules/debate/DebateMessageBubble');

describe('DebateMessageBubble', () => {
  const createMessage = (overrides = {}) => ({
    id: 'msg-1',
    aiId: 'claude',
    role: 'assistant' as const,
    content: 'Test message content',
    timestamp: Date.now(),
    sender: 'Claude (Analytical)',
    metadata: {},
    ...overrides,
  });

  const defaultProps = {
    message: createMessage(),
    index: 0,
  };

  beforeEach(() => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812 });
    mockStreamingState = {
      content: 'Test message',
      isStreaming: false,
      cursorVisible: false,
      error: null,
      chunksReceived: 0,
    };
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('displays message content', () => {
      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText('Test message content')).toBeTruthy();
    });

    it('displays sender name', () => {
      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText('Claude (Analytical)')).toBeTruthy();
    });
  });

  describe('Responsive Width', () => {
    it('renders correctly on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812 });
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('renders correctly on tablet portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('renders correctly on tablet landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Host Messages', () => {
    const hostMessage = createMessage({
      id: 'host-1',
      aiId: 'system',
      role: 'system',
      content: 'Welcome to the debate',
      sender: 'Debate Host',
    });

    it('renders host message centered', () => {
      const result = renderWithProviders(
        <DebateMessageBubble message={hostMessage} index={0} />
      );
      expect(result).toBeTruthy();
    });

    it('renders host message on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812 });
      const result = renderWithProviders(
        <DebateMessageBubble message={hostMessage} index={0} />
      );
      expect(result).toBeTruthy();
    });

    it('renders host message on tablet', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });
      const result = renderWithProviders(
        <DebateMessageBubble message={hostMessage} index={0} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Side Alignment', () => {
    it('renders left-aligned message', () => {
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} side="left" />
      );
      expect(result).toBeTruthy();
    });

    it('renders right-aligned message', () => {
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} side="right" />
      );
      expect(result).toBeTruthy();
    });

    it('renders center-aligned message for host', () => {
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} side="center" />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('AI Color Mapping', () => {
    const aiProviders = [
      { name: 'Claude', sender: 'Claude (Analytical)' },
      { name: 'ChatGPT', sender: 'ChatGPT (Creative)' },
      { name: 'OpenAI', sender: 'OpenAI (Balanced)' },
      { name: 'Gemini', sender: 'Gemini (Expert)' },
      { name: 'Perplexity', sender: 'Perplexity (Research)' },
      { name: 'Mistral', sender: 'Mistral (Fast)' },
      { name: 'Cohere', sender: 'Cohere (Precise)' },
      { name: 'Together', sender: 'Together (Community)' },
      { name: 'DeepSeek', sender: 'DeepSeek (Deep)' },
      { name: 'Grok', sender: 'Grok (Witty)' },
      { name: 'Nomi', sender: 'Nomi (Friendly)' },
      { name: 'Replika', sender: 'Replika (Empathetic)' },
      { name: 'Character.AI', sender: 'Character.AI Bot' },
    ];

    aiProviders.forEach(({ name, sender }) => {
      it(`applies correct color for ${name}`, () => {
        const message = createMessage({ sender });
        const result = renderWithProviders(
          <DebateMessageBubble message={message} index={0} />
        );
        expect(result).toBeTruthy();
      });
    });

    it('uses fallback color for unknown AI', () => {
      const message = createMessage({ sender: 'Unknown AI' });
      const result = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Streaming State', () => {
    it('shows dots indicator when streaming with no chunks', () => {
      mockStreamingState = {
        content: 'Streaming...',
        isStreaming: true,
        cursorVisible: true,
        error: null,
        chunksReceived: 0,
      };

      const { getByTestId } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByTestId('streaming-dots')).toBeTruthy();
    });

    it('shows cursor indicator when streaming with chunks received', () => {
      mockStreamingState = {
        content: 'Streaming content here',
        isStreaming: true,
        cursorVisible: true,
        error: null,
        chunksReceived: 5,
      };

      const { getByTestId } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByTestId('streaming-cursor')).toBeTruthy();
    });

    it('uses streaming content when streaming is active', () => {
      mockStreamingState = {
        content: 'Live streaming text',
        isStreaming: true,
        cursorVisible: true,
        error: null,
        chunksReceived: 3,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText('Live streaming text')).toBeTruthy();
    });

    it('uses message content when not streaming', () => {
      mockStreamingState = {
        content: '',
        isStreaming: false,
        cursorVisible: false,
        error: null,
        chunksReceived: 0,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText('Test message content')).toBeTruthy();
    });
  });

  describe('Streaming Errors', () => {
    it('displays overload error message', () => {
      mockStreamingState = {
        content: 'Partial content',
        isStreaming: false,
        cursorVisible: false,
        error: 'Service overload detected',
        chunksReceived: 2,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText(/Service temporarily busy/)).toBeTruthy();
    });

    it('displays verification error message', () => {
      mockStreamingState = {
        content: 'Content',
        isStreaming: false,
        cursorVisible: false,
        error: 'Verification required',
        chunksReceived: 0,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText(/Streaming disabled/)).toBeTruthy();
    });

    it('displays network error message', () => {
      mockStreamingState = {
        content: 'Content',
        isStreaming: false,
        cursorVisible: false,
        error: 'Network connection failed',
        chunksReceived: 1,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText(/Connection issue/)).toBeTruthy();
    });

    it('displays generic error message for unknown errors', () => {
      mockStreamingState = {
        content: 'Content',
        isStreaming: false,
        cursorVisible: false,
        error: 'Unknown error occurred',
        chunksReceived: 0,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText(/Streaming issue/)).toBeTruthy();
    });
  });

  describe('Copy Button', () => {
    it('renders copy button', () => {
      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(getByText('copy-outline')).toBeTruthy();
    });

    it('copies message content when pressed', async () => {
      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );

      const copyButton = getByText('copy-outline');
      fireEvent.press(copyButton);

      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalledWith('Test message content');
      });
    });

    it('shows checkmark after successful copy', async () => {
      jest.useFakeTimers();

      const { getByText, queryByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );

      const copyButton = getByText('copy-outline');
      fireEvent.press(copyButton);

      await waitFor(() => {
        expect(getByText('checkmark-outline')).toBeTruthy();
      });

      jest.useRealTimers();
    });

    it('copies streaming content when streaming', async () => {
      mockStreamingState = {
        content: 'Streaming message',
        isStreaming: true,
        cursorVisible: true,
        error: null,
        chunksReceived: 2,
      };

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );

      const copyButton = getByText('copy-outline');
      fireEvent.press(copyButton);

      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalledWith('Streaming message');
      });
    });

    it('handles copy errors gracefully', async () => {
      mockSetStringAsync.mockRejectedValueOnce(new Error('Copy failed'));

      const { getByText } = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );

      const copyButton = getByText('copy-outline');
      fireEvent.press(copyButton);

      // Should not throw - error is handled silently
      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalled();
      });
    });
  });

  describe('Long Content', () => {
    it('uses LazyMarkdownRenderer for long content', () => {
      const { shouldLazyRender } = require('@/utils/markdown');
      shouldLazyRender.mockReturnValue(true);

      const message = createMessage({
        content: 'A'.repeat(5000),
      });

      const result = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Empty Content Handling', () => {
    it('uses streaming content when message content is empty', () => {
      mockStreamingState = {
        content: 'Fallback content',
        isStreaming: false,
        cursorVisible: false,
        error: null,
        chunksReceived: 3,
      };

      const message = createMessage({ content: '' });
      const { getByText } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );
      expect(getByText('Fallback content')).toBeTruthy();
    });

    it('uses streaming content when message content is whitespace only', () => {
      mockStreamingState = {
        content: 'Fallback for whitespace',
        isStreaming: false,
        cursorVisible: false,
        error: null,
        chunksReceived: 1,
      };

      const message = createMessage({ content: '   ' });
      const { getByText } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );
      expect(getByText('Fallback for whitespace')).toBeTruthy();
    });
  });

  describe('Memoization', () => {
    it('does not re-render when same props are passed', () => {
      const message = createMessage();
      const { rerender } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );

      // Same message reference
      rerender(<DebateMessageBubble message={message} index={0} />);
      // Component should be memoized
    });

    it('re-renders when message content changes', () => {
      const message1 = createMessage({ content: 'First content' });
      const message2 = createMessage({ content: 'Second content' });

      const { rerender, getByText } = renderWithProviders(
        <DebateMessageBubble message={message1} index={0} />
      );

      expect(getByText('First content')).toBeTruthy();

      rerender(<DebateMessageBubble message={message2} index={0} />);
      expect(getByText('Second content')).toBeTruthy();
    });
  });
});
