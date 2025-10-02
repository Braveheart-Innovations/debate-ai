import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { TopicSelector } from '@/components/organisms/debate/TopicSelector';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Button: () => null,
    GradientButton: () => null,
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('TopicSelector', () => {
  const defaultProps = {
    selectedTopic: '',
    customTopic: '',
    topicMode: 'preset' as const,
    showTopicDropdown: false,
    isTopicSelected: false,
    finalTopic: '',
    setSelectedTopic: jest.fn(),
    setCustomTopic: jest.fn(),
    setTopicMode: jest.fn(),
    setShowTopicDropdown: jest.fn(),
    selectRandomTopic: jest.fn(),
    validateCurrentTopic: jest.fn(() => ({ valid: true })),
    onStartDebate: jest.fn(),
  };

  it('renders topic selector', () => {
    const { getByText } = renderWithProviders(<TopicSelector {...defaultProps} />);
    expect(getByText('Choose Your Battle!')).toBeTruthy();
  });
});
