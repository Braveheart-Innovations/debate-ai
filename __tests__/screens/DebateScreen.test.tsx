import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { createAppStore, showSheet } from '@/store';
import type { AI, Message } from '@/types';

const baseAIs: AI[] = [
  { id: 'left', provider: 'anthropic', name: 'Claude', model: 'claude-3-opus', color: '#000' },
  { id: 'right', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo', color: '#000' },
];

const mockFeatureAccess = jest.fn();
const mockUseDebateSession = jest.fn();
const mockUseDebateFlow = jest.fn();
const mockUseDebateVoting = jest.fn();
const mockUseTopicSelection = jest.fn();
const mockUseDebateMessages = jest.fn();

let mockHeaderProps: any;
let mockTopicSelectorProps: any;
let mockDebateMessageListProps: any;
let mockVotingInterfaceProps: any;
let mockScoreDisplayProps: any;
let mockDemoBannerProps: any;
let mockDemoSamplesBarProps: any;
let mockVictoryProps: any;
let mockTranscriptModalProps: any;

const mockStreamingService = {
  cancelAllStreams: jest.fn(),
};

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockFeatureAccess(...args),
}));

jest.mock('@/hooks/debate', () => ({
  useDebateSession: (...args: unknown[]) => mockUseDebateSession(...args),
  useDebateFlow: (...args: unknown[]) => mockUseDebateFlow(...args),
  useDebateVoting: (...args: unknown[]) => mockUseDebateVoting(...args),
  useTopicSelection: (...args: unknown[]) => mockUseTopicSelection(...args),
  useDebateMessages: (...args: unknown[]) => mockUseDebateMessages(...args),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Header: (props: any) => {
      mockHeaderProps = props;
      return React.createElement(View, null, React.createElement(Text, { testID: 'header-title' }, props.title));
    },
    HeaderActions: () => React.createElement(Text, { testID: 'header-actions' }, 'actions'),
    TopicSelector: (props: any) => {
      mockTopicSelectorProps = props;
      return React.createElement(Text, { testID: 'topic-selector', onPress: () => props.onStartDebate?.() }, 'Topic Selector');
    },
    DebateMessageList: (props: any) => {
      mockDebateMessageListProps = props;
      return React.createElement(Text, { testID: 'debate-message-list' }, `messages:${props.messages?.length ?? 0}`);
    },
    VotingInterface: (props: any) => {
      mockVotingInterfaceProps = props;
      return React.createElement(Text, { testID: 'voting-interface', onPress: () => props.onVote?.('left') }, 'voting');
    },
    ScoreDisplay: (props: any) => {
      mockScoreDisplayProps = props;
      return React.createElement(Text, { testID: 'score-display' }, 'scores');
    },
  };
});

jest.mock('@/components/organisms/debate/VictoryCelebration', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    VictoryCelebration: (props: any) => {
      mockVictoryProps = props;
      return React.createElement(Text, { testID: 'victory', onPress: props.onViewTranscript }, 'victory');
    },
  };
});

jest.mock('@/components/organisms/debate/TranscriptModal', () => ({
  TranscriptModal: (props: any) => {
    mockTranscriptModalProps = props;
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'transcript-modal' }, props.visible ? 'visible' : 'hidden');
  },
}));

jest.mock('@/components/organisms/demo/DebateRecordPickerModal', () => ({
  DebateRecordPickerModal: () => null,
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoBanner: (props: any) => {
      mockDemoBannerProps = props;
      return React.createElement(Text, { testID: 'demo-banner', onPress: props.onPress }, 'demo-banner');
    },
    __esModule: true,
    default: (props: any) => {
      mockDemoBannerProps = props;
      const React = require('react');
      const { Text } = require('react-native');
      return React.createElement(Text, { testID: 'demo-banner', onPress: props.onPress }, 'demo-banner');
    },
  };
});

jest.mock('@/components/organisms/demo/DemoSamplesBar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoSamplesBar: (props: any) => {
      mockDemoSamplesBarProps = props;
      return React.createElement(Text, { testID: 'demo-samples', onPress: () => props.onSelect?.(props.samples?.[0]?.id) }, props.label || 'samples');
    },
  };
});

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    findDebateById: jest.fn().mockResolvedValue(null),
    listDebateSamples: jest.fn().mockResolvedValue([]),
    getDebateSampleForProviders: jest.fn().mockResolvedValue(null),
  },
  __esModule: true,
  default: {
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
  getStreamingService: () => mockStreamingService,
}));

const DebateScreen = require('@/screens/DebateScreen').default;
const DemoContentService = require('@/services/demo/DemoContentService').DemoContentService;
const { primeDebate } = require('@/services/demo/DemoPlaybackRouter');

