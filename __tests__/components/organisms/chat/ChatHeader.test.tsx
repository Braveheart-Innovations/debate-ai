import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatHeader } from '@/components/organisms/chat/ChatHeader';
import type { AI } from '@/types';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(TouchableOpacity, { onPress, testID: 'back-button' }, React.createElement(Text, null, title))
    ),
  };
});

describe('ChatHeader', () => {
  const mockOnBack = jest.fn();
  const mockParticipants: AI[] = [
    { id: 'ai1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
    { id: 'ai2', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default title when no title provided', () => {
    const { getByText } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} participants={mockParticipants} />
    );

    expect(getByText('AI Conversation')).toBeTruthy();
  });

  it('renders with custom title when provided', () => {
    const { getByText } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} title="Custom Chat" participants={mockParticipants} />
    );

    expect(getByText('Custom Chat')).toBeTruthy();
  });

  it('displays all participants with bullet separators', () => {
    const { getByText } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} participants={mockParticipants} />
    );

    expect(getByText(/Claude/)).toBeTruthy();
    expect(getByText(/GPT-4/)).toBeTruthy();
    expect(getByText(/•/)).toBeTruthy();
  });

  it('renders with no participants gracefully', () => {
    const { getByText } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} participants={[]} />
    );

    expect(getByText('AI Conversation')).toBeTruthy();
  });

  it('calls onBack when back button is pressed', () => {
    const { getByTestId } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} participants={mockParticipants} />
    );

    fireEvent.press(getByTestId('back-button'));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('renders single participant without bullet separator', () => {
    const singleParticipant: AI[] = [
      { id: 'ai1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
    ];

    const { getByText, queryByText } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} participants={singleParticipant} />
    );

    expect(getByText('Claude')).toBeTruthy();
    expect(queryByText(/•/)).toBeNull();
  });

  it('renders multiple participants with proper separators', () => {
    const threeParticipants: AI[] = [
      { id: 'ai1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
      { id: 'ai2', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
      { id: 'ai3', provider: 'gemini', name: 'Gemini', model: 'gemini-pro', color: '#abcdef' },
    ];

    const { getAllByText } = renderWithProviders(
      <ChatHeader onBack={mockOnBack} participants={threeParticipants} />
    );

    const bullets = getAllByText(/•/);
    expect(bullets).toHaveLength(2); // Two separators for three participants
  });
});