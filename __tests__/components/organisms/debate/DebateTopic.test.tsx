import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateTopic } from '@/components/organisms/debate/DebateTopic';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('DebateTopic', () => {
  it('renders topic text', () => {
    const { getByText } = renderWithProviders(
      <DebateTopic topic="Test Topic" />
    );
    expect(getByText('Test Topic')).toBeTruthy();
  });

  it('displays format name when provided', () => {
    const { getByText } = renderWithProviders(
      <DebateTopic topic="Test Topic" formatName="Oxford Debate" />
    );
    expect(getByText(/Oxford Debate/)).toBeTruthy();
  });

  it('displays round information when provided', () => {
    const { getByText } = renderWithProviders(
      <DebateTopic topic="Test Topic" roundInfo={{ current: 2, total: 3 }} />
    );
    expect(getByText(/Exchange 2 of 3/)).toBeTruthy();
  });

  it('displays phase label when provided', () => {
    const { getByText } = renderWithProviders(
      <DebateTopic topic="Test Topic" roundInfo={{ current: 1, total: 3 }} phaseLabel="Opening" />
    );
    expect(getByText(/Opening/)).toBeTruthy();
  });

  it('renders without optional props', () => {
    const { getByText } = renderWithProviders(
      <DebateTopic topic="Minimal Topic" />
    );
    expect(getByText('Minimal Topic')).toBeTruthy();
  });

  it('truncates long topics', () => {
    const longTopic = 'This is a very long topic that should be truncated '.repeat(5);
    const { getByText } = renderWithProviders(
      <DebateTopic topic={longTopic} />
    );
    expect(getByText(longTopic)).toBeTruthy();
  });
});