beforeEach(() => {
  jest.clearAllMocks();
  mockStreamingService.cancelAllStreams.mockClear();
  mockHeaderProps = undefined;
  mockTopicSelectorProps = undefined;
  mockDebateMessageListProps = undefined;
  mockVotingInterfaceProps = undefined;
  mockScoreDisplayProps = undefined;
  mockDemoBannerProps = undefined;
  mockDemoSamplesBarProps = undefined;
  mockVictoryProps = undefined;
  mockTranscriptModalProps = undefined;
  Alert.alert = jest.fn();
});

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const createSessionState = (overrides: Record<string, unknown> = {}) => ({
  session: null,
  orchestrator: null,
  isInitialized: false,
  initializeSession: jest.fn().mockResolvedValue(undefined),
  resetSession: jest.fn(),
  error: null,
  ...overrides,
});

const createFlowState = (overrides: Record<string, unknown> = {}) => ({
  startDebate: jest.fn().mockResolvedValue(undefined),
  isDebateActive: false,
  isDebateEnded: false,
  error: null,
  ...overrides,
});

const createVotingState = (overrides: Record<string, unknown> = {}) => ({
  isVoting: false,
  isOverallVote: false,
  isFinalVote: false,
  votingRound: 1,
  scores: null,
  getVotingPrompt: jest.fn().mockReturnValue('Vote now'),
  recordVote: jest.fn().mockResolvedValue(undefined),
  error: null,
  ...overrides,
});

const createTopicSelectionState = (overrides: Record<string, unknown> = {}) => ({
  finalTopic: '',
  selectedTopic: null,
  setTopic: jest.fn(),
  resetTopic: jest.fn(),
  ...overrides,
});

const createMessagesState = (overrides: Record<string, unknown> = {}) => ({
  messages: [],
  typingAIs: [],
  addHostMessage: jest.fn(),
  ...overrides,
});

type RenderOptions = {
  session?: Record<string, unknown>;
  flow?: Record<string, unknown>;
  voting?: Record<string, unknown>;
  topicSelection?: Record<string, unknown>;
  messages?: Record<string, unknown>;
  featureAccess?: Record<string, unknown>;
  routeParams?: Record<string, unknown>;
  store?: ReturnType<typeof createAppStore>;
};

const renderScreen = (options: RenderOptions = {}) => {
  const {
    session: sessionOverrides,
    flow: flowOverrides,
    voting: votingOverrides,
    topicSelection: topicOverrides,
    messages: messagesOverrides,
    featureAccess,
    routeParams,
    store,
  } = options;

  const sessionState = createSessionState(sessionOverrides);
  const flowState = createFlowState(flowOverrides);
  const votingState = createVotingState(votingOverrides);
  const topicSelectionState = createTopicSelectionState(topicOverrides);
  const messagesState = createMessagesState(messagesOverrides);

  mockUseDebateSession.mockReturnValue(sessionState);
  mockUseDebateFlow.mockReturnValue(flowState);
  mockUseDebateVoting.mockReturnValue(votingState);
  mockUseTopicSelection.mockReturnValue(topicSelectionState);
  mockUseDebateMessages.mockReturnValue(messagesState);
  mockFeatureAccess.mockReturnValue({ isDemo: false, ...featureAccess });

  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  };

  const defaultRoute = {
    params: {
      selectedAIs: baseAIs,
      ...routeParams,
    },
  } as any;

  const storeToUse = store ?? createAppStore();

  const renderResult = renderWithProviders(
    <DebateScreen navigation={navigation as any} route={defaultRoute} />,
    { store: storeToUse }
  );

  return {
    renderResult,
    navigation,
    sessionState,
    flowState,
    votingState,
    topicSelectionState,
    messagesState,
    store: renderResult.store,
  };
};

