/**
 * Tests for createSlice - Redux slice for Create mode AI image generation
 */
import reducer, {
  setSelectedProviders,
  toggleProvider,
  setMode,
  setPrompt,
  setStyle,
  setSize,
  setQuality,
  startGeneration,
  updateGenerationProgress,
  completeGeneration,
  generationError,
  clearGenerationError,
  addToGallery,
  removeFromGallery,
  clearGallery,
  startRefinement,
  setRefinementPrompt,
  cancelRefinement,
  completeRefinement,
  setSourceImage,
  clearSourceImage,
  setFocusedImage,
  resetCreateState,
  selectCreateState,
  selectGallery,
  selectIsGenerating,
  selectSelectedProviders,
  selectGenerationProgress,
  hydrateGallery,
  persistGallery,
  type CreateState,
  type GeneratedImageEntry,
} from '@/store/createSlice';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

const initialState = reducer(undefined, { type: 'init' });

describe('createSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('provider selection', () => {
    it('sets selected providers and updates mode', () => {
      const state = reducer(initialState, setSelectedProviders(['openai', 'google']));
      expect(state.selectedProviders).toEqual(['openai', 'google']);
      expect(state.mode).toBe('compare');
    });

    it('limits providers to maximum of 3', () => {
      const state = reducer(initialState, setSelectedProviders(['openai', 'google', 'grok', 'claude']));
      expect(state.selectedProviders).toHaveLength(3);
      expect(state.selectedProviders).toEqual(['openai', 'google', 'grok']);
    });

    it('sets mode to single when only one provider selected', () => {
      const state = reducer(initialState, setSelectedProviders(['openai']));
      expect(state.selectedProviders).toEqual(['openai']);
      expect(state.mode).toBe('single');
    });

    it('toggles provider on when not selected', () => {
      const state = reducer(initialState, toggleProvider('openai'));
      expect(state.selectedProviders).toContain('openai');
    });

    it('toggles provider off when already selected', () => {
      let state = reducer(initialState, toggleProvider('openai'));
      state = reducer(state, toggleProvider('openai'));
      expect(state.selectedProviders).not.toContain('openai');
    });

    it('does not add more than 3 providers via toggle', () => {
      let state = reducer(initialState, toggleProvider('openai'));
      state = reducer(state, toggleProvider('google'));
      state = reducer(state, toggleProvider('grok'));
      state = reducer(state, toggleProvider('claude'));
      expect(state.selectedProviders).toHaveLength(3);
      expect(state.selectedProviders).not.toContain('claude');
    });

    it('updates mode when toggling providers', () => {
      let state = reducer(initialState, toggleProvider('openai'));
      expect(state.mode).toBe('single');

      state = reducer(state, toggleProvider('google'));
      expect(state.mode).toBe('compare');
    });
  });

  describe('mode management', () => {
    it('sets mode to single', () => {
      const state = reducer(initialState, setMode('single'));
      expect(state.mode).toBe('single');
    });

    it('sets mode to compare', () => {
      const state = reducer(initialState, setMode('compare'));
      expect(state.mode).toBe('compare');
    });

    it('keeps only first provider when switching to single mode with multiple providers', () => {
      let state = reducer(initialState, setSelectedProviders(['openai', 'google']));
      state = reducer(state, setMode('single'));
      expect(state.selectedProviders).toHaveLength(1);
      expect(state.selectedProviders).toEqual(['openai']);
    });
  });

  describe('prompt and options', () => {
    it('sets prompt', () => {
      const state = reducer(initialState, setPrompt('A beautiful sunset'));
      expect(state.currentPrompt).toBe('A beautiful sunset');
    });

    it('sets style', () => {
      const state = reducer(initialState, setStyle('cinematic'));
      expect(state.selectedStyle).toBe('cinematic');
    });

    it('sets size', () => {
      const state = reducer(initialState, setSize('portrait'));
      expect(state.selectedSize).toBe('portrait');
    });

    it('sets quality', () => {
      const state = reducer(initialState, setQuality('hd'));
      expect(state.selectedQuality).toBe('hd');
    });

    it('supports all style presets', () => {
      const styles = ['none', 'photo', 'cinematic', 'anime', 'digital-art', 'oil-painting', 'watercolor', 'sketch', '3d-render'] as const;
      styles.forEach(style => {
        const state = reducer(initialState, setStyle(style));
        expect(state.selectedStyle).toBe(style);
      });
    });

    it('supports all size options', () => {
      const sizes = ['auto', 'square', 'portrait', 'landscape'] as const;
      sizes.forEach(size => {
        const state = reducer(initialState, setSize(size));
        expect(state.selectedSize).toBe(size);
      });
    });

    it('supports all quality options', () => {
      const qualities = ['standard', 'hd'] as const;
      qualities.forEach(quality => {
        const state = reducer(initialState, setQuality(quality));
        expect(state.selectedQuality).toBe(quality);
      });
    });
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

    it('calls FileSystem.deleteAsync when removing image', () => {
      let state = reducer(initialState, addToGallery(mockImage));
      reducer(state, removeFromGallery('img_1'));

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockImage.uri, { idempotent: true });
    });

    it('clears entire gallery', () => {
      let state = reducer(initialState, addToGallery(mockImage));
      state = reducer(state, addToGallery({ ...mockImage, id: 'img_2' }));
      state = reducer(state, clearGallery());

      expect(state.gallery).toHaveLength(0);
    });

    it('calls FileSystem.deleteAsync for all images when clearing gallery', () => {
      const image1 = { ...mockImage, uri: 'file:///test/image1.png' };
      const image2 = { ...mockImage, id: 'img_2', uri: 'file:///test/image2.png' };

      let state = reducer(initialState, addToGallery(image1));
      state = reducer(state, addToGallery(image2));
      reducer(state, clearGallery());

      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    });

    it('auto-prunes gallery when exceeding max size (50)', () => {
      let state = initialState;

      // Add 51 images to trigger auto-prune
      for (let i = 0; i < 51; i++) {
        state = reducer(state, addToGallery({
          ...mockImage,
          id: `img_${i}`,
          uri: `file:///test/image_${i}.png`,
        }));
      }

      expect(state.gallery).toHaveLength(50);
      // First image should be removed (oldest)
      expect(state.gallery.find(img => img.id === 'img_0')).toBeUndefined();
    });
  });

  describe('refinement state', () => {
    it('starts refinement with image id', () => {
      const state = reducer(initialState, startRefinement('img_1'));
      expect(state.isRefining).toBe(true);
      expect(state.refiningImageId).toBe('img_1');
      expect(state.refinementPrompt).toBe('');
    });

    it('sets refinement prompt', () => {
      let state = reducer(initialState, startRefinement('img_1'));
      state = reducer(state, setRefinementPrompt('Make it more vibrant'));
      expect(state.refinementPrompt).toBe('Make it more vibrant');
    });

    it('cancels refinement', () => {
      let state = reducer(initialState, startRefinement('img_1'));
      state = reducer(state, setRefinementPrompt('Some instructions'));
      state = reducer(state, cancelRefinement());

      expect(state.isRefining).toBe(false);
      expect(state.refiningImageId).toBeUndefined();
      expect(state.refinementPrompt).toBe('');
    });

    it('completes refinement', () => {
      let state = reducer(initialState, startRefinement('img_1'));
      state = reducer(state, setRefinementPrompt('Add more contrast'));
      state = reducer(state, completeRefinement());

      expect(state.isRefining).toBe(false);
      expect(state.refiningImageId).toBeUndefined();
      expect(state.refinementPrompt).toBe('');
    });
  });

  describe('source image management', () => {
    it('sets source image with uri', () => {
      const state = reducer(initialState, setSourceImage({ uri: 'file:///source.png' }));
      expect(state.sourceImageUri).toBe('file:///source.png');
      expect(state.sourceImageBase64).toBeUndefined();
    });

    it('sets source image with uri and base64', () => {
      const state = reducer(initialState, setSourceImage({
        uri: 'file:///source.png',
        base64: 'base64encodeddata',
      }));
      expect(state.sourceImageUri).toBe('file:///source.png');
      expect(state.sourceImageBase64).toBe('base64encodeddata');
    });

    it('clears source image', () => {
      let state = reducer(initialState, setSourceImage({
        uri: 'file:///source.png',
        base64: 'base64data',
      }));
      state = reducer(state, clearSourceImage());

      expect(state.sourceImageUri).toBeUndefined();
      expect(state.sourceImageBase64).toBeUndefined();
    });
  });

  describe('UI state', () => {
    it('sets focused image id', () => {
      const state = reducer(initialState, setFocusedImage('img_1'));
      expect(state.focusedImageId).toBe('img_1');
    });

    it('clears focused image id', () => {
      let state = reducer(initialState, setFocusedImage('img_1'));
      state = reducer(state, setFocusedImage(undefined));
      expect(state.focusedImageId).toBeUndefined();
    });
  });

  describe('reset state', () => {
    it('resets entire state to initial values', () => {
      let state = reducer(initialState, setSelectedProviders(['openai', 'google']));
      state = reducer(state, setPrompt('Test prompt'));
      state = reducer(state, setStyle('cinematic'));
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

    it('selectSelectedProviders returns selected providers', () => {
      expect(selectSelectedProviders(mockRootState)).toEqual([]);

      const stateWithProviders = reducer(initialState, setSelectedProviders(['openai', 'google']));
      expect(selectSelectedProviders({ create: stateWithProviders })).toEqual(['openai', 'google']);
    });

    it('selectGenerationProgress returns progress object', () => {
      expect(selectGenerationProgress(mockRootState)).toEqual({});

      const stateWithProgress = reducer(initialState, startGeneration(['openai']));
      expect(selectGenerationProgress({ create: stateWithProgress })).toEqual({ openai: 'pending' });
    });
  });

  describe('async thunks', () => {
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
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      expect(initialState.selectedProviders).toEqual([]);
      expect(initialState.mode).toBe('single');
      expect(initialState.isGenerating).toBe(false);
      expect(initialState.generationProgress).toEqual({});
      expect(initialState.currentPrompt).toBe('');
      expect(initialState.selectedStyle).toBe('none');
      expect(initialState.selectedSize).toBe('auto');
      expect(initialState.selectedQuality).toBe('standard');
      expect(initialState.gallery).toEqual([]);
      expect(initialState.galleryHydrated).toBe(false);
      expect(initialState.isRefining).toBe(false);
      expect(initialState.refinementPrompt).toBe('');
    });
  });
});
