import { getModelById } from '../../config/modelConfigs';
import { AIProvider, ImageGenerationMode } from '../../types';
import { getProviderCapabilities } from '../../config/providerCapabilities';

export interface ModalityFlag {
  supported: boolean;
  supportsImageInput?: boolean;  // img2img capability for refinement
  reason?: string;
  models?: string[];
  sizes?: string[];
  resolutions?: string[];
}

export interface ModalityAvailability {
  imageUpload: ModalityFlag;      // Vision input
  documentUpload: ModalityFlag;   // PDF/document input
  imageGeneration: ModalityFlag;  // Images output
  videoGeneration: ModalityFlag;  // Videos output (future)
  webSearch: ModalityFlag;        // Web search capability
}

/**
 * Compute modality availability for a single provider/model combination.
 * - Input modalities come from modelConfigs flags (supportsImageInput, supportsDocuments)
 * - Generation modalities come from providerCapabilities (imageGeneration, optional videoGeneration)
 */
export function getModalityAvailability(providerId: string, modelId: string): ModalityAvailability {
  const model = getModelById(providerId, modelId);
  const caps = getProviderCapabilities(providerId as AIProvider);

  const imageGen = caps.imageGeneration;
  const videoGen = caps.videoGeneration as { supported?: boolean; models?: string[]; resolutions?: string[] } | undefined;

  return {
    imageUpload: { supported: Boolean(model?.supportsImageInput || model?.supportsVision) },
    documentUpload: { supported: Boolean(model?.supportsDocuments) },
    imageGeneration: {
      supported: Boolean(imageGen?.supported),
      supportsImageInput: Boolean(imageGen?.supportsImageInput),
      models: imageGen?.models,
      sizes: imageGen?.sizes,
    },
    videoGeneration: {
      supported: Boolean(videoGen?.supported),
      models: videoGen?.models,
      resolutions: videoGen?.resolutions,
    },
    webSearch: { supported: Boolean(model?.supportsWebSearch) },
  };
}

/**
 * Merge availability across multiple selections.
 * - Input modalities (imageUpload, documentUpload): AND logic - ALL must support
 * - Generation modalities: OR logic - any supporting enables the feature
 */
export function mergeAvailabilities(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  if (items.length === 0) {
    return {
      imageUpload: { supported: false },
      documentUpload: { supported: false },
      imageGeneration: { supported: false, models: [], sizes: [] },
      videoGeneration: { supported: false, models: [], resolutions: [] },
      webSearch: { supported: false },
    };
  }

  const availabilities = items.map(it => getModalityAvailability(it.provider, it.model));

  // Input modalities: AND logic - ALL must support
  const allSupportImageUpload = availabilities.every(a => a.imageUpload.supported);
  const allSupportDocumentUpload = availabilities.every(a => a.documentUpload.supported);
  const allSupportWebSearch = availabilities.every(a => a.webSearch.supported);

  // Generation modalities: OR logic - any supporting enables the feature
  const base: ModalityAvailability = {
    imageUpload: { supported: allSupportImageUpload },
    documentUpload: { supported: allSupportDocumentUpload },
    imageGeneration: { supported: false, models: [], sizes: [] },
    videoGeneration: { supported: false, models: [], resolutions: [] },
    webSearch: { supported: allSupportWebSearch },
  };

  for (const a of availabilities) {
    if (a.imageGeneration.supported) {
      base.imageGeneration.supported = true;
      if (a.imageGeneration.models) {
        base.imageGeneration.models = Array.from(new Set([...(base.imageGeneration.models || []), ...a.imageGeneration.models]));
      }
      if (a.imageGeneration.sizes) {
        base.imageGeneration.sizes = Array.from(new Set([...(base.imageGeneration.sizes || []), ...a.imageGeneration.sizes]));
      }
    }

    if (a.videoGeneration.supported) {
      base.videoGeneration.supported = true;
      if (a.videoGeneration.models) {
        base.videoGeneration.models = Array.from(new Set([...(base.videoGeneration.models || []), ...a.videoGeneration.models]));
      }
      if (a.videoGeneration.resolutions) {
        base.videoGeneration.resolutions = Array.from(new Set([...(base.videoGeneration.resolutions || []), ...a.videoGeneration.resolutions]));
      }
    }
  }

  return base;
}

/**
 * Strict merge: ALL providers must support for any modality to be enabled (AND logic).
 * Used for Compare mode where we want both providers to process inputs/generate outputs.
 */
