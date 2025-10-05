import React from 'react';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { showSheet } from '@/store';

jest.mock('expo-apple-authentication', () => ({}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSigninButton: () => null,
}));
jest.mock('expo-device', () => ({}));
jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => (children ?? null),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
}));

const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: any) => any) => mockUseSelector(selector),
  };
});

const mockValidation = {
  isReady: true,
  checkReadiness: jest.fn(),
};

jest.mock('@/hooks/debate', () => ({
  usePreDebateValidation: () => mockValidation,
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => ({ isDemo: true }),
  useFeatureAccess: () => ({ isDemo: true }),
}));

jest.mock('@/components/molecules/subscription/TrialBanner', () => ({
  TrialBanner: () => null,
}));

let demoBannerProps: any;
jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  DemoBanner: (props: any) => {
    demoBannerProps = props;
    return null;
  },
}));

jest.mock('@/components/organisms/debate/DebateTopicSelector', () => ({
  DebateTopicSelector: () => null,
}));

jest.mock('@/components/organisms/debate/DebateAISelector', () => ({
  DebateAISelector: () => null,
}));

jest.mock('@/components/organisms/debate/DebatePersonalitySelector', () => ({
  DebatePersonalitySelector: () => null,
}));

jest.mock('@/components/organisms/debate/DebateStepIndicator', () => ({
  DebateStepIndicator: () => null,
}));

jest.mock('@/components/organisms/debate/FormatModal', () => ({
  FormatModal: () => null,
}));

jest.mock('@/components/organisms/demo/DemoDebatePickerModal', () => ({
  DemoDebatePickerModal: () => null,
}));

jest.mock('@/components/organisms/demo/DebateRecordPickerModal', () => ({
  DebateRecordPickerModal: () => null,
}));

jest.mock('@/services/debate/TopicService', () => ({
  TopicService: {
    getRandomTopic: () => 'Random Topic',
    getSuggestedTopics: () => ['Topic A', 'Topic B'],
  },
}));

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    getDemoDebates: jest.fn(() => []),
    findDebateById: jest.fn(),
  },
}));

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: {
    startDebate: jest.fn(),
  },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Button: (props: any) => React.createElement(Text, { onPress: props.onPress }, props.title),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    GradientButton: (props: any) => React.createElement(Text, { onPress: props.onPress }, props.title),
    Card: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    HeaderIcon: ({ onPress, children }: { onPress?: () => void; children?: React.ReactNode }) =>
      React.createElement(Text, { onPress }, children ?? 'icon'),
  };
});

const DebateSetupScreen = require('@/screens/DebateSetupScreen').default;

describe('DebateSetupScreen', () => {
  const navigation = { navigate: jest.fn() };
  const preselectedAIs = [
    { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3' },
    { id: 'openai', provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
  ];

  const baseState = {
    settings: {
      apiKeys: { claude: 'key-1', openai: 'key-2' },
      expertMode: {},
      recordModeEnabled: false,
    },
    chat: {
      aiPersonalities: {},
      selectedModels: {},
    },
    debateStats: {
      preservedTopic: '',
      preservedTopicMode: 'preset',
    },
    streaming: {
      globalStreamingEnabled: false,
      streamingSpeed: 'normal',
      providerPreferences: {},
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    navigation.navigate.mockClear();
    demoBannerProps = undefined;
    mockUseSelector.mockImplementation((selector) => selector(baseState));
  });

  it('opens subscription sheet from demo banner when in demo mode', () => {
    renderWithProviders(
      <DebateSetupScreen navigation={navigation as any} route={{ params: { preselectedAIs } }} />
    );

    expect(demoBannerProps).toBeDefined();

    act(() => {
      demoBannerProps?.onPress?.();
    });

    expect(mockDispatch).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });
});
