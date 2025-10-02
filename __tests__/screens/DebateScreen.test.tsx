import React from 'react';
import { Alert, Text, View } from 'react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { AI } from '@/types';
import { fireEvent, act } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

const mockFeatureAccess = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => {
  const mock = mockFeatureAccess;
  return {
    __esModule: true,
    default: mock,
    useFeatureAccess: mock,
  };
});

const mockUseDebateSession = jest.fn();
const mockUseDebateFlow = jest.fn();
const mockUseDebateVoting = jest.fn();
const mockUseTopicSelection = jest.fn();
const mockUseDebateMessages = jest.fn();

jest.mock('@/hooks/debate', () => ({
  useDebateSession: (...args: unknown[]) => mockUseDebateSession(...args),
  useDebateFlow: (...args: unknown[]) => mockUseDebateFlow(...args),
  useDebateVoting: (...args: unknown[]) => mockUseDebateVoting(...args),
  useTopicSelection: (...args: unknown[]) => mockUseTopicSelection(...args),
  useDebateMessages: (...args: unknown[]) => mockUseDebateMessages(...args),
}));

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Header: ({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) => (
      React.createElement(
        View,
        null,
        React.createElement(Text, { accessibilityRole: 'header' }, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        onBack
          ? React.createElement(
              Text,
              { testID: 'back-button', onPress: onBack },
              'Back'
            )
          : null
      )
    ),
    HeaderActions: () => React.createElement(Text, null, 'HeaderActions'),
    TopicSelector: ({ onStartDebate }: { onStartDebate: () => void }) => (
      React.createElement(
        Text,
        { testID: 'topic-selector', onPress: onStartDebate },
        'TopicSelector'
      )
    ),
    DebateMessageList: ({ messages }: { messages: Array<unknown> }) => (
      React.createElement(Text, { testID: 'message-count' }, `Messages: ${messages.length}`)
    ),
    VotingInterface: () => React.createElement(Text, null, 'VotingInterface'),
    ScoreDisplay: () => React.createElement(Text, null, 'ScoreDisplay'),
  };
});

jest.mock('@/components/organisms/debate/VictoryCelebration', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    VictoryCelebration: ({ onViewTranscript }: { onViewTranscript: () => void }) => (
      React.createElement(Text, { testID: 'victory', onPress: onViewTranscript }, 'VictoryScreen')
    ),
  };
});

jest.mock('@/components/organisms/debate/TranscriptModal', () => ({
  TranscriptModal: () => null,
}));

jest.mock('@/components/organisms/demo/DebateRecordPickerModal', () => ({
  DebateRecordPickerModal: () => null,
}));

const DebateScreen = require('@/screens/DebateScreen').default;

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    findDebateById: jest.fn().mockResolvedValue(null),
    listDebateSamples: jest.fn().mockResolvedValue([]),
    getDebateSampleForProviders: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  primeDebate: jest.fn(),
}));

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: {
    isActive: jest.fn().mockReturnValue(false),
    startDebate: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@/services/demo/AppendToPackService', () => ({
  __esModule: true,
  default: {
    append: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: () => ({
    cancelAllStreams: jest.fn(),
  }),
}));

describe('DebateScreen', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  let alertSpy: jest.SpyInstance;

  const baseAIs: AI[] = [
    { id: 'left', provider: 'claude', name: 'Claude', model: 'claude-3', color: '#000' },
    { id: 'right', provider: 'openai', name: 'GPT', model: 'gpt-4', color: '#000' },
  ];

  const baseSession = {
    session: null,
    orchestrator: null,
    isInitialized: false,
    initializeSession: jest.fn(),
    resetSession: jest.fn(),
    error: null,
  };

  const baseFlow = {
    startDebate: jest.fn(),
    isDebateActive: false,
    isDebateEnded: false,
    error: null,
  };

  const baseVoting = {
    isVoting: false,
    isOverallVote: false,
    isFinalVote: false,
    votingRound: 1,
    scores: null,
    getVotingPrompt: jest.fn().mockReturnValue('Vote now'),
    recordVote: jest.fn(),
    error: null,
  };

  const baseTopicSelection = {
    finalTopic: '',
    selectedTopic: null,
    setTopic: jest.fn(),
    resetTopic: jest.fn(),
  };

  const baseMessages = {
    messages: [],
    typingAIs: [],
    addHostMessage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDebateSession.mockReturnValue(baseSession);
    mockUseDebateFlow.mockReturnValue(baseFlow);
    mockUseDebateVoting.mockReturnValue(baseVoting);
    mockUseTopicSelection.mockReturnValue(baseTopicSelection);
    mockUseDebateMessages.mockReturnValue(baseMessages);
    mockFeatureAccess.mockReturnValue({ isDemo: false });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('shows loading state while orchestrator initializes', async () => {
    const route = {
      params: {
        selectedAIs: baseAIs,
        topic: 'Climate Policy',
      },
    } as const;

    const renderResult = renderWithProviders(
      <DebateScreen navigation={navigation} route={route} />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const { getByText } = renderResult;

    expect(getByText('Initializing Debate...')).toBeTruthy();
    expect(getByText('Motion: Climate Policy')).toBeTruthy();
  });

  it('renders topic selector and demo banner when in demo mode without preset topic', async () => {
    mockFeatureAccess.mockReturnValue({ isDemo: true });
    mockUseTopicSelection.mockReturnValue({
      ...baseTopicSelection,
      finalTopic: '',
    });
    mockUseDebateSession.mockReturnValue({
      ...baseSession,
      isInitialized: false,
      orchestrator: null,
    });

    const renderResult = renderWithProviders(
      <DebateScreen
        navigation={navigation}
        route={{ params: { selectedAIs: baseAIs } }}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const { getByText, getByTestId } = renderResult;

    expect(getByTestId('topic-selector')).toBeTruthy();
    expect(getByText(/Demo Mode/i)).toBeTruthy();
  });

  it('shows victory celebration once scores are available after debate ends', async () => {
    mockFeatureAccess.mockReturnValue({ isDemo: false });
    mockUseDebateFlow.mockReturnValue({
      ...baseFlow,
      isDebateEnded: true,
    });
    mockUseDebateVoting.mockReturnValue({
      ...baseVoting,
      scores: {
        left: { name: 'Claude', roundWins: 2, roundsWon: [1, 2], isOverallWinner: true },
        right: { name: 'GPT', roundWins: 1, roundsWon: [3], isOverallWinner: false },
      },
    });
    mockUseDebateMessages.mockReturnValue({
      ...baseMessages,
      messages: [{ id: '1', sender: 'host', senderType: 'ai', content: 'Start', timestamp: Date.now() }],
    });
    mockUseDebateSession.mockReturnValue({
      ...baseSession,
      isInitialized: true,
      session: { topic: 'Debate Motion' },
      orchestrator: {},
    });
    mockUseTopicSelection.mockReturnValue({
      ...baseTopicSelection,
      finalTopic: 'Debate Motion',
    });

    const renderResult = renderWithProviders(
      <DebateScreen
        navigation={navigation}
        route={{ params: { selectedAIs: baseAIs, topic: 'Debate Motion' } }}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(renderResult.getByTestId('victory')).toBeTruthy();
  });

  it('invokes start over handler when back is pressed', async () => {
    mockFeatureAccess.mockReturnValue({ isDemo: false });

    const renderResult = renderWithProviders(
      <DebateScreen
        navigation={navigation}
        route={{ params: { selectedAIs: baseAIs } }}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(renderResult.getByTestId('back-button'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Start Over' }),
      ])
    );
  });
});
