import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { buildRootState, type RootStateOverrides } from '../../test-utils/services/state';
import { capturePropsOf } from '@test-utils/mockComponents';
import {
  buildApiKeyStatus,
  setAIPersonality,
  setAIModel,
  preserveTopic,
  clearPreservedTopic,
} from '@/store';
import { resolveProviderModelId } from '@/config/modelConfigs';
import type { AIConfig } from '@/types';
import type { RootState } from '@/store';
import type { FormatModal } from '@/components/organisms/debate/FormatModal';
import type { DebateTopicSelector } from '@/components/organisms/debate/DebateTopicSelector';
import type { DebateTeamsCard } from '@/components/organisms/debate/DebateTeamsCard';
import type { DebateSlotConfigSheet } from '@/components/organisms/debate/DebateSlotConfigSheet';
import type { ProviderPickerSheet } from '@/components/organisms/composer/ProviderPickerSheet';
import type { DebateRecordPickerModal } from '@/components/organisms/demo/DebateRecordPickerModal';
import type { DemoDebatePickerModal } from '@/components/organisms/demo/DemoDebatePickerModal';
import type { Header } from '@/components/organisms';
import type { Button, GradientButton, SegmentedControl } from '@/components/molecules';
import type DebateSetupScreenComponent from '@/screens/DebateSetupScreen';
import { requireDefined, collectTestIds } from '@test-utils/queries';

const baseAIs: AIConfig[] = [
  { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3-opus' },
  { id: 'openai', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo' },
  { id: 'google', provider: 'google', name: 'Gemini', model: 'gemini-1.5' },
];

const mockDispatch = jest.fn();
let currentState: RootState;
const mockUseSelector = jest.fn<unknown, [(state: RootState) => unknown]>();
const mockFeatureAccess = jest.fn();

/** Slice overrides layered onto the real initial store state. */
const defaultState = () => ({
  settings: {
    apiKeys: {
      claude: buildApiKeyStatus('key-1'),
      openai: buildApiKeyStatus('key-2'),
      google: buildApiKeyStatus('key-3'),
    },
    expertMode: {},
    recordModeEnabled: false,
    theme: 'light',
    fontSize: 'medium',
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    hasCompletedOnboarding: true,
  },
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
  },
  streaming: {
    globalStreamingEnabled: false,
    streamingPreferences: {},
    providerVerificationErrors: {},
  },
  user: { currentUser: null, isAuthenticated: false, uiMode: 'simple' },
}) satisfies RootStateOverrides;

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: RootState) => unknown) => mockUseSelector(selector),
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

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, [cb]);
  },
}));

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({
    timeBasedGreeting: 'Ready to debate',
    welcomeMessage: 'Pick your topic',
    greeting: {
      timeBasedGreeting: 'Ready to debate',
      welcomeMessage: 'Pick your topic',
    },
  }),
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockFeatureAccess(...args),
}));

jest.mock('@/components/molecules/subscription/TrialBanner', () => ({
  TrialBanner: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'trial-banner' }, 'trial-banner');
  },
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  DemoBanner: () => {
    return null;
  },
  __esModule: true,
  default: () => {
    return null;
  },
}));

const mockTopicSelector = capturePropsOf<typeof DebateTopicSelector>();
const mockTeamsCard = capturePropsOf<typeof DebateTeamsCard>();
const mockSlotConfigSheet = capturePropsOf<typeof DebateSlotConfigSheet>();
const mockProviderPicker = capturePropsOf<typeof ProviderPickerSheet>();
const mockFormatModal = capturePropsOf<typeof FormatModal>();
const mockRecordPicker = capturePropsOf<typeof DebateRecordPickerModal>();
const mockDemoPicker = capturePropsOf<typeof DemoDebatePickerModal>();

jest.mock('@/components/organisms/debate/DebateTopicSelector', () => ({
  get DebateTopicSelector() {
    return mockTopicSelector.Stub;
  },
}));

