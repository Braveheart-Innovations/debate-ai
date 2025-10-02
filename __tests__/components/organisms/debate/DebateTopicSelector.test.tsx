import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateTopicSelector } from '@/components/organisms/debate/DebateTopicSelector';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(TouchableOpacity, { onPress, testID: `button-${title}` }, React.createElement(Text, null, title)),
    GradientButton: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(TouchableOpacity, { onPress, testID: `gradient-${title}` }, React.createElement(Text, null, title)),
    Card: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});

jest.mock('@/components/organisms/debate/RichTopicInput', () => ({
  RichTopicInput: () => null,
}));

jest.mock('@/components/organisms/debate/PresetTopicsModal', () => ({
  PresetTopicsModal: () => null,
}));

describe('DebateTopicSelector', () => {
  const defaultProps = {
    selectedTopic: '',
    customTopic: '',
    topicMode: 'preset' as const,
    onTopicSelect: jest.fn(),
    onCustomTopicChange: jest.fn(),
    onTopicModeChange: jest.fn(),
    onSurpriseMe: jest.fn(),
  };

  it('renders topic selection buttons', () => {
    const { getByTestId } = renderWithProviders(<DebateTopicSelector {...defaultProps} />);
    expect(getByTestId('button-Preset Motions')).toBeTruthy();
    expect(getByTestId('button-Custom Motion')).toBeTruthy();
  });

  it('calls onSurpriseMe when surprise button clicked', () => {
    const onSurpriseMe = jest.fn();
    const { getByTestId } = renderWithProviders(<DebateTopicSelector {...defaultProps} onSurpriseMe={onSurpriseMe} />);
    fireEvent.press(getByTestId('gradient-🎲 Surprise Me!'));
    expect(onSurpriseMe).toHaveBeenCalled();
  });

  it('displays selected topic', () => {
    const { getByText } = renderWithProviders(<DebateTopicSelector {...defaultProps} selectedTopic="Test Topic" />);
    expect(getByText('Test Topic')).toBeTruthy();
  });
});
