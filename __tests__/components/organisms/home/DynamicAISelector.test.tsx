import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DynamicAISelector } from '@/components/organisms/home/DynamicAISelector';
import type { AIConfig } from '@/types';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockSectionHeader = jest.fn(({ onAction }: any) => (
  <Text testID="dynamic-header" onPress={onAction}>
    header
  </Text>
));

const mockGradientButton = jest.fn(({ title, onPress, disabled, trailingIcon, onTrailingIconPress, trailingIconDisabled }: any) => (
  <>
    <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
      {title}
    </Text>
    {trailingIcon && onTrailingIconPress && (
      <Text
        testID="trailing-icon"
        onPress={trailingIconDisabled || disabled ? undefined : onTrailingIconPress}
      >
        {trailingIcon}
      </Text>
    )}
  </>
));

const mockAiCard = jest.fn(({ ai, onPress }: any) => (
  <TouchableOpacity testID={`ai-card-${ai.id}`} onPress={() => onPress(ai)} />
));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SectionHeader: (props: any) => mockSectionHeader(props),
    GradientButton: (props: any) => mockGradientButton(props),
    InfoButton: ({ topicId }: any) => React.createElement(Text, { testID: `info-button-${topicId}` }, 'info'),
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/organisms/home/AICard', () => ({
  AICard: (props: any) => mockAiCard(props),
}));

const aiList: AIConfig[] = [
  { id: 'ai-1', name: 'Claude', provider: 'claude', model: 'haiku' },
  { id: 'ai-2', name: 'GPT-4', provider: 'openai', model: 'gpt-4' },
];

describe('DynamicAISelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes onAddAI from header action with haptics', () => {
    const onAddAI = jest.fn();

    const { getByTestId } = renderWithProviders(
      <DynamicAISelector
        configuredAIs={aiList}
        selectedAIs={[]}
        maxAIs={3}
        onToggleAI={jest.fn()}
        onAddAI={onAddAI}
      />
    );

    fireEvent.press(getByTestId('dynamic-header'));
    expect(onAddAI).toHaveBeenCalled();
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
  });

  it('shows configuration button when no AIs present', () => {
    const onAddAI = jest.fn();

    const { getByText } = renderWithProviders(
      <DynamicAISelector
        configuredAIs={[]}
        selectedAIs={[]}
        maxAIs={3}
        onToggleAI={jest.fn()}
        onAddAI={onAddAI}
      />
    );

    fireEvent.press(getByText('Configure Your First AI'));
    expect(onAddAI).toHaveBeenCalled();
  });

  it('omits header when hideHeader is true and hides start button when requested', () => {
    const { queryByTestId, queryByText } = renderWithProviders(
      <DynamicAISelector
        configuredAIs={aiList}
        selectedAIs={aiList}
        maxAIs={3}
        onToggleAI={jest.fn()}
        onAddAI={jest.fn()}
        hideHeader
        hideStartButton
      />
    );

    expect(queryByTestId('dynamic-header')).toBeNull();
    expect(queryByText(/Start Chat/)).toBeNull();
  });

  describe('onQuickStart', () => {
    it('renders trailing icon on Start Chat button when onQuickStart provided', () => {
      const { getByTestId } = renderWithProviders(
        <DynamicAISelector
          configuredAIs={aiList}
          selectedAIs={aiList}
          maxAIs={3}
          onToggleAI={jest.fn()}
          onAddAI={jest.fn()}
          onQuickStart={jest.fn()}
        />
      );

      expect(getByTestId('trailing-icon')).toBeTruthy();
    });

    it('does not render trailing icon when onQuickStart is undefined', () => {
      const { queryByTestId } = renderWithProviders(
        <DynamicAISelector
          configuredAIs={aiList}
          selectedAIs={aiList}
          maxAIs={3}
          onToggleAI={jest.fn()}
          onAddAI={jest.fn()}
        />
      );

      expect(queryByTestId('trailing-icon')).toBeNull();
    });

    it('calls onQuickStart when trailing icon pressed', () => {
      const onQuickStart = jest.fn();
      const { getByTestId } = renderWithProviders(
        <DynamicAISelector
          configuredAIs={aiList}
          selectedAIs={aiList}
          maxAIs={3}
          onToggleAI={jest.fn()}
          onAddAI={jest.fn()}
          onQuickStart={onQuickStart}
        />
      );

      fireEvent.press(getByTestId('trailing-icon'));
      expect(onQuickStart).toHaveBeenCalledTimes(1);
    });

    it('trailing icon is disabled when no AIs selected', () => {
      const onQuickStart = jest.fn();
      const { getByTestId } = renderWithProviders(
        <DynamicAISelector
          configuredAIs={aiList}
          selectedAIs={[]}
          maxAIs={3}
          onToggleAI={jest.fn()}
          onAddAI={jest.fn()}
          onQuickStart={onQuickStart}
        />
      );

      fireEvent.press(getByTestId('trailing-icon'));
      expect(onQuickStart).not.toHaveBeenCalled();
    });
  });
});
