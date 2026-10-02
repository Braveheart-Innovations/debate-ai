/**
 * Tests for createSlice - Redux slice for Create mode AI image generation
 */
// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/services/images/ImageService', () => ({
  ImageService: {
    generateImage: jest.fn(),
  },
}));

jest.mock('@/services/apiKeys/apiKeyStorageCore', () => ({
  readStoredApiKey: jest.fn(),
}));

// Mock expo-file-system
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  documentDirectory: '/documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/documents/images/downloaded.png' }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

import reducer, {
  startImageGeneration,
  updateImageGeneration,
  completeImageGeneration,
  failImageGeneration,
  startGeneration,
  updateGenerationProgress,
  completeGeneration,
  generationError,
  clearGenerationError,
  clearFinishedGenerations,
  setActiveCreateTab,
  markCreateActivitySeen,
  startMediaGeneration,
  updateMediaGeneration,
  completeMediaGeneration,
  failMediaGeneration,
  addToGallery,
  addToGalleryWithCleanup,
  removeFromGallery,
  removeFromGalleryWithCleanup,
  clearGallery,
  clearGalleryWithCleanup,
  addToMediaGallery,
  addToMediaGalleryWithCleanup,
  removeFromMediaGallery,
  removeFromMediaGalleryWithCleanup,
  clearMediaGallery,
  clearMediaGalleryWithCleanup,
  setActiveRunwayTask,
  resetCreateState,
  selectCreateState,
  selectGallery,
  selectIsGenerating,
  selectGenerationProgress,
  hydrateGallery,
  persistGallery,
  hydrateMediaGallery,
  persistMediaGallery,
  generateCreateVideo,
  generateCreateAudio,
  generateCreateImages,
  selectImageGeneration,
  LOCAL_GALLERY_ASSET_LIMIT,
  getGalleryAssetCounts,
  getFilteredGalleryAssets,
  getGalleryRetentionOverflow,
  getSortedGalleryAssets,
  normalizeGalleryAssets,
  type GeneratedImageEntry,
  type GeneratedMediaEntry,
  type ActiveRunwayTask,
  type GalleryFilterState,
} from '@/store/createSlice';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageService } from '@/services/images/ImageService';
import { readStoredApiKey } from '@/services/apiKeys/apiKeyStorageCore';
import MediaGenerationService from '@/services/media/MediaGenerationService';

const initialState = reducer(undefined, { type: 'init' });
const mockedGenerateImage = ImageService.generateImage as jest.Mock;
const mockedReadStoredApiKey = readStoredApiKey as jest.Mock;

