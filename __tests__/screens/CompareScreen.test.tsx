import React, { type ComponentProps } from 'react';
import { Alert, Text } from 'react-native';
import { KeyboardAvoider } from '@/components/molecules/common/KeyboardAvoider';
import { act, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import {
  createMockAIConfig,
  createMockAuthState,
  createMockChatSession,
  createMockMessage,
} from '@test-utils/fixtures';
import { buildRootState, type RootStateOverrides } from '@test-utils/services/state';
import { createAppStore, showSheet } from '@/store';
import { resolveProviderModelId } from '@/config/modelConfigs';
import { StorageService } from '@/services/chat/StorageService';
import type { AppStore } from '@/store';
import type { AIConfig, ChatSession } from '@/types';
import type {
  CompareSplitView,
  CompareUserMessage,
  Header,
  HeaderActions,
} from '@/components/organisms';
import type { ChatInputBar } from '@/components/organisms/chat';
import type { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import type { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import type { GeneratedContentReportModal } from '@/components/organisms/report/GeneratedContentReportModal';
import type CompareScreenComponent from '@/screens/CompareScreen';
import type { AppLifecycleHandler } from '@/services/lifecycle/AppLifecycleService';
import { requireDefined } from '@test-utils/queries';

const leftAI: AIConfig = createMockAIConfig({
  id: 'left-ai',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-sonnet-4-6',
});

const rightAI: AIConfig = createMockAIConfig({
  id: 'right-ai',
  provider: 'openai',
  name: 'ChatGPT',
  model: 'gpt-5.5',
});

const mockUseAIService = jest.fn();
const mockUseMergedAvailability = jest.fn();
const mockListSamples = jest.fn();
const mockFindCompareById = jest.fn();
const mockLoadCompareScript = jest.fn();
const mockPrimeNextCompareTurn = jest.fn();
const mockHasNextCompareTurn = jest.fn();
const mockStreamResponse = jest.fn();
const mockGetMergedPersonality = jest.fn();
const mockLifecycleRegister = jest.fn<() => void, [AppLifecycleHandler]>(() => jest.fn());
const mockSaveActiveSnapshot = jest.fn().mockResolvedValue(undefined);
const mockLoadActiveSnapshot = jest.fn().mockResolvedValue(null);

const mockHeader = capturePropsOf<typeof Header>(() => <Text testID="header">header</Text>);
const mockCompareSplitView = capturePropsOf<typeof CompareSplitView>(() => (
  <Text testID="compare-split">split</Text>
));
const mockDemoSamples = capturePropsOf<typeof DemoSamplesBar>((props) => (
  <Text testID="demo-samples">{props.label || 'Demo Samples'}</Text>
));
const mockChatInput = capturePropsOf<typeof ChatInputBar>(() => (
  <Text testID="chat-input">chat-input</Text>
));
const mockDemoBanner = capturePropsOf<typeof DemoBanner>((props) => (
  <Text testID="demo-banner" onPress={props.onPress}>
    demo-banner
  </Text>
));
const mockReportModal = capturePropsOf<typeof GeneratedContentReportModal>();

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: (...args: unknown[]) => mockUseAIService(...args),
}));

const mockUseMergedAvailabilityStrict = jest.fn();

