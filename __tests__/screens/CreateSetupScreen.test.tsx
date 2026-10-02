/**
 * Tests for CreateSetupScreen - composer-first Studio setup screen.
 * Image tab: ComposerShell pills + options sheet. Video/audio: legacy forms.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

// Mock dispatch and selector
const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();
const mockUseFeatureAccess = jest.fn();
const mockNavigate = jest.fn();
const mockGetApiKey = jest.fn();
const mockListElevenLabsOptions = jest.fn();
const mockGetElevenLabsSubscription = jest.fn();
const mockGenerateCreateImages = jest.fn((payload) => ({
  type: 'create/generateCreateImages',
  payload,
  unwrap: jest.fn().mockResolvedValue({ ids: ['img_done'], entries: [], failedProviders: [] }),
}));

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: any) => any) => mockUseSelector(selector),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
  }),
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
    timeBasedGreeting: 'Create something',
    welcomeMessage: 'Pick your AI',
    greeting: {
      timeBasedGreeting: 'Create something',
      welcomeMessage: 'Pick your AI',
    },
  }),
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

jest.mock('@/services/create/CreateSelectionPersistenceService', () => {
  const service = { load: jest.fn(), save: jest.fn() };
  return {
    __esModule: true,
    CreateSelectionPersistenceService: service,
    default: service,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: any) => React.createElement(Text, { testID: `icon-${props.name}` }, props.name),
  };
});

jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Slider = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: Slider };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Header/HeaderActions stay stubbed; the Studio's own composer stack renders
// for real so pills, sheets, and the status card are exercised end-to-end.
jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const { CreateComposer } = jest.requireActual('@/components/organisms/create/CreateComposer');
  const { CreateEmptyState } = jest.requireActual('@/components/organisms/create/CreateEmptyState');
  const {
    CreateGenerationStatusCard,
  } = jest.requireActual('@/components/organisms/create/CreateGenerationStatusCard');
  const { CreateMediaTabs } = jest.requireActual('@/components/organisms/create/CreateMediaTabs');
  const { CreateOptionsSheet } = jest.requireActual('@/components/organisms/create/CreateOptionsSheet');
  const { CreateMediaStatusCard } = jest.requireActual('@/components/organisms/create/CreateMediaStatusCard');
  const { VideoConfigSheet } = jest.requireActual('@/components/organisms/create/VideoConfigSheet');
  const { AudioConfigSheet } = jest.requireActual('@/components/organisms/create/AudioConfigSheet');
  return {
    Header: (props: any) =>
      React.createElement(
        View,
        { testID: 'header-container' },
        React.createElement(Text, { testID: 'header' }, props.title),
        props.rightElement
      ),
    HeaderActions: () => null,
    CreateComposer,
    CreateEmptyState,
    CreateGenerationStatusCard,
    CreateMediaTabs,
    CreateOptionsSheet,
    CreateMediaStatusCard,
    VideoConfigSheet,
    AudioConfigSheet,
  };
});

jest.mock('@/components/organisms/common/AIAvatar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { AIAvatar: (props: any) => React.createElement(View, { testID: `ai-avatar-${props.providerId || ''}` }) };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    KeyboardAvoider: ({ children }: { children?: import('react').ReactNode }) => require('react').createElement(require('react').Fragment, null, children),
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
    Badge: ({ label }: { label: string }) =>
      React.createElement(Text, { testID: `badge-${label}` }, label),
    GradientButton: (props: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: 'gradient-button', onPress: props.onPress, disabled: props.disabled },
        React.createElement(Text, null, props.title)
      ),
    HeaderIcon: (props: any) =>
      React.createElement(TouchableOpacity, { testID: props.testID, onPress: props.onPress }),
    SectionHeader: (props: any) =>
      React.createElement(Text, { testID: 'section-header' }, props.title),
    InfoButton: (props: any) =>
      React.createElement(TouchableOpacity, { testID: props.testID || `info-${props.topicId}` }),
    ImageModelSelector: (props: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: 'image-model-selector', onPress: () => props.onSelectModel?.('picked-model') },
        React.createElement(Text, null, props.selectedModel || 'model')
      ),
    SheetHeader: (props: any) =>
      React.createElement(
        View,
        { testID: 'sheet-header' },
        React.createElement(Text, null, props.title),
        React.createElement(TouchableOpacity, { testID: 'sheet-header-close', onPress: props.onClose })
      ),
    SegmentedControl: (props: any) =>
      React.createElement(View, { testID: 'segmented-control' },
        props.options.map((option: any) =>
          React.createElement(
            TouchableOpacity,
            {
              key: option.value,
              testID: `segment-${option.value}`,
              onPress: () => props.onChange(option.value),
            },
            React.createElement(Text, null, option.label)
          )
        )
      ),
    AIPill: (props: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: props.testID, onPress: props.onPress },
        React.createElement(Text, null, props.name)
      ),
    AddAIPill: (props: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: props.testID, onPress: props.onPress },
        React.createElement(Text, null, '+ Add AI')
      ),
    ComposerValidationHint: (props: any) =>
      React.createElement(Text, { testID: props.testID }, props.message),
    MicButton: (props: { testID?: string; onPress?: () => void }) =>
      React.createElement(TouchableOpacity, { testID: props.testID, onPress: props.onPress }),
    AttachmentChip: (props: any) =>
      React.createElement(
        View,
        { testID: props.testID },
        React.createElement(TouchableOpacity, {
          testID: props.testID ? `${props.testID}-remove` : undefined,
          onPress: props.onRemove,
        })
      ),
  };
});

jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'openai', name: 'OpenAI', company: 'OpenAI', color: '#10A37F', enabled: true },
    { id: 'google', name: 'Google', company: 'Google', color: '#4285F4', enabled: true },
    { id: 'grok', name: 'Grok', company: 'xAI', color: '#000000', enabled: true },
  ],
  getProviderById: (id: string) =>
    [
      { id: 'openai', name: 'OpenAI', company: 'OpenAI', color: '#10A37F', enabled: true },
      { id: 'google', name: 'Google', company: 'Google', color: '#4285F4', enabled: true },
      { id: 'grok', name: 'Grok', company: 'xAI', color: '#000000', enabled: true },
    ].find((provider) => provider.id === id),
}));

jest.mock('@/config/create/stylePresets', () => ({
  STYLE_PRESETS: [
    { id: 'none', label: 'None', icon: 'close-circle-outline', promptSuffix: '' },
    { id: 'photo', label: 'Photo', icon: 'camera-outline', promptSuffix: 'Photorealistic' },
  ],
}));

jest.mock('@/config/create/sizeOptions', () => ({
  SIZE_OPTIONS: [
    { id: 'auto', label: 'Auto', description: 'Provider default', icon: 'resize-outline', preview: 'Auto' },
    { id: 'square', label: 'Square', description: 'Perfect square', icon: 'square-outline', preview: '1:1' },
  ],
}));

const mockImageModels: Record<string, Array<Record<string, unknown>>> = {
  openai: [
    {
      id: 'gpt-image-2',
      displayName: 'GPT Image 2',
      supportsImageInput: true,
      supportsMultipleReferenceImages: true,
      maxImagesPerRequest: 4,
      maxReferenceImages: 5,
      qualityOptions: ['auto', 'low', 'medium', 'high'],
      outputFormats: ['png', 'jpeg', 'webp'],
      supportsOutputCompression: true,
      backgroundOptions: ['auto', 'opaque'],
      moderationOptions: ['auto', 'low'],
      resolutions: ['1K', '2K'],
    },
  ],
  google: [
    {
      id: 'gemini-2.5-flash-image',
      displayName: 'Gemini Flash Image',
      supportsImageInput: true,
      maxImagesPerRequest: 1,
      maxReferenceImages: 1,
      qualityOptions: ['auto'],
      outputFormats: ['png'],
      backgroundOptions: ['auto'],
      moderationOptions: ['auto'],
      resolutions: [],
    },
    {
      id: 'imagen-4.0-generate-001',
      displayName: 'Imagen 4',
      supportsImageInput: false,
      maxImagesPerRequest: 1,
      maxReferenceImages: 0,
      qualityOptions: ['auto'],
      outputFormats: ['png'],
      backgroundOptions: ['auto'],
      moderationOptions: ['auto'],
      resolutions: ['1K'],
    },
  ],
  grok: [
    {
      id: 'grok-imagine-image',
      displayName: 'Grok Imagine',
      supportsImageInput: true,
      supportsMultipleReferenceImages: true,
      maxImagesPerRequest: 10,
      maxReferenceImages: 3,
      qualityOptions: ['auto'],
      outputFormats: ['png'],
      backgroundOptions: ['auto'],
      moderationOptions: ['auto'],
      resolutions: ['1K', '2K'],
    },
  ],
};

const mockDefaultModelIds: Record<string, string> = {
  openai: 'gpt-image-2',
  google: 'gemini-2.5-flash-image',
  grok: 'grok-imagine-image',
};

jest.mock('@/config/imageGenerationModels', () => ({
  IMAGE_MODELS: mockImageModels,
  getImageModels: (provider: string) => mockImageModels[provider] || [],
  getImageInputModels: (provider: string) =>
    (mockImageModels[provider] || []).filter((model) => model.supportsImageInput),
  getDefaultImageModel: (provider: string) =>
    (mockImageModels[provider] || []).find((model) => model.id === mockDefaultModelIds[provider]),
  getImageProviderDisplayName: (provider: string, options?: { includeModel?: boolean; modelId?: string }) => {
    const names: Record<string, string> = { openai: 'ChatGPT', google: 'Gemini', grok: 'Grok' };
    if (!options?.includeModel) return names[provider] || provider;
    const model = (mockImageModels[provider] || []).find((item) => item.id === options.modelId);
    return model ? `${names[provider] || provider} (${model.displayName})` : names[provider] || provider;
  },
  getResolvedImageModel: (provider: string, modelId?: string) => {
    const resolvedId = modelId || mockDefaultModelIds[provider];
    return (mockImageModels[provider] || []).find((model) => model.id === resolvedId);
  },
  resolveImageModelId: (provider: string, modelId?: string) => {
    if (modelId && (mockImageModels[provider] || []).some((model) => model.id === modelId)) {
      return modelId;
    }
    return mockDefaultModelIds[provider];
  },
  supportsImageGeneration: (provider: string) => ['openai', 'google', 'grok'].includes(provider),
  supportsImageInput: (provider: string, modelId?: string) => {
    const resolvedId = modelId || mockDefaultModelIds[provider];
    return Boolean(
      (mockImageModels[provider] || []).find((model) => model.id === resolvedId)?.supportsImageInput
    );
  },
}));

jest.mock('@/utils/aiProviderAssets', () => ({
  getAIProviderIcon: () => ({ iconType: 'letter', icon: 'O' }),
}));

jest.mock('@/store/createSlice', () => ({
  generateCreateImages: (payload: unknown) => mockGenerateCreateImages(payload),
  setActiveCreateTab: jest.fn((tab) => ({ type: 'create/setActiveCreateTab', payload: tab })),
  markCreateActivitySeen: jest.fn(() => ({ type: 'create/markCreateActivitySeen' })),
  hydrateGallery: jest.fn(() => ({ type: 'create/hydrateGallery' })),
  hydrateMediaGallery: jest.fn(() => ({ type: 'create/hydrateMediaGallery' })),
  backfillVideoThumbnails: jest.fn(() => ({ type: 'create/backfillVideoThumbnails' })),
  clearFinishedGenerations: jest.fn(() => ({ type: 'create/clearFinishedGenerations' })),
  generateCreateVideo: jest.fn((payload) => ({ type: 'create/generateCreateVideo', payload, unwrap: jest.fn() })),
  generateCreateAudio: jest.fn((payload) => ({ type: 'create/generateCreateAudio', payload, unwrap: jest.fn() })),
  selectCreateState: (state: any) => state.create,
}));

jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: {
    getKey: (...args: unknown[]) => mockGetApiKey(...args),
  },
}));

jest.mock('@/services/media/MediaGenerationService', () => ({
  __esModule: true,
  default: {
    listElevenLabsOptions: (...args: unknown[]) => mockListElevenLabsOptions(...args),
    getElevenLabsSubscription: (...args: unknown[]) => mockGetElevenLabsSubscription(...args),
  },
}));

const CreateSetupScreen = require('@/screens/CreateSetupScreen').default;

describe('CreateSetupScreen', () => {
  const baseCreateSelection = {
    image: [],
    imageOptions: { style: 'none', size: 'auto', count: 1 },
    videoOptions: { modelId: 'gen4.5', durationSeconds: 5, aspectRatio: '1280:720' },
    audioOptions: {
      operation: 'text_to_speech',
      ttsModelId: 'eleven_flash_v2_5',
      sfxModelId: 'eleven_text_to_sound_v2',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb',
      outputFormat: 'mp3_44100_128',
      promptInfluence: 0.3,
    },
    attachments: { image: [], video: [], audio: [] },
    hydrated: true,
  };

  const baseState = {
    navigation: { activeSheet: null, sheetVisible: false, helpModalHostCount: 0 },
    settings: {
      apiKeys: { openai: 'key-1', google: 'key-2', grok: 'key-3' },
      verifiedProviders: ['openai', 'google', 'grok'],
    },
    createSelection: baseCreateSelection,
    create: {
      gallery: [],
      galleryHydrated: true,
      mediaGallery: [],
      mediaGalleryHydrated: true,
      imageGeneration: null,
      mediaGeneration: { video: null, audio: null },
      lastImageGenerationResult: undefined,
      activeTab: 'image',
      createActivity: { status: 'idle', hasUnseenActivity: false },
    },
  };

  const stateWith = (overrides: {
    create?: Record<string, unknown>;
    createSelection?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }) => ({
    ...baseState,
    settings: { ...baseState.settings, ...overrides.settings },
    createSelection: { ...baseState.createSelection, ...overrides.createSelection },
    create: { ...baseState.create, ...overrides.create },
  });

  const mockStateWith = (overrides: Parameters<typeof stateWith>[0]) => {
    const state = stateWith(overrides);
    mockUseSelector.mockImplementation((selector) => selector(state));
  };

  const imageSelection = (providerId: string, modelId?: string, settings?: Record<string, unknown>) => ({
    providerId,
    modelId: modelId || mockDefaultModelIds[providerId],
    ...(settings ? { settings } : {}),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    mockNavigate.mockClear();
    mockGenerateCreateImages.mockClear();
    mockDispatch.mockImplementation((action) => action);
    mockUseSelector.mockImplementation((selector) => selector(baseState));
    mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'premium', isDemo: false, isPremium: true });
    mockGetApiKey.mockResolvedValue('eleven-key');
    mockGetElevenLabsSubscription.mockResolvedValue({
      characterCount: 100,
      characterLimit: 1000,
      remainingCredits: 900,
      overageAllowed: false,
    });
    mockListElevenLabsOptions.mockResolvedValue({
      voices: [
        { id: 'voice_a', name: 'Narrator A', description: 'Warm narration' },
        { id: 'voice_b', name: 'Narrator B', description: 'Bright narration' },
      ],
      voiceHasMore: false,
      voiceNextPageToken: null,
      voiceTotalCount: 2,
      models: [
        {
          id: 'eleven_v3',
          label: 'Eleven v3',
          description: 'Expressive TTS model',
          mediaType: 'audio',
          operations: ['text_to_speech'],
        },
        {
          id: 'eleven_multilingual_v2',
          label: 'Multilingual v2',
          description: 'Default high-quality TTS model',
          mediaType: 'audio',
          operations: ['text_to_speech'],
        },
        {
          id: 'eleven_text_to_sound_v2',
          label: 'Text to Sound v2',
          description: 'Default sound effects model',
          mediaType: 'audio',
          operations: ['sound_effect'],
        },
      ],
    });
  });

  describe('rendering', () => {
    it('renders header with correct title', () => {
      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('header')).toBeTruthy();
      expect(getByText('The Studio')).toBeTruthy();
    });

    it('renders the docked composer with input, add pill, attach, and send', () => {
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-composer')).toBeTruthy();
      expect(getByTestId('create-composer-input')).toBeTruthy();
      expect(getByTestId('create-composer-add-ai')).toBeTruthy();
      expect(getByTestId('create-composer-send')).toBeTruthy();
      // Image tab exposes the direct attach affordance (parity with video).
      expect(getByTestId('create-composer-attach')).toBeTruthy();
    });

    it('renders a pill for each persisted image provider', () => {
      mockStateWith({
        createSelection: { image: [imageSelection('openai'), imageSelection('google')] },
      });
      const { getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('OpenAI')).toBeTruthy();
      expect(getByText('Google')).toBeTruthy();
    });

    it('shows the empty-state greeting instead of inline setup sections', () => {
      const { getByText, queryByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('Create something')).toBeTruthy();
      // Output controls live in sheets, not inline.
      expect(queryByTestId('create-image-count-slider')).toBeNull();
      expect(queryByTestId('segmented-control')).toBeNull();
    });

    it('validates the empty lineup with composer copy', () => {
      const { getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('Add an AI to create images')).toBeTruthy();
    });
  });

  describe('demo mode gating', () => {
    it('shows upgrade gate for demo users', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'demo', isDemo: true, isPremium: false });
      const { getAllByText, getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getAllByText('The Studio')).toHaveLength(2);
      expect(getByText('Upgrade to Premium')).toBeTruthy();
    });

    it('allows trial users to access (trial = premium access)', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'trial', isDemo: false, isPremium: true });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-composer')).toBeTruthy();
    });

    it('allows premium users to access', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'premium', isDemo: false, isPremium: true });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-composer')).toBeTruthy();
    });
  });

  describe('AI provider selection', () => {
    it('adds a provider with its default model through the picker sheet', () => {
      const { getByTestId, getByText, getByLabelText } = renderWithProviders(<CreateSetupScreen />);

      fireEvent.press(getByTestId('create-composer-add-ai'));
      expect(getByText('Add an AI')).toBeTruthy();
      fireEvent.press(getByLabelText('OpenAI'));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/addImageSelection',
          payload: { providerId: 'openai', modelId: 'gpt-image-2' },
        })
      );
    });

    it('opens the per-pill config sheet with capability copy and model selector', () => {
      mockStateWith({ createSelection: { image: [imageSelection('openai')] } });
      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      fireEvent.press(getByTestId('create-composer-pill-0'));
      expect(getByTestId('image-model-selector')).toBeTruthy();
      expect(getByText(/Can edit images and use references/)).toBeTruthy();
    });

    it('removes a pill from its config sheet', () => {
      mockStateWith({ createSelection: { image: [imageSelection('openai')] } });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);

      fireEvent.press(getByTestId('create-composer-pill-0'));
      fireEvent.press(getByTestId('create-composer-config-remove'));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/removeImageSelection',
          payload: { index: 0 },
        })
      );
    });

    it('routes model changes through updateImageSelection', () => {
      mockStateWith({ createSelection: { image: [imageSelection('google')] } });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);

      fireEvent.press(getByTestId('create-composer-pill-0'));
      fireEvent.press(getByTestId('image-model-selector'));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/updateImageSelection',
          payload: {
            index: 0,
            config: expect.objectContaining({ providerId: 'google', modelId: 'picked-model' }),
          },
        })
      );
    });
  });

  describe('output options sheet', () => {
    it('dispatches style and frame changes from the options sheet', () => {
      mockStateWith({ createSelection: { image: [imageSelection('openai')] } });
      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      fireEvent.press(getByTestId('create-composer-options'));
      expect(getByTestId('create-options-sheet')).toBeTruthy();

      fireEvent.press(getByText('Photo'));
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setImageOptions',
          payload: { style: 'photo' },
        })
      );

      fireEvent.press(getByText('Square'));
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setImageOptions',
          payload: { size: 'square' },
        })
      );
    });

    it('shows the count slider only when the lineup allows multiple images', () => {
      mockStateWith({ createSelection: { image: [imageSelection('openai')] } });
      const multi = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(multi.getByTestId('create-composer-options'));
      expect(multi.getByTestId('create-image-count-slider')).toBeTruthy();
      multi.unmount();

      mockStateWith({
        createSelection: { image: [imageSelection('google', 'imagen-4.0-generate-001')] },
      });
      const single = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(single.getByTestId('create-composer-options'));
      expect(single.queryByTestId('create-image-count-slider')).toBeNull();
    });
  });

  describe('generation', () => {
    it('does not send without a prompt', () => {
      mockStateWith({ createSelection: { image: [imageSelection('openai')] } });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('create-composer-send'));
      expect(mockGenerateCreateImages).not.toHaveBeenCalled();
    });

    it('dispatches image generation with model and output settings on send', async () => {
      mockStateWith({
        createSelection: {
          image: [
            imageSelection('openai', 'gpt-image-2', {
              quality: 'auto',
              resolution: '1K',
              outputFormat: 'jpeg',
              outputCompression: 80,
              background: 'auto',
              moderation: 'low',
            }),
            imageSelection('google'),
          ],
          imageOptions: { style: 'none', size: 'auto', count: 2 },
        },
      });

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.changeText(getByTestId('create-composer-input'), 'A beautiful sunset');
      fireEvent.press(getByTestId('create-composer-send'));

      expect(mockGenerateCreateImages).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'A beautiful sunset',
        providers: ['openai', 'google'],
        selectedModels: {
          openai: 'gpt-image-2',
          google: 'gemini-2.5-flash-image',
        },
        imageCount: 2,
        modelSettings: {
          openai: {
            quality: 'auto',
            resolution: '1K',
            outputFormat: 'jpeg',
            outputCompression: 80,
            background: 'auto',
            moderation: 'low',
          },
        },
        sourceImages: [],
        refinementInstructions: undefined,
      }));
      await waitFor(() => {
        expect(getByTestId('create-composer-input').props.value).toBe('');
        expect(mockNavigate).toHaveBeenCalledWith('CreateSession', { focusAssetId: 'img_done', galleryTab: 'image' });
      });
    });

    it('sends an attachment as a refinement with instructions', async () => {
      mockStateWith({
        createSelection: {
          image: [imageSelection('openai')],
          attachments: {
            image: [{ uri: 'file://source.png', mimeType: 'image/png', galleryAssetId: 'img_1' }],
            video: [],
            audio: [],
          },
        },
      });

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-composer-attachments')).toBeTruthy();

      fireEvent.changeText(getByTestId('create-composer-input'), 'Make the sky darker');
      fireEvent.press(getByTestId('create-composer-send'));

      expect(mockGenerateCreateImages).toHaveBeenCalledWith(expect.objectContaining({
        sourceImages: [{ uri: 'file://source.png', mimeType: 'image/png' }],
        isUploaded: true,
        refinementInstructions: 'Make the sky darker',
      }));
    });

    it('blocks send and explains when an attachment has no image-input model', () => {
      mockStateWith({
        createSelection: {
          image: [imageSelection('google', 'imagen-4.0-generate-001')],
          attachments: {
            image: [{ uri: 'file://source.png' }],
            video: [],
            audio: [],
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(
        getByText('Attached image needs a model that can edit images — tap a pill to switch models')
      ).toBeTruthy();

      fireEvent.changeText(getByTestId('create-composer-input'), 'Refine this');
      fireEvent.press(getByTestId('create-composer-send'));
      expect(mockGenerateCreateImages).not.toHaveBeenCalled();
    });

    it('removes an attachment from its chip', () => {
      mockStateWith({
        createSelection: {
          image: [imageSelection('openai')],
          attachments: {
            image: [{ uri: 'file://source.png' }],
            video: [],
            audio: [],
          },
        },
      });

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('create-composer-attachment-remove'));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/removeAttachment',
          payload: { tab: 'image', uri: 'file://source.png' },
        })
      );
    });
  });

  describe('image generation status', () => {
    it('shows running state from shared image generation state', () => {
      mockStateWith({
        createSelection: { image: [imageSelection('openai')] },
        create: {
          imageGeneration: {
            id: 'image_running',
            providers: ['openai'],
            prompt: 'A beautiful sunset',
            status: 'running',
            phase: 'generating',
            startedAt: Date.now(),
            message: 'Generating with openai...',
            providerStatuses: {
              openai: {
                provider: 'openai',
                modelId: 'gpt-image-2',
                status: 'generating',
                message: 'Generating image',
              },
            },
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      expect(getByTestId('create-image-status')).toBeTruthy();
      expect(getByTestId('create-image-provider-status-openai')).toBeTruthy();
      expect(getByText('Generating with openai...')).toBeTruthy();
      expect(getByText('Generating image')).toBeTruthy();
    });

    it('shows failed state from the shared image generation result', () => {
      mockStateWith({
        createSelection: { image: [imageSelection('openai')] },
        create: {
          lastImageGenerationResult: {
            ids: [],
            providers: ['openai'],
            status: 'failed',
            message: 'openai: bad request',
            completedAt: Date.now(),
            providerStatuses: {
              openai: {
                provider: 'openai',
                modelId: 'gpt-image-2',
                status: 'error',
                error: 'bad request',
              },
            },
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      expect(getByTestId('create-image-status')).toBeTruthy();
      expect(getByTestId('create-image-provider-status-openai')).toBeTruthy();
      expect(getByText('openai: bad request')).toBeTruthy();
      expect(getByText('bad request')).toBeTruthy();
    });

    it.each([
      {
        providers: ['openai', 'google'] as const,
        successProvider: 'openai' as const,
        failedProvider: 'google' as const,
        successModelId: 'gpt-image-2',
        failedModelId: 'gemini-2.5-flash-image',
        message: '1 of 2 providers generated images. Gemini failed.',
        error: 'Google Images error 400: Request contains an invalid argument.',
      },
      {
        providers: ['google', 'grok'] as const,
        successProvider: 'google' as const,
        failedProvider: 'grok' as const,
        successModelId: 'gemini-2.5-flash-image',
        failedModelId: 'grok-imagine-image',
        message: '1 of 2 providers generated images. Grok failed.',
        error: 'Grok Images error 429: rate limited.',
      },
    ])(
      'shows partial image generation rows when $failedProvider fails',
      ({ providers, successProvider, failedProvider, successModelId, failedModelId, message, error }) => {
        mockStateWith({
          create: {
            lastImageGenerationResult: {
              ids: ['img_done'],
              providers: [...providers],
              status: 'partial',
              message,
              completedAt: Date.now(),
              failedProviders: [failedProvider],
              providerStatuses: {
                [successProvider]: {
                  provider: successProvider,
                  modelId: successModelId,
                  status: 'complete',
                  message: 'Generated 1 image',
                  resultIds: ['img_done'],
                },
                [failedProvider]: {
                  provider: failedProvider,
                  modelId: failedModelId,
                  status: 'error',
                  error,
                },
              },
            },
          },
        });

        const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

        expect(getByText(message)).toBeTruthy();
        expect(getByTestId(`create-image-provider-status-${successProvider}`)).toBeTruthy();
        expect(getByTestId(`create-image-provider-status-${failedProvider}`)).toBeTruthy();
        expect(getByText('Generated 1 image')).toBeTruthy();
        expect(getByText(error)).toBeTruthy();
        fireEvent.press(getByTestId('create-image-gallery-cta'));

        expect(mockNavigate).toHaveBeenCalledWith('CreateSession', { focusAssetId: 'img_done', galleryTab: 'image' });
      }
    );

    it('opens Gallery from the completed image CTA focused on a single result', () => {
      mockStateWith({
        create: {
          lastImageGenerationResult: {
            ids: ['img_done'],
            providers: ['openai'],
            status: 'succeeded',
            message: 'Image generation complete.',
            completedAt: Date.now(),
          },
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      expect(getByText('Image generation complete.')).toBeTruthy();
      fireEvent.press(getByTestId('create-image-gallery-cta'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', { focusAssetId: 'img_done', galleryTab: 'image' });
    });
  });

  describe('video tab', () => {
    const withRunway = (create: Record<string, unknown> = {}) =>
      mockStateWith({
        settings: {
          apiKeys: { ...baseState.settings.apiKeys, runway: 'runway-key' },
        },
        create: { activeTab: 'video', ...create },
      });

    it('derives a single Runway pill and sends the video payload', async () => {
      withRunway();

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('Runway')).toBeTruthy();

      fireEvent.changeText(getByTestId('create-composer-input'), 'A city timelapse');
      fireEvent.press(getByTestId('create-composer-send'));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
          type: 'create/generateCreateVideo',
          payload: {
            prompt: 'A city timelapse',
            modelId: 'gen4.5',
            durationSeconds: 5,
            aspectRatio: '1280:720',
            sourceImageUri: undefined,
          },
        }));
        expect(getByTestId('create-composer-input').props.value).toBe('');
      });
    });

    it('sends the attachment as an image-to-video source', async () => {
      mockStateWith({
        settings: {
          apiKeys: { ...baseState.settings.apiKeys, runway: 'runway-key' },
        },
        createSelection: {
          attachments: { image: [], video: [{ uri: 'file://frame.png' }], audio: [] },
        },
        create: { activeTab: 'video' },
      });

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-composer-attachments')).toBeTruthy();

      fireEvent.changeText(getByTestId('create-composer-input'), 'Make it move');
      fireEvent.press(getByTestId('create-composer-send'));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
          type: 'create/generateCreateVideo',
          payload: expect.objectContaining({ sourceImageUri: 'file://frame.png' }),
        }));
      });
    });

    it('shows the connect CTA without a Runway key', () => {
      mockStateWith({ create: { activeTab: 'video' } });
      const { getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('Connect Runway to generate videos')).toBeTruthy();
      expect(getByText('Connect a provider')).toBeTruthy();
    });

    it('opens the Runway config sheet from the pill and updates duration', () => {
      withRunway();

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('create-composer-pill-0'));
      expect(getByTestId('create-video-model-grid')).toBeTruthy();

      fireEvent(getByTestId('create-video-duration-slider'), 'valueChange', 8);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setVideoOptions',
          payload: { durationSeconds: 10 },
        })
      );
    });

    it('shows running video status from media generation state', () => {
      withRunway({
        mediaGeneration: {
          video: {
            id: 'media_running',
            mediaType: 'video',
            providerId: 'runway',
            operation: 'text_to_video',
            modelId: 'gen4.5',
            prompt: 'A city timelapse',
            status: 'running',
            phase: 'rendering',
            startedAt: Date.now(),
            message: 'Rendering video...',
          },
          audio: null,
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      expect(getByTestId('create-video-status')).toBeTruthy();
      expect(getByText('Rendering video...')).toBeTruthy();
    });

    it('shows a video completion CTA that opens Gallery focused on the result', () => {
      withRunway({
        mediaGeneration: { video: null, audio: null },
        lastMediaGenerationResult: {
          id: 'media_video_done',
          mediaType: 'video',
          status: 'succeeded',
          message: 'Video generation complete.',
          completedAt: Date.now(),
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);

      expect(getByText('Video generation complete.')).toBeTruthy();
      fireEvent.press(getByTestId('create-video-gallery-cta'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', { focusMediaId: 'media_video_done' });
    });
  });

  describe('audio tab', () => {
    const withElevenLabs = (
      create: Record<string, unknown> = {},
      createSelection: Record<string, unknown> = {}
    ) =>
      mockStateWith({
        settings: {
          apiKeys: { ...baseState.settings.apiKeys, elevenlabs: 'eleven-key' },
        },
        createSelection,
        create: { activeTab: 'audio', ...create },
      });

    it('derives a single ElevenLabs pill and opens its config sheet', async () => {
      withElevenLabs();

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('ElevenLabs')).toBeTruthy();

      fireEvent.press(getByTestId('create-composer-pill-0'));
      await waitFor(() => {
        expect(getByTestId('create-audio-voice-selector')).toBeTruthy();
        expect(getByTestId('create-audio-model-selector')).toBeTruthy();
        expect(getByTestId('create-audio-format-selector')).toBeTruthy();
      });
    });

    it('routes operation, model, and format changes into audio options', async () => {
      withElevenLabs();

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('create-composer-pill-0'));

      fireEvent.press(getByTestId('segment-sound_effect'));
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setAudioOptions',
          payload: { operation: 'sound_effect' },
        })
      );

      fireEvent.press(getByTestId('create-audio-model-selector'));
      await waitFor(() => expect(getByText('Select Model')).toBeTruthy());
      fireEvent.press(getByTestId('create-audio-picker-option-eleven_v3'));
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setAudioOptions',
          payload: { ttsModelId: 'eleven_v3' },
        })
      );

      fireEvent.press(getByTestId('create-audio-format-selector'));
      await waitFor(() => expect(getByText('Select Format')).toBeTruthy());
      fireEvent.press(getByTestId('create-audio-picker-option-wav_44100'));
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setAudioOptions',
          payload: { outputFormat: 'wav_44100' },
        })
      );
    });

    it('shows sound-effect sliders only for the sound_effect operation', async () => {
      withElevenLabs({}, {
        audioOptions: {
          ...baseCreateSelection.audioOptions,
          operation: 'sound_effect',
        },
      });

      const { getByTestId, queryByTestId } = renderWithProviders(<CreateSetupScreen />);
      await waitFor(() => expect(mockListElevenLabsOptions).toHaveBeenCalled());
      fireEvent.press(getByTestId('create-composer-pill-0'));

      expect(queryByTestId('create-audio-voice-selector')).toBeNull();
      fireEvent(getByTestId('create-audio-duration-slider'), 'valueChange', 5);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setAudioOptions',
          payload: { durationSeconds: 10 },
        })
      );
      fireEvent(getByTestId('create-audio-influence-slider'), 'valueChange', 3);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setAudioOptions',
          payload: { promptInfluence: 0.7 },
        })
      );
    });

    it('selects a voice from the shared voice picker', async () => {
      withElevenLabs();

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('create-composer-pill-0'));
      fireEvent.press(getByTestId('create-audio-voice-selector'));

      await waitFor(() => expect(getByTestId('debate-voice-option-voice_b')).toBeTruthy());
      fireEvent.press(getByTestId('debate-voice-option-voice_b'));

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'createSelection/setAudioOptions',
          payload: { voiceId: 'voice_b', voiceName: 'Narrator B' },
        })
      );
    });

    it('sends a voiceover with the persisted model, voice, and format', async () => {
      withElevenLabs({}, {
        audioOptions: {
          ...baseCreateSelection.audioOptions,
          voiceId: 'voice_b',
          voiceName: 'Narrator B',
        },
      });

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.changeText(getByTestId('create-composer-input'), 'Read this line');
      fireEvent.press(getByTestId('create-composer-send'));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
          type: 'create/generateCreateAudio',
          payload: {
            prompt: 'Read this line',
            operation: 'text_to_speech',
            modelId: 'eleven_flash_v2_5',
            voiceId: 'voice_b',
            outputFormat: 'mp3_44100_128',
            durationSeconds: undefined,
            promptInfluence: undefined,
          },
        }));
        expect(getByTestId('create-composer-input').props.value).toBe('');
      });
    });

    it('shows the connect CTA without an ElevenLabs key', () => {
      mockStateWith({ create: { activeTab: 'audio' } });
      const { getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('Connect ElevenLabs to generate audio')).toBeTruthy();
    });

    it('uses the same status card pattern for audio completion', async () => {
      withElevenLabs({
        mediaGeneration: { video: null, audio: null },
        lastMediaGenerationResult: {
          id: 'media_audio_done',
          mediaType: 'audio',
          status: 'succeeded',
          message: 'Audio generation complete.',
          completedAt: Date.now(),
        },
      });

      const { getByTestId, getByText } = renderWithProviders(<CreateSetupScreen />);
      await waitFor(() => expect(mockListElevenLabsOptions).toHaveBeenCalled());

      expect(getByTestId('create-audio-status')).toBeTruthy();
      expect(getByText('Audio generation complete.')).toBeTruthy();
      fireEvent.press(getByTestId('create-audio-gallery-cta'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', { focusMediaId: 'media_audio_done' });
    });
  });

  describe('gallery hydration', () => {
    it('dispatches hydrateGallery on mount when not hydrated', () => {
      mockStateWith({ create: { galleryHydrated: false } });

      renderWithProviders(<CreateSetupScreen />);
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'create/hydrateGallery' });
    });

    it('does NOT dispatch hydrateGallery in demo mode', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'demo', isDemo: true, isPremium: false });
      mockStateWith({ create: { galleryHydrated: false } });

      renderWithProviders(<CreateSetupScreen />);
      expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'create/hydrateGallery' });
    });
  });

  describe('gallery access', () => {
    it('navigates to CreateSession when the Gallery tab is pressed (premium user)', () => {
      mockStateWith({ create: { gallery: [{ id: '1', uri: 'file://a.png' }] } });

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('create-tabs-gallery'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', {});
    });

    it('opens a recent creation from the empty-state strip', () => {
      mockStateWith({ create: { gallery: [{ id: 'img_1', uri: 'file://a.png' }] } });

      const { getByLabelText } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByLabelText('Open recent image'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', { focusAssetId: 'img_1', galleryTab: 'image' });
    });
  });
});
