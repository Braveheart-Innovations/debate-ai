import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import {
  showSheet,
  setAIPersonality,
  setAIModel,
  setGlobalStreaming,
  setStreamingSpeed,
  preserveTopic,
  clearPreservedTopic,
} from '@/store';
import { setProviderStreamingPreference } from '@/store/streamingSlice';
import type { AIConfig } from '@/types';
import type { RootState } from '@/store';

const baseAIs: AIConfig[] = [
  { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-opus' },
  { id: 'openai', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo' },
  { id: 'google', provider: 'google', name: 'Gemini', model: 'gemini-1.5' },
];

const mockDispatch = jest.fn();
let currentState: RootState;
const mockUseSelector = jest.fn();
const mockFeatureAccess = jest.fn();

const defaultState = (): RootState => ({
  settings: {
    apiKeys: { claude: 'key-1', openai: 'key-2', google: 'key-3' },
    expertMode: {},
    recordModeEnabled: false,
    theme: 'light',
    fontSize: 'medium',
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    hasCompletedOnboarding: true,
  } as any,
  chat: {
    aiPersonalities: {},
    selectedModels: {},
    currentSession: null,
    sessions: [],
    typingAIs: [],
    isLoading: false,
  },
  debateStats: {
    preservedTopic: '',
    preservedTopicMode: 'preset',
  } as any,
  streaming: {
    globalStreamingEnabled: false,
    streamingSpeed: 'natural',
    streamingPreferences: {},
    providerVerificationErrors: {},
  } as any,
  user: { currentUser: null, isAuthenticated: false, uiMode: 'simple' },
  navigation: {} as any,
  compare: {} as any,
  auth: {} as any,
  services: {} as any,
});

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: RootState) => any) => mockUseSelector(selector),
  };
});

jest.mock('expo-apple-authentication', () => ({}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSigninButton: () => null,
}));
jest.mock('expo-device', () => ({}));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
}));
jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/hooks/debate', () => ({
  usePreDebateValidation: () => ({
    isReady: true,
    checkReadiness: jest.fn(),
  }),
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockFeatureAccess(...args),
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
  __esModule: true,
  default: (props: any) => {
    demoBannerProps = props;
    return null;
  },
}));

let topicSelectorProps: any;
let aiSelectorProps: any;
let personalitySelectorProps: any;
let stepIndicatorProps: any;

jest.mock('@/components/organisms/debate/DebateTopicSelector', () => ({
  DebateTopicSelector: (props: any) => {
    topicSelectorProps = props;
    return null;
  },
}));

jest.mock('@/components/organisms/debate/DebateAISelector', () => ({
  DebateAISelector: (props: any) => {
    aiSelectorProps = props;
    return null;
  },
}));

jest.mock('@/components/organisms/debate/DebatePersonalitySelector', () => ({
  DebatePersonalitySelector: (props: any) => {
    personalitySelectorProps = props;
    return null;
  },
}));

jest.mock('@/components/organisms/debate/DebateStepIndicator', () => ({
  DebateStepIndicator: (props: any) => {
    stepIndicatorProps = props;
    return null;
  },
}));

let recordPickerProps: any;
jest.mock('@/components/organisms/demo/DebateRecordPickerModal', () => ({
  DebateRecordPickerModal: (props: any) => {
    recordPickerProps = props;
    return null;
  },
}));

let demoPickerProps: any;
jest.mock('@/components/organisms/demo/DemoDebatePickerModal', () => ({
  DemoDebatePickerModal: (props: any) => {
    demoPickerProps = props;
    return null;
  },
}));

jest.mock('@/components/organisms/debate/FormatModal', () => ({
  FormatModal: () => null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Button: (props: any) => React.createElement(Text, { onPress: props.onPress }, props.title),
    GradientButton: (props: any) => React.createElement(Text, { onPress: props.onPress }, props.title),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    HeaderIcon: ({ onPress, children }: { onPress?: () => void; children?: React.ReactNode }) =>
      React.createElement(Text, { onPress }, children ?? 'icon'),
  };
});

jest.mock('@/services/debate/TopicService', () => ({
  TopicService: {
    generateRandomTopicString: jest.fn(() => 'Surprise Topic'),
  },
}));

const mockListDebateSamples = jest.fn();
const mockFindDebateById = jest.fn();
jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listDebateSamples: (...args: unknown[]) => mockListDebateSamples(...args),
    findDebateById: (...args: unknown[]) => mockFindDebateById(...args),
  },
  __esModule: true,
  default: {
    listDebateSamples: (...args: unknown[]) => mockListDebateSamples(...args),
    findDebateById: (...args: unknown[]) => mockFindDebateById(...args),
  },
}));

