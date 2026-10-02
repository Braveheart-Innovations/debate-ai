/**
 * Tests for CreateScreen - Active image generation session screen
 * Note: Simplified tests due to component complexity
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import {
  getImageShareUti,
  persistImageUri,
} from '@/services/images/fileCache';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer } from 'expo-video';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import CreateScreen from '@/screens/CreateScreen';
import { resetBackgroundAudioPlaybackForTesting } from '@/services/audio/backgroundAudioPlayback';
import type { GeneratedContentReportTarget } from '@/services/reports/GeneratedContentReportService';

type MockRootState = {
  settings: {
    apiKeys: Record<string, string>;
  };
  create: {
    selectedStyle: string;
    selectedSize: string;
    imageModelSettings: Record<string, Record<string, unknown>>;
    generationProgress: Record<string, string>;
    generationError?: string;
    isGenerating: boolean;
    gallery: Array<Record<string, unknown>>;
    galleryHydrated?: boolean;
    mediaGallery?: Array<Record<string, unknown>>;
    mediaGalleryHydrated?: boolean;
    mediaGeneration?: { video: null; audio: null };
    createActivity?: { status: string; hasUnseenActivity: boolean };
  };
};

// Mock dispatch and selector
const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
const mockGenerateCreateImages = jest.fn((payload) => ({
  type: 'create/generateCreateImages',
  payload,
  unwrap: jest.fn().mockResolvedValue({ ids: ['img_done'], entries: [], failedProviders: [] }),
}));
let mockRouteParams: Record<string, unknown>;
let mockReportModalProps: {
  visible: boolean;
  target: GeneratedContentReportTarget | null;
  onClose: () => void;
  presentation?: 'modal' | 'overlay';
} | undefined;

jest.mock('react-redux', () => {
  const actual = jest.requireActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: MockRootState) => unknown) => mockUseSelector(selector),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    replace: mockReplace,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({
    timeBasedGreeting: 'Pixels in the void',
    welcomeMessage: 'Your pixels specifically',
  }),
}));

jest.mock('expo-media-library', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => ReactModule.createElement(
      ReactNative.Text,
      { testID: `icon-${name}` },
      name
    ),
  };
});

jest.mock('@/components/molecules', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      ReactModule.createElement(ReactNative.Text, { testID }, children),
  };
});

jest.mock('@/components/organisms/chat/ImageRefinementModal', () => ({
  ImageRefinementModal: ({ visible, onRefine }: { visible: boolean; onRefine: (opts: { instructions: string; provider: string; modelId: string }) => void }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
    if (!visible) return null;
    return ReactModule.createElement(
      ReactNative.TouchableOpacity,
      {
        testID: 'refinement-submit',
        onPress: () => onRefine({ instructions: 'Add more detail', provider: 'openai', modelId: 'gpt-image-2' }),
      },
      ReactModule.createElement(ReactNative.Text, null, 'Submit Refinement')
    );
  },
}));

jest.mock('@/components/organisms/report/GeneratedContentReportModal', () => ({
  GeneratedContentReportModal: (props: {
    visible: boolean;
    target: GeneratedContentReportTarget | null;
    onClose: () => void;
    presentation?: 'modal' | 'overlay';
  }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
    mockReportModalProps = props;
    if (!props.visible) return null;
    return ReactModule.createElement(
      ReactNative.Text,
      { testID: 'generated-content-report-modal' },
      `Report ${props.target?.contentId}`
    );
  },
}));

jest.mock('@/services/images/ImageService', () => ({
  ImageService: {
    generateImage: jest.fn().mockResolvedValue([{ url: 'file:///generated/image.png' }]),
  },
}));

jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: {
    getKey: jest.fn().mockImplementation(async (provider: string) => `${provider}-key`),
  },
}));

jest.mock('@/config/create/stylePresets', () => ({
  buildEnhancedPrompt: (prompt: string) => prompt,
}));

jest.mock('@/config/create/sizeOptions', () => ({
  mapSizeToProvider: () => '1024x1024',
}));

jest.mock('@/config/imageGenerationModels', () => ({
  getImageInputModels: (provider: string) => {
    const modelsByProvider: Record<string, Array<{ id: string }>> = {
      openai: [{ id: 'gpt-image-2' }, { id: 'gpt-image-1-mini' }],
      google: [{ id: 'gemini-2.5-flash-image' }, { id: 'gemini-3-pro-image' }],
      grok: [{ id: 'grok-imagine-image' }],
    };
    return modelsByProvider[provider] || [];
  },
  resolveImageModelId: (provider: string, modelId?: string) => {
    if (modelId) return modelId;
    const defaults: Record<string, string> = {
      openai: 'gpt-image-2',
      google: 'gemini-2.5-flash-image',
      grok: 'grok-imagine-image',
    };
    return defaults[provider];
  },
  supportsImageInput: (provider: string) => ['openai', 'google'].includes(provider),
  getImageProviderDisplayName: (provider: string) => {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      google: 'Google',
      grok: 'Grok',
    };
    return names[provider] || provider;
  },
  getImageModelDisplayName: (_provider: string, modelId?: string) => modelId || 'Default Image Model',
}));

jest.mock('@/services/images/fileCache', () => ({
  loadBase64FromFileUri: jest.fn().mockResolvedValue('base64encodedimage'),
  persistImageUri: jest.fn().mockImplementation(async (uri: string) => uri),
  getImageMimeType: jest.fn().mockReturnValue('image/png'),
  getImageShareUti: jest.fn().mockReturnValue('public.png'),
  isDocumentImageUri: jest.fn().mockReturnValue(false),
}));

// Mock useFeatureAccess hook
const mockUseFeatureAccess = jest.fn();
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => mockUseFeatureAccess(),
  useFeatureAccess: () => mockUseFeatureAccess(),
}));

jest.mock('@/store/createSlice', () => {
  const actual = jest.requireActual<typeof import('@/store/createSlice')>('@/store/createSlice');
  return {
    ...actual,
    selectCreateState: (state: MockRootState) => state.create,
    selectGallery: (state: MockRootState) => state.create.gallery,
    selectIsGenerating: (state: MockRootState) => state.create.isGenerating,
    hydrateMediaGallery: jest.fn(() => ({ type: 'create/hydrateMediaGallery' })),
    markCreateActivitySeen: jest.fn(() => ({ type: 'create/markCreateActivitySeen' })),
    startGeneration: jest.fn((providers) => ({ type: 'create/startGeneration', payload: providers })),
    updateGenerationProgress: jest.fn((payload) => ({ type: 'create/updateGenerationProgress', payload })),
    completeGeneration: jest.fn(() => ({ type: 'create/completeGeneration' })),
    generateCreateImages: (payload: unknown) => mockGenerateCreateImages(payload),
    addToGalleryWithCleanup: jest.fn((entry) => ({ type: 'create/addToGalleryWithCleanup', payload: entry })),
    addToMediaGalleryWithCleanup: jest.fn((entry) => ({ type: 'create/addToMediaGalleryWithCleanup', payload: entry })),
    removeFromGalleryWithCleanup: jest.fn((id) => ({ type: 'create/removeFromGalleryWithCleanup', payload: id })),
    removeFromMediaGalleryWithCleanup: jest.fn((id) => ({ type: 'create/removeFromMediaGalleryWithCleanup', payload: id })),
    persistGallery: jest.fn((gallery) => ({ type: 'create/persistGallery', payload: gallery })),
    persistMediaGallery: jest.fn((gallery) => ({ type: 'create/persistMediaGallery', payload: gallery })),
    updateGalleryEntryUri: jest.fn((payload) => ({ type: 'create/updateGalleryEntryUri', payload })),
  };
});
const mockedSharing = Sharing as jest.Mocked<typeof Sharing>;
const mockedGetImageShareUti = getImageShareUti as jest.Mock;
const mockedPersistImageUri = persistImageUri as jest.Mock;
const mockedUseVideoPlayer = useVideoPlayer as jest.Mock;
const mockedUseAudioPlayer = useAudioPlayer as jest.Mock;
const mockedSetAudioModeAsync = setAudioModeAsync as jest.Mock;

type MockVideoPlayer = {
  play: jest.Mock;
  pause: jest.Mock;
  replay: jest.Mock;
  currentTime: number;
  __emit: (eventName: string, payload?: unknown) => void;
};

type MockAudioPlayer = {
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  setActiveForLockScreen: jest.Mock;
  clearLockScreenControls: jest.Mock;
  currentTime: number;
  __finish: () => void;
};

const flushVirtualizedListUpdates = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
};

describe('CreateScreen', () => {
  const mockGalleryImage = {
    id: 'img_1',
    uri: 'file:///test/image1.png',
    prompt: 'A beautiful sunset',
    originalPrompt: 'A beautiful sunset',
    provider: 'openai',
    model: 'gpt-image-1',
    style: 'none',
    size: 'auto',
    quality: 'standard',
    createdAt: Date.now(),
    isRefinement: false,
    isUploaded: false,
  };

  const baseState = {
    settings: {
      apiKeys: { openai: 'key-1', google: 'key-2' },
    },
    create: {
      selectedStyle: 'none',
      selectedSize: 'auto',
      imageModelSettings: { openai: { quality: 'standard' } },
      generationProgress: {},
      generationError: undefined,
      isGenerating: false,
      gallery: [mockGalleryImage],
      galleryHydrated: true,
      mediaGallery: [],
      mediaGalleryHydrated: true,
      mediaGeneration: { video: null, audio: null },
      createActivity: { status: 'idle', hasUnseenActivity: false },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetBackgroundAudioPlaybackForTesting();
    mockDispatch.mockClear();
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockReplace.mockClear();
    mockGenerateCreateImages.mockClear();
    mockReportModalProps = undefined;
    mockRouteParams = {};
    mockDispatch.mockImplementation((action) => action);
    mockUseSelector.mockImplementation((selector) => selector(baseState));
    // Default to non-demo mode
    mockUseFeatureAccess.mockReturnValue({
      isDemo: false,
      isPremium: true,
      isInTrial: false,
      membershipStatus: 'premium',
      canAccessLiveAI: true,
    });
  });

  describe('rendering', () => {
    it('renders the gallery header without crashing', () => {
      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('Gallery')).toBeTruthy();
    });

    it('shows provider name on gallery items', () => {
      const { getAllByText } = renderWithProviders(<CreateScreen />);
      expect(getAllByText(/OpenAI/).length).toBeGreaterThan(0);
    });

    it('never self-generates from navigation params', async () => {
      mockRouteParams = { galleryTab: 'image' };
      renderWithProviders(<CreateScreen />);

      await waitFor(() => {
        expect(mockGenerateCreateImages).not.toHaveBeenCalled();
      });
    });
  });

  describe('gallery display', () => {
    it('shows empty state when no images', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            isGenerating: false,
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateScreen />);
      // Empty gallery now shows the witty greeting (relocated from the header).
      expect(getByText('Pixels in the void')).toBeTruthy();
    });

    it('selects a focused generated media item when Gallery is opened from completion', async () => {
      const audioEntry = {
        id: 'media_audio_focus',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'eleven_multilingual_v2',
        operation: 'text_to_speech',
        prompt: 'A focused audio clip',
        uri: 'file:///test/focused-audio.mp3',
        mimeType: 'audio/mpeg',
        status: 'succeeded',
        createdAt: Date.now(),
      };
      mockRouteParams = { focusMediaId: audioEntry.id };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [audioEntry],
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateScreen />);

      await waitFor(() => {
        expect(getByText('Save')).toBeTruthy();
      });
    });

    it('opens a focused image asset in the shared Gallery detail modal', async () => {
      mockRouteParams = { focusAssetId: mockGalleryImage.id, galleryTab: 'image' };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [mockGalleryImage],
            mediaGallery: [],
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateScreen />);

      await waitFor(() => {
        expect(getByText('Provider')).toBeTruthy();
        expect(getByText('OpenAI')).toBeTruthy();
      });
    });

    it('opens the report modal over the active Gallery detail preview', async () => {
      mockRouteParams = { focusAssetId: mockGalleryImage.id, galleryTab: 'image' };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [mockGalleryImage],
            mediaGallery: [],
          },
        })
      );

      const { getByText, getByTestId } = renderWithProviders(<CreateScreen />);

      await waitFor(() => {
        expect(getByText('Provider')).toBeTruthy();
      });

      fireEvent.press(getByTestId(`report-create-asset-${mockGalleryImage.id}`));

      await waitFor(() => {
        expect(getByTestId('generated-content-report-modal')).toBeTruthy();
        expect(getByText('Provider')).toBeTruthy();
        expect(mockReportModalProps).toEqual(expect.objectContaining({
          visible: true,
          presentation: 'overlay',
          target: expect.objectContaining({
            surface: 'create',
            contentType: 'image',
            contentId: mockGalleryImage.id,
          }),
        }));
      });
    });

    it('replays audio in the detail modal without closing the preview', async () => {
      const audioEntry = {
        id: 'media_audio_replay',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'eleven_multilingual_v2',
        operation: 'text_to_speech',
        prompt: 'A replayable audio clip',
        uri: 'file:///test/replay-audio.mp3',
        mimeType: 'audio/mpeg',
        durationSeconds: 5,
        status: 'succeeded',
        createdAt: Date.now(),
      };
      mockRouteParams = { focusMediaId: audioEntry.id };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [audioEntry],
          },
        })
      );

      const { getByLabelText, rerender } = renderWithProviders(<CreateScreen />);
      const firstPlayer = mockedUseAudioPlayer.mock.results[0].value as MockAudioPlayer;

      fireEvent.press(getByLabelText('Play audio'));
      await waitFor(() => {
        expect(firstPlayer.play).toHaveBeenCalledTimes(1);
        expect(mockedSetAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        }));
        expect(firstPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            title: 'A replayable audio clip',
            artist: 'ElevenLabs',
            albumTitle: 'Symposium AI',
          }),
          expect.any(Object)
        );
      });

      await waitFor(() => {
        expect(getByLabelText('Pause audio')).toBeTruthy();
      });

      act(() => {
        firstPlayer.__finish();
      });
      rerender(<CreateScreen />);

      await waitFor(() => {
        expect(getByLabelText('Replay audio')).toBeTruthy();
      });

      fireEvent.press(getByLabelText('Replay audio'));

      await waitFor(() => {
        const replayPlayer = mockedUseAudioPlayer.mock.results[
          mockedUseAudioPlayer.mock.results.length - 1
        ].value as MockAudioPlayer;
        expect(replayPlayer).not.toBe(firstPlayer);
        expect(replayPlayer.seekTo).toHaveBeenCalledWith(0, 0, 0);
        expect(replayPlayer.play).toHaveBeenCalledTimes(1);
      });
    });

    it('seeks audio from the detail modal progress control', async () => {
      const audioEntry = {
        id: 'media_audio_seek',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'eleven_multilingual_v2',
        operation: 'text_to_speech',
        prompt: 'A seekable audio clip',
        uri: 'file:///test/seek-audio.mp3',
        mimeType: 'audio/mpeg',
        durationSeconds: 5,
        status: 'succeeded',
        createdAt: Date.now(),
      };
      mockRouteParams = { focusMediaId: audioEntry.id };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [audioEntry],
          },
        })
      );

      const { getByLabelText } = renderWithProviders(<CreateScreen />);
      const player = mockedUseAudioPlayer.mock.results[0].value as MockAudioPlayer;

      await act(async () => {
        fireEvent(getByLabelText('Audio playback position'), 'slidingComplete', 2.25);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(player.seekTo).toHaveBeenCalledWith(2.25, 0, 0);
      });
    });

    it('resets the audio player when seeking after playback ends', async () => {
      const audioEntry = {
        id: 'media_audio_seek_ended',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'eleven_multilingual_v2',
        operation: 'text_to_speech',
        prompt: 'An ended audio clip',
        uri: 'file:///test/seek-ended-audio.mp3',
        mimeType: 'audio/mpeg',
        durationSeconds: 5,
        status: 'succeeded',
        createdAt: Date.now(),
      };
      mockRouteParams = { focusMediaId: audioEntry.id };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [audioEntry],
          },
        })
      );

      const { getByLabelText, rerender } = renderWithProviders(<CreateScreen />);
      const firstPlayer = mockedUseAudioPlayer.mock.results[0].value as MockAudioPlayer;

      act(() => {
        firstPlayer.__finish();
      });
      rerender(<CreateScreen />);

      await waitFor(() => {
        expect(getByLabelText('Replay audio')).toBeTruthy();
      });

      await act(async () => {
        fireEvent(getByLabelText('Audio playback position'), 'slidingComplete', 2);
        await Promise.resolve();
      });

      await waitFor(() => {
        const resetPlayer = mockedUseAudioPlayer.mock.results[
          mockedUseAudioPlayer.mock.results.length - 1
        ].value as MockAudioPlayer;
        expect(resetPlayer).not.toBe(firstPlayer);
        expect(resetPlayer.seekTo).toHaveBeenCalledWith(2, 0, 0);
        expect(resetPlayer.play).not.toHaveBeenCalled();
      });
    });

    it('renders and plays a debate voice pack from the audio gallery', async () => {
      const voicePackEntry = {
        id: 'voice_pack_focus',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'debate_voice_pack',
        operation: 'debate_voice_pack',
        prompt: 'Voice pack: Resolved: testing matters.',
        uri: 'file:///packs/voice_pack_focus/001.mp3',
        mimeType: 'audio/mpeg',
        status: 'succeeded',
        createdAt: Date.now(),
        voicePack: {
          kind: 'debate_voice_pack',
          version: 1,
          sessionId: 'debate_1',
          topic: 'Resolved: testing matters.',
          participants: [{ id: 'openai', name: 'ChatGPT' }],
          clips: [
            {
              id: 'clip_1',
              messageId: 'msg_1',
              order: 0,
              speakerId: 'openai',
              speakerName: 'ChatGPT',
              speechLabel: 'Opening statement',
              textPreview: 'Opening statement.',
              uri: 'file:///packs/voice_pack_focus/001.mp3',
              mimeType: 'audio/mpeg',
              fileName: '001.mp3',
              pauseAfterMs: 900,
            },
            {
              id: 'clip_2',
              messageId: 'msg_2',
              order: 1,
              speakerId: 'google',
              speakerName: 'Gemini',
              speechLabel: 'Opening response',
              textPreview: 'Opening response.',
              uri: 'file:///packs/voice_pack_focus/002.mp3',
              mimeType: 'audio/mpeg',
              fileName: '002.mp3',
              pauseAfterMs: 900,
            },
          ],
          pauseMs: 900,
          directoryUri: 'file:///packs/voice_pack_focus/',
          createdAt: Date.now(),
        },
      };
      mockRouteParams = { focusMediaId: voicePackEntry.id, galleryTab: 'audio' };
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [voicePackEntry],
          },
        })
      );

      const { getByLabelText, getByText } = renderWithProviders(<CreateScreen />);

      expect(getByText('Clip 1 of 2 • ChatGPT')).toBeTruthy();
      expect(getByText('2 clips • 0.9s pauses')).toBeTruthy();

      fireEvent.press(getByLabelText('Play voice pack'));
      const player = mockedUseAudioPlayer.mock.results[0].value as MockAudioPlayer;

      await waitFor(() => {
        expect(player.play).toHaveBeenCalledTimes(1);
        expect(player.setActiveForLockScreen).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            title: 'Opening statement',
            artist: 'ChatGPT',
            albumTitle: 'Debate voice pack',
          }),
          expect.any(Object)
        );
      });

      fireEvent.press(getByLabelText('Next voice clip'));

      await waitFor(() => {
        expect(getByText('Clip 2 of 2 • Gemini')).toBeTruthy();
        const nextPlayer = mockedUseAudioPlayer.mock.results[
          mockedUseAudioPlayer.mock.results.length - 1
        ].value as MockAudioPlayer;
        expect(nextPlayer).not.toBe(player);
        expect(nextPlayer.play).toHaveBeenCalledTimes(1);
        expect(nextPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            title: 'Opening response',
            artist: 'Gemini',
            albumTitle: 'Debate voice pack',
          }),
          expect.any(Object)
        );
        expect(player.pause).not.toHaveBeenCalled();
      });
    });

    it('does not pause voice pack players during paused re-renders or unmount', () => {
      let audioPlayerId = 0;
      let forceRenderOnPause = true;
      const pauseCalls = jest.fn();
      const defaultAudioPlayerImplementation = mockedUseAudioPlayer.getMockImplementation();
      mockedUseAudioPlayer.mockImplementation(() => {
        const [, forceRender] = React.useState(0);
        const player = {
          id: `unstable-audio-player-${audioPlayerId += 1}`,
          playing: false,
          currentTime: 0,
          duration: 5,
          didJustFinish: false,
          play: jest.fn(),
          pause: jest.fn(() => {
            pauseCalls();
            if (forceRenderOnPause) {
              forceRender((value) => value + 1);
            }
          }),
          seekTo: jest.fn(async () => undefined),
          __finish: jest.fn(),
        };

        return player;
      });

      const voicePackEntry = {
        id: 'voice_pack_focus',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'debate_voice_pack',
        operation: 'debate_voice_pack',
        prompt: 'Voice pack: Resolved: testing matters.',
        uri: 'file:///packs/voice_pack_focus/001.mp3',
        mimeType: 'audio/mpeg',
        status: 'succeeded',
        createdAt: Date.now(),
        voicePack: {
          kind: 'debate_voice_pack',
          version: 1,
          sessionId: 'debate_1',
          topic: 'Resolved: testing matters.',
          participants: [{ id: 'openai', name: 'ChatGPT' }],
          clips: [
            {
              id: 'clip_1',
              messageId: 'msg_1',
              order: 0,
              speakerId: 'openai',
              speakerName: 'ChatGPT',
              speechLabel: 'Opening statement',
              textPreview: 'Opening statement.',
              uri: 'file:///packs/voice_pack_focus/001.mp3',
              mimeType: 'audio/mpeg',
              fileName: '001.mp3',
              pauseAfterMs: 900,
            },
          ],
          pauseMs: 900,
          directoryUri: 'file:///packs/voice_pack_focus/',
          createdAt: Date.now(),
        },
      };
      const voicePackState = {
        ...baseState,
        create: {
          ...baseState.create,
          gallery: [],
          mediaGallery: [voicePackEntry],
        },
      };
      mockRouteParams = { focusMediaId: voicePackEntry.id, galleryTab: 'audio' };
      mockUseSelector.mockImplementation((selector) => selector(voicePackState));

      let unmountScreen: (() => void) | undefined;
      try {
        const { getByText, unmount } = renderWithProviders(<CreateScreen />);
        unmountScreen = unmount;

        expect(getByText('Clip 1 of 1 • ChatGPT')).toBeTruthy();
        expect(pauseCalls).not.toHaveBeenCalled();

        forceRenderOnPause = false;
        unmountScreen();
        unmountScreen = undefined;
        expect(pauseCalls).not.toHaveBeenCalled();
      } finally {
        forceRenderOnPause = false;
        unmountScreen?.();
        if (defaultAudioPlayerImplementation) {
          mockedUseAudioPlayer.mockImplementation(defaultAudioPlayerImplementation);
        }
      }
    });

    it('opens video playback only from the asset detail preview', async () => {
      mockRouteParams = {};
      const videoEntry = {
        id: 'media_video_1',
        mediaType: 'video',
        providerId: 'runway',
        modelId: 'gen4.5',
        operation: 'text_to_video',
        prompt: 'A test video',
        uri: 'file:///test/video.mp4',
        mimeType: 'video/mp4',
        durationSeconds: 5,
        status: 'ready',
        createdAt: Date.now(),
      };

      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [videoEntry],
          },
        })
      );

      const { getByLabelText, getByTestId, queryByTestId } = renderWithProviders(<CreateScreen />);

      expect(queryByTestId('gallery-video-surface-media_video_1')).toBeNull();

      fireEvent.press(getByLabelText('Video generated by Runway'));

      await waitFor(() => {
        expect(getByTestId('gallery-video-surface-media_video_1')).toBeTruthy();
      });
    });

    it('uses native video controls only while playback is inactive', async () => {
      mockRouteParams = {};
      const videoEntry = {
        id: 'media_video_controls',
        mediaType: 'video',
        providerId: 'runway',
        modelId: 'gen4.5',
        operation: 'text_to_video',
        prompt: 'A test video',
        uri: 'file:///test/video-controls.mp4',
        mimeType: 'video/mp4',
        durationSeconds: 5,
        status: 'ready',
        createdAt: Date.now(),
      };

      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            mediaGallery: [videoEntry],
          },
        })
      );

      const { getByLabelText, getByTestId } = renderWithProviders(<CreateScreen />);
      fireEvent.press(getByLabelText('Video generated by Runway'));

      await waitFor(() => {
        expect(getByTestId('gallery-video-surface-media_video_controls')).toBeTruthy();
      });

      const player = mockedUseVideoPlayer.mock.results[0].value as MockVideoPlayer;
      const getVideoSurface = () => getByTestId('gallery-video-surface-media_video_controls');

      expect(getVideoSurface().props.nativeControls).toBe(true);
      expect(getVideoSurface().props.fullscreenOptions).toEqual({ enable: false });
      expect(getVideoSurface().props.showsTimecodes).toBe(false);
      expect(getVideoSurface().props.buttonOptions).toMatchObject({
        showBottomBar: false,
        showSeekBackward: false,
        showSeekForward: false,
        showSettings: false,
        showNext: false,
        showPrevious: false,
        showSubtitles: false,
      });

      act(() => {
        player.__emit('playingChange', { isPlaying: true });
      });

      await waitFor(() => {
        expect(getVideoSurface().props.nativeControls).toBe(false);
        expect(getByLabelText('Pause video')).toBeTruthy();
      });

      fireEvent.press(getByLabelText('Pause video'));
      expect(player.pause).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(getVideoSurface().props.nativeControls).toBe(true);
      });

      act(() => {
        player.__emit('playingChange', { isPlaying: true });
      });

      await waitFor(() => {
        expect(getVideoSurface().props.nativeControls).toBe(false);
      });

      act(() => {
        player.__emit('playToEnd');
      });

      await waitFor(() => {
        expect(getVideoSurface().props.nativeControls).toBe(true);
      });

      await flushVirtualizedListUpdates();
    });
  });

  describe('refinement flow', () => {
    it('normalizes remote gallery images and attaches them to the Studio composer', async () => {
      mockedPersistImageUri.mockResolvedValueOnce('/documents/images/refine-source.png');

      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [
              {
                ...mockGalleryImage,
                uri: 'https://example.com/generated.png',
                model: 'gpt-image-2',
              },
            ],
          },
        })
      );

      const { getByLabelText, getByText } = renderWithProviders(<CreateScreen />);

      fireEvent.press(getByLabelText('Image generated by OpenAI'));
      fireEvent.press(getByText('Refine'));

      await waitFor(() => {
        expect(mockedPersistImageUri).toHaveBeenCalledWith(
          'https://example.com/generated.png',
          { prefix: 'gallery' }
        );
        expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
          type: 'createSelection/setAttachments',
          payload: {
            tab: 'image',
            attachments: [expect.objectContaining({
              uri: '/documents/images/refine-source.png',
              galleryAssetId: mockGalleryImage.id,
            })],
          },
        }));
        expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'CreateTab' });
      });
    });
  });

  describe('share flow', () => {
    it('shares the resolved local image with native sharing metadata', async () => {
      mockedPersistImageUri.mockResolvedValueOnce('file:///documents/images/shared.png');
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [
              {
                ...mockGalleryImage,
                model: 'gpt-image-2',
              },
            ],
          },
        })
      );

      const { getByLabelText, getByText } = renderWithProviders(<CreateScreen />);

      fireEvent.press(getByLabelText('Image generated by OpenAI'));
      fireEvent.press(getByText('Share'));

      await waitFor(() => {
        expect(mockedSharing.shareAsync).toHaveBeenCalledWith(
          'file:///documents/images/shared.png',
          expect.objectContaining({
            mimeType: 'image/png',
            ...(Platform.OS === 'ios' ? { UTI: 'public.png' } : {}),
          })
        );
      });

      if (Platform.OS === 'ios') {
        expect(mockedGetImageShareUti).toHaveBeenCalledWith('file:///documents/images/shared.png');
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    });
  });

  describe('generation progress', () => {
    it('shows generation progress from the shared image generation state', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            isGenerating: true,
            generationProgress: { openai: 'generating' },
            imageGeneration: {
              id: 'image_running',
              providers: ['openai'],
              prompt: 'A beautiful sunset',
              status: 'running',
              phase: 'generating',
              startedAt: Date.now(),
              providerStatuses: {
                openai: { provider: 'openai', modelId: 'gpt-image-2', status: 'generating' },
              },
            },
          },
        })
      );

      const { getAllByText } = renderWithProviders(<CreateScreen />);
      expect(getAllByText('gpt-image-2').length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('shows error message when present', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            generationError: 'API rate limit exceeded',
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('API rate limit exceeded')).toBeTruthy();
    });
  });

  describe('demo mode guards', () => {
    it('uses isDemo from useFeatureAccess hook', () => {
      // Verify that the component renders when isDemo is false
      mockUseFeatureAccess.mockReturnValue({
        isDemo: false,
        isPremium: true,
        isInTrial: false,
        membershipStatus: 'premium',
        canAccessLiveAI: true,
      });

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('Gallery')).toBeTruthy();
    });

    it('renders in demo mode without crashing', () => {
      mockUseFeatureAccess.mockReturnValue({
        isDemo: true,
        isPremium: false,
        isInTrial: false,
        membershipStatus: 'demo',
        canAccessLiveAI: false,
      });

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('Gallery')).toBeTruthy();
    });
  });
});
