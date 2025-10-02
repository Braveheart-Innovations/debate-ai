import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatEmptyState } from '@/components/organisms/chat/ChatEmptyState';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('ChatEmptyState', () => {
  it('renders with default props', () => {
    const { getByText } = renderWithProviders(<ChatEmptyState />);

    expect(getByText('💭')).toBeTruthy();
    expect(getByText('Start the conversation')).toBeTruthy();
    expect(getByText('Type a message or @ mention specific AIs')).toBeTruthy();
  });

  it('renders with custom emoji', () => {
    const { getByText } = renderWithProviders(<ChatEmptyState emoji="🤖" />);
    expect(getByText('🤖')).toBeTruthy();
  });

  it('renders with custom title', () => {
    const { getByText } = renderWithProviders(<ChatEmptyState title="No messages yet" />);
    expect(getByText('No messages yet')).toBeTruthy();
  });

  it('renders with custom subtitle', () => {
    const { getByText } = renderWithProviders(
      <ChatEmptyState subtitle="Send your first message to begin" />
    );
    expect(getByText('Send your first message to begin')).toBeTruthy();
  });

  it('renders with all custom props', () => {
    const { getByText } = renderWithProviders(
      <ChatEmptyState
        emoji="🎭"
        title="Welcome to the debate"
        subtitle="Choose your participants and start"
      />
    );

    expect(getByText('🎭')).toBeTruthy();
    expect(getByText('Welcome to the debate')).toBeTruthy();
    expect(getByText('Choose your participants and start')).toBeTruthy();
  });

  it('renders with empty strings', () => {
    const { queryByText } = renderWithProviders(
      <ChatEmptyState emoji="" title="" subtitle="" />
    );

    // Should render but with empty content
    expect(queryByText('💭')).toBeNull();
    expect(queryByText('Start the conversation')).toBeNull();
  });
});