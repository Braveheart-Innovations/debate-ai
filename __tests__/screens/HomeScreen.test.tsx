import { act } from '@testing-library/react-native';
import { Text } from 'react-native';
import HomeScreen from '@/screens/HomeScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAIConfig } from '@test-utils/fixtures';
import { showSheet, createAppStore } from '@/store';
import type { AIConfig } from '@/types';
import type { AISelectionConfig } from '@/types/aiSelection';
import type {
  AIComposer,
  Header,
  HeaderActions,
  HomeEmptyState,
  QuickStartSheet,
} from '@/components/organisms';
import type { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import type { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';
import { requireDefined, collectTestIds } from '@test-utils/queries';

const mockUseGreeting = jest.fn();
const mockUseComposerSelection = jest.fn();
const mockUseSessionManagement = jest.fn();
const mockUseQuickStart = jest.fn();
const mockUseFeatureAccess = jest.fn();

const mockHeader = capturePropsOf<typeof Header>((props) => (
  <>
    <Text testID="header">header</Text>
    {props.rightElement ?? null}
  </>
));
const mockHeaderActions = capturePropsOf<typeof HeaderActions>(() => (
  <Text testID="header-actions">actions</Text>
));
const mockComposer = capturePropsOf<typeof AIComposer>(() => <Text testID="ai-composer">composer</Text>);
const mockEmptyState = capturePropsOf<typeof HomeEmptyState>(() => (
  <Text testID="home-empty-state">empty-state</Text>
));
const mockQuickStartSheet = capturePropsOf<typeof QuickStartSheet>((props) => (
  <Text testID="quick-start-sheet">{props.visible ? 'visible' : 'hidden'}</Text>
));
const mockDemoBanner = capturePropsOf<typeof DemoBanner>((props) => (
  <Text testID="demo-banner" onPress={props.onPress}>demo-banner</Text>
));
const mockChatTopicPicker = capturePropsOf<typeof ChatTopicPickerModal>((props) => (
  <Text testID="topic-picker">{props.visible ? 'visible' : 'hidden'}</Text>
));

/** An optional prop the screen is expected to have provided. */
jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: (...args: unknown[]) => mockUseGreeting(...args),
}));

jest.mock('@/hooks/home/useComposerSelection', () => ({
  useComposerSelection: (...args: unknown[]) => mockUseComposerSelection(...args),
}));

jest.mock('@/hooks/home/useSessionManagement', () => ({
  useSessionManagement: (...args: unknown[]) => mockUseSessionManagement(...args),
}));

jest.mock('@/hooks/home/useQuickStart', () => ({
  useQuickStart: (...args: unknown[]) => mockUseQuickStart(...args),
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

jest.mock('@/components/organisms', () => ({
  get Header() {
    return mockHeader.Stub;
  },
  get HeaderActions() {
    return mockHeaderActions.Stub;
  },
  get AIComposer() {
    return mockComposer.Stub;
  },
  get HomeEmptyState() {
    return mockEmptyState.Stub;
  },
  get QuickStartSheet() {
    return mockQuickStartSheet.Stub;
  },
}));

jest.mock('@/components/molecules/subscription/TrialBanner', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    TrialBanner: () => React.createElement(Text, { testID: 'trial-banner' }, 'trial-banner'),
    __esModule: true,
    default: () => React.createElement(Text, { testID: 'trial-banner' }, 'trial-banner'),
  };
});

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  get DemoBanner() {
    return mockDemoBanner.Stub;
  },
  __esModule: true,
  get default() {
    return mockDemoBanner.Stub;
  },
}));

jest.mock('@/components/organisms/demo/ChatTopicPickerModal', () => ({
  get ChatTopicPickerModal() {
    return mockChatTopicPicker.Stub;
  },
  __esModule: true,
  get default() {
    return mockChatTopicPicker.Stub;
  },
}));

