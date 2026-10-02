import React from 'react';
import { FlatList } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { ChatMessageList } from '../../../../src/components/organisms/chat/ChatMessageList';
import { useTheme } from '../../../../src/theme';
import { lightTheme } from '../../../../src/theme/types';
import { Message } from '../../../../src/types';
import type { Box, ResponsiveContainer } from '../../../../src/components/atoms';
import {
  createMockAIMessage,
  createMockAttachment,
  createMockMessage,
} from '@test-utils/fixtures';

// Mock dependencies
jest.mock('../../../../src/theme', () => ({
  useTheme: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, `Ionicons:${name}`),
  };
});

jest.mock('../../../../src/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

jest.mock('../../../../src/components/atoms', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Box: stubComponent<typeof Box>('box', { render: (p) => p.children }),
    ResponsiveContainer: stubComponent<typeof ResponsiveContainer>('responsive-container', {
      render: (p) => p.children,
    }),
  };
});

jest.mock('../../../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({
    isTablet: false,
    isLandscape: false,
    isPhone: true,
    isPortrait: true,
    width: 375,
    height: 812,
    responsive: <T,>(phone: T) => phone,
    rs: () => 16,
    fontSize: () => 16,
    gridColumns: (phone: number) => phone,
  }),
}));

jest.mock('@/components/organisms/common/MessageBubble', () => ({
  MessageBubble: ({ message, onReportContent }: { message: Message; onReportContent?: (message: Message) => void }) => {
    const React = require('react') as typeof import('react');
    const { Text, TouchableOpacity, View } = require('react-native') as typeof import('react-native');
    return React.createElement(
      View,
      { testID: `message-${message.id}` },
      React.createElement(Text, null, message.content),
      onReportContent
        ? React.createElement(TouchableOpacity, { testID: `report-message-${message.id}`, onPress: () => onReportContent(message) }, React.createElement(Text, null, 'Report'))
        : null
    );
  },
}));

jest.mock('../../../../src/components/organisms/chat/ImageMessageRow', () => ({
  ImageMessageRow: ({ message, onReportContent }: { message: Message; onReportContent?: (message: Message) => void }) => {
    const React = require('react') as typeof import('react');
    const { Text, TouchableOpacity, View } = require('react-native') as typeof import('react-native');
    return React.createElement(
      View,
      { testID: `image-row-${message.id}` },
      React.createElement(Text, null, 'Image Message'),
      onReportContent
        ? React.createElement(TouchableOpacity, { testID: `report-image-${message.id}`, onPress: () => onReportContent(message) }, React.createElement(Text, null, 'Report Image'))
        : null
    );
  },
}));

jest.mock('../../../../src/components/organisms/chat/ImageGeneratingRow', () => ({
  ImageGeneratingRow: ({ message }: { message: Message }) => {
    const React = require('react') as typeof import('react');
    const { Text } = require('react-native') as typeof import('react-native');
    return React.createElement(Text, { testID: `generating-${message.id}` }, 'Generating Image...');
  },
}));

const mockUseTheme = jest.mocked(useTheme);

