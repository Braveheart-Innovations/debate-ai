import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { ChatSession } from '@/types';

let lastTranscriptProps: any;
const mockTranscriptModal = jest.fn((props) => {
  lastTranscriptProps = props;
  return <Text testID="transcript">Transcript</Text>;
});

jest.mock('@/components/organisms/debate/TranscriptModal', () => ({
  TranscriptModal: (props: any) => mockTranscriptModal(props),
}));

const DebateTranscriptScreen = require('@/screens/DebateTranscriptScreen').default;

describe('DebateTranscriptScreen', () => {
  const navigation = { goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    navigation.goBack.mockClear();
    lastTranscriptProps = undefined;
  });

  it('passes session data to transcript modal and handles close', () => {
    const session: ChatSession = {
      id: 'session-1',
      selectedAIs: [
        { id: 'ai-1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku' },
        { id: 'ai-2', provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
      ],
      messages: [
        {
          id: 'm1',
          sender: 'Debate Host',
          senderType: 'ai',
          content: 'OVERALL WINNER: Claude! Claude dominated with 3 rounds while GPT-5 secured 1 round.',
          timestamp: 1,
        },
      ],
      isActive: false,
      createdAt: 0,
      topic: 'AI Ethics',
      sessionType: 'debate',
    };

    const { getByTestId } = renderWithProviders(
      <DebateTranscriptScreen navigation={navigation} route={{ params: { session } }} />
    );

    expect(getByTestId('transcript')).toBeTruthy();
    expect(lastTranscriptProps).toMatchObject({
      topic: 'AI Ethics',
      participants: [
        { id: 'ai-1', name: 'Claude' },
        { id: 'ai-2', name: 'GPT-5' },
      ],
      winner: { id: 'ai-1', name: 'Claude' },
    });

    expect(lastTranscriptProps.scores).toMatchObject({
      'ai-1': { name: 'Claude', roundWins: 3 },
      'ai-2': { name: 'GPT-5', roundWins: 1 },
    });

    lastTranscriptProps.onClose();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('extracts topic and warns when legacy session lacks topic field', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const session: ChatSession = {
      id: 'session-2',
      selectedAIs: [
        { id: 'ai-1', provider: 'claude', name: 'Claude', model: 'claude-3-opus' },
        { id: 'ai-2', provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
      ],
      messages: [
        {
          id: 'intro',
          sender: 'Debate Host',
          senderType: 'ai',
          content: '"AI Rights" is today\'s motion. OVERALL WINNER: GPT-5! GPT-5 triumphed with 4 rounds while Claude secured 2 rounds.',
          timestamp: 1,
        },
      ],
      isActive: false,
      createdAt: 0,
      sessionType: 'debate',
      topic: undefined,
    };

    renderWithProviders(
      <DebateTranscriptScreen navigation={navigation} route={{ params: { session } }} />
    );

    expect(lastTranscriptProps.topic).toBe('AI Rights');
    expect(lastTranscriptProps.winner).toEqual({ id: 'ai-2', name: 'GPT-5' });
    expect(lastTranscriptProps.scores).toMatchObject({
      'ai-1': { name: 'Claude', roundWins: 2 },
      'ai-2': { name: 'GPT-5', roundWins: 4 },
    });
    expect(warnSpy).toHaveBeenCalledWith('No motion (topic) field in session, extracted:', 'AI Rights');

    warnSpy.mockRestore();
  });

  it('handles tie outcomes without assigning a winner and defaults scores', () => {
    const session: ChatSession = {
      id: 'session-3',
      selectedAIs: [
        { id: 'ai-1', provider: 'claude', name: 'Claude', model: 'claude-3-opus' },
        { id: 'ai-2', provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
      ],
      messages: [
        {
          id: 'm1',
          sender: 'Debate Host',
          senderType: 'ai',
          content: 'OVERALL WINNER: Claude! DEBATE ENDED IN A TIE! Judges could not determine a winner.',
          timestamp: 1,
        },
      ],
      isActive: false,
      createdAt: 0,
      topic: 'AI vs Humanity',
      sessionType: 'debate',
    };

    renderWithProviders(
      <DebateTranscriptScreen navigation={navigation} route={{ params: { session } }} />
    );

    expect(lastTranscriptProps.topic).toBe('AI vs Humanity');
    expect(lastTranscriptProps.winner).toBeUndefined();
    expect(lastTranscriptProps.scores).toMatchObject({
      'ai-1': { name: 'Claude', roundWins: 0 },
      'ai-2': { name: 'GPT-5', roundWins: 0 },
    });
  });
});
