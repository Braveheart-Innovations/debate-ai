import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { MessageBubble } from '@/components/organisms/common/MessageBubble';
import type { Message } from '@/types';

let mockStreamingState = {
  content: '',
  isStreaming: false,
  cursorVisible: false,
  error: '',
};

jest.mock('expo-haptics', () => ({}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  return {
  __esModule: true,
  Ionicons: () => null,
};
});

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
  };
});

jest.mock('@/hooks/streaming', () => ({
  useStreamingMessage: () => mockStreamingState,
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => ({ isDemo: false }),
}));

jest.mock('@/utils/markdown', () => ({
  sanitizeMarkdown: (content: string) => content,
  shouldLazyRender: () => false,
}));

jest.mock('@/utils/markdownSelectable', () => ({ selectableMarkdownRules: {} }));

jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    LazyMarkdownRenderer: ({ content }: { content: string }) => React.createElement(Text, { testID: 'lazy-markdown' }, content),
    createMarkdownStyles: () => ({}),
  };
});

jest.mock('react-native-markdown-display', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => React.createElement(Text, { testID: 'markdown' }, children),
  };
});

jest.mock('@/components/organisms/chat/ImageBubble', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    ImageBubble: () => React.createElement(View, { testID: 'image-bubble' }),
  };
});

jest.mock('@/components/organisms/common/StreamingIndicator', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    StreamingIndicator: () => React.createElement(View, { testID: 'streaming-indicator' }),
  };
});