jest.mock('@/hooks/multimodal/useModalityAvailability', () => ({
  useMergedModalityAvailability: (...args: unknown[]) => mockUseMergedAvailability(...args),
  useMergedModalityAvailabilityStrict: (...args: unknown[]) => mockUseMergedAvailabilityStrict(...args),
}));

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listCompareSamples: (...args: unknown[]) => mockListSamples(...args),
    findCompareById: (...args: unknown[]) => mockFindCompareById(...args),
    getCompareSampleForProviders: jest.fn(),
  },
  __esModule: true,
  default: {
    listCompareSamples: (...args: unknown[]) => mockListSamples(...args),
    findCompareById: (...args: unknown[]) => mockFindCompareById(...args),
    getCompareSampleForProviders: jest.fn(),
  },
}));

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  loadCompareScript: (...args: unknown[]) => mockLoadCompareScript(...args),
  primeNextCompareTurn: (...args: unknown[]) => mockPrimeNextCompareTurn(...args),
  hasNextCompareTurn: (...args: unknown[]) => mockHasNextCompareTurn(...args),
}));

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: {
    isActive: jest.fn().mockReturnValue(false),
    recordUserMessage: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordAssistantChunk: jest.fn(),
    startCompare: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@/services/chat/StorageService', () => ({
  StorageService: {
    loadSession: jest.fn(),
    saveSession: jest.fn(),
    enforceStorageLimits: jest.fn(),
  },
}));

jest.mock('@/services/chat', () => ({
  PromptBuilder: {
    appendPersonaGuidance: jest.fn((text: string) => text),
  },
}));

jest.mock('@/hooks/usePersonality', () => ({
  usePersonality: () => ({
    isLoading: false,
    settings: { customizations: {}, lastSyncedAt: 0, version: 1 },
    getPersonality: (...args: unknown[]) => mockGetMergedPersonality(...args),
    getAllPersonalities: jest.fn().mockReturnValue([]),
    isCustomized: jest.fn().mockReturnValue(false),
    getCustomization: jest.fn().mockReturnValue(null),
    updateCustomization: jest.fn(),
    updateTone: jest.fn(),
    updateDebateProfile: jest.fn(),
    updateModelParameters: jest.fn(),
    toggleCustomization: jest.fn(),
    resetToDefaults: jest.fn(),
    resetAll: jest.fn(),
    reload: jest.fn(),
  }),
  usePersonalityById: () => null,
}));

jest.mock('@/services/streaming/StreamingService', () => ({
  isStreamInterruptedError: () => false,
  getStreamingService: () => ({
    streamResponse: (...args: unknown[]) => mockStreamResponse(...args),
    cancelAllStreams: jest.fn(),
  }),
}));

jest.mock('@/services/lifecycle/AppLifecycleService', () => ({
  AppLifecycleService: {
    register: (handler: AppLifecycleHandler) => mockLifecycleRegister(handler),
  },
}));

jest.mock('@/services/lifecycle/ActiveSessionPersistenceService', () => ({
  ActiveSessionPersistenceService: {
    saveSnapshot: (...args: unknown[]) => mockSaveActiveSnapshot(...args),
    loadSnapshot: (...args: unknown[]) => mockLoadActiveSnapshot(...args),
  },
}));

jest.mock('@/components/organisms/demo/CompareRecordPickerModal', () => ({
  CompareRecordPickerModal: () => null,
}));

jest.mock('@/components/organisms', () => {
  const { stubComponent } = jest.requireActual<typeof import('@test-utils/mockComponents')>(
    '@test-utils/mockComponents'
  );
  return {
    get Header() {
      return mockHeader.Stub;
    },
    HeaderActions: stubComponent<typeof HeaderActions>('header-actions', { text: () => 'actions' }),
    get CompareSplitView() {
      return mockCompareSplitView.Stub;
    },
    CompareUserMessage: stubComponent<typeof CompareUserMessage>('compare-user-message', {
      text: (props) => props.message.content,
    }),
  };
});

jest.mock('@/components/organisms/chat', () => ({
  get ChatInputBar() {
    return mockChatInput.Stub;
  },
}));

jest.mock('@/components/organisms/demo/DemoSamplesBar', () => ({
  get DemoSamplesBar() {
    return mockDemoSamples.Stub;
  },
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  get DemoBanner() {
    return mockDemoBanner.Stub;
  },
  __esModule: true,
  get default() {
    return mockDemoBanner.Stub;
  },
}));

