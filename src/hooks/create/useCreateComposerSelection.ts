import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import {
  RootState,
  isApiKeyConfigured,
  addImageSelection,
  updateImageSelection,
  removeImageSelection,
  setImageOptions,
  setVideoOptions,
  setAudioOptions,
} from '../../store';
import type { AIProvider } from '../../types';
import type { CreateTab } from '../../types/media';
import type { CreateSelectionConfig } from '../../types/createSelection';
import type { ImageModelSettings } from '../../store/createSlice';
import {
  IMAGE_MODELS,
  getResolvedImageModel,
  resolveImageModelId,
  supportsImageGeneration,
  type ImageModelConfig,
} from '../../config/imageGenerationModels';
import { AI_PROVIDERS } from '../../config/aiProviders';
import { MEDIA_PROVIDERS } from '../../config/mediaProviders';
import type { ProviderPickerItem } from '../../components/organisms/composer/ProviderOptionList';
import CreateSelectionPersistenceService from '../../services/create/CreateSelectionPersistenceService';
import useFeatureAccess from '@/hooks/useFeatureAccess';

/** Providers with an image-generation catalog (openai/google/grok today). */
export const IMAGE_GEN_PROVIDER_IDS = Object.keys(IMAGE_MODELS) as AIProvider[];

export interface ImageGenerationSelectionMaps {
  providers: AIProvider[];
  selectedModels: Partial<Record<AIProvider, string>>;
  modelSettings: Partial<Record<AIProvider, ImageModelSettings>>;
}

/**
 * Draft AI selection for the Studio composer, the Create-mode sibling of
 * useComposerSelection.
 *
 * Reads are non-destructive: persisted image pills whose provider currently
 * lacks a verified key are hidden, not deleted, and stale model ids re-resolve
 * to the current catalog. Video/audio have exactly one possible provider, so
 * their pill is derived from options + key presence rather than stored.
 *
 * Persistence rides a state-watching effect (multiple dispatch sites: pills,
 * option sheets) and is skipped in demo mode so simulated lineups never
 * overwrite the user's real selection.
 */
