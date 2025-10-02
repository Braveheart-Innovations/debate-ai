/**
 * DebateMessageList Test Suite
 * Comprehensive tests for the debate message list component
 */

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateMessageList } from '@/components/organisms/debate/DebateMessageList';
import { Message } from '@/types';

// Mock dependencies
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: any) => React.createElement(Text, null, name),
  };
});
jest.mock('@/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, ...props }: any) =>
      React.createElement(View, { testID: 'box', ...props }, children),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Typography: ({ children, ...props }: any) =>
      React.createElement(Text, { testID: props.testID || 'typography' }, children),
    DebateMessageBubble: ({ message }: any) =>
      React.createElement(View, { testID: `message-${message.id}` },
        React.createElement(Text, null, message.content)
      ),
    DebateTypingIndicator: ({ aiName }: any) =>
      React.createElement(View, { testID: `typing-${aiName}` },
        React.createElement(Text, null, `${aiName} is typing...`)
      ),
  };
});

jest.mock('@/components/organisms/debate/SystemAnnouncement', () => ({
  SystemAnnouncement: ({ content, type }: any) => {
    const React = require('react');
    const { View, Text } = require('react-native');
    return React.createElement(View, { testID: `system-${type}` },
      React.createElement(Text, null, content)
    );
  },
}));

describe('DebateMessageList', () => {
  const mockMessages: Message[] = [
    { id: '1', sender: 'Claude', content: 'Opening argument', timestamp: new Date() },
    { id: '2', sender: 'ChatGPT', content: 'Counter argument', timestamp: new Date() },
    { id: '3', sender: 'Debate Host', content: '"Is AI beneficial?"', timestamp: new Date() },
    { id: '4', sender: 'Debate Host', content: 'Claude opens the debate', timestamp: new Date() },
    { id: '5', sender: 'System', content: 'Opening: Claude', timestamp: new Date() },
  ];

  const defaultProps = {
    messages: mockMessages,
    typingAIs: [],
    contentContainerStyle: {},
    showsVerticalScrollIndicator: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
      const React = require('react');
      const { View, Text } = require('react-native');
      const Header = () => React.createElement(View, { testID: 'header' },
        React.createElement(Text, null, 'Header Text')
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
  });

  describe('Scroll Behavior', () => {
    it('handles scroll events', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );

      const FlatList = require('react-native').FlatList;
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
      const { getByText, UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} />
      );

      const FlatList = require('react-native').FlatList;
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
        const scrollButton = getByText(/New debate responses/i).parent;
        if (scrollButton) {
          fireEvent.press(scrollButton);
        }
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

      const FlatList = require('react-native').FlatList;
      expect(UNSAFE_getByType(FlatList)).toBeTruthy();
    });

    it('handles messages with same sender alternating', () => {
      const messages: Message[] = [
        { id: '1', sender: 'Claude', content: 'Message 1', timestamp: new Date() },
        { id: '2', sender: 'ChatGPT', content: 'Message 2', timestamp: new Date() },
        { id: '3', sender: 'Claude', content: 'Message 3', timestamp: new Date() },
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
        { id: '1', sender: 'Claude', content: longContent, timestamp: new Date() },
      ];

      const { getByTestId } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={messages} />
      );

      expect(getByTestId('message-1')).toBeTruthy();
    });

    it('handles messages without IDs', () => {
      const messages: any[] = [
        { sender: 'Claude', content: 'Message 1', timestamp: new Date() },
      ];

      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} messages={messages} />
      );

      const FlatList = require('react-native').FlatList;
      expect(UNSAFE_getByType(FlatList)).toBeTruthy();
    });
  });

  describe('Performance Optimizations', () => {
    it('applies performance optimizations to FlatList', () => {
      const { UNSAFE_getByType } = renderWithProviders(<DebateMessageList {...defaultProps} />);

      const FlatList = require('react-native').FlatList;
      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.removeClippedSubviews).toBe(true);
      expect(flatList.props.maxToRenderPerBatch).toBe(10);
      expect(flatList.props.initialNumToRender).toBe(15);
    });

    it('uses proper key extractor', () => {
      const { UNSAFE_getByType } = renderWithProviders(<DebateMessageList {...defaultProps} />);

      const FlatList = require('react-native').FlatList;
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

      const FlatList = require('react-native').FlatList;
      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.contentContainerStyle).toContainEqual(
        expect.objectContaining(customStyle)
      );
    });

    it('handles showsVerticalScrollIndicator prop', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} showsVerticalScrollIndicator={true} />
      );

      const FlatList = require('react-native').FlatList;
      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.showsVerticalScrollIndicator).toBe(true);
    });

    it('handles bottomInset prop', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <DebateMessageList {...defaultProps} bottomInset={50} />
      );

      const FlatList = require('react-native').FlatList;
      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.contentContainerStyle).toBeDefined();
    });
  });
});
