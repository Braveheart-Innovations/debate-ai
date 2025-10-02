/**
 * VotingInterface Test Suite
 * Comprehensive tests for the voting interface component
 */

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { VotingInterface } from '@/components/organisms/debate/VotingInterface';
import { AI } from '@/types';

// Mock dependencies
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ...require('react-native-reanimated/mock'),
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      springify: () => ({ damping: () => ({}) }),
      duration: () => ({}),
    },
    useSharedValue: () => ({ value: 1 }),
    useAnimatedStyle: (fn: any) => fn(),
    withSpring: (value: any) => value,
    withTiming: (value: any) => value,
  };
});

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: any) =>
      React.createElement(Text, { testID: props.testID || 'typography' }, children),
    AIProviderTile: ({ ai, onPress }: any) =>
      React.createElement(TouchableOpacity, {
        testID: `ai-tile-${ai.id}`,
        onPress: () => onPress?.(),
      }, React.createElement(Text, null, ai.name)),
  };
});

describe('VotingInterface', () => {
  const mockOnVote = jest.fn();

  const mockParticipants: AI[] = [
    { id: 'claude', name: 'Claude', provider: 'anthropic', color: '#6366F1' },
    { id: 'chatgpt', name: 'ChatGPT', provider: 'openai', color: '#10A37F' },
  ];

  const mockScores = {
    claude: { name: 'Claude', roundWins: 2 },
    chatgpt: { name: 'ChatGPT', roundWins: 1 },
  };

  const defaultProps = {
    participants: mockParticipants,
    isOverallVote: false,
    isFinalVote: false,
    votingRound: 1,
    scores: null,
    votingPrompt: 'Who won this exchange?',
    onVote: mockOnVote,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders voting prompt', () => {
      const { getByText } = renderWithProviders(<VotingInterface {...defaultProps} />);
      expect(getByText('Who won this exchange?')).toBeTruthy();
    });

    it('renders all participant tiles', () => {
      const { getByTestId } = renderWithProviders(<VotingInterface {...defaultProps} />);

      expect(getByTestId('ai-tile-claude')).toBeTruthy();
      expect(getByTestId('ai-tile-chatgpt')).toBeTruthy();
    });

    it('renders participant names', () => {
      const { getByText } = renderWithProviders(<VotingInterface {...defaultProps} />);

      expect(getByText('Claude')).toBeTruthy();
      expect(getByText('ChatGPT')).toBeTruthy();
    });

    it('does not show scores when not overall vote', () => {
      const { queryByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={false} scores={mockScores} />
      );

      expect(queryByText('Current Scores:')).toBeNull();
    });

    it('shows scores when overall vote', () => {
      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={mockScores} />
      );

      expect(getByText('Current Scores:')).toBeTruthy();
    });

    it('renders custom voting prompt', () => {
      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} votingPrompt="Custom prompt" />
      );

      expect(getByText('Custom prompt')).toBeTruthy();
    });
  });

  describe('Voting Interactions', () => {
    it('calls onVote with Claude ID when Claude tile is pressed', () => {
      const { getByTestId } = renderWithProviders(<VotingInterface {...defaultProps} />);

      fireEvent.press(getByTestId('ai-tile-claude'));

      expect(mockOnVote).toHaveBeenCalledWith('claude');
    });

    it('calls onVote with ChatGPT ID when ChatGPT tile is pressed', () => {
      const { getByTestId } = renderWithProviders(<VotingInterface {...defaultProps} />);

      fireEvent.press(getByTestId('ai-tile-chatgpt'));

      expect(mockOnVote).toHaveBeenCalledWith('chatgpt');
    });

    it('allows multiple votes (for different rounds)', () => {
      const { getByTestId } = renderWithProviders(<VotingInterface {...defaultProps} />);

      fireEvent.press(getByTestId('ai-tile-claude'));
      fireEvent.press(getByTestId('ai-tile-chatgpt'));

      expect(mockOnVote).toHaveBeenCalledTimes(2);
      expect(mockOnVote).toHaveBeenNthCalledWith(1, 'claude');
      expect(mockOnVote).toHaveBeenNthCalledWith(2, 'chatgpt');
    });
  });

  describe('Overall Vote Display', () => {
    it('displays scores for overall vote', () => {
      const { getAllByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={mockScores} />
      );

      const claudeTexts = getAllByText('Claude');
      const chatgptTexts = getAllByText('ChatGPT');

      expect(claudeTexts.length).toBeGreaterThan(0);
      expect(chatgptTexts.length).toBeGreaterThan(0);
    });

    it('displays round wins for each participant', () => {
      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={mockScores} />
      );

      expect(getByText('2')).toBeTruthy(); // Claude's score
      expect(getByText('1')).toBeTruthy(); // ChatGPT's score
    });

    it('shows override message for overall vote', () => {
      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={mockScores} />
      );

      expect(getByText(/Despite the scores/i)).toBeTruthy();
    });

    it('handles missing scores gracefully', () => {
      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={null} />
      );

      expect(getByText('Who won this exchange?')).toBeTruthy();
    });
  });

  describe('Props Handling', () => {
    it('handles different voting rounds', () => {
      const { rerender, getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} votingRound={1} />
      );

      expect(getByText('Who won this exchange?')).toBeTruthy();

      rerender(<VotingInterface {...defaultProps} votingRound={3} />);

      expect(getByText('Who won this exchange?')).toBeTruthy();
    });

    it('handles isFinalVote prop', () => {
      const { getByTestId } = renderWithProviders(
        <VotingInterface {...defaultProps} isFinalVote={true} />
      );

      expect(getByTestId('ai-tile-claude')).toBeTruthy();
      expect(getByTestId('ai-tile-chatgpt')).toBeTruthy();
    });

    it('handles different participant configurations', () => {
      const singleParticipant: AI[] = [mockParticipants[0]];

      const { getByTestId, queryByTestId } = renderWithProviders(
        <VotingInterface {...defaultProps} participants={singleParticipant} />
      );

      expect(getByTestId('ai-tile-claude')).toBeTruthy();
      expect(queryByTestId('ai-tile-chatgpt')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty participants array', () => {
      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} participants={[]} />
      );

      expect(getByText('Who won this exchange?')).toBeTruthy();
    });

    it('handles participants without color', () => {
      const participantsNoColor: AI[] = [
        { id: 'claude', name: 'Claude', provider: 'anthropic' },
      ];

      const { getByTestId } = renderWithProviders(
        <VotingInterface {...defaultProps} participants={participantsNoColor} />
      );

      expect(getByTestId('ai-tile-claude')).toBeTruthy();
    });

    it('handles long voting prompts', () => {
      const longPrompt = 'This is a very long voting prompt that should still be displayed correctly without breaking the layout';

      const { getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} votingPrompt={longPrompt} />
      );

      expect(getByText(longPrompt)).toBeTruthy();
    });

    it('handles scores with zero round wins', () => {
      const zeroScores = {
        claude: { name: 'Claude', roundWins: 0 },
        chatgpt: { name: 'ChatGPT', roundWins: 0 },
      };

      const { getAllByText } = renderWithProviders(
        <VotingInterface
          {...defaultProps}
          isOverallVote={true}
          scores={zeroScores}
        />
      );

      expect(getAllByText('0').length).toBeGreaterThan(0);
    });
  });

  describe('Animations', () => {
    it('renders without animation errors', () => {
      const { getByTestId } = renderWithProviders(<VotingInterface {...defaultProps} />);

      expect(getByTestId('ai-tile-claude')).toBeTruthy();
      expect(getByTestId('ai-tile-chatgpt')).toBeTruthy();
    });

    it('handles multiple renders without errors', () => {
      const { rerender } = renderWithProviders(<VotingInterface {...defaultProps} />);

      rerender(<VotingInterface {...defaultProps} votingRound={2} />);
      rerender(<VotingInterface {...defaultProps} votingRound={3} />);

      expect(() => rerender(<VotingInterface {...defaultProps} />)).not.toThrow();
    });
  });

  describe('Score Display Details', () => {
    it('displays AI names in scores section', () => {
      const { getAllByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={mockScores} />
      );

      const claudeOccurrences = getAllByText('Claude');
      const chatgptOccurrences = getAllByText('ChatGPT');

      expect(claudeOccurrences.length).toBeGreaterThanOrEqual(1);
      expect(chatgptOccurrences.length).toBeGreaterThanOrEqual(1);
    });

    it('handles partial scores object', () => {
      const partialScores = {
        claude: { name: 'Claude', roundWins: 2 },
      };

      const { getByText } = renderWithProviders(
        <VotingInterface
          {...defaultProps}
          isOverallVote={true}
          scores={partialScores as any}
        />
      );

      expect(getByText('2')).toBeTruthy();
    });

    it('updates scores when props change', () => {
      const { rerender, getByText } = renderWithProviders(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={mockScores} />
      );

      expect(getByText('2')).toBeTruthy();

      const newScores = {
        claude: { name: 'Claude', roundWins: 3 },
        chatgpt: { name: 'ChatGPT', roundWins: 2 },
      };

      rerender(
        <VotingInterface {...defaultProps} isOverallVote={true} scores={newScores} />
      );

      expect(getByText('3')).toBeTruthy();
    });
  });
});