const mockRecordController = {
  startDebate: jest.fn(),
};
jest.mock('@/services/demo/RecordController', () => ({
  RecordController: mockRecordController,
}));

const DebateSetupScreen = require('@/screens/DebateSetupScreen').default;

const renderScreen = (options: {
  featureAccess?: Record<string, unknown>;
  route?: Record<string, unknown>;
  state?: Partial<RootState>;
} = {}) => {
  const { featureAccess, route, state } = options;
  currentState = {
    ...defaultState(),
    ...(state ? state : {}),
  } as RootState;

  mockUseSelector.mockImplementation((selector) => selector(currentState));
  mockFeatureAccess.mockReturnValue({ isDemo: false, isPremium: false, isInTrial: false, ...featureAccess });

  const navigation = {
    navigate: jest.fn(),
  };

  const renderResult = renderWithProviders(
    <DebateSetupScreen navigation={navigation as any} route={{ params: { ...route } } as any} />
  );

  return {
    renderResult,
    navigation,
  };
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListDebateSamples.mockReset();
  mockFindDebateById.mockReset();
  mockRecordController.startDebate.mockReset();
  topicSelectorProps = undefined;
  aiSelectorProps = undefined;
  personalitySelectorProps = undefined;
  recordPickerProps = undefined;
  demoPickerProps = undefined;
  demoBannerProps = undefined;
  Alert.alert = jest.fn();
});

