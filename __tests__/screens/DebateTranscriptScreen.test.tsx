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
        { id: 'm1', sender: 'Debate Host', senderType: 'ai', content: 'OVERALL WINNER: Claude!', timestamp: 1 },
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

    lastTranscriptProps.onClose();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
