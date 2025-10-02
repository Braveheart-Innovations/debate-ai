import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import { VotingInterface } from '@/components/organisms/debate/VotingInterface';
import type { AI } from '@/types';
import { fireEvent } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    AIProviderTile: ({ ai, onPress }: { ai: AI; onPress: () => void }) => (
      React.createElement(Text, { accessibilityRole: 'button', onPress }, ai.name)
    ),
  };
});

describe('VotingInterface', () => {
  const participants: AI[] = [
    { id: 'left', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
    { id: 'right', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
  ];

  it('displays prompt and current scores when overall voting', () => {
    const { getByText, getAllByText } = renderWithProviders(
      <VotingInterface
        participants={participants}
        isOverallVote={true}
        isFinalVote={true}
        votingRound={3}
        scores={{
          left: { name: 'Claude', roundWins: 2, roundsWon: [1, 2], isOverallWinner: true },
          right: { name: 'GPT-4', roundWins: 1, roundsWon: [3], isOverallWinner: false },
        }}
        votingPrompt="Pick the champion"
        onVote={jest.fn()}
      />
    );

    expect(getByText('Pick the champion')).toBeTruthy();
    expect(getAllByText('Claude').length).toBeGreaterThan(0);
    expect(getByText('2')).toBeTruthy();
  });

  it('invokes onVote when participant tile is pressed', () => {
    const handleVote = jest.fn();
    const { getByText } = renderWithProviders(
      <VotingInterface
        participants={participants}
        isOverallVote={false}
        isFinalVote={false}
        votingRound={1}
        scores={null}
        votingPrompt="Round vote"
        onVote={handleVote}
      />
    );

    fireEvent.press(getByText('Claude'));
    expect(handleVote).toHaveBeenCalledWith('left');
  });
});
