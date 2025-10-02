import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatMentionSuggestions } from '@/components/organisms/chat/ChatMentionSuggestions';
import type { AI } from '@/types';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ...require('react-native-reanimated/mock'),
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      springify: () => ({}),
    },
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(TouchableOpacity, { onPress, testID: `button-${title}` }, React.createElement(Text, null, title))
    ),
  };
});

describe('ChatMentionSuggestions', () => {
  const mockOnSelectMention = jest.fn();
  const mockSuggestions: AI[] = [
    { id: 'ai1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
    { id: 'ai2', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
    { id: 'ai3', provider: 'gemini', name: 'Gemini', model: 'gemini-pro', color: '#abcdef' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null when visible is false', () => {
    const { toJSON } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={mockSuggestions}
        onSelectMention={mockOnSelectMention}
        visible={false}
      />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders null when suggestions array is empty', () => {
    const { toJSON } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={[]}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders all suggestions when visible', () => {
    const { getByText } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={mockSuggestions}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    expect(getByText('@claude')).toBeTruthy();
    expect(getByText('@gpt-4')).toBeTruthy();
    expect(getByText('@gemini')).toBeTruthy();
  });

  it('converts AI names to lowercase with @ prefix', () => {
    const upperCaseAI: AI[] = [
      { id: 'ai1', provider: 'claude', name: 'CLAUDE', model: 'claude-3-haiku', color: '#123456' },
    ];

    const { getByText } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={upperCaseAI}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    expect(getByText('@claude')).toBeTruthy();
  });

  it('calls onSelectMention with correct AI name when suggestion is pressed', () => {
    const { getByTestId } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={mockSuggestions}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    fireEvent.press(getByTestId('button-@claude'));
    expect(mockOnSelectMention).toHaveBeenCalledWith('Claude');
  });

  it('calls onSelectMention with original case name', () => {
    const { getByTestId } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={mockSuggestions}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    fireEvent.press(getByTestId('button-@gpt-4'));
    expect(mockOnSelectMention).toHaveBeenCalledWith('GPT-4');
  });

  it('handles multiple suggestion presses', () => {
    const { getByTestId } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={mockSuggestions}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    fireEvent.press(getByTestId('button-@claude'));
    fireEvent.press(getByTestId('button-@gemini'));

    expect(mockOnSelectMention).toHaveBeenCalledTimes(2);
    expect(mockOnSelectMention).toHaveBeenCalledWith('Claude');
    expect(mockOnSelectMention).toHaveBeenCalledWith('Gemini');
  });

  it('renders single suggestion correctly', () => {
    const singleSuggestion: AI[] = [mockSuggestions[0]];

    const { getByText, queryByText } = renderWithProviders(
      <ChatMentionSuggestions
        suggestions={singleSuggestion}
        onSelectMention={mockOnSelectMention}
        visible={true}
      />
    );

    expect(getByText('@claude')).toBeTruthy();
    expect(queryByText('@gpt-4')).toBeNull();
  });
});