jest.mock('@/components/organisms/debate/DebateTeamsCard', () => ({
  get DebateTeamsCard() {
    return mockTeamsCard.Stub;
  },
}));

jest.mock('@/components/organisms/debate/DebateSlotConfigSheet', () => ({
  get DebateSlotConfigSheet() {
    return mockSlotConfigSheet.Stub;
  },
}));

jest.mock('@/components/organisms/composer/ProviderPickerSheet', () => ({
  get ProviderPickerSheet() {
    return mockProviderPicker.Stub;
  },
}));

jest.mock('@/components/organisms/common/AIAvatar', () => ({
  AIAvatar: () => null,
}));

jest.mock('@/components/organisms/demo/DebateRecordPickerModal', () => ({
  get DebateRecordPickerModal() {
    return mockRecordPicker.Stub;
  },
}));

jest.mock('@/components/organisms/demo/DemoDebatePickerModal', () => ({
  get DemoDebatePickerModal() {
    return mockDemoPicker.Stub;
  },
}));

jest.mock('@/components/organisms/debate/FormatModal', () => ({
  get FormatModal() {
    return mockFormatModal.Stub;
  },
}));

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Header: stubComponent<typeof Header>('header', {
      text: (props) => props.title,
      render: (props) => props.rightElement ?? null,
    }),
    HeaderActions: () => React.createElement(Text, null, 'actions'),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Button: stubComponent<typeof Button>('button', {
      onPress: (props) => props.onPress,
      text: (props) => props.title,
    }),
    GradientButton: stubComponent<typeof GradientButton>('gradient-button', {
      testID: (props) => props.testID,
      onPress: (props) => (props.disabled ? undefined : props.onPress),
      text: (props) => props.title,
    }),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    HeaderIcon: ({ onPress, testID }: { onPress?: () => void; testID?: string }) =>
      React.createElement(Text, { onPress, testID }, 'icon'),
    InfoButton: ({ topicId }: { topicId: string }) =>
      React.createElement(Text, { testID: `info-button-${topicId}` }, 'info'),
    SegmentedControl: stubComponent<typeof SegmentedControl>('segmented-control', {
      render: ({ options, onChange }) =>
        options.map((option) =>
          React.createElement(
            Text,
            { key: String(option.value), onPress: () => onChange(option.value) },
            option.label
          )
        ),
    }),
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

const mockGetAPIKey = jest.fn();
jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: {
    getKey: (...args: unknown[]) => mockGetAPIKey(...args),
  },
}));

const mockListElevenLabsOptions = jest.fn();
const mockGetElevenLabsSubscription = jest.fn();
jest.mock('@/services/media/MediaGenerationService', () => ({
  __esModule: true,
  default: {
    listElevenLabsOptions: (...args: unknown[]) => mockListElevenLabsOptions(...args),
    getElevenLabsSubscription: (...args: unknown[]) => mockGetElevenLabsSubscription(...args),
  },
}));

const mockRecordController = {
  startDebate: jest.fn(),
};
jest.mock('@/services/demo/RecordController', () => ({
  RecordController: mockRecordController,
}));

const DebateSetupScreen: typeof DebateSetupScreenComponent = require('@/screens/DebateSetupScreen').default;

type DebateSetupRouteParams = NonNullable<
  NonNullable<React.ComponentProps<typeof DebateSetupScreenComponent>['route']>['params']
>;

/** The slot's debater; fails the test when the slot is unexpectedly empty. */
const filledAI = (ai: AIConfig | null | undefined): AIConfig => {
  if (!ai) throw new Error('expected a filled debater slot');
  return ai;
};

