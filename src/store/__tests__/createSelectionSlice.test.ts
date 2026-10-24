import reducer, {
  hydrateCreateSelection,
  setImageSelection,
  addImageSelection,
  updateImageSelection,
  removeImageSelection,
  setImageOptions,
  setVideoOptions,
  setAudioOptions,
  setAttachments,
  addAttachment,
  removeAttachment,
  clearAttachments,
  type CreateSelectionState,
} from '../createSelectionSlice';
import {
  ELEVENLABS_DEFAULT_TTS_MODEL,
  RUNWAY_DEFAULT_VIDEO_MODEL,
} from '../../config/mediaProviders';
import type { CreateSelectionConfig } from '../../types/createSelection';

const initial = (): CreateSelectionState => reducer(undefined, { type: '@@INIT' });

const config = (providerId: string, modelId = 'model-1'): CreateSelectionConfig => ({
  providerId,
  modelId,
});

describe('createSelectionSlice', () => {
  it('starts unhydrated with catalog defaults', () => {
    const state = initial();
    expect(state.hydrated).toBe(false);
    expect(state.image).toEqual([]);
    expect(state.videoOptions.modelId).toBe(RUNWAY_DEFAULT_VIDEO_MODEL);
    expect(state.audioOptions.ttsModelId).toBe(ELEVENLABS_DEFAULT_TTS_MODEL);
    expect(state.attachments).toEqual({ image: [], video: [], audio: [] });
  });

  describe('hydrateCreateSelection', () => {
    it('replaces persisted fields, clamps limits, and flips hydrated', () => {
      const state = reducer(
        initial(),
        hydrateCreateSelection({
          image: [config('openai'), config('google'), config('grok'), config('claude')],
          imageOptions: { style: 'anime', count: 99 },
          videoOptions: { durationSeconds: 8 },
          audioOptions: { operation: 'sound_effect' },
        })
      );

      expect(state.hydrated).toBe(true);
      expect(state.image.map(c => c.providerId)).toEqual(['openai', 'google', 'grok']);
      expect(state.imageOptions).toEqual({ style: 'anime', size: 'auto', count: 10 });
      expect(state.videoOptions.durationSeconds).toBe(8);
      expect(state.videoOptions.modelId).toBe(RUNWAY_DEFAULT_VIDEO_MODEL);
      expect(state.audioOptions.operation).toBe('sound_effect');
    });

    it('flips hydrated on a null payload without touching defaults (first run)', () => {
      const state = reducer(initial(), hydrateCreateSelection(null));
      expect(state.hydrated).toBe(true);
      expect(state.image).toEqual([]);
      expect(state.imageOptions).toEqual({ style: 'none', size: 'auto', count: 1 });
    });
  });

  describe('image selection', () => {
    it('adds up to three pills and blocks duplicate providers', () => {
      let state = reducer(initial(), addImageSelection(config('openai')));
      state = reducer(state, addImageSelection(config('openai', 'other-model')));
      expect(state.image).toHaveLength(1);

      state = reducer(state, addImageSelection(config('google')));
      state = reducer(state, addImageSelection(config('grok')));
      state = reducer(state, addImageSelection(config('claude')));
      expect(state.image.map(c => c.providerId)).toEqual(['openai', 'google', 'grok']);
    });

    it('updates and removes by index with bounds guards', () => {
      let state = reducer(initial(), setImageSelection([config('openai'), config('google')]));

      state = reducer(
        state,
        updateImageSelection({ index: 1, config: { ...config('google', 'gemini-3-pro-image'), settings: { quality: 'hd' } } })
      );
      expect(state.image[1].modelId).toBe('gemini-3-pro-image');
      expect(state.image[1].settings).toEqual({ quality: 'hd' });

      state = reducer(state, updateImageSelection({ index: 5, config: config('grok') }));
      expect(state.image.map(c => c.providerId)).toEqual(['openai', 'google']);

      state = reducer(state, removeImageSelection({ index: 0 }));
      expect(state.image.map(c => c.providerId)).toEqual(['google']);

      state = reducer(state, removeImageSelection({ index: 9 }));
      expect(state.image).toHaveLength(1);
    });

    it('clamps setImageSelection to three entries', () => {
      const state = reducer(
        initial(),
        setImageSelection([config('a'), config('b'), config('c'), config('d')])
      );
      expect(state.image).toHaveLength(3);
    });
  });

  describe('options', () => {
    it('merges patches and clamps image count into [1, 10]', () => {
      let state = reducer(initial(), setImageOptions({ count: 0 }));
      expect(state.imageOptions.count).toBe(1);

      state = reducer(state, setImageOptions({ count: 42 }));
      expect(state.imageOptions.count).toBe(10);

      state = reducer(state, setImageOptions({ style: 'photo' }));
      expect(state.imageOptions).toEqual({ style: 'photo', size: 'auto', count: 10 });
    });

    it('patches video and audio options independently', () => {
      let state = reducer(initial(), setVideoOptions({ aspectRatio: '720:1280' }));
      state = reducer(state, setAudioOptions({ voiceId: 'v-2', voiceName: 'Nova' }));

      expect(state.videoOptions.aspectRatio).toBe('720:1280');
      expect(state.videoOptions.modelId).toBe(RUNWAY_DEFAULT_VIDEO_MODEL);
      expect(state.audioOptions.voiceId).toBe('v-2');
      expect(state.audioOptions.voiceName).toBe('Nova');
      expect(state.audioOptions.operation).toBe('text_to_speech');
    });
  });

  describe('attachments', () => {
    it('adds per tab, dedupes by uri, removes, and clears', () => {
      let state = reducer(
        initial(),
        addAttachment({ tab: 'image', attachment: { uri: 'file://a.png' } })
      );
      state = reducer(
        state,
        addAttachment({ tab: 'image', attachment: { uri: 'file://a.png', mimeType: 'image/png' } })
      );
      state = reducer(
        state,
        addAttachment({ tab: 'video', attachment: { uri: 'file://b.png' } })
      );

      expect(state.attachments.image).toHaveLength(1);
      expect(state.attachments.video).toHaveLength(1);

      state = reducer(state, removeAttachment({ tab: 'image', uri: 'file://a.png' }));
      expect(state.attachments.image).toEqual([]);
      expect(state.attachments.video).toHaveLength(1);

      state = reducer(
        state,
        setAttachments({ tab: 'audio', attachments: [{ uri: 'file://c.png' }] })
      );
      state = reducer(state, clearAttachments({ tab: 'audio' }));
      expect(state.attachments.audio).toEqual([]);
    });
  });
});
