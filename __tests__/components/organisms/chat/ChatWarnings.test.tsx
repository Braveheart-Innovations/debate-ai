import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatWarnings } from '@/components/organisms/chat/ChatWarnings';
import type { AIConfig } from '@/types';

jest.mock('@/components/molecules/chat/GPT5LatencyWarning', () => ({
  GPT5LatencyWarning: ({ showAlternativeButton, onSwitchToAlternative }: any) => {
    const React = require('react');
    const { TouchableOpacity, Text } = require('react-native');
    return React.createElement(
      'View',
      null,
      React.createElement(Text, null, 'GPT-5 Warning'),
      showAlternativeButton && React.createElement(
        TouchableOpacity,
        { onPress: onSwitchToAlternative, testID: 'switch-button' },
        React.createElement(Text, null, 'Switch')
      )
    );
  },
}));

describe('ChatWarnings', () => {
  const mockOnSwitchModel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no GPT-5 models selected', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
      { id: 'ai2', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
    ];

    const { toJSON } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} onSwitchModel={mockOnSwitchModel} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders warning when GPT-5 is selected', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'openai', name: 'GPT-5', model: 'gpt-5', color: '#123456' },
    ];

    const { getByText } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} onSwitchModel={mockOnSwitchModel} />
    );

    expect(getByText('GPT-5 Warning')).toBeTruthy();
  });

  it('renders warning when GPT-5 model starts with "gpt-5"', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'openai', name: 'GPT-5 Preview', model: 'gpt-5-preview', color: '#123456' },
    ];

    const { getByText } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} onSwitchModel={mockOnSwitchModel} />
    );

    expect(getByText('GPT-5 Warning')).toBeTruthy();
  });

  it('shows switch button when onSwitchModel is provided', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'openai', name: 'GPT-5', model: 'gpt-5', color: '#123456' },
    ];

    const { getByText } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} onSwitchModel={mockOnSwitchModel} />
    );

    expect(getByText('Switch')).toBeTruthy();
  });

  it('does not show switch button when onSwitchModel is not provided', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'openai', name: 'GPT-5', model: 'gpt-5', color: '#123456' },
    ];

    const { queryByText } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} />
    );

    expect(queryByText('Switch')).toBeNull();
  });

  it('calls onSwitchModel with correct parameters when switch is pressed', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'openai', name: 'GPT-5', model: 'gpt-5', color: '#123456' },
    ];

    const { getByTestId } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} onSwitchModel={mockOnSwitchModel} />
    );

    fireEvent.press(getByTestId('switch-button'));

    expect(mockOnSwitchModel).toHaveBeenCalledWith('gpt-5', 'gpt-4o');
  });

  it('handles multiple AIs with GPT-5 being one of them', () => {
    const selectedAIs: AIConfig[] = [
      { id: 'ai1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
      { id: 'ai2', provider: 'openai', name: 'GPT-5', model: 'gpt-5', color: '#654321' },
      { id: 'ai3', provider: 'gemini', name: 'Gemini', model: 'gemini-pro', color: '#abcdef' },
    ];

    const { getByText, getByTestId } = renderWithProviders(
      <ChatWarnings selectedAIs={selectedAIs} onSwitchModel={mockOnSwitchModel} />
    );

    expect(getByText('GPT-5 Warning')).toBeTruthy();

    fireEvent.press(getByTestId('switch-button'));
    expect(mockOnSwitchModel).toHaveBeenCalledWith('gpt-5', 'gpt-4o');
  });

  it('returns null when selectedAIs is empty', () => {
    const { toJSON } = renderWithProviders(
      <ChatWarnings selectedAIs={[]} onSwitchModel={mockOnSwitchModel} />
    );

    expect(toJSON()).toBeNull();
  });
});