jest.mock('@/services/media/MediaSaveService', () => ({
  __esModule: true,
  default: {
    saveFileUri: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/components/organisms/chat/ImageLightboxModal', () => ({
  ImageLightboxModal: () => null,
}));

jest.mock('@/components/organisms/report/GeneratedContentReportModal', () => ({
  get GeneratedContentReportModal() {
    return mockReportModal.Stub;
  },
}));

const CompareScreen: typeof CompareScreenComponent = require('@/screens/CompareScreen').default;

type CompareScreenProps = ComponentProps<typeof CompareScreenComponent>;
type CompareRouteParams = CompareScreenProps['route']['params'];

/** The resumed-session shape CompareScreen reads divergence state from. */
type ResumedCompareSession = ChatSession & { hasDiverged?: boolean; continuedWithAI?: string };

type RenderOptions = {
  params?: Partial<CompareRouteParams>;
  isDemo?: boolean;
  preloadedState?: RootStateOverrides;
  aiServiceOverrides?: Partial<{
    getAdapter: jest.Mock;
    ensureAdapter: jest.Mock;
    getApiKey: jest.Mock;
    setPersonality: jest.Mock;
    sendMessage: jest.Mock;
  }>;
  store?: AppStore;
};

let navigation: { navigate: jest.Mock; goBack: jest.Mock };

const renderScreen = (options: RenderOptions = {}) => {
  const { params, isDemo = false, preloadedState, aiServiceOverrides, store: providedStore } = options;

  const aiService = {
    getAdapter: jest.fn().mockReturnValue({ config: {}, debugGetSystemPrompt: jest.fn(() => 'adapter prompt') }),
    ensureAdapter: jest.fn().mockResolvedValue({ config: {}, debugGetSystemPrompt: jest.fn(() => 'adapter prompt') }),
    getApiKey: jest.fn().mockResolvedValue('api-key'),
    setPersonality: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ response: 'response', modelUsed: 'model' }),
    ...aiServiceOverrides,
  };

  mockUseAIService.mockReturnValue({
    aiService,
    isInitialized: true,
    isLoading: false,
    error: null,
    reinitialize: jest.fn(),
  });

  let store: AppStore;
  if (providedStore) {
    store = providedStore;
  } else {
    // Screen tests bypass App.tsx, so mark auth/profile resolution complete.
    store = createAppStore(buildRootState({
      ...preloadedState,
      auth: {
        authLoading: false,
        isAuthenticated: true,
        isPremium: !isDemo,
        userProfile: {
          email: null,
          displayName: null,
          photoURL: null,
          createdAt: null,
          membershipStatus: isDemo ? 'demo' : 'premium',
          hasUsedTrial: false,
          trialEndDate: null,
        },
      },
    }));
  }

  const routeParams: CompareRouteParams = {
    leftAI,
    rightAI,
    ...params,
  };

  const route = { params: routeParams };

  const renderResult = renderWithProviders(
    <CompareScreen navigation={navigation} route={route} />,
    { store }
  );

  return { renderResult, store: renderResult.store, aiService };
};

