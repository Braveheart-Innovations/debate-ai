import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatTypingIndicators, TypingIndicator } from '@/components/organisms/chat/ChatTypingIndicators';

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('ChatTypingIndicators', () => {
  it('renders null when typingAIs is empty', () => {
    const { toJSON } = renderWithProviders(<ChatTypingIndicators typingAIs={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders typing indicator for single AI', () => {
    const { getByText } = renderWithProviders(<ChatTypingIndicators typingAIs={['Claude']} />);
    expect(getByText('Claude is thinking')).toBeTruthy();
  });

  it('renders typing indicators for multiple AIs', () => {
    const { getByText } = renderWithProviders(
      <ChatTypingIndicators typingAIs={['Claude', 'GPT-4', 'Gemini']} />
    );

    expect(getByText('Claude is thinking')).toBeTruthy();
    expect(getByText('GPT-4 is thinking')).toBeTruthy();
    expect(getByText('Gemini is thinking')).toBeTruthy();
  });

  it('renders correct number of typing indicators', () => {
    const { getAllByText } = renderWithProviders(
      <ChatTypingIndicators typingAIs={['Claude', 'GPT-4']} />
    );

    const indicators = getAllByText(/is thinking/);
    expect(indicators).toHaveLength(2);
  });
});

describe('TypingIndicator', () => {
  it('renders AI name with thinking message', () => {
    const { getByText } = renderWithProviders(<TypingIndicator aiName="Claude" />);
    expect(getByText('Claude is thinking')).toBeTruthy();
  });

  it('renders with different AI names', () => {
    const { getByText } = renderWithProviders(<TypingIndicator aiName="GPT-4 Turbo" />);
    expect(getByText('GPT-4 Turbo is thinking')).toBeTruthy();
  });
});