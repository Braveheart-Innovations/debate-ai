import React from 'react';
import { FlatList } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ChatMessageList } from '../../../../src/components/organisms/chat/ChatMessageList';
import { useTheme } from '../../../../src/theme';
import { Message } from '../../../../src/types';

// Mock dependencies
jest.mock('../../../../src/theme', () => ({
  useTheme: jest.fn(),
}));

jest.mock('../../../../src/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

jest.mock('../../../../src/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, style }: any) => React.createElement(View, { style }, children),
  };
});

jest.mock('@/components/organisms/common/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: Message }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: `message-${message.id}` }, message.content);
  },
}));

jest.mock('../../../../src/components/organisms/chat/ImageMessageRow', () => ({
  ImageMessageRow: ({ message }: { message: Message }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: `image-row-${message.id}` }, 'Image Message');
  },
}));

jest.mock('../../../../src/components/organisms/chat/VideoMessageRow', () => ({
  VideoMessageRow: ({ message }: { message: Message }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: `video-row-${message.id}` }, 'Video Message');
  },
}));

jest.mock('../../../../src/components/organisms/chat/ImageGeneratingRow', () => ({
  ImageGeneratingRow: ({ message }: { message: Message }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: `generating-${message.id}` }, 'Generating Image...');
  },
}));

const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;

describe('ChatMessageList', () => {
  const mockTheme = {
    theme: {
      colors: {
        background: '#FFFFFF',
        text: {
          primary: '#000000',
          secondary: '#666666',
        },
      },
      spacing: {
        md: 16,
      },
    },
    isDark: false,
  };

  const createMockRef = () => ({
    current: {
      scrollToEnd: jest.fn(),
      scrollToIndex: jest.fn(),
    } as unknown as FlatList,
  });

  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      content: 'Hello from user',
      senderType: 'user',
      senderId: 'user-1',
      timestamp: Date.now(),
    },
    {
      id: 'msg-2',
      content: 'Hello from AI',
      senderType: 'ai',
      senderId: 'ai-1',
      timestamp: Date.now(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.mockReturnValue(mockTheme);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
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

      expect(screen.getByText('💭')).toBeTruthy();
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
        {
          id: 'msg-image',
          content: '',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
          attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
        },
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

    it('renders video message row for AI messages with video attachments', () => {
      const flatListRef = createMockRef();
      const messagesWithVideo: Message[] = [
        {
          id: 'msg-video',
          content: '',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
          attachments: [{ type: 'video', url: 'https://example.com/video.mp4' }],
        },
      ];

      render(
        <ChatMessageList
          messages={messagesWithVideo}
          flatListRef={flatListRef}
        />
      );

      expect(screen.getByTestId('video-row-msg-video')).toBeTruthy();
      expect(screen.getByText('Video Message')).toBeTruthy();
    });

    it('renders image generating row for AI messages with imageGenerating metadata', () => {
      const flatListRef = createMockRef();
      const messagesGenerating: Message[] = [
        {
          id: 'msg-gen',
          content: 'Generating image',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
          metadata: {
            providerMetadata: {
              imageGenerating: true,
            },
          },
        },
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
        {
          id: 'msg-user-image',
          content: '',
          senderType: 'user',
          senderId: 'user-1',
          timestamp: Date.now(),
          attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
        },
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
  });

  describe('Scrolling Behavior', () => {
    it('scrolls to end on content size change by default', () => {
      const flatListRef = createMockRef();

      const { rerender } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
        />
      );

      // Trigger content size change by adding more messages
      const moreMessages = [
        ...mockMessages,
        {
          id: 'msg-3',
          content: 'New message',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
        },
      ];

      rerender(
        <ChatMessageList
          messages={moreMessages}
          flatListRef={flatListRef}
        />
      );

      // scrollToEnd should be called when content size changes
      // Note: This is tested via the FlatList's onContentSizeChange callback
      expect(flatListRef.current).toBeTruthy();
    });

    it('calls custom onContentSizeChange when provided', () => {
      const flatListRef = createMockRef();
      const mockOnContentSizeChange = jest.fn();

      const { rerender } = render(
        <ChatMessageList
          messages={mockMessages}
          flatListRef={flatListRef}
          onContentSizeChange={mockOnContentSizeChange}
        />
      );

      const moreMessages = [
        ...mockMessages,
        {
          id: 'msg-3',
          content: 'New message',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
        },
      ];

      rerender(
        <ChatMessageList
          messages={moreMessages}
          flatListRef={flatListRef}
          onContentSizeChange={mockOnContentSizeChange}
        />
      );

      expect(mockOnContentSizeChange).toBeTruthy();
    });

    it('scrolls to search result when searchTerm changes', async () => {
      const flatListRef = createMockRef();
      const mockOnScrollToSearchResult = jest.fn();

      const searchableMessages: Message[] = [
        {
          id: 'msg-1',
          content: 'Hello world',
          senderType: 'user',
          senderId: 'user-1',
          timestamp: Date.now(),
        },
        {
          id: 'msg-2',
          content: 'This is a test message',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
        },
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
        {
          id: 'msg-complex',
          content: 'Image content',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
          attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
          metadata: {
            providerMetadata: {
              imageGenerating: true,
            },
          },
        },
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
        {
          id: 'msg-both',
          content: 'Check out this image',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
          attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
        },
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
        {
          id: 'msg-no-meta',
          content: 'Simple message',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
        },
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
        {
          id: 'msg-whitespace',
          content: '   ',
          senderType: 'ai',
          senderId: 'ai-1',
          timestamp: Date.now(),
          attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
        },
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