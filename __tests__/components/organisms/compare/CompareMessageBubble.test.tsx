import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareMessageBubble } from '@/components/organisms/compare/CompareMessageBubble';
import type { Message } from '@/types';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => (
      React.createElement(Text, { testID: `ionicon-${name}` }, name)
    ),
  };
});

const mockLazyRenderer = jest.fn(({ content }: { content: string }) => (
  <Text testID="lazy-markdown">{content}</Text>
));

jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: (props: any) => mockLazyRenderer(props),
  createMarkdownStyles: jest.fn(() => ({ body: { color: 'black' } })),
}));

jest.mock('react-native-markdown-display', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      React.createElement(Text, { testID: 'markdown' }, children)
    ),
  };
});

jest.mock('@/utils/markdown', () => ({
  sanitizeMarkdown: jest.fn((value: string) => `sanitized:${value}`),
  shouldLazyRender: jest.fn(),
}));

jest.mock('@/utils/markdownSelectable', () => ({ selectableMarkdownRules: {} }));

jest.mock('@/hooks/streaming', () => ({
  useStreamingMessage: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/hooks/useFeatureAccess', () => jest.fn(() => ({ isDemo: false })));

const mockUseStreamingMessage = require('@/hooks/streaming').useStreamingMessage as jest.Mock;
const mockShouldLazyRender = require('@/utils/markdown').shouldLazyRender as jest.Mock;
const mockSanitizeMarkdown = require('@/utils/markdown').sanitizeMarkdown as jest.Mock;
const Clipboard = require('expo-clipboard');

const baseMessage: Message = {
  id: 'msg-1',
  sender: 'Claude',
  senderType: 'ai',
  content: 'Hello world',
  timestamp: Date.now(),
};

jest.useFakeTimers();

describe('CompareMessageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStreamingMessage.mockReturnValue({
      content: null,
      isStreaming: false,
      error: null,
    });
    mockShouldLazyRender.mockReturnValue(false);
  });

  it('sanitizes content, renders markdown, and copies message text', async () => {
    const { getByTestId, getByLabelText } = renderWithProviders(
      <CompareMessageBubble message={baseMessage} side="left" />
    );

    expect(mockSanitizeMarkdown).toHaveBeenCalledWith('Hello world', { showWarning: false });
    expect(getByTestId('markdown').props.children).toBe('sanitized:Hello world');

    fireEvent.press(getByLabelText('Copy message'));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Hello world');

    await waitFor(() => {
      expect(getByTestId('ionicon-checkmark-outline')).toBeTruthy();
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('uses lazy renderer when content is long and prefers streaming error content', () => {
    mockUseStreamingMessage.mockReturnValue({
      content: 'partial stream',
      isStreaming: false,
      error: new Error('fail'),
    });
    mockShouldLazyRender.mockReturnValue(true);

    const { getByTestId } = renderWithProviders(
      <CompareMessageBubble
        message={{ ...baseMessage, content: 'Original' }}
        side="right"
      />
    );

    expect(mockLazyRenderer).toHaveBeenCalled();
    expect(getByTestId('lazy-markdown').props.children).toBe('sanitized:partial stream');
  });
});