/** An optional callback prop the screen is expected to have provided. */
const renderScreen = (options: {
  featureAccess?: Record<string, unknown>;
  route?: DebateSetupRouteParams;
  state?: RootStateOverrides;
} = {}) => {
  const { featureAccess, route, state } = options;
  currentState = buildRootState({
    ...defaultState(),
    ...(state ? state : {}),
  });

  mockUseSelector.mockImplementation((selector) => selector(currentState));
  mockFeatureAccess.mockReturnValue({ isDemo: false, isPremium: false, isInTrial: false, ...featureAccess });

  const navigation = {
    navigate: jest.fn(),
  };

  const renderResult = renderWithProviders(
    <DebateSetupScreen navigation={navigation} route={{ params: { ...route } }} />
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
  mockGetAPIKey.mockReset();
  mockListElevenLabsOptions.mockReset();
  mockGetElevenLabsSubscription.mockReset();
  mockGetAPIKey.mockResolvedValue('eleven-key');
  mockGetElevenLabsSubscription.mockResolvedValue({
    characterCount: 100,
    characterLimit: 1000,
    remainingCredits: 900,
    overageAllowed: false,
  });
  mockListElevenLabsOptions.mockResolvedValue({
    success: true,
    providerId: 'elevenlabs',
    voices: [
      { id: 'voice-1', name: 'Voice One', description: 'Warm' },
      { id: 'voice-2', name: 'Voice Two', description: 'Clear' },
    ],
  });
  mockRecordController.startDebate.mockReset();
  mockTopicSelector.reset();
  mockTeamsCard.reset();
  mockSlotConfigSheet.reset();
  mockProviderPicker.reset();
  mockFormatModal.reset();
  mockRecordPicker.reset();
  mockDemoPicker.reset();
  Alert.alert = jest.fn();
});

const elevenLabsState = () => ({
  settings: {
    ...defaultState().settings,
    apiKeys: {
      ...defaultState().settings.apiKeys,
      elevenlabs: { configured: true, maskedLabel: 'key', updatedAt: 1 },
    },
    verifiedProviders: ['elevenlabs'],
  },
});