const createResumedSession = (
  overrides: Partial<ResumedCompareSession> = {}
): ResumedCompareSession => ({
  ...createMockChatSession({
    id: 'compare-session',
    selectedAIs: [leftAI, rightAI],
    messages: [
      createMockMessage({ id: 'm1', sender: 'You', senderType: 'user', content: 'Prompt', timestamp: 1 }),
      createMockMessage({ id: 'm2', sender: leftAI.name, senderType: 'ai', content: 'Left answer', timestamp: 2 }),
      createMockMessage({ id: 'm3', sender: rightAI.name, senderType: 'ai', content: 'Right answer', timestamp: 3 }),
    ],
    isActive: false,
    createdAt: Date.now(),
    sessionType: 'comparison',
    topic: 'Topic',
  }),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  navigation = { navigate: jest.fn(), goBack: jest.fn() };
  mockHeader.reset();
  mockCompareSplitView.reset();
  mockDemoSamples.reset();
  mockChatInput.reset();
  mockDemoBanner.reset();
  mockReportModal.reset();
  mockListSamples.mockResolvedValue([]);
  mockFindCompareById.mockResolvedValue(null);
  mockLoadCompareScript.mockReset();
  mockPrimeNextCompareTurn.mockReset().mockReturnValue({ user: 'Next message' });
  mockHasNextCompareTurn.mockReset().mockReturnValue(false);
  mockStreamResponse.mockReset().mockImplementation(async (_config, _onChunk, onComplete) => {
    onComplete?.('streamed response');
  });
  mockLifecycleRegister.mockClear();
  mockLifecycleRegister.mockReturnValue(jest.fn());
  mockSaveActiveSnapshot.mockClear();
  mockSaveActiveSnapshot.mockResolvedValue(undefined);
  mockLoadActiveSnapshot.mockClear();
  mockLoadActiveSnapshot.mockResolvedValue(null);
  mockGetMergedPersonality.mockReset().mockReturnValue(null);
  mockUseMergedAvailability.mockImplementation(() => ({
    imageUpload: { supported: true },
    documentUpload: { supported: false },
    imageGeneration: { supported: false },
    videoGeneration: { supported: false },
    webSearch: { supported: false },
  }));
  mockUseMergedAvailabilityStrict.mockImplementation(() => ({
    imageUpload: { supported: true },
    documentUpload: { supported: false },
    imageGeneration: { supported: false },
    videoGeneration: { supported: false },
    webSearch: { supported: false },
  }));
});