describe('DebateScreen', () => {
  it('shows loading state while orchestrator initializes', async () => {
    renderScreen({
      session: { orchestrator: null, isInitialized: false },
      routeParams: { topic: 'Climate Policy' },
    });

    await flushMicrotasks();

    expect(mockHeaderProps.title).toContain('Climate Policy');
    expect(mockDebateMessageListProps).toBeUndefined();
  });

  it('renders topic selector and demo banner in demo mode when no topic selected', async () => {
    renderScreen({
      featureAccess: { isDemo: true },
      topicSelection: { finalTopic: '' },
    });

    await flushMicrotasks();

    expect(mockTopicSelectorProps).toBeDefined();
    expect(mockDemoBannerProps).toBeDefined();
  });

  it('auto starts debate when initial topic provided', async () => {
    jest.useFakeTimers();
    const initializeSession = jest.fn().mockResolvedValue(undefined);
    const startDebate = jest.fn().mockResolvedValue(undefined);
    const addHostMessage = jest.fn();

    renderScreen({
      session: { orchestrator: {}, initializeSession, isInitialized: false },
      flow: { startDebate },
      messages: { addHostMessage },
      routeParams: { topic: 'AI Safety' },
    });

    await flushMicrotasks();

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await flushMicrotasks();

    expect(initializeSession).toHaveBeenCalledWith(
      'AI Safety',
      baseAIs,
      expect.any(Object),
      expect.objectContaining({ formatId: 'oxford' })
    );
    expect(addHostMessage).toHaveBeenCalledWith(expect.stringContaining('opens the debate'));
    expect(startDebate).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('displays messages, voting, and scores when debate is active', async () => {
    const recordVote = jest.fn().mockResolvedValue(undefined);

    renderScreen({
      flow: { isDebateActive: true },
      messages: {
        messages: [
          { id: 'm1', sender: 'Host', senderType: 'ai', content: 'Opening', timestamp: 1 } as Message,
        ],
      },
      session: { isInitialized: true, session: { topic: 'Topic' }, orchestrator: {} },
      voting: {
        isVoting: true,
        scores: {
          left: { name: 'Claude', roundWins: 1, roundsWon: [1], isOverallWinner: false },
          right: { name: 'GPT-4', roundWins: 0, roundsWon: [], isOverallWinner: false },
        },
        recordVote,
      },
    });

    await flushMicrotasks();

    expect(mockDebateMessageListProps.messages).toHaveLength(1);
    expect(mockVotingInterfaceProps).toBeDefined();
    expect(mockScoreDisplayProps.scores.left.roundWins).toBe(1);

    mockVotingInterfaceProps.onVote('left');
    expect(recordVote).toHaveBeenCalledWith('left');
  });

  it('shows alert when vote submission fails', async () => {
    const recordVote = jest.fn().mockRejectedValue(new Error('vote failed'));

    renderScreen({
      flow: { isDebateActive: true },
      messages: {
        messages: [
          { id: 'm1', sender: 'Host', senderType: 'ai', content: 'Opening', timestamp: 1 } as Message,
        ],
      },
      session: { isInitialized: true, session: { topic: 'Topic' }, orchestrator: {} },
      voting: {
        isVoting: true,
        recordVote,
      },
    });

    await flushMicrotasks();

    await act(async () => {
      await mockVotingInterfaceProps.onVote('left');
    });

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'vote failed');
  });

  it('loads demo sample from samples bar and primes debate', async () => {
    const sample = { id: 'sample-1', title: 'Sample', topic: 'Topic' };
    DemoContentService.listDebateSamples.mockResolvedValueOnce([{ id: 'sample-1', title: 'Sample', topic: 'Topic' }]);
    DemoContentService.findDebateById.mockResolvedValueOnce(sample as any);
    const initializeSession = jest.fn().mockResolvedValue(undefined);

    renderScreen({
      featureAccess: { isDemo: true },
      topicSelection: { finalTopic: '' },
      session: { initializeSession },
    });

    await flushMicrotasks();
    await flushMicrotasks();

    await act(async () => {
      await mockDemoSamplesBarProps.onSelect('sample-1');
    });

    expect(DemoContentService.findDebateById).toHaveBeenCalledWith('sample-1');
    expect(primeDebate).toHaveBeenCalledWith(sample);
    expect(initializeSession).toHaveBeenCalled();
  });

  it('dispatches subscription sheet when demo banner pressed', async () => {
    const store = createAppStore();
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    renderScreen({ featureAccess: { isDemo: true }, topicSelection: { finalTopic: '' }, store });

    await act(async () => {
      mockDemoBannerProps.onPress();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('shows victory celebration and opens transcript when messages exist', async () => {
    renderScreen({
      flow: { isDebateEnded: true },
      messages: {
        messages: [
          { id: '1', sender: 'Host', senderType: 'ai', content: 'Summary', timestamp: 1 } as Message,
        ],
      },
      session: { isInitialized: true, session: { topic: 'Topic' }, orchestrator: {} },
      voting: {
        scores: {
          left: { name: 'Claude', roundWins: 2, roundsWon: [1, 2], isOverallWinner: true },
          right: { name: 'GPT-4', roundWins: 1, roundsWon: [3], isOverallWinner: false },
        },
        isOverallVote: true,
        isVoting: false,
      },
    });

    await flushMicrotasks();

    expect(mockVictoryProps).toBeDefined();

    act(() => {
      mockVictoryProps.onViewTranscript();
    });

    expect(mockTranscriptModalProps.visible).toBe(true);
  });

  it('alerts when viewing transcript without messages', async () => {
    renderScreen({
      flow: { isDebateEnded: true },
      messages: { messages: [] },
      session: { isInitialized: true, session: { topic: 'Topic' }, orchestrator: {} },
      voting: {
        scores: {
          left: { name: 'Claude', roundWins: 1, roundsWon: [1], isOverallWinner: true },
        },
        isOverallVote: true,
        isVoting: false,
      },
    });

    await flushMicrotasks();

    act(() => {
      mockVictoryProps.onViewTranscript();
    });

    expect(Alert.alert).toHaveBeenCalledWith('No Transcript', 'No messages to display in transcript.');
  });

  it('stops streams and resets session when starting over', () => {
    const resetSession = jest.fn();
    const { navigation } = renderScreen({
      session: { resetSession },
    });

    mockHeaderProps.onBack();

    expect(mockStreamingService.cancelAllStreams).toHaveBeenCalled();
    expect(resetSession).toHaveBeenCalled();

    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; onPress?: () => void }>;
    const startOverButton = buttons.find((btn) => btn.text === 'Start Over');

    startOverButton?.onPress?.();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'DebateTab' });
  });
});
