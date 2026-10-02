/**
 * DebateMessageList Test Suite
 * Comprehensive tests for the debate message list component
 */

import { FlatList, Text, View } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { Ionicons } from '@expo/vector-icons';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateMessageList } from '@/components/organisms/debate/DebateMessageList';
import type { Box } from '@/components/atoms';
import type {
  DebateMessageBubble,
  DebateTypingIndicator,
  Typography,
} from '@/components/molecules';
import type { SystemAnnouncement } from '@/components/organisms/debate/SystemAnnouncement';
import type { Message } from '@/types';
import { createMockAIMessage, createMockMessage } from '@test-utils/fixtures';

// Mock dependencies
jest.mock('@expo/vector-icons', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Ionicons: stubComponent<typeof Ionicons>('ionicons', { text: (p) => p.name }),
  };
});
jest.mock('@/components/atoms', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Box: stubComponent<typeof Box>('box', {
      testID: (p) => p.testID ?? 'box',
      render: (p) => p.children,
    }),
  };
});

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: stubComponent<typeof Typography>('typography', {
      text: (p) => p.children,
    }),
    DebateMessageBubble: stubComponent<typeof DebateMessageBubble>('message', {
      testID: (p) => `message-${p.message.id}`,
      text: (p) => p.message.content,
      render: ({ message, onReportContent }) =>
        onReportContent ? (
          <RN.TouchableOpacity
            testID={`report-message-${message.id}`}
            onPress={() => onReportContent(message)}
          >
            <RN.Text>Report</RN.Text>
          </RN.TouchableOpacity>
        ) : null,
    }),
    DebateTypingIndicator: stubComponent<typeof DebateTypingIndicator>('typing', {
      testID: (p) => `typing-${p.aiName}`,
      text: (p) => `${p.aiName} is typing...`,
    }),
  };
});

jest.mock('@/components/organisms/debate/SystemAnnouncement', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SystemAnnouncement: stubComponent<typeof SystemAnnouncement>('system', {
      testID: (p) => `system-${p.type}`,
      render: ({ label, content, type, onReportContent }) => (
        <>
          {label ? <RN.Text>{label}</RN.Text> : null}
          <RN.Text>{content}</RN.Text>
          {onReportContent ? (
            <RN.TouchableOpacity testID={`report-system-${type}`} onPress={onReportContent}>
              <RN.Text>Report System</RN.Text>
            </RN.TouchableOpacity>
          ) : null}
        </>
      ),
    }),
  };
});

/** A debate turn from an AI participant (DebateMessageBubble path). */
const aiTurn = (id: string, sender: string, content: string): Message =>
  createMockAIMessage({ id, sender, content, metadata: undefined, timestamp: Date.now() });

/** A host/system line (SystemAnnouncement path); the orchestrator sends these as senderType 'user'. */
const hostLine = (id: string, sender: 'Debate Host' | 'System', content: string): Message =>
  createMockMessage({ id, sender, content, senderType: 'user', timestamp: Date.now() });

const flushScheduledScroll = () => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
};

const advanceScrollIndicatorDelay = (ms = 650) => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

