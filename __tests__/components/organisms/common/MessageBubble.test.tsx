import React from 'react';
import { Text, View } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { MessageBubble } from '@/components/organisms/common/MessageBubble';
import type { Message } from '@/types';

jest.mock('expo-haptics', () => ({}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
  __esModule: true,
  Ionicons: () => null,
};
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
  };
});

jest.mock('@/hooks/streaming', () => ({
  useStreamingMessage: () => ({ content: '', isStreaming: false, cursorVisible: false, error: '' }),
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
  const React = require('react');
  const { Text } = require('react-native');
  return {
    LazyMarkdownRenderer: ({ content }: { content: string }) => React.createElement(Text, { testID: 'lazy-markdown' }, content),
    createMarkdownStyles: () => ({}),
  };
});

jest.mock('react-native-markdown-display', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => React.createElement(Text, { testID: 'markdown' }, children),
  };
});

jest.mock('@/components/organisms/chat/ImageBubble', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ImageBubble: () => React.createElement(View, { testID: 'image-bubble' }),
  };
});

jest.mock('@/components/organisms/common/StreamingIndicator', () => {
  const React = require('react');
  const { View } = require('react-native');
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
  });
});
