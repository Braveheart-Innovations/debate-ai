import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ScoreDisplay } from '@/components/organisms/debate/ScoreDisplay';
import type { AI } from '@/types';
import type { ScoreBoard } from '@/services/debate';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, style }: { children: React.ReactNode; style?: any }) =>
      React.createElement(Text, { style }, children),
  };
});

describe('ScoreDisplay', () => {
  const mockParticipants: AI[] = [
    { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
    { id: 'openai', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
  ];

  const mockScores: ScoreBoard = {
    claude: { name: 'Claude', roundWins: 2, roundsWon: [1, 2], isOverallWinner: true },
    openai: { name: 'GPT-4', roundWins: 1, roundsWon: [3], isOverallWinner: false },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={mockScores} />
      );
      expect(result).toBeTruthy();
    });

    it('displays all participant names', () => {
      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={mockScores} />
      );

      expect(getByText('Claude')).toBeTruthy();
      expect(getByText('GPT-4')).toBeTruthy();
    });

    it('displays correct scores for all participants', () => {
      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={mockScores} />
      );

      expect(getByText('2')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
    });

    it('renders with empty participants array', () => {
      const result = renderWithProviders(
        <ScoreDisplay participants={[]} scores={{}} />
      );
      expect(result).toBeTruthy();
    });

    it('renders with single participant', () => {
      const singleParticipant = [mockParticipants[0]];
      const singleScore: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 3, roundsWon: [1, 2, 3], isOverallWinner: true },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={singleParticipant} scores={singleScore} />
      );

      expect(getByText('Claude')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
    });
  });

  describe('Score Display Logic', () => {
    it('displays 0 when participant has no score entry', () => {
      const participantsWithNoScore: AI[] = [
        { id: 'gemini', provider: 'gemini', name: 'Gemini', model: 'gemini-pro', color: '#abc123' },
      ];

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={participantsWithNoScore} scores={{}} />
      );

      expect(getByText('Gemini')).toBeTruthy();
      expect(getByText('0')).toBeTruthy();
    });

    it('displays 0 when roundWins is undefined', () => {
      const scoresWithUndefined: ScoreBoard = {
        claude: { name: 'Claude', roundWins: undefined as any, roundsWon: [], isOverallWinner: false },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={[mockParticipants[0]]} scores={scoresWithUndefined} />
      );

      expect(getByText('0')).toBeTruthy();
    });

    it('displays correct scores for tied participants', () => {
      const tiedScores: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 2, roundsWon: [1, 2], isOverallWinner: false },
        openai: { name: 'GPT-4', roundWins: 2, roundsWon: [3, 4], isOverallWinner: false },
      };

      const { getAllByText } = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={tiedScores} />
      );

      const scoreTexts = getAllByText('2');
      expect(scoreTexts).toHaveLength(2);
    });

    it('displays high scores correctly', () => {
      const highScores: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 15, roundsWon: [], isOverallWinner: true },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={[mockParticipants[0]]} scores={highScores} />
      );

      expect(getByText('15')).toBeTruthy();
    });
  });

  describe('Multiple Participants', () => {
    it('displays three participants with scores', () => {
      const threeParticipants: AI[] = [
        { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
        { id: 'openai', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
        { id: 'gemini', provider: 'gemini', name: 'Gemini', model: 'gemini-pro', color: '#abcdef' },
      ];

      const threeScores: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 3, roundsWon: [1, 2, 3], isOverallWinner: true },
        openai: { name: 'GPT-4', roundWins: 2, roundsWon: [4, 5], isOverallWinner: false },
        gemini: { name: 'Gemini', roundWins: 1, roundsWon: [6], isOverallWinner: false },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={threeParticipants} scores={threeScores} />
      );

      expect(getByText('Claude')).toBeTruthy();
      expect(getByText('GPT-4')).toBeTruthy();
      expect(getByText('Gemini')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
    });

    it('displays four participants correctly', () => {
      const fourParticipants: AI[] = [
        { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
        { id: 'openai', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
        { id: 'gemini', provider: 'gemini', name: 'Gemini', model: 'gemini-pro', color: '#abcdef' },
        { id: 'nomi', provider: 'nomi', name: 'Nomi', model: 'nomi-v1', color: '#fedcba' },
      ];

      const fourScores: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 4, roundsWon: [1, 2, 3, 4], isOverallWinner: true },
        openai: { name: 'GPT-4', roundWins: 3, roundsWon: [5, 6, 7], isOverallWinner: false },
        gemini: { name: 'Gemini', roundWins: 2, roundsWon: [8, 9], isOverallWinner: false },
        nomi: { name: 'Nomi', roundWins: 1, roundsWon: [10], isOverallWinner: false },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={fourParticipants} scores={fourScores} />
      );

      expect(getByText('Nomi')).toBeTruthy();
      expect(getByText('4')).toBeTruthy();
    });
  });

  describe('AI Color Mapping', () => {
    it('handles chatgpt id mapping to openai', () => {
      const chatgptParticipant: AI[] = [
        { id: 'chatgpt', provider: 'openai', name: 'ChatGPT', model: 'gpt-4', color: '#123456' },
      ];

      const chatgptScore: ScoreBoard = {
        chatgpt: { name: 'ChatGPT', roundWins: 1, roundsWon: [1], isOverallWinner: true },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={chatgptParticipant} scores={chatgptScore} />
      );

      expect(getByText('ChatGPT')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
    });

    it('handles unknown AI provider', () => {
      const unknownAI: AI[] = [
        { id: 'unknown', provider: 'unknown' as any, name: 'Unknown AI', model: 'model-x', color: '#999999' },
      ];

      const unknownScore: ScoreBoard = {
        unknown: { name: 'Unknown AI', roundWins: 2, roundsWon: [1, 2], isOverallWinner: true },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={unknownAI} scores={unknownScore} />
      );

      expect(getByText('Unknown AI')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
    });

    it('handles nomi provider', () => {
      const nomiAI: AI[] = [
        { id: 'nomi', provider: 'nomi', name: 'Nomi', model: 'nomi-v1', color: '#ff9900' },
      ];

      const nomiScore: ScoreBoard = {
        nomi: { name: 'Nomi', roundWins: 3, roundsWon: [1, 2, 3], isOverallWinner: true },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={nomiAI} scores={nomiScore} />
      );

      expect(getByText('Nomi')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles participant without score gracefully', () => {
      const participantWithoutScore: AI[] = [
        { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-haiku', color: '#123456' },
        { id: 'openai', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#654321' },
      ];

      const partialScores: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 2, roundsWon: [1, 2], isOverallWinner: true },
        // openai score missing
      };

      const { getByText, getAllByText } = renderWithProviders(
        <ScoreDisplay participants={participantWithoutScore} scores={partialScores} />
      );

      expect(getByText('Claude')).toBeTruthy();
      expect(getByText('GPT-4')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
      const zeros = getAllByText('0');
      expect(zeros.length).toBeGreaterThan(0);
    });

    it('handles zero scores for all participants', () => {
      const zeroScores: ScoreBoard = {
        claude: { name: 'Claude', roundWins: 0, roundsWon: [], isOverallWinner: false },
        openai: { name: 'GPT-4', roundWins: 0, roundsWon: [], isOverallWinner: false },
      };

      const { getAllByText } = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={zeroScores} />
      );

      const zeros = getAllByText('0');
      expect(zeros).toHaveLength(2);
    });

    it('handles very long participant names', () => {
      const longNameParticipant: AI[] = [
        {
          id: 'ai1',
          provider: 'claude',
          name: 'Very Long AI Name That Exceeds Normal Length',
          model: 'claude-3-haiku',
          color: '#123456'
        },
      ];

      const longNameScore: ScoreBoard = {
        ai1: { name: 'Very Long AI Name That Exceeds Normal Length', roundWins: 5, roundsWon: [], isOverallWinner: true },
      };

      const { getByText } = renderWithProviders(
        <ScoreDisplay participants={longNameParticipant} scores={longNameScore} />
      );

      expect(getByText('Very Long AI Name That Exceeds Normal Length')).toBeTruthy();
      expect(getByText('5')).toBeTruthy();
    });
  });

  describe('Theme Integration', () => {
    it('renders in light mode', () => {
      const result = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={mockScores} />,
        { themeMode: 'light' }
      );
      expect(result).toBeTruthy();
    });

    it('renders in dark mode', () => {
      const result = renderWithProviders(
        <ScoreDisplay participants={mockParticipants} scores={mockScores} />,
        { themeMode: 'dark' }
      );
      expect(result).toBeTruthy();
    });
  });
});
