import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAttachment } from '@test-utils/fixtures';
import { CompareResponsePane } from '@/components/organisms/compare/CompareResponsePane';
import type { AIConfig, Message } from '@/types';
import type { ImageGenState } from '@/components/organisms/compare/CompareSplitView';
import type { ContinueButton } from '@/components/organisms/compare/ContinueButton';
import type { CompareTypingIndicator } from '@/components/organisms/compare/CompareTypingIndicator';
import type { CompareImageGeneratingPane } from '@/components/organisms/compare/CompareImageGeneratingPane';
import type { CompareImageDisplay } from '@/components/organisms/compare/CompareImageDisplay';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text testID={`ionicon-${name}`}>{name}</Text>,
  };
});

const mockContinueButton = capturePropsOf<typeof ContinueButton>((props) => (
  <TouchableOpacity testID="continue-button" onPress={props.onPress} disabled={props.isDisabled} />
));
const mockTypingIndicator = capturePropsOf<typeof CompareTypingIndicator>(({ isVisible }) => (
  isVisible ? <Text testID="typing-indicator">typing</Text> : null
));
const mockImageGeneratingPane = capturePropsOf<typeof CompareImageGeneratingPane>(({ ai }) => (
  <Text testID="image-generating-pane">{ai.name} generating</Text>
));
const mockCompareImageDisplay = capturePropsOf<typeof CompareImageDisplay>(({ uri }) => (
  <Text testID={`image-display-${uri}`}>Image</Text>
));

jest.mock('@/components/organisms/compare/ContinueButton', () => ({
  get ContinueButton() {
    return mockContinueButton.Stub;
  },
}));

jest.mock('@/components/organisms/compare/CompareTypingIndicator', () => ({
  get CompareTypingIndicator() {
    return mockTypingIndicator.Stub;
  },
}));

jest.mock('@/components/organisms/compare/CompareImageGeneratingPane', () => ({
  get CompareImageGeneratingPane() {
    return mockImageGeneratingPane.Stub;
  },
}));

jest.mock('@/components/organisms/compare/CompareImageDisplay', () => ({
  get CompareImageDisplay() {
    return mockCompareImageDisplay.Stub;
  },
}));

jest.mock('react-native-markdown-display', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: string }) =>
      React.createElement(Text, { testID: 'markdown' }, children),
  };
});

jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: ({ content }: { content: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'lazy-markdown' }, content);
  },
  createMarkdownStyles: () => ({}),
}));

jest.mock('@/utils/aiBrandColors', () => ({
  getBrandPalette: jest.fn(() => ({
    50: '#f5f5f5',
    300: '#999999',
    500: '#333333',
  })),
}));

jest.mock('@/utils/markdown', () => ({
  sanitizeMarkdown: (content: string) => content,
  shouldLazyRender: () => false,
}));

