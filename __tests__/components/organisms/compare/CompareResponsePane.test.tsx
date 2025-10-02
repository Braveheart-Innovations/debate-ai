import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareResponsePane } from '@/components/organisms/compare/CompareResponsePane';
import type { AIConfig, Message } from '@/types';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text testID={`ionicon-${name}`}>{name}</Text>,
  };
});

const mockCompareMessageBubble = jest.fn(({ message }: { message: Message }) => (
  <Text testID={`bubble-${message.id}`}>{message.content}</Text>
));
const mockContinueButton = jest.fn((props: any) => (
  <TouchableOpacity testID="continue-button" onPress={props.onPress} disabled={props.isDisabled} />
));
const mockTypingIndicator = jest.fn(({ isVisible }: { isVisible: boolean }) => (
  isVisible ? <Text testID="typing-indicator">typing</Text> : null
));

jest.mock('@/components/organisms/compare/CompareMessageBubble', () => ({
  CompareMessageBubble: (props: any) => mockCompareMessageBubble(props),
}));

jest.mock('@/components/organisms/compare/ContinueButton', () => ({
  ContinueButton: (props: any) => mockContinueButton(props),
}));

jest.mock('@/components/organisms/compare/CompareTypingIndicator', () => ({
  CompareTypingIndicator: (props: any) => mockTypingIndicator(props),
}));

jest.mock('@/utils/aiBrandColors', () => ({
  getBrandPalette: jest.fn(() => ({
    50: '#f5f5f5',
    300: '#999999',
    500: '#333333',
  })),
}));

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
    const { getByTestId } = renderWithProviders(
      <CompareResponsePane
        ai={ai}
        messages={messages}
        isTyping={false}
        streamingContent="Streaming"
        onContinueWithAI={jest.fn()}
        side="left"
        onExpand={jest.fn()}
      />
    );

    expect(mockCompareMessageBubble).toHaveBeenCalledTimes(3);
    expect(getByTestId('bubble-m1')).toBeTruthy();
    expect(getByTestId('bubble-m2')).toBeTruthy();
    expect(getByTestId('bubble-streaming_left')).toBeTruthy();
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
      />
    );

    expect(mockContinueButton).toHaveBeenCalledWith(expect.objectContaining({ isDisabled: true }));
  });
});