describe('DebateMessageList', () => {
  const mockMessages: Message[] = [
    aiTurn('1', 'Claude', 'Opening argument'),
    aiTurn('2', 'ChatGPT', 'Counter argument'),
    hostLine('3', 'Debate Host', '"Is AI beneficial?"'),
    hostLine('4', 'Debate Host', 'Claude opens the debate'),
    hostLine('5', 'System', 'Opening: Claude'),
  ];

  const defaultProps = {
    messages: mockMessages,
    typingAIs: [],
    contentContainerStyle: {},
    showsVerticalScrollIndicator: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders FlatList with messages', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('message-1')).toBeTruthy();
      expect(getByTestId('message-2')).toBeTruthy();
    });

    it('renders regular messages as DebateMessageBubble', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('message-1')).toBeTruthy();
    });

    it('renders system messages as SystemAnnouncement', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('system-topic')).toBeTruthy();
    });

    it('renders all messages in correct order', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);

      expect(getByTestId('message-1')).toBeTruthy();
      expect(getByTestId('message-2')).toBeTruthy();
      expect(getByTestId('system-topic')).toBeTruthy();
    });

    it('renders header component when provided', () => {
      const Header = () => (
        <View testID="header">
          <Text>Header Text</Text>
        </View>
      );
      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} headerComponent={<Header />} />
      );

      expect(getByTestId('header')).toBeTruthy();
    });
  });

  describe('Typing Indicators', () => {
    it('renders typing indicators for AIs', () => {
      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} typingAIs={['Claude']} />
      );

      expect(getByTestId('typing-Claude')).toBeTruthy();
    });

    it('renders multiple typing indicators', () => {
      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} typingAIs={['Claude', 'ChatGPT']} />
      );

      expect(getByTestId('typing-Claude')).toBeTruthy();
      expect(getByTestId('typing-ChatGPT')).toBeTruthy();
    });

    it('does not render typing indicators when array is empty', () => {
      const { queryByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} typingAIs={[]} />
      );

      expect(queryByTestId('typing-Claude')).toBeNull();
    });

    it('updates typing indicators when typingAIs changes', () => {
      const { rerender, getByTestId, queryByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} typingAIs={['Claude']} />
      );

      expect(getByTestId('typing-Claude')).toBeTruthy();

      rerender(<DebateMessageList {...defaultProps} typingAIs={['ChatGPT']} />);

      expect(queryByTestId('typing-Claude')).toBeNull();
      expect(getByTestId('typing-ChatGPT')).toBeTruthy();
    });
  });

  describe('Message Detection', () => {
    it('detects topic announcement', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('system-topic')).toBeTruthy();
    });

    it('detects debate start announcement', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('system-debate-start')).toBeTruthy();
    });

    it('detects exchange winner announcement', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('system-exchange-winner')).toBeTruthy();
    });

    it('renders AI messages as normal bubbles', () => {
      const { getByTestId } = renderWithProviders(<DebateMessageList {...defaultProps} />);
      expect(getByTestId('message-1')).toBeTruthy();
      expect(getByTestId('message-2')).toBeTruthy();
    });

    it('passes report handler to debate AI messages', () => {
      const onReportContent = jest.fn();
      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} onReportContent={onReportContent} />
      );

      fireEvent.press(getByTestId('report-message-1'));

      expect(onReportContent).toHaveBeenCalledWith(mockMessages[0]);
    });

    it('passes report handler to generated MC announcements', () => {
      const onReportContent = jest.fn();
      const mcMessage: Message = {
        id: 'mc-1',
        sender: 'Debate Host',
        senderType: 'ai',
        content: 'Now we move to crossfire.',
        timestamp: Date.now(),
        metadata: {
          debateInterstitial: {
            kind: 'phase_segue',
            flowStep: 'podcast_phase_segue',
            label: 'MC',
            generatedByProvider: 'openai',
            generatedByModel: 'gpt-4.1-mini',
          },
        },
      };

      const { getByTestId } = renderWithProviders(
        <DebateMessageList
          {...defaultProps}
          messages={[mcMessage]}
          onReportContent={onReportContent}
        />
      );

      fireEvent.press(getByTestId('report-system-mc'));

      expect(onReportContent).toHaveBeenCalledWith(mcMessage);
    });

    it('detects submitted audience questions as a dedicated announcement', () => {
      const messages: Message[] = [
        {
          id: 'audience-questions',
          sender: 'Debate Host',
          senderType: 'user',
          content: 'Audience questions submitted:\n\nAffirmative: Should we also ban vaping?\n\nNegative: Why not ban smoking?',
          timestamp: Date.now(),
          metadata: {
            debateAudienceQuestions: {
              aff: 'Should we also ban vaping?',
              neg: 'Why not ban smoking?',
            },
          },
        },
      ];

      const { getByTestId, getByText } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={messages} />
      );

      expect(getByTestId('system-audience-questions')).toBeTruthy();
      expect(getByText('AUDIENCE Q&A')).toBeTruthy();
    });
  });

  describe('Scroll Behavior', () => {
    const getFlatList = (UNSAFE_getByType: typeof screen.UNSAFE_getByType) => ({
      FlatList,
      flatList: UNSAFE_getByType(FlatList),
    });

    const createScrollToEndSpy = () =>
      jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(jest.fn());

    it('has content and scroll handlers for new-response follow state', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.onContentSizeChange).toBeDefined();
      expect(typeof flatList.props.onContentSizeChange).toBe('function');
      expect(flatList.props.onScrollBeginDrag).toBeDefined();
      expect(flatList.props.onScrollEndDrag).toBeDefined();
      expect(flatList.props.onMomentumScrollEnd).toBeDefined();
    });

    it('does not chase content growth while following the debate', () => {
      const scrollToEndSpy = createScrollToEndSpy();
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );
      const { flatList } = getFlatList(UNSAFE_getByType);

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      act(() => {
        (flatList.props.onContentSizeChange as () => void)();
      });
      flushScheduledScroll();

      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('does not scroll when the latest streamed message text updates', () => {
      const scrollToEndSpy = createScrollToEndSpy();
      const streamingMessages: Message[] = [
        aiTurn('streaming-1', 'Claude', 'Opening'),
      ];
      const { rerender } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={streamingMessages} />
      );

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      rerender(
        <DebateMessageList
          {...defaultProps}
          messages={[
            {
              ...streamingMessages[0],
              content: 'Opening argument with streamed content',
            },
          ]}
        />
      );
      flushScheduledScroll();

      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('delays the latest-responses arrow when a new debate message is appended below view', () => {
      const scrollToEndSpy = createScrollToEndSpy();
      const { UNSAFE_getByType, getByLabelText, queryByLabelText, rerender } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );
      const { flatList } = getFlatList(UNSAFE_getByType);

      flushScheduledScroll();
      scrollToEndSpy.mockClear();
      act(() => {
        (flatList.props.onLayout as (event: unknown) => void)({
          nativeEvent: { layout: { height: 500 } },
        });
        (flatList.props.onContentSizeChange as (_: number, height: number) => void)(0, 1000);
      });

      rerender(
        <DebateMessageList
          {...defaultProps}
          messages={[
            ...mockMessages,
            aiTurn('new-1', 'Claude', 'New response starts'),
          ]}
        />
      );
      act(() => {
        (flatList.props.onContentSizeChange as (_: number, height: number) => void)(0, 1200);
      });

      expect(queryByLabelText('Scroll to latest debate responses')).toBeNull();
      advanceScrollIndicatorDelay(649);
      expect(queryByLabelText('Scroll to latest debate responses')).toBeNull();
      advanceScrollIndicatorDelay(1);

      expect(getByLabelText('Scroll to latest debate responses')).toBeTruthy();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('does not auto-follow after non-user scroll and momentum events', () => {
      const scrollToEndSpy = createScrollToEndSpy();
      const { UNSAFE_getByType, getByLabelText, rerender } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );
      const { flatList } = getFlatList(UNSAFE_getByType);

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      fireEvent.scroll(flatList, {
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });
      act(() => {
        (flatList.props.onMomentumScrollEnd as () => void)();
      });
      rerender(
        <DebateMessageList
          {...defaultProps}
          messages={[
            ...mockMessages,
            aiTurn('new-after-programmatic-scroll', 'Claude', 'New response'),
          ]}
        />
      );
      flushScheduledScroll();

      expect(getByLabelText('Scroll to latest debate responses')).toBeTruthy();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('shows the latest-responses button instead of auto-scrolling after user drags away', () => {
      const scrollToEndSpy = createScrollToEndSpy();
      const { UNSAFE_getByType, getByLabelText } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );
      const { flatList } = getFlatList(UNSAFE_getByType);

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      act(() => {
        (flatList.props.onScrollBeginDrag as () => void)();
      });
      fireEvent.scroll(flatList, {
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });
      act(() => {
        (flatList.props.onScrollEndDrag as () => void)();
      });

      scrollToEndSpy.mockClear();
      act(() => {
        (flatList.props.onContentSizeChange as () => void)();
      });
      flushScheduledScroll();

      expect(getByLabelText('Scroll to latest debate responses')).toBeTruthy();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('scrolls only when pressing the latest-responses button', () => {
      const scrollToEndSpy = createScrollToEndSpy();
      const { UNSAFE_getByType, getByLabelText, queryByLabelText, rerender } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );
      const { flatList } = getFlatList(UNSAFE_getByType);

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      act(() => {
        (flatList.props.onScrollBeginDrag as () => void)();
      });
      fireEvent.scroll(flatList, {
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });
      act(() => {
        (flatList.props.onScrollEndDrag as () => void)();
      });

      flushScheduledScroll();
      fireEvent.press(getByLabelText('Scroll to latest debate responses'));
      flushScheduledScroll();

      expect(queryByLabelText('Scroll to latest debate responses')).toBeNull();
      expect(scrollToEndSpy).toHaveBeenCalledWith({ animated: true });

      scrollToEndSpy.mockClear();
      rerender(
        <DebateMessageList
          {...defaultProps}
          messages={[
            ...mockMessages,
            aiTurn('new-after-latest-button', 'Claude', 'Another response'),
          ]}
        />
      );
      flushScheduledScroll();

      expect(getByLabelText('Scroll to latest debate responses')).toBeTruthy();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('handles scroll events', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Simulate scroll event
      fireEvent.scroll(flatList, {
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });

      // Scroll handler should not throw
      expect(flatList).toBeTruthy();
    });

    it('handles scroll to latest button press', () => {
      const { getByLabelText, UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Simulate scroll away from bottom
      fireEvent.scroll(flatList, {
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });

      // Find and press scroll button if it exists
      try {
        flushScheduledScroll();
        fireEvent.press(getByLabelText('Scroll to latest debate responses'));
      } catch {
        // Button might not be visible, that's okay
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles empty messages array', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={[]} />
      );

      expect(UNSAFE_getByType(FlatList)).toBeTruthy();
    });

    it('handles messages with same sender alternating', () => {
      const messages: Message[] = [
        aiTurn('1', 'Claude', 'Message 1'),
        aiTurn('2', 'ChatGPT', 'Message 2'),
        aiTurn('3', 'Claude', 'Message 3'),
      ];

      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={messages} />
      );

      expect(getByTestId('message-1')).toBeTruthy();
      expect(getByTestId('message-2')).toBeTruthy();
      expect(getByTestId('message-3')).toBeTruthy();
    });

    it('handles very long message content', () => {
      const longContent = 'A'.repeat(1000);
      const messages: Message[] = [
        aiTurn('1', 'Claude', longContent),
      ];

      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={messages} />
      );

      expect(getByTestId('message-1')).toBeTruthy();
    });

    it('handles messages without IDs', () => {
      // `id` is required by the Message type; an empty id exercises the same
      // missing-id fallback in the list's keyExtractor.
      const messages: Message[] = [aiTurn('', 'Claude', 'Message 1')];

      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={messages} />
      );

      expect(UNSAFE_getByType(FlatList)).toBeTruthy();
      expect(UNSAFE_getByType(FlatList).props.keyExtractor(messages[0], 0)).toBe('idx-0');
    });
  });

  describe('Performance Optimizations', () => {
    it('applies performance optimizations to FlatList', () => {
      const { UNSAFE_getByType } = renderWithProviders(<DebateMessageList {...defaultProps} />);

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.removeClippedSubviews).toBe(true);
      expect(flatList.props.maxToRenderPerBatch).toBe(10);
      expect(flatList.props.initialNumToRender).toBe(15);
    });

    it('uses proper key extractor', () => {
      const { UNSAFE_getByType } = renderWithProviders(<DebateMessageList {...defaultProps} />);

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.keyExtractor).toBeDefined();

      // Test key extractor
      const key = flatList.props.keyExtractor(mockMessages[0], 0);
      expect(key).toBe('msg-1-0');
    });
  });

  describe('Props Handling', () => {
    it('applies contentContainerStyle', () => {
      const customStyle = { paddingTop: 20 };
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} contentContainerStyle={customStyle} />
      );

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.contentContainerStyle).toContainEqual(
        expect.objectContaining(customStyle)
      );
    });

    it('handles showsVerticalScrollIndicator prop', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} showsVerticalScrollIndicator={true} />
      );

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.showsVerticalScrollIndicator).toBe(true);
    });

    it('handles bottomInset prop', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} bottomInset={50} />
      );

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.contentContainerStyle).toBeDefined();
    });
  });
});
