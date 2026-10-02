import { fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { LinearGradient } from 'expo-linear-gradient';
import type Slider from '@react-native-community/slider';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { resetBackgroundAudioPlaybackForTesting } from '@/services/audio/backgroundAudioPlayback';
import { DebateMessageBubble } from '@/components/molecules/debate/DebateMessageBubble';
import type { Button, Card, GlassCard, Typography } from '@/components/molecules';
import { shouldLazyRender } from '@/utils/markdown';
import type { Message } from '@/types';
import { createMockMessage, createMockWindowSize } from '@test-utils/fixtures';
import { requireDefined } from '@test-utils/queries';

const mockUseWindowDimensions = jest.mocked(useWindowDimensions);
const mockedSetAudioModeAsync = jest.mocked(setAudioModeAsync);
const mockedUseAudioPlayer = jest.mocked(useAudioPlayer);
// Mock Clipboard
const mockSetStringAsync = jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
  getStringAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID={testID || `icon-${name}`}>{name}</Text>;
  },
  MaterialIcons: () => null,
}));
jest.mock('expo-linear-gradient', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    LinearGradient: stubComponent<typeof LinearGradient>('linear-gradient', {
      render: (p) => p.children,
    }),
  };
});
jest.mock('react-native-markdown-display', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ children }: { children: string }) => <Text>{children}</Text>;
});
jest.mock('@react-native-community/slider', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    __esModule: true,
    default: stubComponent<typeof Slider>('slider', { testID: (p) => p.testID ?? 'slider' }),
  };
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

jest.mock('@/hooks/useMessageBubbleAnimation', () => ({
  useMessageBubbleAnimation: jest.fn(() => ({
    animatedStyle: {},
  })),
}));

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    Card: stubComponent<typeof Card>('card', { render: (p) => p.children }),
    GlassCard: stubComponent<typeof GlassCard>('glass-card', { render: (p) => p.children }),
    Button: stubComponent<typeof Button>('button', { text: (p) => p.title }),
  };
});

jest.mock('@/components/organisms/common/StreamingIndicator', () => ({
  StreamingIndicator: ({ visible, variant }: { visible: boolean; variant: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID={`streaming-${variant}`}>{variant}</Text> : null;
  },
}));

jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: ({ content }: { content: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{content}</Text>;
  },
  createMarkdownStyles: jest.fn(() => ({})),
}));