export const useCreateComposerSelection = (tab: CreateTab) => {
  const dispatch = useDispatch();
  const reduxStore = useStore<RootState>();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const verifiedProviders = useSelector(
    (state: RootState) => state.settings.verifiedProviders || []
  );
  const selection = useSelector((state: RootState) => state.createSelection);
  const { isDemo } = useFeatureAccess();

  const { image, imageOptions, videoOptions, audioOptions, attachments, hydrated } = selection;

  const isImageProviderConfigured = useCallback(
    (providerId: string): boolean => {
      if (!IMAGE_GEN_PROVIDER_IDS.includes(providerId as AIProvider)) return false;
      if (isDemo) return true;
      return (
        isApiKeyConfigured(apiKeys[providerId]) &&
        verifiedProviders.includes(providerId) &&
        supportsImageGeneration(providerId as AIProvider)
      );
    },
    [apiKeys, verifiedProviders, isDemo]
  );

  const hasRunwayKey = isApiKeyConfigured(apiKeys.runway);
  const hasElevenLabsKey = isApiKeyConfigured(apiKeys.elevenlabs);

  /** Validated image pills, independent of the active tab (drives caps/maps). */
  const imageConfigs = useMemo<CreateSelectionConfig[]>(
    () =>
      image
        .filter(config => isImageProviderConfigured(config.providerId))
        .map(config => ({
          ...config,
          modelId:
            resolveImageModelId(config.providerId as AIProvider, config.modelId) ||
            config.modelId,
        })),
    [image, isImageProviderConfigured]
  );

  /** Visible pills for the active tab; indices align with update/remove. */
  const configs = useMemo<CreateSelectionConfig[]>(() => {
    if (tab === 'image') {
      return imageConfigs;
    }
    if (tab === 'video') {
      return hasRunwayKey
        ? [{ providerId: 'runway', modelId: videoOptions.modelId }]
        : [];
    }
    return hasElevenLabsKey
      ? [
          {
            providerId: 'elevenlabs',
            modelId:
              audioOptions.operation === 'text_to_speech'
                ? audioOptions.ttsModelId
                : audioOptions.sfxModelId,
          },
        ]
      : [];
  }, [
    tab,
    imageConfigs,
    hasRunwayKey,
    videoOptions.modelId,
    hasElevenLabsKey,
    audioOptions.operation,
    audioOptions.ttsModelId,
    audioOptions.sfxModelId,
  ]);

  /** Picker catalog rows for the active tab (media tabs use their own catalog). */
  const pickerProviders = useMemo<ProviderPickerItem[]>(() => {
    if (tab === 'image') {
      return AI_PROVIDERS.filter(
        provider => provider.enabled && IMAGE_GEN_PROVIDER_IDS.includes(provider.id as AIProvider)
      ).map(({ id, name, company, color }) => ({ id, name, company, color }));
    }
    return MEDIA_PROVIDERS.filter(provider =>
      provider.mediaTypes.includes(tab)
    ).map(({ id, name, company, color }) => ({ id, name, company, color }));
  }, [tab]);

  /** Which Studio tabs have a usable provider, so an empty tab can point to one that works. */
  const readyTabs = useMemo<Record<CreateTab, boolean>>(
    () => ({
      image: IMAGE_GEN_PROVIDER_IDS.some(id => isImageProviderConfigured(id)),
      video: hasRunwayKey,
      audio: hasElevenLabsKey,
    }),
    [isImageProviderConfigured, hasRunwayKey, hasElevenLabsKey]
  );

  const configuredProviderIds = useMemo<string[]>(() => {
    if (tab === 'image') {
      return IMAGE_GEN_PROVIDER_IDS.filter(id => isImageProviderConfigured(id));
    }
    if (tab === 'video') return hasRunwayKey ? ['runway'] : [];
    return hasElevenLabsKey ? ['elevenlabs'] : [];
  }, [tab, isImageProviderConfigured, hasRunwayKey, hasElevenLabsKey]);

  const addProvider = useCallback(
    (providerId: string) => {
      if (tab !== 'image') return; // video/audio pills derive from key presence
      const modelId = resolveImageModelId(providerId as AIProvider, undefined);
      if (!modelId) return;
      dispatch(addImageSelection({ providerId, modelId }));
    },
    [tab, dispatch]
  );

  const updateConfig = useCallback(
    (index: number, patch: Partial<CreateSelectionConfig>) => {
      if (tab === 'image') {
        if (index < 0 || index >= configs.length) return;
        const visible = configs[index];
        // Map the visible index back to the raw array (hidden pills keep slots).
        const rawIndex = image.findIndex(c => c.providerId === visible.providerId);
        if (rawIndex < 0) return;
        dispatch(
          updateImageSelection({
            index: rawIndex,
            config: { ...image[rawIndex], ...patch },
          })
        );
        return;
      }
      if (tab === 'video') {
        if (patch.modelId) dispatch(setVideoOptions({ modelId: patch.modelId }));
        return;
      }
      if (patch.modelId) {
        dispatch(
          audioOptions.operation === 'text_to_speech'
            ? setAudioOptions({ ttsModelId: patch.modelId })
            : setAudioOptions({ sfxModelId: patch.modelId })
        );
      }
    },
    [tab, configs, image, dispatch, audioOptions.operation]
  );

  const removeConfig = useCallback(
    (index: number) => {
      if (tab !== 'image') return; // media pills are fixed while the key exists
      if (index < 0 || index >= configs.length) return;
      const rawIndex = image.findIndex(c => c.providerId === configs[index].providerId);
      if (rawIndex < 0) return;
      dispatch(removeImageSelection({ index: rawIndex }));
    },
    [tab, configs, image, dispatch]
  );

  /** Image models behind the validated pills (drives caps + capability gating). */
  const selectedImageModels = useMemo<ImageModelConfig[]>(
    () =>
      imageConfigs
        .map(config => getResolvedImageModel(config.providerId as AIProvider, config.modelId))
        .filter((model): model is ImageModelConfig => Boolean(model)),
    [imageConfigs]
  );

  const imageSupportsSourceInput = selectedImageModels.some(model => model.supportsImageInput);
  const imageMaxReferenceImages = Math.max(
    1,
    ...selectedImageModels.map(model => model.maxReferenceImages || 0)
  );
  const imageMaxCount =
    selectedImageModels.length > 0
      ? Math.max(
          1,
          Math.min(...selectedImageModels.map(model => model.maxImagesPerRequest || 1), 10)
        )
      : 1;

  /** Exact maps for the generateCreateImages thunk payload. */
  const imageSelectionMaps = useMemo<ImageGenerationSelectionMaps>(() => {
    const maps: ImageGenerationSelectionMaps = {
      providers: [],
      selectedModels: {},
      modelSettings: {},
    };
    imageConfigs.forEach(config => {
      const provider = config.providerId as AIProvider;
      maps.providers.push(provider);
      maps.selectedModels[provider] = config.modelId;
      if (config.settings) maps.modelSettings[provider] = config.settings;
    });
    return maps;
  }, [imageConfigs]);

  // Selected models cap the per-request count; clamp the persisted choice
  // down whenever the lineup's ceiling drops.
  useEffect(() => {
    if (hydrated && imageOptions.count > imageMaxCount) {
      dispatch(setImageOptions({ count: imageMaxCount }));
    }
  }, [hydrated, imageOptions.count, imageMaxCount, dispatch]);

  // Persist durable fields once hydrated; demo lineups are simulated and must
  // never overwrite the user's real persisted selection.
  const skipNextPersist = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (isDemo) return;
    const { createSelection } = reduxStore.getState();
    CreateSelectionPersistenceService.save({
      image: createSelection.image,
      imageOptions: createSelection.imageOptions,
      videoOptions: createSelection.videoOptions,
      audioOptions: createSelection.audioOptions,
    });
  }, [hydrated, isDemo, reduxStore, image, imageOptions, videoOptions, audioOptions]);

  return {
    configs,
    pickerProviders,
    configuredProviderIds,
    readyTabs,
    addProvider,
    updateConfig,
    removeConfig,
    imageOptions,
    videoOptions,
    audioOptions,
    attachments: attachments[tab],
    selectedImageModels,
    imageSupportsSourceInput,
    imageMaxReferenceImages,
    imageMaxCount,
    imageSelectionMaps,
    hasEnoughAIs: configs.length >= 1,
    hydrated,
    isDemo,
  };
};

export default useCreateComposerSelection;
