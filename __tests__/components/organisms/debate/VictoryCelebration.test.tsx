import React from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { VictoryCelebration } from '@/components/organisms/debate/VictoryCelebration';
import type { AI } from '@/types';
import type { ScoreBoard } from '@/services/debate';
import type { AudienceDecisionResult } from '@/config/debate/formats';

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/organisms/debate/ShareModal', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return ({ visible }: { visible: boolean }) => (
    visible ? React.createElement(Text, { testID: 'share-modal' }, 'share-modal') : null
  );
});

jest.mock('@/services/analytics', () => ({
  analytics: {
    trackShare: jest.fn(),
  },
}));

jest.mock('@/services/shareIncentives', () => ({
  shareIncentives: {
    recordShare: jest.fn(),
  },
}));

describe('VictoryCelebration', () => {
  const winner: AI = {
    id: 'google',
    provider: 'google',
    name: 'Gemini',
    model: 'gemini-3.5-flash',
  };

  const scores: ScoreBoard = {
    openai: {
      name: 'ChatGPT',
      roundWins: 1,
      roundsWon: [1],
      isOverallWinner: false,
    },
    google: {
      name: 'Gemini',
      roundWins: 2,
      roundsWon: [2, 3],
      isOverallWinner: true,
    },
  };

  const defaultProps = {
    winner,
    scores,
    rounds: [
      { round: 1, winner: 'ChatGPT' },
      { round: 2, winner: 'Gemini' },
      { round: 3, winner: 'Gemini' },
    ],
    voteResults: [
      {
        round: 1,
        winnerId: 'gemini',
        winnerName: 'Gemini',
        votingLabel: 'Value constructives',
        criterion: 'Value constructives: choose who better established and defended their value, criterion, definitions, and contentions.',
        timestamp: 100,
      },
    ],
    onViewTranscript: jest.fn(),
    onRematch: jest.fn(),
    onStartOver: jest.fn(),
    topic: 'Resolved: policy matters.',
    participants: [winner],
    messages: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the revamped victory actions', () => {
    const { getAllByText, getByText, getByTestId, queryByText } = renderWithProviders(
      <VictoryCelebration {...defaultProps} />
    );

    expect(getByText('DEBATE CHAMPION')).toBeTruthy();
    expect(getAllByText('Gemini').length).toBeGreaterThan(0);
    expect(getByText('Judge Decisions')).toBeTruthy();
    expect(getByText('Value constructives')).toBeTruthy();
    expect(getByText('Value constructives: choose who better established and defended their value, criterion, definitions, and contentions.')).toBeTruthy();
    expect(getByTestId('victory-rematch')).toBeTruthy();
    expect(getByTestId('victory-transcript')).toBeTruthy();
    expect(getByTestId('victory-share')).toBeTruthy();
    expect(getByTestId('victory-start-over')).toBeTruthy();
    expect(queryByText('Share Results')).toBeNull();
  });

  it('calls the supplied navigation actions', () => {
    const onViewTranscript = jest.fn();
    const onRematch = jest.fn();
    const onStartOver = jest.fn();
    const { getByTestId } = renderWithProviders(
      <VictoryCelebration
        {...defaultProps}
        onViewTranscript={onViewTranscript}
        onRematch={onRematch}
        onStartOver={onStartOver}
      />
    );

    fireEvent.press(getByTestId('victory-rematch'));
    fireEvent.press(getByTestId('victory-transcript'));
    fireEvent.press(getByTestId('victory-start-over'));

    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(onViewTranscript).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('opens the share modal from the explicit share action', () => {
    const { getByTestId } = renderWithProviders(
      <VictoryCelebration {...defaultProps} />
    );

    fireEvent.press(getByTestId('victory-share'));

    expect(getByTestId('share-modal')).toBeTruthy();
  });

  it('top-anchors the result card inside a real scroll surface', () => {
    const { UNSAFE_getByType } = renderWithProviders(
      <VictoryCelebration {...defaultProps} />
    );

    const scrollView = UNSAFE_getByType(ScrollView);
    const scrollViewProps = scrollView.props as {
      contentContainerStyle?: StyleProp<ViewStyle>;
    };
    const contentStyle = StyleSheet.flatten(scrollViewProps.contentContainerStyle);

    expect(contentStyle?.justifyContent).toBe('flex-start');
    expect(contentStyle?.paddingTop).toBe(12);
    expect(contentStyle?.paddingBottom).toBeGreaterThanOrEqual(40);
  });

  it('keeps Oxford audience decisions scrollable from the top', () => {
    const audienceResult: AudienceDecisionResult = {
      initialStance: 'for',
      finalStance: 'for',
      winningSide: 'aff',
      winningSideLabel: 'Affirmative',
      resultVerb: 'held',
      summary: 'Affirmative held the audience at For.',
      winningParticipantIds: ['google'],
    };
    const { UNSAFE_getByType, getByTestId } = renderWithProviders(
      <VictoryCelebration
        {...defaultProps}
        audienceResult={audienceResult}
        onSaveVoicePack={jest.fn()}
        voicePackClipCount={11}
        voicePackActionLabel="Podcast"
      />
    );

    const scrollView = UNSAFE_getByType(ScrollView);
    const scrollViewProps = scrollView.props as {
      contentContainerStyle?: StyleProp<ViewStyle>;
    };
    const contentStyle = StyleSheet.flatten(scrollViewProps.contentContainerStyle);

    expect(contentStyle?.justifyContent).toBe('flex-start');
    expect(getByTestId('victory-rematch')).toBeTruthy();
    expect(getByTestId('victory-voice-pack')).toBeTruthy();
    expect(getByTestId('victory-start-over')).toBeTruthy();
  });

  it('renders the voice pack action when voiced clips are available', () => {
    const onSaveVoicePack = jest.fn();
    const { getByTestId } = renderWithProviders(
      <VictoryCelebration
        {...defaultProps}
        onSaveVoicePack={onSaveVoicePack}
        voicePackClipCount={2}
      />
    );

    fireEvent.press(getByTestId('victory-voice-pack'));

    expect(onSaveVoicePack).toHaveBeenCalledTimes(1);
  });
});