describe('DebateMessageBubble', () => {
  const createMessage = (overrides: Partial<Message> = {}): Message =>
    createMockMessage({
      id: 'msg-1',
      senderType: 'ai',
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
    mockUseWindowDimensions.mockReturnValue(createMockWindowSize(375, 812));
    resetBackgroundAudioPlaybackForTesting();
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

    it('reports generated debate message content from the bubble action', () => {
      const onReportContent = jest.fn();
      const message = createMessage({ id: 'debate-report-1' });

      const { getByTestId } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} onReportContent={onReportContent} />
      );

      fireEvent.press(getByTestId('report-debate-message-debate-report-1'));

      expect(onReportContent).toHaveBeenCalledWith(message);
    });

    it('keeps report and copy actions on the bottom row of the debate bubble', () => {
      const message = createMessage({ id: 'debate-actions-1' });
      const { getByLabelText, getByTestId } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} onReportContent={jest.fn()} />
      );

      expect(StyleSheet.flatten(getByTestId('debate-message-bubble-debate-actions-1').props.style)).toEqual(
        expect.objectContaining({
          paddingBottom: 44,
        })
      );
      expect(StyleSheet.flatten(getByLabelText('Copy message').props.style)).toEqual(
        expect.objectContaining({
          position: 'absolute',
          right: 8,
          bottom: 8,
        })
      );
      expect(StyleSheet.flatten(getByTestId('report-debate-message-debate-actions-1').props.style)).toEqual(
        expect.objectContaining({
          position: 'absolute',
          right: 42,
          bottom: 8,
        })
      );
    });

    it('does not show the report action while a debate message is streaming', () => {
      mockStreamingState = {
        content: '',
        isStreaming: true,
        cursorVisible: true,
        error: null,
        chunksReceived: 0,
      };
      const message = createMessage({ id: 'debate-report-streaming', content: '' });

      const { queryByTestId } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} onReportContent={jest.fn()} />
      );

      expect(queryByTestId('report-debate-message-debate-report-streaming')).toBeNull();
    });

    it('renders citation sources for cited AI messages', () => {
      const message = createMessage({
        content: 'See [1] for details.',
        metadata: {
          citations: [{ index: 1, url: 'https://example.com/source' }],
        },
      });

      const { getByTestId, getByText } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );

      expect(getByText('See [[1]](https://example.com/source) for details.')).toBeTruthy();
      expect(getByTestId('citation-sources')).toBeTruthy();
    });

    it('renders generating debate audio state', () => {
      const message = createMessage({
        senderType: 'ai',
        metadata: {
          debateAudio: {
            status: 'generating',
            voiceId: 'voice-1',
            voiceName: 'Voice One',
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );

      expect(getByTestId('debate-audio-generating')).toBeTruthy();
      expect(getByText('Generating voice with Voice One')).toBeTruthy();
    });

    it('renders ready debate audio controls', () => {
      const message = createMessage({
        senderType: 'ai',
        metadata: {
          debateAudio: {
            status: 'ready',
            voiceId: 'voice-1',
            voiceName: 'Voice One',
            uri: 'file:///debate/msg-1.mp3',
            mimeType: 'audio/mpeg',
          },
        },
        attachments: [
          { type: 'audio', uri: 'file:///debate/msg-1.mp3', mimeType: 'audio/mpeg' },
        ],
      });

      const { getByTestId, getByText } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );

      expect(getByTestId('debate-audio-play')).toBeTruthy();
      expect(getByText('Ready · Voice One')).toBeTruthy();
    });

    it('activates background playback for ready debate audio', async () => {
      const message = createMessage({
        senderType: 'ai',
        metadata: {
          debateAudio: {
            status: 'ready',
            voiceId: 'voice-1',
            voiceName: 'Voice One',
            uri: 'file:///debate/msg-1.mp3',
            mimeType: 'audio/mpeg',
          },
        },
        attachments: [
          { type: 'audio', uri: 'file:///debate/msg-1.mp3', mimeType: 'audio/mpeg' },
        ],
      });

      const { getByTestId } = renderWithProviders(
        <DebateMessageBubble message={message} index={0} />
      );
      const player = requireDefined(mockedUseAudioPlayer.mock.results[0], 'useAudioPlayer result').value;

      fireEvent.press(getByTestId('debate-audio-play'));

      await waitFor(() => {
        expect(mockedSetAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        }));
        expect(player.setActiveForLockScreen).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            title: 'Claude (Analytical)',
            artist: 'Voice One',
            albumTitle: 'Debate',
          }),
          expect.any(Object)
        );
        expect(player.play).toHaveBeenCalledTimes(1);
      });
    });

    it('renders retry action for failed debate audio', () => {
      const onRetryAudio = jest.fn();
      const message = createMessage({
        senderType: 'ai',
        metadata: {
          debateAudio: {
            status: 'failed',
            voiceId: 'voice-1',
            voiceName: 'Voice One',
            error: 'Quota exceeded',
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(
        <DebateMessageBubble
          message={message}
          index={0}
          canRetryAudio
          onRetryAudio={onRetryAudio}
        />
      );

      expect(getByTestId('debate-audio-failed')).toBeTruthy();
      expect(getByText('Quota exceeded')).toBeTruthy();
      fireEvent.press(getByTestId('debate-audio-retry'));
      expect(onRetryAudio).toHaveBeenCalledWith(message);
    });

    it('renders retry action for retryable failed debate turns', () => {
      const onRetryTurn = jest.fn();
      const message = createMessage({
        senderType: 'ai',
        metadata: {
          lifecycle: {
            status: 'failed',
            reason: 'Gemini error (400): invalid model name',
            retryable: true,
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(
        <DebateMessageBubble
          message={message}
          index={0}
          canRetryTurn
          onRetryTurn={onRetryTurn}
        />
      );

      expect(getByTestId('debate-turn-retry-row')).toBeTruthy();
      expect(getByText('Turn failed')).toBeTruthy();
      fireEvent.press(getByTestId('debate-turn-retry'));
      expect(onRetryTurn).toHaveBeenCalledWith(message);
    });

    it('does not render retry action for failed debate turns without an active retry continuation', () => {
      const message = createMessage({
        senderType: 'ai',
        metadata: {
          lifecycle: {
            status: 'failed',
            reason: 'Provider failed',
            retryable: true,
          },
        },
      });

      const { queryByTestId } = renderWithProviders(
        <DebateMessageBubble
          message={message}
          index={0}
          canRetryTurn={false}
          onRetryTurn={jest.fn()}
        />
      );

      expect(queryByTestId('debate-turn-retry')).toBeNull();
    });
  });

  describe('Responsive Width', () => {
    it('renders correctly on phone', () => {
      mockUseWindowDimensions.mockReturnValue(createMockWindowSize(375, 812));
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('renders correctly on tablet portrait', () => {
      mockUseWindowDimensions.mockReturnValue(createMockWindowSize(768, 1024));
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('renders correctly on tablet landscape', () => {
      mockUseWindowDimensions.mockReturnValue(createMockWindowSize(1024, 768));
      const result = renderWithProviders(
        <DebateMessageBubble {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Host Messages', () => {
    const hostMessage = createMessage({
      id: 'host-1',
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
      mockUseWindowDimensions.mockReturnValue(createMockWindowSize(375, 812));
      const result = renderWithProviders(
        <DebateMessageBubble message={hostMessage} index={0} />
      );
      expect(result).toBeTruthy();
    });

    it('renders host message on tablet', () => {
      mockUseWindowDimensions.mockReturnValue(createMockWindowSize(768, 1024));
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

    it('shows retry UI instead of stale stream warning for retryable lifecycle failures', () => {
      const onRetryTurn = jest.fn();
      mockStreamingState = {
        content: 'Gemini 2 could not finish this turn.',
        isStreaming: false,
        cursorVisible: false,
        error: 'Network connection failed',
        chunksReceived: 1,
      };
      const message = createMessage({
        senderType: 'ai',
        content: 'Gemini 2 could not finish this turn.',
        metadata: {
          lifecycle: {
            status: 'failed',
            reason: 'Network connection failed',
            retryable: true,
          },
        },
      });

      const { getByTestId, getByText, queryByText } = renderWithProviders(
        <DebateMessageBubble
          {...defaultProps}
          message={message}
          canRetryTurn
          onRetryTurn={onRetryTurn}
        />
      );

      expect(queryByText(/Connection issue/)).toBeNull();
      expect(getByTestId('debate-turn-retry-row')).toBeTruthy();
      expect(getByText('Turn failed')).toBeTruthy();
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

      const { getByText } = renderWithProviders(
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
      jest.mocked(shouldLazyRender).mockReturnValue(true);

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
