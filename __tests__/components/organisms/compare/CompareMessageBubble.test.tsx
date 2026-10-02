import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAIMessage } from '@test-utils/fixtures';
import { CompareMessageBubble } from '@/components/organisms/compare/CompareMessageBubble';
import { useStreamingMessage, type StreamingMessageHook } from '@/hooks/streaming';
import { sanitizeMarkdown, shouldLazyRender } from '@/utils/markdown';
import * as Clipboard from 'expo-clipboard';
import type { Message } from '@/types';
import type { LazyMarkdownRenderer } from '@/components/molecules/common/LazyMarkdownRenderer';

jest.mock('@/services/media/MediaSaveService', () => ({
  __esModule: true,
  default: {
    saveFileUri: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/components/organisms/compare/CompareImageDisplay', () => ({
  CompareImageDisplay: () => null,
}));

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

const mockLazyRenderer = capturePropsOf<typeof LazyMarkdownRenderer>(({ content }) => (
  <Text testID="lazy-markdown">{content}</Text>
));

jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => ({
  get LazyMarkdownRenderer() {
    return mockLazyRenderer.Stub;
  },
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

const mockUseStreamingMessage = jest.mocked(useStreamingMessage);
const mockShouldLazyRender = jest.mocked(shouldLazyRender);
const mockSanitizeMarkdown = jest.mocked(sanitizeMarkdown);

/** Idle streaming state; override the fields a test drives. */
const createStreamingState = (
  overrides: Partial<StreamingMessageHook> = {}
): StreamingMessageHook => ({
  content: '',
  isStreaming: false,
  cursorVisible: false,
  chunksReceived: 0,
  bytesReceived: 0,
  appendChunk: jest.fn(),
  completeStream: jest.fn(),
  handleError: jest.fn(),
  clearStream: jest.fn(),
  ...overrides,
});

const baseMessage = createMockAIMessage({
  id: 'msg-1',
  sender: 'Claude',
  content: 'Hello world',
  timestamp: Date.now(),
  metadata: undefined,
});

jest.useFakeTimers();

describe('CompareMessageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLazyRenderer.reset();
    mockUseStreamingMessage.mockReturnValue(createStreamingState());
    mockShouldLazyRender.mockReturnValue(false);
  });

  it('sanitizes content, renders markdown, and copies message text', async () => {
    const { getByTestId, getByLabelText } = renderWithProviders(
      <CompareMessageBubble message={baseMessage} side="left" onOpenLightbox={jest.fn()} />
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
    mockUseStreamingMessage.mockReturnValue(
      createStreamingState({ content: 'partial stream', error: 'fail' })
    );
    mockShouldLazyRender.mockReturnValue(true);

    const { getByTestId } = renderWithProviders(
      <CompareMessageBubble
        message={{ ...baseMessage, content: 'Original' }}
        side="right"
        onOpenLightbox={jest.fn()}
      />
    );

    expect(mockLazyRenderer.calls.length).toBeGreaterThan(0);
    expect(getByTestId('lazy-markdown').props.children).toBe('sanitized:partial stream');
  });

  it('renders citation sources outside the message content container', () => {
    const message: Message = {
      ...baseMessage,
      content: 'See [1] for details.',
      metadata: {
        citations: [{ index: 1, url: 'https://example.com/source' }],
      },
    };

    const { getByTestId } = renderWithProviders(
      <CompareMessageBubble
        message={message}
        side="left"
        onOpenLightbox={jest.fn()}
      />
    );

    expect(getByTestId('markdown').props.children).toContain('[[1]](https://example.com/source)');
    expect(getByTestId('citation-sources')).toBeTruthy();
  });

  it('accepts onOpenLightbox prop for image attachments', () => {
    const onOpenLightbox = jest.fn();

    renderWithProviders(
      <CompareMessageBubble
        message={baseMessage}
        side="left"
        onOpenLightbox={onOpenLightbox}
      />
    );

    // The component should accept and handle onOpenLightbox prop
    // Image attachment rendering is tested separately in CompareImageDisplay tests
    expect(mockSanitizeMarkdown).toHaveBeenCalled();
  });
});