export function mergeAvailabilitiesStrict(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  if (items.length === 0) {
    return {
      imageUpload: { supported: false },
      documentUpload: { supported: false },
      imageGeneration: { supported: false, models: [], sizes: [] },
      videoGeneration: { supported: false, models: [], resolutions: [] },
      webSearch: { supported: false },
    };
  }

  const availabilities = items.map(it => getModalityAvailability(it.provider, it.model));

  // All modalities: AND logic - ALL must support
  const allSupportImageUpload = availabilities.every(a => a.imageUpload.supported);
  const allSupportDocumentUpload = availabilities.every(a => a.documentUpload.supported);
  const allSupportImageGen = availabilities.every(a => a.imageGeneration.supported);
  const allSupportVideoGen = availabilities.every(a => a.videoGeneration.supported);
  const allSupportWebSearch = availabilities.every(a => a.webSearch.supported);

  return {
    // Input modalities: AND logic (all must support)
    imageUpload: { supported: allSupportImageUpload },
    documentUpload: { supported: allSupportDocumentUpload },
    // Generation modalities: AND logic (all must support)
    imageGeneration: {
      supported: allSupportImageGen,
      models: allSupportImageGen ? availabilities.flatMap(a => a.imageGeneration.models || []) : [],
      sizes: allSupportImageGen ? [...new Set(availabilities.flatMap(a => a.imageGeneration.sizes || []))] : [],
    },
    videoGeneration: {
      supported: allSupportVideoGen,
      models: allSupportVideoGen ? availabilities.flatMap(a => a.videoGeneration.models || []) : [],
      resolutions: allSupportVideoGen ? [...new Set(availabilities.flatMap(a => a.videoGeneration.resolutions || []))] : [],
    },
    webSearch: { supported: allSupportWebSearch },
  };
}

/**
 * React hook variant for single selection.
 */
export function useModalityAvailability(providerId: string, modelId: string): ModalityAvailability {
  // No React state used; simple synchronous compute for now to avoid coupling to external stores.
  return getModalityAvailability(providerId, modelId);
}

/**
 * React hook variant for multiple selections (OR logic for generation).
 */
export function useMergedModalityAvailability(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  return mergeAvailabilities(items);
}

/**
 * React hook variant for strict merge (AND logic for generation).
 * Used by Compare mode to ensure both providers support image generation.
 */
export function useMergedModalityAvailabilityStrict(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  return mergeAvailabilitiesStrict(items);
}

/**
 * Result type for image generation availability check.
 */
export interface ImageGenerationAvailabilityResult {
  isAvailable: boolean;
  mode: ImageGenerationMode;
  reason?: string;
  providers: Array<{ provider: string; supportsImageGen: boolean; supportsImg2Img: boolean }>;
}

/**
 * Determine image generation availability and mode based on selected providers.
 *
 * Logic:
 * - Chat mode (single or multi-AI): mode='single', uses first AI for generation
 *   User can refine images afterward via the Refine button (user-driven refinement)
 * - Compare mode: mode='compare' if ALL AIs support image generation
 */
export function useImageGenerationAvailability(
  items: Array<{ provider: string; model: string }>,
  screenMode: 'chat' | 'compare'
): ImageGenerationAvailabilityResult {
  if (items.length === 0) {
    return {
      isAvailable: false,
      mode: 'single',
      reason: 'No AI selected',
      providers: [],
    };
  }

  // Get capabilities for each provider
  const providerInfo = items.map(item => {
    const caps = getProviderCapabilities(item.provider as AIProvider);
    return {
      provider: item.provider,
      supportsImageGen: Boolean(caps.imageGeneration?.supported),
      supportsImg2Img: Boolean(caps.imageGeneration?.supportsImageInput),
    };
  });

  const allSupportImageGen = providerInfo.every(p => p.supportsImageGen);
  const firstSupportsImageGen = providerInfo[0]?.supportsImageGen ?? false;

  // Compare mode: ALL must support image generation
  if (screenMode === 'compare') {
    return {
      isAvailable: allSupportImageGen,
      mode: 'compare',
      reason: allSupportImageGen
        ? undefined
        : `${providerInfo.filter(p => !p.supportsImageGen).map(p => p.provider).join(', ')} does not support image generation`,
      providers: providerInfo,
    };
  }

  // Chat mode: use first AI for generation, user can refine via Refine button
  return {
    isAvailable: firstSupportsImageGen,
    mode: 'single',
    reason: firstSupportsImageGen ? undefined : `${providerInfo[0]?.provider} does not support image generation`,
    providers: providerInfo,
  };
}