describe('DebateSetupScreen', () => {
  const fillSlot = async (index: number, providerId: string) => {
    act(() => {
      mockTeamsCard.latest().onSlotPress(mockTeamsCard.latest().slots[index]);
    });
    await flush();
    expect(mockProviderPicker.latest().visible).toBe(true);
    act(() => {
      mockProviderPicker.latest().onSelectProvider(providerId);
    });
    await flush();
  };

  const setTopic = async (topic: string) => {
    act(() => {
      mockTopicSelector.latest().onTopicSelect(topic);
    });
    await flush();
  };

  it('places the trial banner below the header surface', () => {
    const { renderResult } = renderScreen({ featureAccess: { isInTrial: true, trialDaysRemaining: 1 } });

    const testIds = collectTestIds(renderResult.toJSON());

    expect(renderResult.getByText('The Arena')).toBeTruthy();
    expect(testIds.indexOf('header')).toBeGreaterThanOrEqual(0);
    expect(testIds.indexOf('trial-banner')).toBeGreaterThanOrEqual(0);
    expect(testIds.indexOf('header')).toBeLessThan(testIds.indexOf('trial-banner'));
  });

  it('shows Oxford presets with a one-line summary that tracks selection', async () => {
    const { renderResult } = renderScreen({ featureAccess: { isDemo: false } });

    expect(renderResult.getByText('1v1')).toBeTruthy();
    expect(renderResult.getByText('2v2')).toBeTruthy();
    expect(renderResult.getByText('2v2 + Q&A')).toBeTruthy();
    expect(renderResult.getByText(/1v1 Oxford/)).toBeTruthy();
    expect(renderResult.getByText(/6 speeches · 2 debaters · audience votes/)).toBeTruthy();

    fireEvent.press(renderResult.getByText('2v2'));
    await flush();

    expect(renderResult.getByText(/2v2 Oxford/)).toBeTruthy();
    expect(renderResult.getByText(/4 debaters/)).toBeTruthy();
    expect(mockTeamsCard.latest().totalCount).toBe(4);

    fireEvent.press(renderResult.getByText('2v2 + Q&A'));
    await flush();

    expect(renderResult.getByText(/2v2 \+ Q&A Oxford/)).toBeTruthy();
    expect(renderResult.getByText(/8 turns/)).toBeTruthy();
  });

  it('updates the summary for Lincoln-Douglas and Policy formats', async () => {
    const { renderResult } = renderScreen({ featureAccess: { isDemo: false } });

    act(() => {
      mockFormatModal.latest().onSelect('lincoln_douglas');
    });
    await flush();

    expect(renderResult.getByText('Lincoln-Douglas')).toBeTruthy();
    expect(renderResult.getByText(/Short LD/)).toBeTruthy();
    expect(renderResult.getByText(/5 turns · 2 debaters · 4 judge moments/)).toBeTruthy();

    fireEvent.press(renderResult.getByText('Standard'));
    await flush();

    expect(renderResult.getByText(/Standard LD/)).toBeTruthy();
    expect(renderResult.getByText(/9 turns · 2 debaters · 5 judge moments/)).toBeTruthy();

    act(() => {
      mockFormatModal.latest().onSelect('policy');
    });
    await flush();

    expect(renderResult.getByText('Policy')).toBeTruthy();
    expect(renderResult.getByText(/16 turns/)).toBeTruthy();
  });

  it('fills empty slots through the provider picker', async () => {
    renderScreen({ featureAccess: { isDemo: false } });
    await setTopic('Climate Action');

    expect(mockTeamsCard.latest().slots).toHaveLength(2);
    expect(mockTeamsCard.latest().slots[0].ai).toBeNull();

    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    expect(mockTeamsCard.latest().slots[0].ai?.provider).toBe('claude');
    expect(mockTeamsCard.latest().slots[1].ai?.provider).toBe('openai');
    expect(mockTeamsCard.latest().filledCount).toBe(2);
    expect(mockProviderPicker.latest().visible).toBe(false);
  });

  it('adds same-provider debater slots with distinct slot ids and numbered names', async () => {
    renderScreen({ featureAccess: { isDemo: false } });
    await setTopic('Climate Action');

    await fillSlot(0, 'claude');
    await fillSlot(1, 'claude');

    const [first, second] = mockTeamsCard.latest().slots.map((slot) => filledAI(slot.ai));
    expect(first.id).not.toEqual(second.id);
    expect(first.name).toBe('Claude 1');
    expect(second.name).toBe('Claude 2');
  });

  it('opens the slot config sheet for filled slots and applies model and personality changes', async () => {
    renderScreen({ featureAccess: { isDemo: false } });
    await setTopic('Climate Action');
    await fillSlot(0, 'claude');

    act(() => {
      mockTeamsCard.latest().onSlotPress(mockTeamsCard.latest().slots[0]);
    });
    await flush();

    expect(mockSlotConfigSheet.latest().visible).toBe(true);
    expect(mockSlotConfigSheet.latest().ai?.provider).toBe('claude');
    expect(mockSlotConfigSheet.latest().slotLabel).toBe('Affirmative 1');

    const slotId = filledAI(mockSlotConfigSheet.latest().ai).id;

    act(() => {
      mockSlotConfigSheet.latest().onChangeModel('claude-custom');
    });
    expect(mockDispatch).toHaveBeenCalledWith(setAIModel({
      aiId: slotId,
      modelId: resolveProviderModelId('claude', 'claude-custom') || 'claude-custom',
    }));

    act(() => {
      requireDefined(mockSlotConfigSheet.latest().onChangePersonality, 'onChangePersonality')('friendly');
    });
    expect(mockDispatch).toHaveBeenCalledWith(setAIPersonality({ aiId: slotId, personalityId: 'friendly' }));
  });

  it('removes a debater and reopens the provider picker on change provider', async () => {
    renderScreen({ featureAccess: { isDemo: false } });
    await setTopic('Climate Action');
    await fillSlot(0, 'claude');

    act(() => {
      mockTeamsCard.latest().onSlotPress(mockTeamsCard.latest().slots[0]);
    });
    await flush();

    act(() => {
      mockSlotConfigSheet.latest().onChangeProvider();
    });
    await flush();
    expect(mockProviderPicker.latest().visible).toBe(true);

    act(() => {
      mockProviderPicker.latest().onSelectProvider('openai');
    });
    await flush();
    expect(mockTeamsCard.latest().slots[0].ai?.provider).toBe('openai');

    act(() => {
      mockTeamsCard.latest().onSlotPress(mockTeamsCard.latest().slots[0]);
    });
    await flush();
    act(() => {
      mockSlotConfigSheet.latest().onRemove();
    });
    await flush();
    expect(mockTeamsCard.latest().slots[0].ai).toBeNull();
  });

  it('hides the personality row in demo mode', async () => {
    renderScreen({ featureAccess: { isDemo: true } });
    await setTopic('AI Ethics');
    await fillSlot(0, 'claude');

    act(() => {
      mockTeamsCard.latest().onSlotPress(mockTeamsCard.latest().slots[0]);
    });
    await flush();

    expect(mockSlotConfigSheet.latest().visible).toBe(true);
    expect(mockSlotConfigSheet.latest().personalityId).toBeUndefined();
  });

  it('blocks Start with a hint until motion and slots are complete', async () => {
    const { renderResult, navigation } = renderScreen({ featureAccess: { isDemo: false } });

    expect(renderResult.getByText('Choose a motion to debate.')).toBeTruthy();
    fireEvent.press(renderResult.getByTestId('start-debate-button'));
    expect(navigation.navigate).not.toHaveBeenCalled();

    await setTopic('Climate Action');
    expect(renderResult.getByText('Fill 2 more debater slots.')).toBeTruthy();

    await fillSlot(0, 'claude');
    expect(renderResult.getByText('Fill 1 more debater slot.')).toBeTruthy();

    await fillSlot(1, 'openai');
    expect(renderResult.queryByText(/debater slot/)).toBeNull();

    fireEvent.press(renderResult.getByTestId('start-debate-button'));
    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({
      topic: 'Climate Action',
      formatId: 'oxford',
      rounds: 3,
      civility: 3,
    }));
    expect(mockDispatch).toHaveBeenCalledWith(clearPreservedTopic());
  });

  it('passes intensity changes through to the debate', async () => {
    const { renderResult, navigation } = renderScreen({ featureAccess: { isDemo: false } });
    await setTopic('Climate Action');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    fireEvent.press(renderResult.getByText('Hostile'));
    await flush();

    fireEvent.press(renderResult.getByTestId('start-debate-button'));
    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({ civility: 5 }));
  });

  it('opens demo debate picker and navigates with selected sample', async () => {
    mockListDebateSamples.mockResolvedValue([{ id: 'sample-1', title: 'Sample', topic: 'AI Ethics' }]);
    mockFindDebateById.mockResolvedValue({ id: 'sample-1', title: 'Sample', topic: 'AI Ethics' });

    const { renderResult, navigation } = renderScreen({ featureAccess: { isDemo: true } });

    await setTopic('AI Ethics');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    await act(async () => {
      fireEvent.press(renderResult.getByTestId('start-debate-button'));
      await Promise.resolve();
    });

    expect(mockListDebateSamples).toHaveBeenCalledWith(expect.arrayContaining(['claude', 'openai']), 'default');
    expect(mockDemoPicker.latest().visible).toBe(true);

    await act(async () => {
      await mockDemoPicker.latest().onSelect({ id: 'sample-1', title: 'Sample', topic: 'AI Ethics' });
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
        },
      },
    });

    await setTopic('Climate Action');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    fireEvent.press(renderResult.getByTestId('start-debate-button'));
    await flush();

    expect(mockRecordPicker.latest().visible).toBe(true);

    await act(async () => {
      await mockRecordPicker.latest().onSelect({ type: 'new', id: 'record-1', topic: 'Custom Topic' });
    });

    expect(mockRecordController.startDebate).toHaveBeenCalledWith(expect.objectContaining({ id: 'record-1' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({ topic: 'Custom Topic' }));
  });

  it('hides voice controls without a verified ElevenLabs key', async () => {
    const { renderResult } = renderScreen({ featureAccess: { isDemo: false } });

    await setTopic('Climate Action');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    expect(renderResult.queryByText('Debate Voices')).toBeNull();
    expect(mockListElevenLabsOptions).not.toHaveBeenCalled();
    expect(mockSlotConfigSheet.latest().showVoice).toBe(false);
  });

  it('loads verified ElevenLabs voices and passes voice config to Debate', async () => {
    const { renderResult, navigation } = renderScreen({
      featureAccess: { isDemo: false },
      state: elevenLabsState(),
    });

    await setTopic('Climate Action');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    expect(renderResult.getByText('Debate Voices')).toBeTruthy();
    expect(mockListElevenLabsOptions).not.toHaveBeenCalled();

    // The first Off toggle is Debate Voices; the second is Podcast Mode.
    await act(async () => {
      fireEvent.press(renderResult.getAllByText('Off')[0]);
      await Promise.resolve();
    });
    await flush();

    expect(mockGetAPIKey).toHaveBeenCalledWith('elevenlabs');
    expect(mockListElevenLabsOptions).toHaveBeenCalledWith('eleven-key', expect.objectContaining({
      pageSize: 50,
      includeTotalCount: true,
      voiceType: 'non-community',
    }));
    expect(renderResult.getByText(/900 remaining/)).toBeTruthy();

    const [claudeDebater, openaiDebater] = mockTeamsCard.latest().slots.map((slot) => filledAI(slot.ai));
    expect(mockTeamsCard.latest().slots[0].voiceLabel).toContain('Voice One');
    expect(mockTeamsCard.latest().slots[1].voiceLabel).toContain('Voice Two');

    fireEvent.press(renderResult.getByTestId('start-debate-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({
      voiceConfig: {
        enabled: true,
        providerId: 'elevenlabs',
        ttsModelId: 'eleven_flash_v2_5',
        debaterVoices: {
          [claudeDebater.id]: { voiceId: 'voice-1', voiceName: 'Voice One' },
          [openaiDebater.id]: { voiceId: 'voice-2', voiceName: 'Voice Two' },
        },
      },
    }));
  });

  it('passes podcast MC provider, model, and voice config to Debate', async () => {
    const { renderResult, navigation } = renderScreen({
      featureAccess: { isDemo: false },
      state: elevenLabsState(),
    });

    await setTopic('Climate Action');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    // Second Off toggle is Podcast Mode (first is Debate Voices).
    await act(async () => {
      fireEvent.press(renderResult.getAllByText('Off')[1]);
      await Promise.resolve();
    });
    await flush();

    fireEvent.press(renderResult.getByText('Add MC'));
    await flush();
    expect(mockProviderPicker.latest().visible).toBe(true);
    act(() => {
      mockProviderPicker.latest().onSelectProvider('google');
    });
    await flush();

    // MC voice still missing: Start stays blocked.
    expect(renderResult.getByText('Choose a voice for the podcast MC.')).toBeTruthy();
    fireEvent.press(renderResult.getByTestId('start-debate-button'));
    expect(navigation.navigate).not.toHaveBeenCalledWith('Debate', expect.anything());

    fireEvent.press(renderResult.getByTestId('debate-podcast-mc-row'));
    await flush();
    expect(mockSlotConfigSheet.latest().slotLabel).toBe('Podcast MC');
    expect(mockSlotConfigSheet.latest().personalityId).toBeUndefined();
    act(() => {
      requireDefined(mockSlotConfigSheet.latest().onSelectVoice, 'onSelectVoice')({ id: 'voice-host', name: 'Host Voice' });
    });
    await flush();

    fireEvent.press(renderResult.getByText('Multilingual'));
    await flush();

    fireEvent.press(renderResult.getByTestId('start-debate-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({
      voiceConfig: expect.objectContaining({
        ttsModelId: 'eleven_multilingual_v2',
        podcast: {
          enabled: true,
          scriptMode: 'byok_ai',
          outputMode: 'playlist',
          mc: expect.objectContaining({
            provider: 'google',
            model: expect.any(String),
          }),
          mcVoice: { voiceId: 'voice-host', voiceName: 'Host Voice' },
        },
      }),
    }));
  });

  it('blocks Start when podcast mode has no voices available for debaters', async () => {
    mockListElevenLabsOptions.mockResolvedValue({
      success: true,
      providerId: 'elevenlabs',
      voices: [],
    });

    const { renderResult, navigation } = renderScreen({
      featureAccess: { isDemo: false },
      state: elevenLabsState(),
    });

    await setTopic('Climate Action');
    await fillSlot(0, 'claude');
    await fillSlot(1, 'openai');

    await act(async () => {
      fireEvent.press(renderResult.getAllByText('Off')[1]);
      await Promise.resolve();
    });
    await flush();

    fireEvent.press(renderResult.getByText('Add MC'));
    await flush();
    act(() => {
      mockProviderPicker.latest().onSelectProvider('google');
    });
    await flush();

    fireEvent.press(renderResult.getByTestId('debate-podcast-mc-row'));
    await flush();
    act(() => {
      requireDefined(mockSlotConfigSheet.latest().onSelectVoice, 'onSelectVoice')({ id: 'voice-host', name: 'Host Voice' });
    });
    await flush();

    expect(renderResult.getByText('Choose a voice for every debater.')).toBeTruthy();
    fireEvent.press(renderResult.getByTestId('start-debate-button'));
    expect(navigation.navigate).not.toHaveBeenCalledWith('Debate', expect.anything());
  });

  it('resets setup state when returning from a completed debate', async () => {
    renderScreen({
      featureAccess: { isDemo: false },
      route: {
        resetDebateSetup: true,
        resetKey: 'reset-1',
      },
      state: {
        debateStats: {
          preservedTopic: 'Old Motion',
          preservedTopicMode: 'custom',
        },
      },
    });

    await flush();

    expect(mockTopicSelector.latest().selectedTopic).toBe('');
    expect(mockTopicSelector.latest().customTopic).toBe('');
    expect(mockTopicSelector.latest().topicMode).toBe('preset');
    expect(mockDispatch).toHaveBeenCalledWith(clearPreservedTopic());
  });

  it('keeps Oxford preset changes after returning from a completed debate', async () => {
    const { renderResult } = renderScreen({
      featureAccess: { isDemo: false },
      route: {
        resetDebateSetup: true,
        resetKey: 'reset-1',
      },
    });

    await flush();

    fireEvent.press(renderResult.getByText('2v2'));
    await flush();

    expect(renderResult.getByText(/2v2 Oxford/)).toBeTruthy();
    expect(renderResult.getByText(/4 debaters/)).toBeTruthy();

    fireEvent.press(renderResult.getByText('2v2 + Q&A'));
    await flush();

    expect(renderResult.getByText(/2v2 \+ Q&A Oxford/)).toBeTruthy();
    expect(renderResult.getByText(/8 turns/)).toBeTruthy();
  });

  it('preserves topic on unmount and clears when starting debate', async () => {
    const firstRender = renderScreen({
      featureAccess: { isDemo: false },
      state: {
        debateStats: {
          preservedTopic: '',
          preservedTopicMode: 'preset',
        },
      },
    });

    act(() => {
      mockTopicSelector.latest().onTopicModeChange('custom');
      mockTopicSelector.latest().onCustomTopicChange('Custom Motion');
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

    fireEvent.press(secondRender.renderResult.getByTestId('start-debate-button'));
    expect(mockDispatch).toHaveBeenCalledWith(clearPreservedTopic());
    expect(secondRender.navigation.navigate).toHaveBeenCalledWith('Debate', expect.objectContaining({ topic: 'Prefilled' }));
  });

  it('navigates to Stats from the header action', () => {
    const { renderResult, navigation } = renderScreen({ featureAccess: { isDemo: false } });

    fireEvent.press(renderResult.getByTestId('debate-stats-header-button'));
    expect(navigation.navigate).toHaveBeenCalledWith('Stats');
  });
});