describe('CompareScreen', () => {
  it('renders split-width AI metadata cards under the header', () => {
    const georgeLeft = { ...leftAI, personality: 'george' };

    const { renderResult } = renderScreen({ params: { leftAI: georgeLeft, rightAI } });

    expect(renderResult.getByTestId('compare-ai-metadata-header')).toBeTruthy();
    expect(renderResult.getByText('Left')).toBeTruthy();
    expect(renderResult.getByText('Right')).toBeTruthy();
    expect(renderResult.getByText('Claude')).toBeTruthy();
    expect(renderResult.getByText('Claude Sonnet 4.6')).toBeTruthy();
    expect(renderResult.getByText('George')).toBeTruthy();
    expect(renderResult.getByText('ChatGPT')).toBeTruthy();
    expect(renderResult.getByText('GPT-5.5')).toBeTruthy();
    expect(renderResult.queryByText('Face-off')).toBeNull();
    expect(renderResult.queryByText('Different minds, same prompt.')).toBeNull();
  });

  it('uses the same zero-offset keyboard avoidance as Chat', () => {
    const { renderResult } = renderScreen();

    const keyboardAvoider = renderResult.UNSAFE_getByType(KeyboardAvoider);

    expect(keyboardAvoider.props.keyboardVerticalOffset).toBe(0);
  });

  it('renders header and resumed comparison state with divergent session', async () => {
    const session = createResumedSession({ hasDiverged: true, continuedWithAI: leftAI.name });
    const preloadedState: RootStateOverrides = {
      chat: {
        currentSession: session,
      },
    };

    const { renderResult } = renderScreen({ params: { resuming: true }, preloadedState });

    expect(mockHeader.calls.length).toBeGreaterThan(0);
    expect(mockHeader.latest().slim).toBe(true);
    expect(mockHeader.latest().title).toBe('The Lens');
    expect(renderResult.getByText(leftAI.name)).toBeTruthy();
    expect(renderResult.getByText(rightAI.name)).toBeTruthy();
    expect(mockCompareSplitView.calls.length).toBeGreaterThan(0);
    expect(mockCompareSplitView.latest().viewMode).toBe('left-only');
    expect(mockCompareSplitView.latest().leftMessages[0].content).toBe('Left answer');
    expect(mockCompareSplitView.latest().continuedSide).toBe('left');
    expect(mockChatInput.latest().placeholder).toContain(leftAI.name);
  });

  it('opens the generated content report modal for compare AI messages', async () => {
    const session = createResumedSession();
    const preloadedState: RootStateOverrides = {
      chat: {
        ...createAppStore().getState().chat,
        currentSession: session,
      },
    };

    renderScreen({ params: { resuming: true }, preloadedState });

    expect(mockCompareSplitView.latest().onReportContent).toEqual(expect.any(Function));

    await act(async () => {
      requireDefined(mockCompareSplitView.latest().onReportContent, 'onReportContent')(session.messages[1]);
    });

    await waitFor(() => {
      expect(mockReportModal.latest().visible).toBe(true);
      expect(mockReportModal.latest().target).toMatchObject({
        surface: 'compare',
        contentId: 'm2',
        sessionId: 'compare-session',
        contentText: 'Left answer',
      });
    });
  });

  it('wires stop controls into the compare input bar', () => {
    renderScreen();

    expect(mockChatInput.latest().isProcessing).toBe(false);
    expect(mockChatInput.latest().onStop).toEqual(expect.any(Function));
  });

  it('checkpoints active compare streams without marking them interrupted on app background', async () => {
    mockStreamResponse.mockImplementation(() => new Promise(() => undefined));

    const { renderResult } = renderScreen();

    await act(async () => {
      await mockChatInput.latest().onSend('Compare this');
    });

    await waitFor(() => {
      expect(mockChatInput.latest().isProcessing).toBe(true);
    });

    const compareHandlers = mockLifecycleRegister.mock.calls
      .map(call => call[0])
      .filter(entry => entry.id.startsWith('compare-'));
    const handler = compareHandlers[compareHandlers.length - 1];
    expect(handler).toBeTruthy();

    await act(async () => {
      await requireDefined(requireDefined(handler, 'compare lifecycle handler').onBackground, 'onBackground')('background');
    });

    const savedSnapshot = mockSaveActiveSnapshot.mock.calls[mockSaveActiveSnapshot.mock.calls.length - 1][0];
    expect(savedSnapshot.status).toBe('active');
    expect(savedSnapshot.pendingTurn).toEqual(expect.objectContaining({
      kind: 'compare_response',
      reason: 'app_backgrounded',
    }));
    expect(renderResult.queryByText(/comparison was interrupted/i)).toBeNull();
  });

  it('navigates back when a required AI is missing', () => {
    renderScreen({ params: { rightAI: undefined } });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('dispatches subscription sheet when demo banner is pressed', async () => {
    const store = createAppStore(buildRootState({
      auth: createMockAuthState({ isPremium: false }),
    }));
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    renderScreen({ isDemo: true, store });

    await act(async () => {
      requireDefined(mockDemoBanner.latest().onPress, 'onPress')();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('loads demo sample and sends scripted turn on selection', async () => {
    const sample = { id: 'sample-1', title: 'Demo Sample' };
    mockListSamples.mockResolvedValue([sample]);
    mockFindCompareById.mockResolvedValue(sample);

    const { aiService } = renderScreen({ isDemo: true });

    await waitFor(() => expect(mockDemoSamples.calls.length).toBeGreaterThan(0));

    await act(async () => {
      await mockDemoSamples.latest().onSelect('sample-1');
    });

    expect(mockFindCompareById).toHaveBeenCalledWith('sample-1');
    expect(mockLoadCompareScript).toHaveBeenCalledWith(sample);
    expect(mockPrimeNextCompareTurn).toHaveBeenCalled();
    await waitFor(() => {
      expect(aiService.sendMessage).toHaveBeenCalledTimes(2);
      expect(aiService.sendMessage).toHaveBeenCalledWith(
        leftAI.provider,
        expect.any(String),
        expect.any(Array),
        false,
        undefined,
        undefined,
        resolveProviderModelId(leftAI.provider, leftAI.model) || leftAI.model
      );
      expect(aiService.sendMessage).toHaveBeenCalledWith(
        rightAI.provider,
        expect.any(String),
        expect.any(Array),
        false,
        undefined,
        undefined,
        resolveProviderModelId(rightAI.provider, rightAI.model) || rightAI.model
      );
    });
  });

  it('passes selected personality into compare streaming adapter configs', async () => {
    const georgeLeft = { ...leftAI, personality: 'george' };
    const { aiService } = renderScreen({ params: { leftAI: georgeLeft, rightAI } });

    await act(async () => {
      await mockChatInput.latest().onSend('Compare these options');
    });

    await waitFor(() => expect(mockStreamResponse).toHaveBeenCalled());

    expect(aiService.setPersonality).toHaveBeenCalledWith(
      georgeLeft.provider,
      expect.objectContaining({ id: 'george' })
    );
    expect(aiService.setPersonality).toHaveBeenCalledWith(rightAI.provider, undefined);
    expect(mockStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          provider: georgeLeft.provider,
          personality: expect.objectContaining({
            id: 'george',
            systemPrompt: expect.stringContaining('PG-13 observational satirist'),
          }),
          parameters: expect.objectContaining({ temperature: 0.9 }),
        }),
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('passes compare personality into streaming fallback sendMessage calls', async () => {
    mockStreamResponse.mockImplementation(async (_config, _onChunk, _onComplete, onError) => {
      onError?.(new Error('overload'));
    });
    const georgeLeft = { ...leftAI, personality: 'george' };
    const { aiService } = renderScreen({ params: { leftAI: georgeLeft, rightAI } });

    await act(async () => {
      await mockChatInput.latest().onSend('Compare these options');
    });

    await waitFor(() => {
      expect(aiService.sendMessage).toHaveBeenCalledWith(
        georgeLeft.provider,
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ id: 'george' }),
        undefined,
        undefined,
        resolveProviderModelId(georgeLeft.provider, georgeLeft.model) || georgeLeft.model
      );
    });
  });

  it('auto-sends the composer prompt with staged attachments to both AIs, then clears them', async () => {
    const attachment = {
      type: 'image' as const,
      uri: 'file://staged.png',
      mimeType: 'image/png',
      base64: 'abc',
      fileName: 'staged.png',
    };

    const { store } = renderScreen({
      params: { initialPrompt: 'What is in this image?' },
      preloadedState: {
        composerAttachments: { chat: [], compare: [attachment] },
      },
    });

    await waitFor(() => {
      expect(mockStreamResponse).toHaveBeenCalledTimes(2);
    });
    const [leftConfig] = mockStreamResponse.mock.calls[0];
    const [rightConfig] = mockStreamResponse.mock.calls[1];
    expect(leftConfig).toEqual(expect.objectContaining({ attachments: [attachment] }));
    expect(rightConfig).toEqual(expect.objectContaining({ attachments: [attachment] }));
    // One-shot take: the staged list is cleared so it cannot leak.
    expect(store.getState().composerAttachments.compare).toEqual([]);
  });

  it('saves comparison history after AI responses complete', async () => {
    renderScreen();

    await act(async () => {
      await mockChatInput.latest().onSend('Compare these options');
    });

    await waitFor(() => {
      expect(StorageService.saveSession).toHaveBeenCalledWith(expect.objectContaining({
        sessionType: 'comparison',
        selectedAIs: [leftAI, rightAI],
        messages: expect.arrayContaining([
          expect.objectContaining({ sender: 'You', content: 'Compare these options' }),
          expect.objectContaining({ sender: leftAI.name }),
          expect.objectContaining({ sender: rightAI.name }),
        ]),
      }));
    });
  });

  it('prompts before starting over', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    renderScreen();

    act(() => {
      requireDefined(mockHeader.latest().onBack, 'onBack')();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over',
      expect.stringContaining('end the current comparison'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Start Over', onPress: expect.any(Function) }),
      ]),
    );

    alertSpy.mockRestore();
  });

  // Note: Image generation tests removed - image generation moved to Create mode
});
