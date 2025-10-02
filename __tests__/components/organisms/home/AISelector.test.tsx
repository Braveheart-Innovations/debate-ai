import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { AISelector } from '@/components/organisms/home/AISelector';
import type { AIConfig } from '@/types';

const mockSectionHeader = jest.fn(() => null);
const mockGradientButton = jest.fn(({ title, onPress, disabled }: any) => (
  <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
    {title}
  </Text>
));
const mockAiCard = jest.fn(({ ai, onPress }: any) => (
  <TouchableOpacity testID={`ai-card-${ai.id}`} onPress={() => onPress(ai)} />
));

jest.mock('@/components/molecules', () => {
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    SectionHeader: (props: any) => mockSectionHeader(props),
    GradientButton: (props: any) => mockGradientButton(props),
  };
});

jest.mock('@/components/organisms/home/AICard', () => ({
  AICard: (props: any) => mockAiCard(props),
}));

const aiList: AIConfig[] = [
  { id: 'ai-1', name: 'Claude', provider: 'claude', model: 'haiku' },
  { id: 'ai-2', name: 'GPT-4', provider: 'openai', model: 'gpt-4' },
  { id: 'ai-3', name: 'Gemini', provider: 'google', model: 'gemini-pro' },
];

describe('AISelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders AI cards and forwards toggle callback', () => {
    const onToggleAI = jest.fn();

    const { getByTestId } = renderWithProviders(
      <AISelector
        availableAIs={aiList}
        selectedAIs={[aiList[0]]}
        maxAIs={2}
        onToggleAI={onToggleAI}
        onStartChat={jest.fn()}
      />
    );

    expect(mockAiCard).toHaveBeenCalledTimes(3);
    fireEvent.press(getByTestId('ai-card-ai-2'));
    expect(onToggleAI).toHaveBeenCalledWith(aiList[1]);
  });

  it('enables start chat button when AIs selected', () => {
    const onStartChat = jest.fn();

    const { getByText } = renderWithProviders(
      <AISelector
        availableAIs={aiList}
        selectedAIs={[aiList[0], aiList[1]]}
        maxAIs={3}
        onToggleAI={jest.fn()}
        onStartChat={onStartChat}
      />
    );

    fireEvent.press(getByText('Start Chat with 2 AIs'));
    expect(onStartChat).toHaveBeenCalled();
  });

  it('disables start chat button when none selected', () => {
    renderWithProviders(
      <AISelector
        availableAIs={aiList}
        selectedAIs={[]}
        maxAIs={3}
        onToggleAI={jest.fn()}
        onStartChat={jest.fn()}
      />
    );

    expect(mockGradientButton).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
  });
});