describe('MessageBubble', () => {
  const baseMessage: Message = {
    id: 'msg-1',
    sender: 'You',
    senderType: 'user',
    content: 'Hello @Claude',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    mockStreamingState = {
      content: '',
      isStreaming: false,
      cursorVisible: false,
      error: '',
    };
  });

  it('renders user message text with mentions highlighted', () => {
    const { getByText } = renderWithProviders(
      <MessageBubble message={baseMessage} isLast={false} />
    );

    expect(getByText('Hello ')).toBeTruthy();
    expect(getByText('@Claude')).toBeTruthy();
  });

  it('processes AI message citations into markdown links', () => {
    const aiMessage: Message = {
      ...baseMessage,
      sender: 'Claude',
      senderType: 'ai',
      content: 'See [1] for details.',
      metadata: {
        citations: [{ index: 1, url: 'https://example.com' }],
      },
    };

    const { getByTestId } = renderWithProviders(
      <MessageBubble message={aiMessage} isLast={false} />
    );

    expect(getByTestId('markdown').props.children).toContain('[[1]](https://example.com)');
    expect(getByTestId('citation-sources')).toBeTruthy();
  });

  it('reports AI-generated message content from the bubble action', () => {
    const onReportContent = jest.fn();
    const aiMessage: Message = {
      ...baseMessage,
      sender: 'Claude',
      senderType: 'ai',
      content: 'Generated answer',
    };

    const { getByTestId } = renderWithProviders(
      <MessageBubble message={aiMessage} isLast={false} onReportContent={onReportContent} />
    );

    fireEvent.press(getByTestId('report-message-msg-1'));

    expect(onReportContent).toHaveBeenCalledWith(aiMessage);
  });

  it('does not show the report action while an AI message is streaming', () => {
    mockStreamingState = {
      content: '',
      isStreaming: true,
      cursorVisible: true,
      error: '',
    };
    const aiMessage: Message = {
      ...baseMessage,
      sender: 'Claude',
      senderType: 'ai',
      content: '',
    };

    const { queryByTestId } = renderWithProviders(
      <MessageBubble message={aiMessage} isLast={false} onReportContent={jest.fn()} />
    );

    expect(queryByTestId('report-message-msg-1')).toBeNull();
  });

  it('does not show the report action for user messages', () => {
    const { queryByTestId } = renderWithProviders(
      <MessageBubble message={baseMessage} isLast={false} onReportContent={jest.fn()} />
    );

    expect(queryByTestId('report-message-msg-1')).toBeNull();
  });

  describe('reply cut off at the length limit', () => {
    const truncated = (content: string): Message => ({
      ...baseMessage,
      sender: 'Claude',
      senderType: 'ai',
      content,
      metadata: {
        aiId: 'claude',
        lifecycle: { status: 'truncated', reason: 'length', partial: content.length > 0, retryable: true },
      },
    });

    it('says the reply was cut off and continues it on tap', () => {
      const onContinue = jest.fn();
      const message = truncated('The answer is');
      const { getByText, getByTestId } = renderWithProviders(
        <MessageBubble message={message} isLast={false} onContinue={onContinue} />
      );

      expect(getByText('Cut off at the length limit')).toBeTruthy();
      fireEvent.press(getByTestId('continue-message-msg-1'));
      expect(onContinue).toHaveBeenCalledWith(message);
    });

    it('offers to ask again when the reply has no text', () => {
      const { getByText } = renderWithProviders(
        <MessageBubble message={truncated('')} isLast={false} onContinue={jest.fn()} />
      );

      expect(getByText('Hit the length limit before answering')).toBeTruthy();
      expect(getByText('Try again')).toBeTruthy();
    });

    it('keeps the note but hides the action while another reply is generating', () => {
      const { getByTestId, queryByTestId } = renderWithProviders(
        <MessageBubble message={truncated('The answer is')} isLast={false} />
      );

      expect(getByTestId('truncated-notice-msg-1')).toBeTruthy();
      expect(queryByTestId('continue-message-msg-1')).toBeNull();
    });

    it('hides the note while the continuation streams', () => {
      mockStreamingState = { content: 'The answer is still', isStreaming: true, cursorVisible: true, error: '' };
      const { queryByTestId } = renderWithProviders(
        <MessageBubble message={truncated('The answer is')} isLast={false} onContinue={jest.fn()} />
      );

      expect(queryByTestId('truncated-notice-msg-1')).toBeNull();
    });

    it('shows no note on a reply that finished', () => {
      const { queryByTestId } = renderWithProviders(
        <MessageBubble
          message={{ ...truncated('Done.'), metadata: { aiId: 'claude' } }}
          isLast={false}
          onContinue={jest.fn()}
        />
      );

      expect(queryByTestId('truncated-notice-msg-1')).toBeNull();
    });
  });

  describe('reply that failed', () => {
    const failed = (content: string, overrides: { partial?: boolean; retryable?: boolean; reason?: string } = {}): Message => ({
      ...baseMessage,
      sender: 'DeepSeek',
      senderType: 'ai',
      content,
      metadata: {
        aiId: 'deepseek',
        lifecycle: {
          status: 'failed',
          reason: overrides.reason ?? 'Stream stalled',
          partial: overrides.partial ?? content.length > 0,
          retryable: overrides.retryable ?? true,
        },
      },
    });

    it('shows the error and continues a partial reply on tap', () => {
      const onContinue = jest.fn<void, [Message]>();
      const message = failed('The answer is');
      const { getByText, getByTestId } = renderWithProviders(
        <MessageBubble message={message} isLast={false} onContinue={onContinue} />
      );

      expect(getByTestId('markdown').props.children).toBe('The answer is');
      expect(getByText('Stream stalled')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
      fireEvent.press(getByTestId('retry-message-msg-1'));
      expect(onContinue).toHaveBeenCalledWith(message);
    });

    it('offers to try again when no text arrived', () => {
      const { getByText, getByTestId } = renderWithProviders(
        <MessageBubble message={failed('', { reason: 'Connection failed' })} isLast={false} onContinue={jest.fn<void, [Message]>()} />
      );

      expect(getByTestId('markdown').props.children).toBe('Connection issue. Please check your internet.');
      expect(getByText('No reply received')).toBeTruthy();
      expect(getByText('Try again')).toBeTruthy();
    });

    it('offers to try again on an error reply that holds only the error text', () => {
      const { getByText } = renderWithProviders(
        <MessageBubble
          message={failed('Sorry, I encountered an error: boom', { partial: false })}
          isLast={false}
          onContinue={jest.fn<void, [Message]>()}
        />
      );

      expect(getByText('Try again')).toBeTruthy();
    });

    it('shows the error without an action when retrying cannot help', () => {
      const { getByTestId, queryByTestId } = renderWithProviders(
        <MessageBubble
          message={failed('', { reason: 'Invalid API key', retryable: false })}
          isLast={false}
          onContinue={jest.fn<void, [Message]>()}
        />
      );

      expect(getByTestId('failed-notice-msg-1')).toBeTruthy();
      expect(queryByTestId('retry-message-msg-1')).toBeNull();
    });

    it('keeps the error but hides the action while another reply is generating', () => {
      const { getByTestId, queryByTestId } = renderWithProviders(
        <MessageBubble message={failed('The answer is')} isLast={false} />
      );

      expect(getByTestId('failed-notice-msg-1')).toBeTruthy();
      expect(queryByTestId('retry-message-msg-1')).toBeNull();
    });

    it('shows the live stream error without the old suffix before the failure is saved', () => {
      mockStreamingState = { content: 'Half an ans', isStreaming: false, cursorVisible: false, error: 'Stream stalled' };
      const { getByTestId, getByText, queryByTestId } = renderWithProviders(
        <MessageBubble
          message={{ ...baseMessage, sender: 'DeepSeek', senderType: 'ai', content: '' }}
          isLast={false}
          onContinue={jest.fn<void, [Message]>()}
        />
      );

      expect(getByTestId('markdown').props.children).toBe('Half an ans');
      expect(getByText('Stream stalled')).toBeTruthy();
      // The action needs the saved failure, which the retry reads.
      expect(queryByTestId('retry-message-msg-1')).toBeNull();
    });

    it('leaves the failed view while the retry streams', () => {
      mockStreamingState = { content: 'The answer is still', isStreaming: true, cursorVisible: true, error: '' };
      const { queryByTestId } = renderWithProviders(
        <MessageBubble message={failed('The answer is')} isLast={false} onContinue={jest.fn<void, [Message]>()} />
      );

      expect(queryByTestId('failed-notice-msg-1')).toBeNull();
    });
  });
});
