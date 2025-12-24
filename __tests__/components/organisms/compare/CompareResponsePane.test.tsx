import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareResponsePane } from '@/components/organisms/compare/CompareResponsePane';
import type { AIConfig, Message } from '@/types';
import type { ImageGenState } from '@/components/organisms/compare/CompareSplitView';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text testID={`ionicon-${name}`}>{name}</Text>,
  };
});

const mockContinueButton = jest.fn((props: any) => (
  <TouchableOpacity testID="continue-button" onPress={props.onPress} disabled={props.isDisabled} />
));
const mockTypingIndicator = jest.fn(({ isVisible }: { isVisible: boolean }) => (
  isVisible ? <Text testID="typing-indicator">typing</Text> : null
));
const mockImageGeneratingPane = jest.fn(({ ai }: { ai: AIConfig }) => (
  <Text testID="image-generating-pane">{ai.name} generating</Text>
));
const mockCompareImageDisplay = jest.fn(({ uri }: { uri: string }) => (
  <Text testID={`image-display-${uri}`}>Image</Text>
));

jest.mock('@/components/organisms/compare/ContinueButton', () => ({
  ContinueButton: (props: any) => mockContinueButton(props),
}));

jest.mock('@/components/organisms/compare/CompareTypingIndicator', () => ({
  CompareTypingIndicator: (props: any) => mockTypingIndicator(props),
}));

jest.mock('@/components/organisms/compare/CompareImageGeneratingPane', () => ({
  CompareImageGeneratingPane: (props: any) => mockImageGeneratingPane(props),
}));

jest.mock('@/components/organisms/compare/CompareImageDisplay', () => ({
  CompareImageDisplay: (props: any) => mockCompareImageDisplay(props),
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
    expect(mockTypingIndicator).toHaveBeenCalledWith(expect.objectContaining({ isVisible: false }));
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

    expect(mockTypingIndicator).toHaveBeenCalledWith(expect.objectContaining({ isVisible: true }));
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

    expect(mockContinueButton).toHaveBeenCalledWith(expect.objectContaining({ isDisabled: true }));
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
    expect(mockImageGeneratingPane).toHaveBeenCalledWith(
      expect.objectContaining({
        ai: ai,
        side: 'left',
        phase: 'rendering',
        onCancel: expect.any(Function),
      })
    );
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
        attachments: [{ type: 'image', uri: 'https://example.com/image.jpg' }],
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

    expect(mockCompareImageDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        onOpenLightbox: onOpenLightbox,
      })
    );
  });
});
