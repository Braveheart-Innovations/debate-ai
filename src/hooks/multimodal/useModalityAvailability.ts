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
  };
}

/**
 * Merge availability across multiple selections by unioning support flags and concatenating models/sizes/resolutions.
 */
export function mergeAvailabilities(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  const base: ModalityAvailability = {
    imageUpload: { supported: false },
    documentUpload: { supported: false },
    imageGeneration: { supported: false, models: [], sizes: [] },
    videoGeneration: { supported: false, models: [], resolutions: [] },
  };

  for (const it of items) {
    const a = getModalityAvailability(it.provider, it.model);
    base.imageUpload.supported ||= a.imageUpload.supported;
    base.documentUpload.supported ||= a.documentUpload.supported;

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
 * Strict merge: image/video generation requires ALL providers to support it (AND logic instead of OR).
 * Used for Compare mode where we want to generate from both providers simultaneously.
 * Input modalities still use OR logic (any supporting is fine for receiving attachments).
 */
export function mergeAvailabilitiesStrict(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  if (items.length === 0) {
    return {
      imageUpload: { supported: false },
      documentUpload: { supported: false },
      imageGeneration: { supported: false, models: [], sizes: [] },
      videoGeneration: { supported: false, models: [], resolutions: [] },
    };
  }

  const availabilities = items.map(it => getModalityAvailability(it.provider, it.model));

  // Image generation: ALL must support
  const allSupportImageGen = availabilities.every(a => a.imageGeneration.supported);
  // Video generation: ALL must support
  const allSupportVideoGen = availabilities.every(a => a.videoGeneration.supported);

  return {
    // Input modalities: OR logic (any supporting is fine)
    imageUpload: { supported: availabilities.some(a => a.imageUpload.supported) },
    documentUpload: { supported: availabilities.some(a => a.documentUpload.supported) },
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