jest.mock('@/utils/markdownSelectable', () => ({
  selectableMarkdownRules: {},
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

const defaultImageState: ImageGenState = {
  isGenerating: false,
  phase: 'done',
  startTime: 0,
  aspectRatio: 'square',
};

const generatingImageState: ImageGenState = {
  isGenerating: true,
  phase: 'rendering',
  startTime: Date.now(),
  aspectRatio: 'square',
};

const ai: AIConfig = {
  id: 'ai-1',
  name: 'Claude',
  provider: 'claude',
  model: 'haiku',
  color: '#111111',
};

const messages: Message[] = [
  { id: 'm1', sender: 'Claude', senderType: 'ai', content: 'Hello', timestamp: 1 },
  { id: 'm2', sender: 'Claude', senderType: 'ai', content: 'How can I assist?', timestamp: 2 },
];

describe('CompareResponsePane', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContinueButton.reset();
    mockTypingIndicator.reset();
    mockImageGeneratingPane.reset();
    mockCompareImageDisplay.reset();
  });

  it('renders messages and streaming content when provided', () => {
    const { getByText, getAllByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messages}
        isTyping={false}
        streamingContent="Streaming"
        onContinueWithAI={jest.fn()}
        side="left"
        onExpand={jest.fn()}
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={jest.fn()}
      />
    );

    // Messages are rendered via markdown
    const markdowns = getAllByTestId('markdown');
    expect(markdowns.length).toBeGreaterThanOrEqual(2); // At least 2 messages + streaming content
    expect(getByText('Hello')).toBeTruthy();
    expect(getByText('How can I assist?')).toBeTruthy();
    expect(getByText('Streaming')).toBeTruthy();
    expect(mockTypingIndicator.calls).toContainEqual(expect.objectContaining({ isVisible: false }));
  });

  it('invokes expand and continue callbacks', () => {
    const onExpand = jest.fn();
    const onContinue = jest.fn();

    const { getByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messages}
        isTyping={true}
        onContinueWithAI={onContinue}
        side="right"
        isExpanded
        isDisabled={false}
        onExpand={onExpand}
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('continue-button'));
    expect(onContinue).toHaveBeenCalled();

    fireEvent.press(getByTestId('ionicon-contract-outline'));
    expect(onExpand).toHaveBeenCalled();

    expect(mockTypingIndicator.calls).toContainEqual(expect.objectContaining({ isVisible: true }));
  });

  it('disables continue button when pane disabled', () => {
    renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messages}
        isTyping={false}
        onContinueWithAI={jest.fn()}
        side="left"
        isDisabled
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={jest.fn()}
      />
    );

    expect(mockContinueButton.calls).toContainEqual(expect.objectContaining({ isDisabled: true }));
  });

  it('renders image generating pane when image is generating', () => {
    const onCancelImage = jest.fn();

    const { getByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messages}
        isTyping={false}
        onContinueWithAI={jest.fn()}
        side="left"
        imageState={generatingImageState}
        onCancelImage={onCancelImage}
        onOpenLightbox={jest.fn()}
      />
    );

    expect(getByTestId('image-generating-pane')).toBeTruthy();
    expect(mockImageGeneratingPane.calls).toContainEqual(
      expect.objectContaining({
        ai: ai,
        side: 'left',
        phase: 'rendering',
        onCancel: expect.any(Function),
      })
    );
  });

  it('renders citation sources for cited messages', () => {
    const citedMessages: Message[] = [
      {
        id: 'm1',
        sender: 'Claude',
        senderType: 'ai',
        content: 'See [1] for details.',
        timestamp: 1,
        metadata: {
          citations: [{ index: 1, url: 'https://example.com/source' }],
        },
      },
    ];

    const { getByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={citedMessages}
        isTyping={false}
        onContinueWithAI={jest.fn()}
        side="left"
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={jest.fn()}
      />
    );

    expect(getByTestId('citation-sources')).toBeTruthy();
  });

  it('passes onOpenLightbox to image display when message has image attachments', () => {
    const onOpenLightbox = jest.fn();
    const messagesWithImage: Message[] = [
      {
        id: 'm1',
        sender: 'Claude',
        senderType: 'ai',
        content: 'Here is an image',
        timestamp: 1,
        attachments: [createMockAttachment({ uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' })],
      },
    ];

    renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messagesWithImage}
        isTyping={false}
        onContinueWithAI={jest.fn()}
        side="left"
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={onOpenLightbox}
      />
    );

    expect(mockCompareImageDisplay.calls).toContainEqual(
      expect.objectContaining({
        onOpenLightbox: onOpenLightbox,
      })
    );
  });

  it('renders report and copy in the same pane action row', () => {
    const onReportContent = jest.fn();

    const { getByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messages}
        isTyping={false}
        onContinueWithAI={jest.fn()}
        side="left"
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={jest.fn()}
        onReportContent={onReportContent}
      />
    );

    expect(getByTestId('compare-pane-action-row')).toHaveStyle({
      flexDirection: 'row',
      alignItems: 'center',
    });
    expect(getByTestId('copy-compare-pane-content')).toBeTruthy();

    fireEvent.press(getByTestId('report-compare-message-m2'));

    expect(onReportContent).toHaveBeenCalledWith(messages[1]);
  });

  it('does not show report actions for streaming-only compare content', () => {
    const { queryByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={[]}
        isTyping={false}
        streamingContent="Still streaming"
        onContinueWithAI={jest.fn()}
        side="left"
        imageState={defaultImageState}
        onCancelImage={jest.fn()}
        onOpenLightbox={jest.fn()}
        onReportContent={jest.fn()}
      />
    );

    expect(queryByTestId('report-compare-message-m1')).toBeNull();
  });
});