describe('DebateSetupScreen', () => {
  it('progresses from topic to AI step with valid selection', async () => {
    const { renderResult } = renderScreen({ featureAccess: { isDemo: false } });

    expect(topicSelectorProps).toBeDefined();
    act(() => {
      topicSelectorProps.onTopicSelect('Climate Action');
    });

    await flush();
    fireEvent.press(renderResult.getByText('Next: Choose Debaters →'));
    await flush();

    expect(aiSelectorProps).toBeDefined();
    expect(stepIndicatorProps.currentStep).toBe('ai');
  });

  it('toggles AI selection and streaming preferences', async () => {
    const { renderResult } = renderScreen({
      featureAccess: { isDemo: false },
      state: {
        streaming: {
          ...defaultState().streaming,
          globalStreamingEnabled: true,
          streamingSpeed: 'natural',
          streamingPreferences: {
            claude: { enabled: true },
            openai: { enabled: true },
          },
        } as any,
      },
    });

    act(() => {
      topicSelectorProps.onTopicSelect('Climate Action');
    });
    await flush();
    fireEvent.press(renderResult.getByText('Next: Choose Debaters →'));
    await flush();

    const claudeConfig = aiSelectorProps.configuredAIs.find((ai: AIConfig) => ai.id === 'claude');
    const openaiConfig = aiSelectorProps.configuredAIs.find((ai: AIConfig) => ai.id === 'openai');
    act(() => {
      aiSelectorProps.onToggleAI(claudeConfig);
      aiSelectorProps.onToggleAI(openaiConfig);
    });
    await flush();

    expect(aiSelectorProps.selectedAIs).toHaveLength(2);

    act(() => {
      aiSelectorProps.onPersonalityChange('claude', 'friendly');
    });
    expect(mockDispatch).toHaveBeenCalledWith(setAIPersonality({ aiId: 'claude', personalityId: 'friendly' }));

    await act(async () => {
      await aiSelectorProps.onModelChange('claude', 'claude-custom');
    });
    expect(mockDispatch).toHaveBeenCalledWith(setAIModel({ aiId: 'claude', modelId: 'claude-custom' }));

    fireEvent.press(renderResult.getByText('Streaming: On'));
    expect(mockDispatch).toHaveBeenCalledWith(setGlobalStreaming(false));

    fireEvent.press(renderResult.getByText('Speed: Natural'));
    expect(mockDispatch).toHaveBeenCalledWith(setStreamingSpeed('slow'));

    const providerToggle = renderResult.getAllByText('Streaming On')[0];
    fireEvent.press(providerToggle);
    expect(mockDispatch).toHaveBeenCalledWith(setProviderStreamingPreference({ providerId: 'claude', enabled: false }));
  });

  it('opens demo debate picker and navigates with selected sample', async () => {
    mockListDebateSamples.mockResolvedValue([{ id: 'sample-1', title: 'Sample', topic: 'AI Ethics' }]);
    mockFindDebateById.mockResolvedValue({ id: 'sample-1', title: 'Sample', topic: 'AI Ethics' });

    const { renderResult, navigation } = renderScreen({ featureAccess: { isDemo: true } });

    act(() => {
      topicSelectorProps.onTopicSelect('AI Ethics');
    });
    await flush();
    fireEvent.press(renderResult.getByText('Next: Choose Debaters →'));
    await flush();

    const claudeConfig = aiSelectorProps.configuredAIs.find((ai: AIConfig) => ai.id === 'claude');
    const openaiConfig = aiSelectorProps.configuredAIs.find((ai: AIConfig) => ai.id === 'openai');

    act(() => {
      aiSelectorProps.onToggleAI(claudeConfig);
      aiSelectorProps.onToggleAI(openaiConfig);
    });
    await flush();

    await act(async () => {
      await aiSelectorProps.onNext();
    });

    expect(mockListDebateSamples).toHaveBeenCalledWith(expect.arrayContaining(['claude', 'openai']), 'default');
    expect(demoPickerProps.visible).toBe(true);

    await act(async () => {
      await demoPickerProps.onSelect({ id: 'sample-1', title: 'Sample', topic: 'AI Ethics' });
    });

    expect(mockFindDebateById).toHaveBeenCalledWith('sample-1');
    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({
      demoDebateId: 'sample-1',
      topic: 'AI Ethics',
    }));
  });

  it('uses record picker when record mode enabled before navigation', async () => {
    const { renderResult, navigation } = renderScreen({
      featureAccess: { isDemo: false, isPremium: true },
      state: {
        settings: {
          ...defaultState().settings,
          recordModeEnabled: true,
        } as any,
      },
    });

    act(() => {
      topicSelectorProps.onTopicSelect('Climate Action');
    });
    await flush();
    fireEvent.press(renderResult.getByText('Next: Choose Debaters →'));
    await flush();

    const claudeConfig = aiSelectorProps.configuredAIs.find((ai: AIConfig) => ai.id === 'claude');
    const openaiConfig = aiSelectorProps.configuredAIs.find((ai: AIConfig) => ai.id === 'openai');
    act(() => {
      aiSelectorProps.onToggleAI(claudeConfig);
      aiSelectorProps.onToggleAI(openaiConfig);
    });
    await flush();

    act(() => {
      aiSelectorProps.onNext();
    });
    await flush();

    expect(personalitySelectorProps).toBeDefined();

    await act(async () => {
      await personalitySelectorProps.onStartDebate();
    });

    expect(recordPickerProps.visible).toBe(true);

    await act(async () => {
      await recordPickerProps.onSelect({ type: 'new', id: 'record-1', topic: 'Custom Topic' });
    });

    expect(mockRecordController.startDebate).toHaveBeenCalledWith(expect.objectContaining({ id: 'record-1' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({ topic: 'Custom Topic' }));
  });

  it('shows alerts when missing selections', async () => {
    const { renderResult } = renderScreen({ featureAccess: { isDemo: false } });

    await flush();
    fireEvent.press(renderResult.getByText('Next: Choose Debaters →'));
    expect(Alert.alert).toHaveBeenCalledWith('Select a Motion', expect.any(String));

    (Alert.alert as jest.Mock).mockClear();
    act(() => {
      topicSelectorProps.onTopicSelect('Prepared Topic');
    });
    await flush();
    fireEvent.press(renderResult.getByText('Next: Choose Debaters →'));
    await flush();

    await act(async () => {
      await aiSelectorProps.onNext();
    });
    expect(Alert.alert).toHaveBeenCalledWith('Select 2 AIs', expect.any(String));
  });

  it('preserves topic on unmount and clears when starting debate', async () => {
    const firstRender = renderScreen({
      featureAccess: { isDemo: false },
      state: {
        debateStats: {
          preservedTopic: '',
          preservedTopicMode: 'preset',
        } as any,
      },
    });

    act(() => {
      topicSelectorProps.onTopicModeChange('custom');
      topicSelectorProps.onCustomTopicChange('Custom Motion');
    });
    await flush();

    firstRender.renderResult.unmount();
    expect(mockDispatch).toHaveBeenCalledWith(preserveTopic({ topic: 'Custom Motion', mode: 'custom' }));

    jest.clearAllMocks();
    const secondRender = renderScreen({
      featureAccess: { isDemo: false },
      route: { preselectedAIs: baseAIs.slice(0, 2), prefilledTopic: 'Prefilled' },
    });
    await flush();
    fireEvent.press(secondRender.renderResult.getByText('Next: Choose Debaters →'));
    await flush();
    await act(async () => {
      await aiSelectorProps.onNext();
    });
    await flush();
    await act(async () => {
      await personalitySelectorProps.onStartDebate();
    });
    expect(mockDispatch).toHaveBeenCalledWith(clearPreservedTopic());
    expect(secondRender.navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({ topic: 'Prefilled' }));
  });
});