const createAIConfig = (overrides: Partial<AIConfig> = {}): AIConfig =>
  createMockAIConfig({ id: 'anthropic', model: 'claude-model', ...overrides });

const createSelectionConfig = (overrides: Partial<AISelectionConfig> = {}): AISelectionConfig => ({
  providerId: 'anthropic',
  modelId: 'claude-model',
  personalityId: 'default',
  ...overrides,
});

const createSelection = (overrides: Record<string, unknown> = {}) => ({
  configs: [] as AISelectionConfig[],
  configuredAIs: [] as AIConfig[],
  addProvider: jest.fn(),
  updateConfig: jest.fn(),
  removeConfig: jest.fn(),
  replaceConfigs: jest.fn(),
  selectedAIConfigs: [] as AIConfig[],
  sessionMaps: { personalities: {}, models: {} },
  hasEnoughAIs: false,
  hydrated: true,
  isDemo: false,
  ...overrides,
});

const createQuickStart = (overrides: Record<string, unknown> = {}) => ({
  templates: [
    {
      id: 'brainstorm',
      title: 'Brainstorm',
      subtitle: 'Generate ideas',
      icon: 'bulb-outline',
      buildAIPrompt: jest.fn(),
    },
  ],
  showSheet: false,
  openSheet: jest.fn(),
  closeSheet: jest.fn(),
  reset: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true),
  buildPrompt: jest.fn().mockReturnValue({
    templateId: 'brainstorm',
    userPrompt: 'app ideas',
    aiPrompt: 'Brainstorm app ideas with structure.',
  }),
  templateCount: 1,
  getStatus: jest.fn(),
  ...overrides,
});

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeader.reset();
    mockHeaderActions.reset();
    mockComposer.reset();
    mockEmptyState.reset();
    mockQuickStartSheet.reset();
    mockDemoBanner.reset();
    mockChatTopicPicker.reset();
  });

  const baseGreeting = {
    timeBasedGreeting: 'Good afternoon',
    welcomeMessage: 'Ready for a new debate?',
    greeting: {
      timeBasedGreeting: 'Good afternoon',
      welcomeMessage: 'Ready for a new debate?',
    },
  };

  const renderHome = (options?: {
    selection?: ReturnType<typeof createSelection>;
    quickStart?: ReturnType<typeof createQuickStart>;
    featureAccess?: Record<string, unknown>;
    session?: Record<string, unknown>;
    navigation?: { navigate: jest.Mock };
    store?: ReturnType<typeof createAppStore>;
  }) => {
    const selection = options?.selection ?? createSelection();
    mockUseComposerSelection.mockReturnValue(selection);

    const quickStart = options?.quickStart ?? createQuickStart();
    mockUseQuickStart.mockReturnValue(quickStart);

    const featureAccess = { isDemo: false, ...options?.featureAccess };
    mockUseFeatureAccess.mockReturnValue(featureAccess);

    const session = { createSession: jest.fn().mockReturnValue('session-123'), ...options?.session };
    mockUseSessionManagement.mockReturnValue(session);

    mockUseGreeting.mockReturnValue(baseGreeting);

    const navigation = options?.navigation ?? { navigate: jest.fn() };

    const store = options?.store ?? createAppStore();

    const renderResult = renderWithProviders(<HomeScreen navigation={navigation} />, { store });

    return {
      renderResult,
      selection,
      quickStart,
      featureAccess,
      session,
      navigation,
      store,
    };
  };

  it('renders the slim header and wires the composer for chat mode', () => {
    renderHome();

    // Cap is the product constant (3), not min(3, keyed providers) — the
    // picker's "Add key" rows must stay reachable via [+].
    expect(mockUseComposerSelection).toHaveBeenCalledWith('chat', {
      minAIs: 1,
      maxAIs: 3,
    });
    expect(mockHeader.calls).not.toHaveLength(0);
    expect(mockHeader.latest().slim).toBe(true);
    expect(mockHeader.latest().title).toBe('The Forum');
    expect(mockHeaderActions.latest().variant).toBe('gradient');
    expect(mockHeaderActions.latest().helpCategoryId).toBe('chat');
    expect(mockComposer.latest().mode).toBe('chat');
    expect(mockComposer.latest().maxAIs).toBe(3);
    expect(mockComposer.latest().minAIs).toBe(1);
    expect(mockComposer.latest().requireText).toBe(true);
  });

  it('places the trial banner between the header and the empty state', () => {
    const { renderResult } = renderHome({
      featureAccess: { isDemo: false, isInTrial: true, trialDaysRemaining: 1 },
    });

    const testIds = collectTestIds(renderResult.toJSON());

    expect(testIds.indexOf('header')).toBeGreaterThanOrEqual(0);
    expect(testIds.indexOf('trial-banner')).toBeGreaterThanOrEqual(0);
    expect(testIds.indexOf('header')).toBeLessThan(testIds.indexOf('trial-banner'));
    expect(testIds.indexOf('trial-banner')).toBeLessThan(testIds.indexOf('home-empty-state'));
    expect(testIds.indexOf('home-empty-state')).toBeLessThan(testIds.indexOf('ai-composer'));
  });

  it('does not start a session when sending without enough AIs', async () => {
    const navigation = { navigate: jest.fn() };
    const session = { createSession: jest.fn() };
    const selection = createSelection({ hasEnoughAIs: false });

    renderHome({ navigation, session, selection });

    await act(async () => {
      mockComposer.latest().onSend('hello');
    });

    expect(session.createSession).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(mockChatTopicPicker.calls).toHaveLength(0);
  });

  it('creates a session and navigates to chat with the auto-send rail on send', async () => {
    const navigation = { navigate: jest.fn() };
    const selectedAIConfigs = [createAIConfig()];
    const sessionMaps = { personalities: { anthropic: 'default' }, models: { anthropic: 'claude-model' } };
    const session = { createSession: jest.fn().mockReturnValue('session-456') };
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig()],
      selectedAIConfigs,
      sessionMaps,
    });

    renderHome({ navigation, session, selection });

    await act(async () => {
      mockComposer.latest().onSend('What is the meaning of life?');
    });

    expect(session.createSession).toHaveBeenCalledWith(selectedAIConfigs, sessionMaps);
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      sessionId: 'session-456',
      initialPrompt: 'What is the meaning of life?',
      userPrompt: 'What is the meaning of life?',
      autoSend: true,
    });
  });

  it('stages composer attachments in Redux and keeps them out of nav params', async () => {
    const navigation = { navigate: jest.fn() };
    const session = { createSession: jest.fn().mockReturnValue('session-789') };
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig()],
      selectedAIConfigs: [createAIConfig()],
    });
    const attachment = {
      type: 'image' as const,
      uri: 'file://photo.png',
      mimeType: 'image/png',
      base64: 'abc',
      fileName: 'photo.png',
    };

    const { store } = renderHome({ navigation, session, selection });

    expect(mockComposer.latest().allowAttachments).toBe(true);

    await act(async () => {
      mockComposer.latest().onSend('What is in this photo?', [attachment]);
    });

    expect(store.getState().composerAttachments.chat).toEqual([attachment]);
    // Nav state is persisted to AsyncStorage — base64 must never ride params.
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      sessionId: 'session-789',
      initialPrompt: 'What is in this photo?',
      userPrompt: 'What is in this photo?',
      autoSend: true,
    });

    // A later attachment-less send overwrites the staged list.
    await act(async () => {
      mockComposer.latest().onSend('Plain follow-up');
    });
    expect(store.getState().composerAttachments.chat).toEqual([]);
  });

  it('opens the topic picker instead of a live session in demo mode', async () => {
    const session = { createSession: jest.fn() };
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig()],
      selectedAIConfigs: [createAIConfig()],
    });

    renderHome({ session, selection, featureAccess: { isDemo: true } });

    expect(mockChatTopicPicker.latest().visible).toBe(false);
    expect(mockComposer.latest().requireText).toBe(false);
    expect(mockComposer.latest().allowAttachments).toBe(false);

    await act(async () => {
      mockComposer.latest().onSend('');
    });

    expect(session.createSession).not.toHaveBeenCalled();
    expect(mockChatTopicPicker.latest().visible).toBe(true);
    expect(mockChatTopicPicker.latest().providers).toEqual(['claude']);
  });

  it('passes single AI personality to topic picker when available', async () => {
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig({ personalityId: 'friendly' })],
      selectedAIConfigs: [createAIConfig()],
    });

    renderHome({ selection, featureAccess: { isDemo: true } });

    await act(async () => {
      mockComposer.latest().onSend('');
    });

    expect(mockChatTopicPicker.latest().personaId).toBe('friendly');
  });

  it('does not forward persona when multiple AIs selected', async () => {
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [
        createSelectionConfig({ personalityId: 'friendly' }),
        createSelectionConfig({ providerId: 'openai', personalityId: 'succinct' }),
      ],
      selectedAIConfigs: [
        createAIConfig(),
        createAIConfig({ id: 'openai', provider: 'openai' }),
      ],
    });

    renderHome({ selection, featureAccess: { isDemo: true } });

    await act(async () => {
      mockComposer.latest().onSend('');
    });

    expect(mockChatTopicPicker.latest().personaId).toBeUndefined();
  });

  it('exposes Quick Start on the empty state when AIs are ready', async () => {
    const quickStart = createQuickStart();
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig()],
      selectedAIConfigs: [createAIConfig()],
    });

    renderHome({ selection, quickStart });

    expect(mockEmptyState.latest().onQuickStart).toBeDefined();

    await act(async () => {
      requireDefined(mockEmptyState.latest().onQuickStart, 'onQuickStart')();
    });

    expect(quickStart.openSheet).toHaveBeenCalled();
  });

  it('hides Quick Start in demo mode and when no AIs are selected', () => {
    renderHome({
      selection: createSelection({ hasEnoughAIs: true, selectedAIConfigs: [createAIConfig()] }),
      featureAccess: { isDemo: true },
    });
    expect(mockEmptyState.latest().onQuickStart).toBeUndefined();

    renderHome({ selection: createSelection({ hasEnoughAIs: false }) });
    expect(mockEmptyState.latest().onQuickStart).toBeUndefined();
  });

  it('passes quick start sheet props correctly', () => {
    const quickStart = createQuickStart({ showSheet: true });

    renderHome({ quickStart });

    expect(mockQuickStartSheet.latest().visible).toBe(true);
    expect(mockQuickStartSheet.latest().templates).toEqual(quickStart.templates);
    expect(mockQuickStartSheet.latest().onStart).toBeDefined();
    expect(mockQuickStartSheet.latest().onClose).toBeDefined();
  });

  it('handles quick start completion when selection exists', async () => {
    const selectedAIConfigs = [createAIConfig()];
    const sessionMaps = { personalities: { anthropic: 'default' }, models: { anthropic: 'claude-model' } };
    const session = { createSession: jest.fn().mockReturnValue('session-789') };
    const quickStart = createQuickStart({ showSheet: true, closeSheet: jest.fn() });
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig()],
      selectedAIConfigs,
      sessionMaps,
    });
    const navigation = { navigate: jest.fn() };

    renderHome({ selection, quickStart, session, navigation });

    await act(async () => {
      mockQuickStartSheet.latest().onStart({
        templateId: 'brainstorm',
        userPrompt: 'user prompt',
        aiPrompt: 'ai prompt',
      });
    });

    expect(session.createSession).toHaveBeenCalledWith(selectedAIConfigs, sessionMaps);
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      sessionId: 'session-789',
      initialPrompt: 'ai prompt',
      userPrompt: 'user prompt',
      autoSend: true,
    });
    expect(quickStart.closeSheet).toHaveBeenCalled();
  });

  it('closes quick start sheet without navigation when no AI is selected', async () => {
    const quickStart = createQuickStart({ showSheet: true, closeSheet: jest.fn() });
    const session = { createSession: jest.fn() };
    const navigation = { navigate: jest.fn() };

    renderHome({ quickStart, session, navigation });

    await act(async () => {
      mockQuickStartSheet.latest().onStart({
        templateId: 'brainstorm',
        userPrompt: 'user prompt',
        aiPrompt: 'ai prompt',
      });
    });

    expect(session.createSession).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(quickStart.closeSheet).toHaveBeenCalled();
  });

  it('dispatches subscription sheet when demo banner is pressed', async () => {
    const store = createAppStore();
    const dispatchSpy = jest.spyOn(store, 'dispatch');
    renderHome({ featureAccess: { isDemo: true }, store });

    await act(async () => {
      requireDefined(mockDemoBanner.latest().onPress, 'onPress')();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('does not show trial-start copy in the demo banner after the trial was used', () => {
    renderHome({ featureAccess: { isDemo: true, canStartTrial: false } });

    expect(mockDemoBanner.latest().subtitle).toBe('Simulated chat preview. Upgrade to Premium to chat for real.');
  });

  it('restricts the provider picker to configured demo providers', () => {
    const configuredAIs = [createAIConfig(), createAIConfig({ id: 'openai', provider: 'openai' })];
    renderHome({
      selection: createSelection({ configuredAIs }),
      featureAccess: { isDemo: true },
    });

    expect(mockComposer.latest().allowedProviderIds).toEqual(['anthropic', 'openai']);
    expect(mockComposer.latest().onRequestAddKey).toBeUndefined();
    expect(mockComposer.latest().showAdvancedParams).toBe(false);
  });

  it('creates demo session from topic picker selection and closes modal', async () => {
    const selectedAIConfigs = [createAIConfig()];
    const sessionMaps = { personalities: { anthropic: 'friendly' }, models: { anthropic: 'claude-model' } };
    const session = { createSession: jest.fn().mockReturnValue('session-demo') };
    const navigation = { navigate: jest.fn() };
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig({ personalityId: 'friendly' })],
      selectedAIConfigs,
      sessionMaps,
    });

    renderHome({ selection, session, navigation, featureAccess: { isDemo: true } });

    await act(async () => {
      mockComposer.latest().onSend('');
    });

    expect(mockChatTopicPicker.latest().visible).toBe(true);

    await act(async () => {
      mockChatTopicPicker.latest().onSelect('sample-123', 'Sample');
    });

    expect(session.createSession).toHaveBeenCalledWith(selectedAIConfigs, sessionMaps);
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      sessionId: 'session-demo',
      demoSampleId: 'sample-123',
    });
    expect(mockChatTopicPicker.latest().visible).toBe(false);
  });

  it('hides topic picker when closed without selection', async () => {
    const selection = createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig()],
      selectedAIConfigs: [createAIConfig()],
    });

    renderHome({ selection, featureAccess: { isDemo: true } });

    await act(async () => {
      mockComposer.latest().onSend('');
    });

    expect(mockChatTopicPicker.latest().visible).toBe(true);

    await act(async () => {
      mockChatTopicPicker.latest().onClose();
    });

    expect(mockChatTopicPicker.latest().visible).toBe(false);
  });

  it('routes to API config from the empty-state CTA and the composer add-key action', async () => {
    const navigation = { navigate: jest.fn() };

    renderHome({ navigation });

    await act(async () => {
      mockEmptyState.latest().onConfigureAIs();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('APIConfig');

    await act(async () => {
      requireDefined(mockComposer.latest().onRequestAddKey, 'onRequestAddKey')();
    });
    expect(navigation.navigate).toHaveBeenCalledTimes(2);
    expect(navigation.navigate).toHaveBeenLastCalledWith('APIConfig');
  });
});