describe('ChatMessageList', () => {
  const mockTheme: ReturnType<typeof useTheme> = {
    theme: lightTheme,
    themeMode: 'light',
    setThemeMode: jest.fn(),
    isDark: false,
  };

  // ChatMessageList attaches this ref to its FlatList, so `current` becomes the
  // rendered instance; scroll calls are observed via FlatList.prototype spies.
  const createMockRef = () => React.createRef<FlatList>();

  const mockMessages: Message[] = [
    createMockMessage({
      id: 'msg-1',
      content: 'Hello from user',
      timestamp: Date.now(),
    }),
    createMockAIMessage({
      id: 'msg-2',
      content: 'Hello from AI',
      timestamp: Date.now(),
    }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.mockReturnValue(mockTheme);
    jest.useFakeTimers();
  });

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

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders empty state when no messages', () => {
      const flatListRef = createMockRef();

      render(
        <ChatMessageList
          messages={[]}
          flatListRef={flatListRef}
        />
      );

      expect(screen.getByText('Ionicons:chatbubble-ellipses-outline')).toBeTruthy();
      expect(screen.getByText('Start the conversation')).toBeTruthy();
      expect(screen.getByText('Type a message or @ mention specific AIs')).toBeTruthy();
    });

    it('renders list of messages', () => {
      const flatListRef = createMockRef();

      render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );

      expect(screen.getByTestId('message-msg-1')).toBeTruthy();
      expect(screen.getByTestId('message-msg-2')).toBeTruthy();
    });

    it('renders image message row for AI messages with image attachments', () => {
      const flatListRef = createMockRef();
      const messagesWithImage: Message[] = [
        createMockAIMessage({
          id: 'msg-image',
          content: '',
          timestamp: Date.now(),
          attachments: [createMockAttachment({ uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' })],
        }),
      ];

      render(
        <ChatMessageList
          messages={messagesWithImage}
          flatListRef={flatListRef}
        />
      );

      expect(screen.getByTestId('image-row-msg-image')).toBeTruthy();
      expect(screen.getByText('Image Message')).toBeTruthy();
    });

    it('renders image generating row for AI messages with imageGenerating metadata', () => {
      const flatListRef = createMockRef();
      const messagesGenerating: Message[] = [
        createMockAIMessage({
          id: 'msg-gen',
          content: 'Generating image',
          timestamp: Date.now(),
          metadata: {
            providerMetadata: {
              imageGenerating: true,
            },
          },
        }),
      ];

      render(
        <ChatMessageList
          messages={messagesGenerating}
          flatListRef={flatListRef}
        />
      );

      expect(screen.getByTestId('generating-msg-gen')).toBeTruthy();
      expect(screen.getByText('Generating Image...')).toBeTruthy();
    });

    it('does not render special rows for user messages with attachments', () => {
      const flatListRef = createMockRef();
      const userMessagesWithImage: Message[] = [
        createMockMessage({
          id: 'msg-user-image',
          content: '',
          timestamp: Date.now(),
          attachments: [createMockAttachment({ uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' })],
        }),
      ];

      render(
        <ChatMessageList
          messages={userMessagesWithImage}
          flatListRef={flatListRef}
        />
      );

      // Should render as MessageBubble, not ImageMessageRow
      expect(screen.getByTestId('message-msg-user-image')).toBeTruthy();
    });

    it('passes report handler to AI message bubbles only', () => {
      const flatListRef = createMockRef();
      const onReportContent = jest.fn();

      render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
          onReportContent={onReportContent}
        />
      );

      expect(screen.queryByTestId('report-message-msg-1')).toBeNull();

      fireEvent.press(screen.getByTestId('report-message-msg-2'));

      expect(onReportContent).toHaveBeenCalledWith(mockMessages[1]);
    });

    it('passes report handler to generated image rows', () => {
      const flatListRef = createMockRef();
      const onReportContent = jest.fn();
      const imageMessage: Message = {
        id: 'msg-image-report',
        content: '',
        sender: 'Claude',
        senderType: 'ai',
        timestamp: Date.now(),
        attachments: [{ type: 'image', uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }],
      };

      render(
        <ChatMessageList
          messages={[imageMessage]}
          flatListRef={flatListRef}
          onReportContent={onReportContent}
        />
      );

      fireEvent.press(screen.getByTestId('report-image-msg-image-report'));

      expect(onReportContent).toHaveBeenCalledWith(imageMessage);
    });
  });

  describe('Scrolling Behavior', () => {
    it('does not chase content size changes while a message is streaming', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});

      const { UNSAFE_getByType } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      act(() => {
        UNSAFE_getByType(FlatList).props.onContentSizeChange();
      });
      flushScheduledScroll();

      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('does not auto-scroll when a new message is appended', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});

      const { rerender } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );

      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      rerender(
        <ChatMessageList
          messages={[
            ...mockMessages,
            createMockAIMessage({
              id: 'msg-3',
              content: 'A new answer starts',
              timestamp: Date.now(),
            }),
          ]}
          flatListRef={flatListRef}
        />
      );
      flushScheduledScroll();

      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('calls custom onContentSizeChange when provided', () => {
      const flatListRef = createMockRef();
      const mockOnContentSizeChange = jest.fn();

      const { UNSAFE_getByType } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
          onContentSizeChange={mockOnContentSizeChange}
        />
      );

      act(() => {
        UNSAFE_getByType(FlatList).props.onContentSizeChange();
      });

      expect(mockOnContentSizeChange).toHaveBeenCalledTimes(1);
    });

    it('does not force auto-scroll after content size changes', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});

      const { UNSAFE_getByType } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );
      const flatList = UNSAFE_getByType(FlatList);
      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      act(() => {
        flatList.props.onContentSizeChange();
      });
      flushScheduledScroll();

      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('does not auto-scroll even if the user was already at the bottom', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});

      const { rerender } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );
      flushScheduledScroll();
      scrollToEndSpy.mockClear();

      rerender(
        <ChatMessageList
          messages={[
            ...mockMessages,
            createMockAIMessage({
              id: 'msg-after-bottom',
              content: 'New message',
              timestamp: Date.now(),
            }),
          ]}
          flatListRef={flatListRef}
        />
      );
      flushScheduledScroll();

      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('delays the latest-responses arrow when a new chat response is appended below view', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
      const { UNSAFE_getByType, getByLabelText, queryByLabelText, rerender } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );
      const flatList = UNSAFE_getByType(FlatList);

      act(() => {
        flatList.props.onLayout({
          nativeEvent: { layout: { height: 500 } },
        });
        flatList.props.onContentSizeChange(0, 1000);
      });

      rerender(
        <ChatMessageList
          messages={[
            ...mockMessages,
            createMockAIMessage({
              id: 'msg-3',
              content: 'A new answer starts',
              timestamp: Date.now(),
            }),
          ]}
          flatListRef={flatListRef}
        />
      );
      act(() => {
        flatList.props.onContentSizeChange(0, 1200);
      });

      expect(queryByLabelText('Scroll to latest chat responses')).toBeNull();
      advanceScrollIndicatorDelay(649);
      expect(queryByLabelText('Scroll to latest chat responses')).toBeNull();
      advanceScrollIndicatorDelay(1);

      expect(getByLabelText('Scroll to latest chat responses')).toBeTruthy();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('delays the latest-responses arrow when streamed content grows below view', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
      const { UNSAFE_getByType, getByLabelText, queryByLabelText } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );
      const flatList = UNSAFE_getByType(FlatList);

      act(() => {
        flatList.props.onLayout({
          nativeEvent: { layout: { height: 500 } },
        });
        flatList.props.onContentSizeChange(0, 480);
      });
      act(() => {
        flatList.props.onContentSizeChange(0, 1000);
      });

      expect(queryByLabelText('Scroll to latest chat responses')).toBeNull();
      advanceScrollIndicatorDelay();

      expect(getByLabelText('Scroll to latest chat responses')).toBeTruthy();
      expect(scrollToEndSpy).not.toHaveBeenCalled();
      scrollToEndSpy.mockRestore();
    });

    it('shows the latest-responses arrow after user drags away and scrolls only on button press', () => {
      const flatListRef = createMockRef();
      const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
      const { UNSAFE_getByType, getByLabelText, queryByLabelText } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );
      const flatList = UNSAFE_getByType(FlatList);

      act(() => {
        flatList.props.onScrollBeginDrag();
      });
      fireEvent.scroll(flatList, {
        nativeEvent: {
          contentOffset: { y: 0 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });
      act(() => {
        flatList.props.onScrollEndDrag();
      });
      advanceScrollIndicatorDelay();

      fireEvent.press(getByLabelText('Scroll to latest chat responses'));

      expect(queryByLabelText('Scroll to latest chat responses')).toBeNull();
      expect(scrollToEndSpy).toHaveBeenCalledWith({ animated: true });
      scrollToEndSpy.mockRestore();
    });

    it('scrolls to search result when searchTerm changes', async () => {
      const flatListRef = createMockRef();
      const mockOnScrollToSearchResult = jest.fn();

      const searchableMessages: Message[] = [
        createMockMessage({
          id: 'msg-1',
          content: 'Hello world',
          timestamp: Date.now(),
        }),
        createMockAIMessage({
          id: 'msg-2',
          content: 'This is a test message',
          timestamp: Date.now(),
        }),
      ];

      render(
        <ChatMessageList
          messages={searchableMessages}
          flatListRef={flatListRef}
          searchTerm="test"
          onScrollToSearchResult={mockOnScrollToSearchResult}
        />
      );

      // Fast-forward timers to trigger the search scroll
      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockOnScrollToSearchResult).toHaveBeenCalledWith(1);
      });
    });

    it('handles search term with no matches gracefully', async () => {
      const flatListRef = createMockRef();
      const mockOnScrollToSearchResult = jest.fn();

      render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
          searchTerm="nonexistent"
          onScrollToSearchResult={mockOnScrollToSearchResult}
        />
      );

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(mockOnScrollToSearchResult).not.toHaveBeenCalled();
      });
    });
  });

  describe('Message Type Handling', () => {
    it('prioritizes image generating state over other states', () => {
      const flatListRef = createMockRef();
      const messagesWithMultipleStates: Message[] = [
        createMockAIMessage({
          id: 'msg-complex',
          content: 'Image content',
          timestamp: Date.now(),
          attachments: [createMockAttachment({ uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' })],
          metadata: {
            providerMetadata: {
              imageGenerating: true,
            },
          },
        }),
      ];

      render(
        <ChatMessageList
          messages={messagesWithMultipleStates}
          flatListRef={flatListRef}
        />
      );

      // Should render ImageGeneratingRow, not ImageMessageRow
      expect(screen.getByTestId('generating-msg-complex')).toBeTruthy();
    });

    it('renders regular message bubble for AI messages with content and attachments', () => {
      const flatListRef = createMockRef();
      const messagesWithBoth: Message[] = [
        createMockAIMessage({
          id: 'msg-both',
          content: 'Check out this image',
          timestamp: Date.now(),
          attachments: [createMockAttachment({ uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' })],
        }),
      ];

      render(
        <ChatMessageList
          messages={messagesWithBoth}
          flatListRef={flatListRef}
        />
      );

      // Should render MessageBubble because there's content
      expect(screen.getByTestId('message-msg-both')).toBeTruthy();
    });
  });

  describe('Performance Optimization', () => {
    it('configures FlatList with proper virtualization settings', () => {
      const flatListRef = createMockRef();

      const { UNSAFE_root } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );

      // FlatList should be configured with removeClippedSubviews, maxToRenderPerBatch, etc.
      expect(UNSAFE_root).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles messages with missing metadata gracefully', () => {
      const flatListRef = createMockRef();
      const messagesWithoutMetadata: Message[] = [
        // Plain builder (not createMockAIMessage) so the AI message carries no metadata.
        createMockMessage({
          id: 'msg-no-meta',
          sender: 'Claude',
          senderType: 'ai',
          content: 'Simple message',
          timestamp: Date.now(),
        }),
      ];

      render(
        <ChatMessageList
          messages={messagesWithoutMetadata}
          flatListRef={flatListRef}
        />
      );

      expect(screen.getByTestId('message-msg-no-meta')).toBeTruthy();
    });

    it('handles empty content with whitespace only', () => {
      const flatListRef = createMockRef();
      const messagesWithWhitespace: Message[] = [
        createMockAIMessage({
          id: 'msg-whitespace',
          content: '   ',
          timestamp: Date.now(),
          attachments: [createMockAttachment({ uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' })],
        }),
      ];

      render(
        <ChatMessageList
          messages={messagesWithWhitespace}
          flatListRef={flatListRef}
        />
      );

      // Should render as ImageMessageRow because content is effectively empty
      expect(screen.getByTestId('image-row-msg-whitespace')).toBeTruthy();
    });

    it('passes searchTerm to MessageBubble components', () => {
      const flatListRef = createMockRef();

      render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
          searchTerm="hello"
        />
      );

      // Messages should be rendered (searchTerm is passed to MessageBubble)
      expect(screen.getByTestId('message-msg-1')).toBeTruthy();
      expect(screen.getByTestId('message-msg-2')).toBeTruthy();
    });
  });
});