describe('createSlice', () => {
  const mockMedia: GeneratedMediaEntry = {
    id: 'media_1',
    mediaType: 'video',
    providerId: 'runway',
    modelId: 'gen4.5',
    operation: 'text_to_video',
    prompt: 'A cinematic orbital shot',
    uri: 'file:///test/video.mp4',
    remoteUrl: 'https://example.com/video.mp4',
    mimeType: 'video/mp4',
    durationSeconds: 5,
    providerTaskId: 'task_1',
    status: 'succeeded',
    createdAt: 123456,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedReadStoredApiKey.mockResolvedValue(null);
    mockedGenerateImage.mockReset();
  });

  describe('generation state', () => {
    it('starts generation with providers', () => {
      const providers = ['openai', 'google'] as const;
      const state = reducer(initialState, startGeneration([...providers]));

      expect(state.isGenerating).toBe(true);
      expect(state.generationError).toBeUndefined();
      expect(state.generationProgress['openai']).toBe('pending');
      expect(state.generationProgress['google']).toBe('pending');
    });

    it('updates generation progress for specific provider', () => {
      let state = reducer(initialState, startGeneration(['openai']));
      state = reducer(state, updateGenerationProgress({ provider: 'openai', progress: 'generating' }));
      expect(state.generationProgress['openai']).toBe('generating');
    });

    it('completes generation and marks generating providers as complete', () => {
      let state = reducer(initialState, startGeneration(['openai']));
      state = reducer(state, updateGenerationProgress({ provider: 'openai', progress: 'generating' }));
      state = reducer(state, completeGeneration());

      expect(state.isGenerating).toBe(false);
      expect(state.generationProgress['openai']).toBe('complete');
    });

    it('sets generation error', () => {
      let state = reducer(initialState, startGeneration(['openai']));
      state = reducer(state, generationError('API rate limit exceeded'));

      expect(state.isGenerating).toBe(false);
      expect(state.generationError).toBe('API rate limit exceeded');
    });

    it('clears generation error', () => {
      let state = reducer(initialState, generationError('Some error'));
      state = reducer(state, clearGenerationError());

      expect(state.generationError).toBeUndefined();
    });

    it('handles error progress state', () => {
      let state = reducer(initialState, startGeneration(['openai']));
      state = reducer(state, updateGenerationProgress({ provider: 'openai', progress: 'error' }));
      expect(state.generationProgress['openai']).toBe('error');
    });

    it('tracks image generation lifecycle independently for the shared rail', () => {
      let state = reducer(initialState, startImageGeneration({
        id: 'image_generation_1',
        providers: ['openai'],
        prompt: 'A clean product image',
        message: 'Preparing image generation...',
      }));

      const selectorState = { create: state } as Parameters<typeof selectImageGeneration>[0];
      expect(selectImageGeneration(selectorState)).toMatchObject({
        id: 'image_generation_1',
        status: 'queued',
        phase: 'queued',
      });
      expect(state.createActivity.status).toBe('running');

      state = reducer(state, updateImageGeneration({
        status: 'running',
        phase: 'generating',
        message: 'Generating with openai...',
        providerStatus: {
          provider: 'openai',
          modelId: 'gpt-image-2',
          status: 'generating',
          message: 'Generating image',
        },
      }));
      expect(state.imageGeneration).toMatchObject({
        status: 'running',
        phase: 'generating',
        message: 'Generating with openai...',
        providerStatuses: {
          openai: {
            provider: 'openai',
            modelId: 'gpt-image-2',
            status: 'generating',
            message: 'Generating image',
          },
        },
      });

      state = reducer(state, completeImageGeneration({
        resultIds: ['img_1'],
        message: 'Image generation complete.',
      }));
      expect(state.imageGeneration).toBeNull();
      expect(state.lastImageGenerationResult).toMatchObject({
        ids: ['img_1'],
        providers: ['openai'],
        status: 'succeeded',
      });
      expect(state.createActivity.hasUnseenActivity).toBe(true);
    });

    it('tracks failed image generation for retry messaging', () => {
      let state = reducer(initialState, startImageGeneration({
        id: 'image_generation_1',
        providers: ['openai'],
        prompt: 'A clean product image',
      }));

      state = reducer(state, failImageGeneration({
        message: 'openai: unsupported source image',
        failedProviders: ['openai'],
      }));

      expect(state.imageGeneration).toBeNull();
      expect(state.lastImageGenerationResult).toMatchObject({
        ids: [],
        providers: ['openai'],
        status: 'failed',
        message: 'openai: unsupported source image',
      });
      expect(state.createActivity.status).toBe('failed');
    });
  });

  describe('clearFinishedGenerations', () => {
    it('clears a completed image result so Create returns to a fresh empty state', () => {
      let state = reducer(initialState, startImageGeneration({
        id: 'image_generation_1',
        providers: ['openai'],
        prompt: 'A clean product image',
      }));
      state = reducer(state, completeImageGeneration({
        resultIds: ['img_1'],
        message: 'Image generation complete.',
      }));
      expect(state.lastImageGenerationResult).toBeDefined();

      state = reducer(state, clearFinishedGenerations());
      expect(state.imageGeneration).toBeNull();
      expect(state.lastImageGenerationResult).toBeUndefined();
    });

    it('clears a completed media result', () => {
      let state = reducer(initialState, startMediaGeneration({
        id: 'generation_1',
        mediaType: 'video',
        providerId: 'runway',
        operation: 'text_to_video',
        modelId: 'gen4.5',
        prompt: 'A city at sunrise',
      }));
      state = reducer(state, completeMediaGeneration({
        mediaType: 'video',
        status: 'succeeded',
        message: 'Video generation complete.',
        resultId: 'vid_1',
      }));
      expect(state.lastMediaGenerationResult).toBeDefined();

      state = reducer(state, clearFinishedGenerations());
      expect(state.mediaGeneration.video).toBeNull();
      expect(state.lastMediaGenerationResult).toBeUndefined();
    });

    it('preserves an in-flight image generation', () => {
      let state = reducer(initialState, startImageGeneration({
        id: 'image_generation_1',
        providers: ['openai'],
        prompt: 'Still generating',
      }));
      state = reducer(state, clearFinishedGenerations());
      expect(state.imageGeneration).not.toBeNull();
    });

    it('preserves an in-flight media generation', () => {
      let state = reducer(initialState, startMediaGeneration({
        id: 'generation_1',
        mediaType: 'video',
        providerId: 'runway',
        operation: 'text_to_video',
        modelId: 'gen4.5',
        prompt: 'Still rendering',
      }));
      state = reducer(state, clearFinishedGenerations());
      expect(state.mediaGeneration.video).not.toBeNull();
    });
  });

  describe('generateCreateImages thunk', () => {
    it('records per-provider progress, gallery entries, and the last image result', async () => {
      mockedReadStoredApiKey.mockResolvedValue('image-key');
      mockedGenerateImage.mockResolvedValue([
        { url: 'file:///generated/openai-1.png', mimeType: 'image/png' },
        { url: 'file:///generated/openai-2.png', mimeType: 'image/png' },
      ]);
      const store = configureStore({ reducer: { create: reducer } });

      const result = await store.dispatch(generateCreateImages({
        prompt: 'A premium editorial photo',
        providers: ['openai'],
        selectedModels: { openai: 'gpt-image-2' },
        style: 'photo',
        size: 'portrait',
        imageCount: 2,
        modelSettings: {
          openai: {
            quality: 'high',
            outputFormat: 'webp',
            outputCompression: 80,
            background: 'opaque',
            moderation: 'low',
          },
        },
      })).unwrap();

      const state = store.getState().create;
      expect(result.ids).toHaveLength(2);
      expect(state.gallery).toHaveLength(2);
      expect(state.generationProgress.openai).toBe('complete');
      expect(state.lastImageGenerationResult).toMatchObject({
        ids: result.ids,
        status: 'succeeded',
        message: '2 images generated.',
      });
      expect(mockedGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        model: 'gpt-image-2',
        apiKey: 'image-key',
        n: 2,
        quality: 'high',
        outputFormat: 'webp',
        outputCompression: 80,
        background: 'opaque',
        moderation: 'low',
      }));
    });

    it('supports multi-provider and multi-count gallery results', async () => {
      mockedReadStoredApiKey.mockResolvedValue('image-key');
      mockedGenerateImage
        .mockResolvedValueOnce([
          { url: 'file:///generated/openai-1.png', mimeType: 'image/png' },
          { url: 'file:///generated/openai-2.png', mimeType: 'image/png' },
        ])
        .mockResolvedValueOnce([
          { url: 'file:///generated/google-1.png', mimeType: 'image/png' },
        ]);
      const store = configureStore({ reducer: { create: reducer } });

      const result = await store.dispatch(generateCreateImages({
        prompt: 'A comparison render',
        providers: ['openai', 'google'],
        selectedModels: {
          openai: 'gpt-image-2',
          google: 'gemini-2.5-flash-image',
        },
        imageCount: 2,
      })).unwrap();

      expect(result.ids).toHaveLength(3);
      expect(store.getState().create.gallery.map((entry) => entry.provider).sort()).toEqual([
        'google',
        'openai',
        'openai',
      ]);
      expect(mockedGenerateImage).toHaveBeenCalledTimes(2);
    });

    it.each([
      {
        providers: ['openai', 'google'] as const,
        selectedModels: { openai: 'gpt-image-2', google: 'gemini-3.1-flash-image' },
        successProvider: 'openai' as const,
        failedProvider: 'google' as const,
        failureMessage: 'Google Images error 400: Request contains an invalid argument.',
        expectedSummary: '1 of 2 providers generated images. Gemini failed.',
        expectedErrorPrefix: 'Gemini: Google Images error 400',
      },
      {
        providers: ['google', 'grok'] as const,
        selectedModels: { google: 'gemini-2.5-flash-image', grok: 'grok-imagine-image' },
        successProvider: 'google' as const,
        failedProvider: 'grok' as const,
        failureMessage: 'Grok Images error 429: rate limited',
        expectedSummary: '1 of 2 providers generated images. Grok failed.',
        expectedErrorPrefix: 'Grok: Grok Images error 429',
      },
      {
        providers: ['grok', 'openai'] as const,
        selectedModels: { grok: 'grok-imagine-image', openai: 'gpt-image-2' },
        successProvider: 'grok' as const,
        failedProvider: 'openai' as const,
        failureMessage: 'OpenAI Images error 500: upstream failed',
        expectedSummary: '1 of 2 providers generated images. ChatGPT failed.',
        expectedErrorPrefix: 'ChatGPT: OpenAI Images error 500',
      },
    ])(
      'keeps $successProvider images visible when $failedProvider fails',
      async ({ providers, selectedModels, successProvider, failedProvider, failureMessage, expectedSummary, expectedErrorPrefix }) => {
        mockedReadStoredApiKey.mockResolvedValue('image-key');
        mockedGenerateImage.mockReset();
        mockedGenerateImage.mockImplementation(async (opts: { provider: string }) => {
          if (opts.provider === failedProvider) {
            throw new Error(failureMessage);
          }
          return [{ url: `file:///generated/${opts.provider}-1.png`, mimeType: 'image/png' }];
        });
        const store = configureStore({ reducer: { create: reducer } });

        const result = await store.dispatch(generateCreateImages({
          prompt: 'A comparison render',
          providers: [...providers],
          selectedModels,
        })).unwrap();

        const state = store.getState().create;
        expect(result.ids).toHaveLength(1);
        expect(result.failedProviders).toEqual([failedProvider]);
        expect(state.gallery).toHaveLength(1);
        expect(state.gallery[0].provider).toBe(successProvider);
        expect(state.generationProgress[successProvider]).toBe('complete');
        expect(state.generationProgress[failedProvider]).toBe('error');
        expect(state.lastImageGenerationResult).toMatchObject({
          ids: result.ids,
          providers: [...providers],
          status: 'partial',
          message: expectedSummary,
          failedProviders: [failedProvider],
        });
        expect(state.lastImageGenerationResult?.providerStatuses?.[successProvider]).toMatchObject({
          provider: successProvider,
          status: 'complete',
          resultIds: result.ids,
        });
        expect(state.lastImageGenerationResult?.providerStatuses?.[failedProvider]).toMatchObject({
          provider: failedProvider,
          modelId: selectedModels[failedProvider],
          status: 'error',
          error: failureMessage,
        });
        expect(state.generationError).toContain(expectedErrorPrefix);
      }
    );

    it('fails source-image runs with actionable provider errors', async () => {
      mockedReadStoredApiKey.mockResolvedValue('image-key');
      mockedGenerateImage.mockReset();
      mockedGenerateImage.mockImplementationOnce(async () => {
        throw new Error('Imagen 4 does not support image refinement.');
      });
      const store = configureStore({ reducer: { create: reducer } });

      const actionResult = await store.dispatch(generateCreateImages({
        prompt: 'Improve the lighting',
        providers: ['google'],
        selectedModels: { google: 'imagen-4.0-generate-001' },
        sourceImages: [{ uri: 'base64-source-image-data-that-is-long-enough-to-detect', base64: 'source-base64' }],
        refinementInstructions: 'Improve the lighting',
      }));
      expect(actionResult.type).toBe('create/generateCreateImages/rejected');
      if (!generateCreateImages.rejected.match(actionResult)) {
        throw new Error('expected generateCreateImages to reject');
      }
      expect(actionResult.error.message).toContain('Imagen 4 does not support image refinement.');

      expect(store.getState().create.lastImageGenerationResult).toMatchObject({
        ids: [],
        status: 'failed',
        message: expect.stringContaining('Imagen 4 does not support image refinement.'),
      });
      expect(store.getState().create.generationProgress.google).toBe('error');
    });
  });

  describe('media generation state', () => {
    it('sets active Create tab without changing image state', () => {
      const state = reducer(initialState, setActiveCreateTab('video'));

      expect(state.activeTab).toBe('video');
      expect(state.mediaGeneration.video).toBeNull();
    });

    it('tracks video generation lifecycle and unseen activity', () => {
      let state = reducer(initialState, startMediaGeneration({
        id: 'generation_1',
        mediaType: 'video',
        providerId: 'runway',
        operation: 'text_to_video',
        modelId: 'gen4.5',
        prompt: 'A city at sunrise',
        message: 'Starting video generation...',
      }));

      expect(state.mediaGeneration.video).toMatchObject({
        id: 'generation_1',
        mediaType: 'video',
        providerId: 'runway',
        status: 'queued',
        phase: 'queued',
      });
      expect(state.createActivity.status).toBe('running');
      expect(state.createActivity.hasUnseenActivity).toBe(false);

      state = reducer(state, updateMediaGeneration({
        mediaType: 'video',
        status: 'running',
        phase: 'rendering',
        providerTaskId: 'task_1',
        message: 'Rendering video...',
      }));

      expect(state.mediaGeneration.video).toMatchObject({
        status: 'running',
        phase: 'rendering',
        providerTaskId: 'task_1',
        message: 'Rendering video...',
      });

      state = reducer(state, completeMediaGeneration({
        mediaType: 'video',
        status: 'succeeded',
        message: 'Video generation complete.',
        resultId: mockMedia.id,
      }));

      expect(state.mediaGeneration.video).toBeNull();
      expect(state.lastMediaGenerationResult).toMatchObject({
        id: mockMedia.id,
        mediaType: 'video',
        status: 'succeeded',
        message: 'Video generation complete.',
      });
      expect(state.createActivity).toMatchObject({
        status: 'completed',
        hasUnseenActivity: true,
        lastEventId: mockMedia.id,
      });
    });

    it('tracks failed audio generation and clears unseen activity', () => {
      let state = reducer(initialState, startMediaGeneration({
        id: 'audio_generation_1',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        operation: 'text_to_speech',
        modelId: 'eleven_multilingual_v2',
        prompt: 'Read this line',
      }));

      state = reducer(state, failMediaGeneration({
        mediaType: 'audio',
        message: 'ElevenLabs request failed.',
      }));

      expect(state.mediaGeneration.audio).toBeNull();
      expect(state.lastMediaGenerationResult).toMatchObject({
        id: 'audio_generation_1',
        mediaType: 'audio',
        status: 'failed',
        message: 'ElevenLabs request failed.',
      });
      expect(state.createActivity.status).toBe('failed');
      expect(state.createActivity.hasUnseenActivity).toBe(true);

      state = reducer(state, markCreateActivitySeen());
      expect(state.createActivity.hasUnseenActivity).toBe(false);
    });

    it('enters video running state before async key lookup resolves', async () => {
      let resolveKey!: (value: string | null) => void;
      const keyPromise = new Promise<string | null>((resolve) => {
        resolveKey = resolve;
      });
      mockedReadStoredApiKey.mockReturnValueOnce(keyPromise);
      const store = configureStore({
        reducer: { create: reducer },
      });

      const resultPromise = store.dispatch(generateCreateVideo({
        prompt: 'A city timelapse',
        modelId: 'gen4.5',
        durationSeconds: 5,
        aspectRatio: '1280:720',
      }));

      expect(store.getState().create.mediaGeneration.video).toMatchObject({
        mediaType: 'video',
        providerId: 'runway',
        status: 'queued',
        message: 'Starting Runway video task...',
      });
      expect(store.getState().create.createActivity.status).toBe('running');

      resolveKey(null);
      await resultPromise;
    });

    it('enters audio running state before async key lookup resolves', async () => {
      let resolveKey!: (value: string | null) => void;
      const keyPromise = new Promise<string | null>((resolve) => {
        resolveKey = resolve;
      });
      mockedReadStoredApiKey.mockReturnValueOnce(keyPromise);
      const store = configureStore({
        reducer: { create: reducer },
      });

      const resultPromise = store.dispatch(generateCreateAudio({
        prompt: 'Read this line',
        operation: 'text_to_speech',
        modelId: 'eleven_multilingual_v2',
      }));

      expect(store.getState().create.mediaGeneration.audio).toMatchObject({
        mediaType: 'audio',
        providerId: 'elevenlabs',
        status: 'queued',
        message: 'Generating audio with ElevenLabs...',
      });
      expect(store.getState().create.createActivity.status).toBe('running');

      resolveKey(null);
      await resultPromise;
    });

    it('blocks low-credit Create voiceover before calling ElevenLabs generation', async () => {
      mockedReadStoredApiKey.mockResolvedValueOnce('eleven-key');
      const subscriptionSpy = jest.spyOn(MediaGenerationService, 'getElevenLabsSubscription').mockResolvedValueOnce({
        characterCount: 999,
        characterLimit: 1000,
        remainingCredits: 1,
        overageAllowed: false,
      });
      const generateAudioSpy = jest.spyOn(MediaGenerationService, 'generateElevenLabsAudio');
      const store = configureStore({
        reducer: { create: reducer },
      });

      try {
        await store.dispatch(generateCreateAudio({
          prompt: 'Read this longer line',
          operation: 'text_to_speech',
        }));

        expect(generateAudioSpy).not.toHaveBeenCalled();
        expect(store.getState().create.lastMediaGenerationResult).toMatchObject({
          mediaType: 'audio',
          status: 'failed',
          message: expect.stringContaining('Not enough ElevenLabs credits'),
        });
      } finally {
        subscriptionSpy.mockRestore();
        generateAudioSpy.mockRestore();
      }
    });

    it('marks completed image generation as unseen create activity too', () => {
      let state = reducer(initialState, startGeneration(['openai']));
      expect(state.createActivity.status).toBe('running');

      state = reducer(state, completeGeneration());
      expect(state.createActivity).toMatchObject({
        status: 'completed',
        hasUnseenActivity: true,
        lastMessage: 'Image generation complete.',
      });
    });
  });

  describe('gallery management', () => {
    const mockImage: GeneratedImageEntry = {
      id: 'img_1',
      uri: 'file:///test/image.png',
      prompt: 'A sunset. Photorealistic style',
      originalPrompt: 'A sunset',
      provider: 'openai',
      model: 'gpt-image-1',
      style: 'photo',
      size: 'square',
      quality: 'standard',
      createdAt: Date.now(),
      isRefinement: false,
      isUploaded: false,
    };

    it('adds image to gallery at the beginning', () => {
      const state = reducer(initialState, addToGallery(mockImage));
      expect(state.gallery).toHaveLength(1);
      expect(state.gallery[0]).toEqual(mockImage);
    });

    it('prepends new images to gallery', () => {
      let state = reducer(initialState, addToGallery(mockImage));
      const secondImage = { ...mockImage, id: 'img_2' };
      state = reducer(state, addToGallery(secondImage));

      expect(state.gallery).toHaveLength(2);
      expect(state.gallery[0].id).toBe('img_2');
      expect(state.gallery[1].id).toBe('img_1');
    });

    it('removes image from gallery by id', () => {
      let state = reducer(initialState, addToGallery(mockImage));
      state = reducer(state, removeFromGallery('img_1'));

      expect(state.gallery).toHaveLength(0);
    });

    it('does not perform filesystem side effects in reducer when removing image', () => {
      const state = reducer(initialState, addToGallery(mockImage));
      reducer(state, removeFromGallery('img_1'));

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('clears entire gallery', () => {
      let state = reducer(initialState, addToGallery(mockImage));
      state = reducer(state, addToGallery({ ...mockImage, id: 'img_2' }));
      state = reducer(state, clearGallery());

      expect(state.gallery).toHaveLength(0);
    });

    it('does not perform filesystem side effects in reducer when clearing gallery', () => {
      const image1 = { ...mockImage, uri: 'file:///test/image1.png' };
      const image2 = { ...mockImage, id: 'img_2', uri: 'file:///test/image2.png' };

      let state = reducer(initialState, addToGallery(image1));
      state = reducer(state, addToGallery(image2));
      reducer(state, clearGallery());

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('does not perform retention pruning in the gallery reducer', () => {
      let state = initialState;

      for (let i = 0; i < 51; i++) {
        state = reducer(state, addToGallery({
          ...mockImage,
          id: `img_${i}`,
          uri: `file:///test/image_${i}.png`,
        }));
      }

      expect(state.gallery).toHaveLength(51);
      expect(state.gallery.find(img => img.id === 'img_0')).toBeDefined();
    });

    it('does not perform filesystem side effects in reducer after exceeding the old cap', () => {
      let state = initialState;

      for (let i = 0; i < 51; i++) {
        state = reducer(state, addToGallery({
          ...mockImage,
          id: `img_${i}`,
          uri: `file:///test/image_${i}.png`,
        }));
      }

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('media gallery management', () => {
    it('adds media to gallery at the beginning', () => {
      const state = reducer(initialState, addToMediaGallery(mockMedia));

      expect(state.mediaGallery).toHaveLength(1);
      expect(state.mediaGallery[0]).toEqual(mockMedia);
    });

    it('replaces existing media gallery entries with the same id', () => {
      let state = reducer(initialState, addToMediaGallery(mockMedia));
      state = reducer(state, addToMediaGallery({
        ...mockMedia,
        uri: 'file:///test/replacement-video.mp4',
        createdAt: 456789,
      }));

      expect(state.mediaGallery).toHaveLength(1);
      expect(state.mediaGallery[0]).toMatchObject({
        id: mockMedia.id,
        uri: 'file:///test/replacement-video.mp4',
        createdAt: 456789,
      });
    });

    it('removes media from gallery by id', () => {
      let state = reducer(initialState, addToMediaGallery(mockMedia));
      state = reducer(state, removeFromMediaGallery(mockMedia.id));

      expect(state.mediaGallery).toEqual([]);
    });

    it('clears media gallery', () => {
      let state = reducer(initialState, addToMediaGallery(mockMedia));
      state = reducer(state, addToMediaGallery({
        ...mockMedia,
        id: 'media_2',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        operation: 'text_to_speech',
        uri: 'file:///test/audio.mp3',
        mimeType: 'audio/mpeg',
      }));
      state = reducer(state, clearMediaGallery());

      expect(state.mediaGallery).toEqual([]);
    });

    it('does not perform retention pruning in the media gallery reducer', () => {
      let state = initialState;

      for (let i = 0; i < 51; i++) {
        state = reducer(state, addToMediaGallery({
          ...mockMedia,
          id: `media_${i}`,
          uri: `file:///test/media_${i}.mp4`,
        }));
      }

      expect(state.mediaGallery).toHaveLength(51);
      expect(state.mediaGallery.find(entry => entry.id === 'media_0')).toBeDefined();
    });

    it('sets active Runway task metadata for resume', () => {
      const task: ActiveRunwayTask = {
        id: 'generation_1',
        providerTaskId: 'task_1',
        prompt: 'A city at sunrise',
        operation: 'text_to_video',
        modelId: 'gen4.5',
        durationSeconds: 5,
        aspectRatio: '1280:720',
        startedAt: 123456,
      };

      const state = reducer(initialState, setActiveRunwayTask(task));
      expect(state.activeRunwayTask).toEqual(task);
    });
  });

  describe('gallery library helpers', () => {
    const imageEntry: GeneratedImageEntry = {
      id: 'img_library',
      uri: 'file:///test/image.png',
      prompt: 'A sunset. Photorealistic style',
      originalPrompt: 'A sunset',
      revisedPrompt: 'A vivid sunset over water',
      provider: 'openai',
      model: 'gpt-image-1',
      style: 'photo',
      size: 'square',
      quality: 'standard',
      createdAt: 1000,
      isRefinement: false,
      isUploaded: false,
    };
    const videoEntry: GeneratedMediaEntry = {
      ...mockMedia,
      id: 'video_library',
      mediaType: 'video',
      providerId: 'runway',
      modelId: 'gen4.5',
      operation: 'text_to_video',
      prompt: 'A cinematic orbital shot',
      createdAt: 2000,
    };
    const audioEntry: GeneratedMediaEntry = {
      ...mockMedia,
      id: 'audio_library',
      mediaType: 'audio',
      providerId: 'elevenlabs',
      modelId: 'eleven_multilingual_v2',
      operation: 'text_to_speech',
      prompt: 'Read a short greeting',
      uri: 'file:///test/audio.mp3',
      mimeType: 'audio/mpeg',
      createdAt: 3000,
    };
    const defaultFilters: GalleryFilterState = {
      providers: [],
      models: [],
      operations: [],
      dateRange: 'all',
      availability: 'all',
    };

    it('normalizes mixed image, video, and audio entries with counts', () => {
      const assets = normalizeGalleryAssets([imageEntry], [videoEntry, audioEntry]);
      const counts = getGalleryAssetCounts(assets);

      expect(assets.map((asset) => asset.type)).toEqual(['audio', 'video', 'image']);
      expect(counts).toEqual({ all: 3, image: 1, video: 1, audio: 1 });
    });

    it('filters gallery assets by search, provider, model, and operation', () => {
      const assets = normalizeGalleryAssets([imageEntry], [videoEntry, audioEntry]);

      expect(getFilteredGalleryAssets(assets, 'sunset', defaultFilters)).toHaveLength(1);
      expect(getFilteredGalleryAssets(assets, '', { ...defaultFilters, providers: ['runway'] })).toEqual([
        expect.objectContaining({ id: 'video_library' }),
      ]);
      expect(getFilteredGalleryAssets(assets, '', { ...defaultFilters, models: ['eleven_multilingual_v2'] })).toEqual([
        expect.objectContaining({ id: 'audio_library' }),
      ]);
      expect(getFilteredGalleryAssets(assets, '', { ...defaultFilters, operations: ['text_to_video'] })).toEqual([
        expect.objectContaining({ id: 'video_library' }),
      ]);
    });

    it('sorts gallery assets by oldest, provider, and model', () => {
      const assets = normalizeGalleryAssets([imageEntry], [videoEntry, audioEntry]);

      expect(getSortedGalleryAssets(assets, 'oldest').map((asset) => asset.id)).toEqual([
        'img_library',
        'video_library',
        'audio_library',
      ]);
      expect(getSortedGalleryAssets(assets, 'provider')[0].providerId).toBe('elevenlabs');
      expect(getSortedGalleryAssets(assets, 'model')[0].modelId).toBe('eleven_multilingual_v2');
    });

    it('selects oldest mixed assets for shared retention cleanup', () => {
      const images = Array.from({ length: LOCAL_GALLERY_ASSET_LIMIT }, (_, index) => ({
        ...imageEntry,
        id: `img_${index}`,
        uri: `file:///test/image_${index}.png`,
        createdAt: index + 1,
      }));
      const media = [{
        ...videoEntry,
        id: 'new_video',
        uri: 'file:///test/new-video.mp4',
        createdAt: LOCAL_GALLERY_ASSET_LIMIT + 1,
      }];

      const overflow = getGalleryRetentionOverflow(images, media);

      expect(overflow.images.map((entry) => entry.id)).toEqual(['img_0']);
      expect(overflow.media).toEqual([]);
    });
  });

  describe('reset state', () => {
    it('resets entire state to initial values', () => {
      let state = reducer(initialState, setActiveCreateTab('video'));
      state = reducer(state, startGeneration(['openai']));
      state = reducer(state, resetCreateState());

      expect(state).toEqual({
        ...initialState,
        gallery: [], // Gallery preserved as empty array
        galleryHydrated: false,
      });
    });
  });

  describe('selectors', () => {
    const mockRootState = { create: initialState };

    it('selectCreateState returns entire create state', () => {
      expect(selectCreateState(mockRootState)).toEqual(initialState);
    });

    it('selectGallery returns gallery array', () => {
      expect(selectGallery(mockRootState)).toEqual([]);
    });

    it('selectIsGenerating returns generation status', () => {
      expect(selectIsGenerating(mockRootState)).toBe(false);

      const generatingState = reducer(initialState, startGeneration(['openai']));
      expect(selectIsGenerating({ create: generatingState })).toBe(true);
    });

    it('selectGenerationProgress returns progress object', () => {
      expect(selectGenerationProgress(mockRootState)).toEqual({});

      const stateWithProgress = reducer(initialState, startGeneration(['openai']));
      expect(selectGenerationProgress({ create: stateWithProgress })).toEqual({ openai: 'pending' });
    });
  });

  describe('async thunks', () => {
    const thunkImage: GeneratedImageEntry = {
      id: 'img_thunk',
      uri: 'file:///test/thunk-image.png',
      prompt: 'Test',
      originalPrompt: 'Test',
      provider: 'openai',
      model: 'gpt-image-1',
      createdAt: Date.now(),
      isRefinement: false,
      isUploaded: false,
    };

    it('hydrateGallery loads valid entries from storage', async () => {
      const mockGallery: GeneratedImageEntry[] = [
        {
          id: 'img_1',
          uri: 'file:///test/image.png',
          prompt: 'Test',
          originalPrompt: 'Test',
          provider: 'openai',
          model: 'gpt-image-1',
          createdAt: Date.now(),
          isRefinement: false,
          isUploaded: false,
        },
      ];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockGallery));
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(hydrateGallery());
      const state = store.getState().create;

      expect(state.galleryHydrated).toBe(true);
      expect(state.gallery).toHaveLength(1);
    });

    it('hydrateGallery filters out entries with missing files', async () => {
      const mockGallery: GeneratedImageEntry[] = [
        {
          id: 'img_1',
          uri: 'file:///test/existing.png',
          prompt: 'Test',
          originalPrompt: 'Test',
          provider: 'openai',
          model: 'gpt-image-1',
          createdAt: Date.now(),
          isRefinement: false,
          isUploaded: false,
        },
        {
          id: 'img_2',
          uri: 'file:///test/missing.png',
          prompt: 'Test',
          originalPrompt: 'Test',
          provider: 'openai',
          model: 'gpt-image-1',
          createdAt: Date.now(),
          isRefinement: false,
          isUploaded: false,
        },
      ];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockGallery));
      (FileSystem.getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: true })
        .mockResolvedValueOnce({ exists: false });

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(hydrateGallery());
      const state = store.getState().create;

      expect(state.gallery).toHaveLength(1);
      expect(state.gallery[0].id).toBe('img_1');
    });

    it('hydrateGallery handles empty storage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(hydrateGallery());
      const state = store.getState().create;

      expect(state.galleryHydrated).toBe(true);
      expect(state.gallery).toHaveLength(0);
    });

    it('hydrateGallery marks as hydrated even on error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(hydrateGallery());
      const state = store.getState().create;

      expect(state.galleryHydrated).toBe(true);
    });

    it('persistGallery saves gallery to storage', async () => {
      const mockGallery: GeneratedImageEntry[] = [
        {
          id: 'img_1',
          uri: 'file:///test/image.png',
          prompt: 'Test',
          originalPrompt: 'Test',
          provider: 'openai',
          model: 'gpt-image-1',
          createdAt: Date.now(),
          isRefinement: false,
          isUploaded: false,
        },
      ];

      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(persistGallery(mockGallery));

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'create_gallery',
        JSON.stringify(mockGallery)
      );
    });

    it('addToGalleryWithCleanup deletes the shared-retention pruned local file outside the reducer', async () => {
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            gallery: Array.from({ length: LOCAL_GALLERY_ASSET_LIMIT }, (_, index) => LOCAL_GALLERY_ASSET_LIMIT - 1 - index).map((index) => ({
              ...thunkImage,
              id: `img_${index}`,
              uri: `file:///test/image_${index}.png`,
              createdAt: index,
            })),
          },
        },
      });

      await store.dispatch(addToGalleryWithCleanup({
        ...thunkImage,
        id: 'img_new',
        uri: 'file:///test/new-image.png',
        createdAt: LOCAL_GALLERY_ASSET_LIMIT + 1,
      }));

      expect(store.getState().create.gallery).toHaveLength(LOCAL_GALLERY_ASSET_LIMIT);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///test/image_0.png', { idempotent: true });
      expect(store.getState().create.gallery[0].id).toBe('img_new');
      expect(store.getState().create.gallery.find((image) => image.id === 'img_0')).toBeUndefined();
    });

    it('removeFromGalleryWithCleanup deletes the removed local file outside the reducer', async () => {
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            gallery: [thunkImage],
          },
        },
      });

      await store.dispatch(removeFromGalleryWithCleanup(thunkImage.id));

      expect(store.getState().create.gallery).toHaveLength(0);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(thunkImage.uri, { idempotent: true });
    });

    it('clearGalleryWithCleanup deletes all local gallery files outside the reducer', async () => {
      const secondImage = { ...thunkImage, id: 'img_2', uri: 'file:///test/second.png' };
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            gallery: [thunkImage, secondImage],
          },
        },
      });

      await store.dispatch(clearGalleryWithCleanup());

      expect(store.getState().create.gallery).toEqual([]);
      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(thunkImage.uri, { idempotent: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(secondImage.uri, { idempotent: true });
    });

    it('hydrateMediaGallery loads media entries and resumable Runway task metadata', async () => {
      const activeTask: ActiveRunwayTask = {
        id: 'generation_1',
        providerTaskId: 'task_1',
        prompt: 'A city at sunrise',
        operation: 'text_to_video',
        modelId: 'gen4.5',
        durationSeconds: 5,
        aspectRatio: '1280:720',
        startedAt: 123456,
      };

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === 'create_media_gallery') {
          return Promise.resolve(JSON.stringify([mockMedia]));
        }
        if (key === 'create_active_media_task') {
          return Promise.resolve(JSON.stringify(activeTask));
        }
        return Promise.resolve(null);
      });

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(hydrateMediaGallery());
      const state = store.getState().create;

      expect(state.mediaGalleryHydrated).toBe(true);
      expect(state.mediaGallery).toEqual([mockMedia]);
      expect(state.activeRunwayTask).toEqual(activeTask);
    });

    it('hydrateMediaGallery removes duplicate media ids from persisted data', async () => {
      const duplicateMedia = {
        ...mockMedia,
        uri: 'file:///test/duplicate-video.mp4',
        createdAt: mockMedia.createdAt - 1,
      };

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === 'create_media_gallery') {
          return Promise.resolve(JSON.stringify([mockMedia, duplicateMedia]));
        }
        return Promise.resolve(null);
      });

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(hydrateMediaGallery());

      expect(store.getState().create.mediaGallery).toEqual([mockMedia]);
    });

    it('persistMediaGallery saves media entries to storage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(persistMediaGallery([mockMedia]));

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'create_media_gallery',
        JSON.stringify([mockMedia])
      );
    });

    it('persistMediaGallery deduplicates media entries before writing storage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const store = configureStore({
        reducer: { create: reducer },
      });

      await store.dispatch(persistMediaGallery([
        mockMedia,
        { ...mockMedia, uri: 'file:///test/duplicate-video.mp4' },
      ]));

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'create_media_gallery',
        JSON.stringify([mockMedia])
      );
    });

    it('addToMediaGalleryWithCleanup deletes shared-retention pruned local media outside the reducer', async () => {
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            mediaGallery: Array.from({ length: LOCAL_GALLERY_ASSET_LIMIT }, (_, index) => LOCAL_GALLERY_ASSET_LIMIT - 1 - index).map((index) => ({
              ...mockMedia,
              id: `media_${index}`,
              uri: `file:///test/media_${index}.mp4`,
              createdAt: index,
            })),
          },
        },
      });

      await store.dispatch(addToMediaGalleryWithCleanup({
        ...mockMedia,
        id: 'media_new',
        uri: 'file:///test/new-media.mp4',
        createdAt: LOCAL_GALLERY_ASSET_LIMIT + 1,
      }));

      expect(store.getState().create.mediaGallery).toHaveLength(LOCAL_GALLERY_ASSET_LIMIT);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///test/media_0.mp4', { idempotent: true });
      expect(store.getState().create.mediaGallery[0].id).toBe('media_new');
      expect(store.getState().create.mediaGallery.find((entry) => entry.id === 'media_0')).toBeUndefined();
    });

    it('addToMediaGalleryWithCleanup does not duplicate completed media tasks', async () => {
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            mediaGallery: [mockMedia],
          },
        },
      });

      const replacement = {
        ...mockMedia,
        uri: 'file:///test/replacement-video.mp4',
        createdAt: 456789,
      };

      await store.dispatch(addToMediaGalleryWithCleanup(replacement));

      expect(store.getState().create.mediaGallery).toEqual([replacement]);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockMedia.uri, { idempotent: true });
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'create_media_gallery',
        JSON.stringify([replacement])
      );
    });

    it('removeFromMediaGalleryWithCleanup deletes removed local media outside the reducer', async () => {
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            mediaGallery: [mockMedia],
          },
        },
      });

      await store.dispatch(removeFromMediaGalleryWithCleanup(mockMedia.id));

      expect(store.getState().create.mediaGallery).toEqual([]);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockMedia.uri, { idempotent: true });
    });

    it('removeFromMediaGalleryWithCleanup deletes a voice pack directory', async () => {
      const voicePackMedia: GeneratedMediaEntry = {
        id: 'voice_pack_1',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        modelId: 'debate_voice_pack',
        operation: 'debate_voice_pack',
        prompt: 'Voice pack: Resolved',
        uri: 'file:///documents/gallery-voice-packs/voice_pack_1/001_msg.mp3',
        mimeType: 'audio/mpeg',
        status: 'succeeded',
        createdAt: 123,
        voicePack: {
          kind: 'debate_voice_pack',
          version: 1,
          sessionId: 'debate_1',
          topic: 'Resolved',
          participants: [{ id: 'openai', name: 'ChatGPT' }],
          clips: [{
            id: 'clip_1',
            messageId: 'msg_1',
            order: 0,
            speakerId: 'openai',
            speakerName: 'ChatGPT',
            textPreview: 'Opening statement.',
            uri: 'file:///documents/gallery-voice-packs/voice_pack_1/001_msg.mp3',
            mimeType: 'audio/mpeg',
            fileName: '001_msg.mp3',
            pauseAfterMs: 900,
          }],
          pauseMs: 900,
          directoryUri: 'file:///documents/gallery-voice-packs/voice_pack_1/',
          createdAt: 123,
        },
      };
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            mediaGallery: [voicePackMedia],
          },
        },
      });

      await store.dispatch(removeFromMediaGalleryWithCleanup(voicePackMedia.id));

      expect(store.getState().create.mediaGallery).toEqual([]);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///documents/gallery-voice-packs/voice_pack_1/',
        { idempotent: true }
      );
    });

    it('clearMediaGalleryWithCleanup deletes all local media files outside the reducer', async () => {
      const audioMedia: GeneratedMediaEntry = {
        ...mockMedia,
        id: 'media_audio',
        mediaType: 'audio',
        providerId: 'elevenlabs',
        operation: 'text_to_speech',
        uri: 'file:///test/audio.mp3',
        mimeType: 'audio/mpeg',
      };
      const store = configureStore({
        reducer: { create: reducer },
        preloadedState: {
          create: {
            ...initialState,
            mediaGallery: [mockMedia, audioMedia],
          },
        },
      });

      await store.dispatch(clearMediaGalleryWithCleanup());

      expect(store.getState().create.mediaGallery).toEqual([]);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockMedia.uri, { idempotent: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(audioMedia.uri, { idempotent: true });
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('create_media_gallery', JSON.stringify([]));
    });
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      expect(initialState.isGenerating).toBe(false);
      expect(initialState.generationProgress).toEqual({});
      expect(initialState.gallery).toEqual([]);
      expect(initialState.galleryHydrated).toBe(false);
      expect(initialState.activeTab).toBe('image');
      expect(initialState.mediaGallery).toEqual([]);
      expect(initialState.mediaGalleryHydrated).toBe(false);
      expect(initialState.mediaGeneration).toEqual({ video: null, audio: null });
      expect(initialState.activeRunwayTask).toBeUndefined();
      expect(initialState.lastMediaGenerationResult).toBeUndefined();
      expect(initialState.createActivity).toEqual({
        status: 'idle',
        hasUnseenActivity: false,
      });
    });
  });
});
