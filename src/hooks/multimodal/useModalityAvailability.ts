import { getModelById } from '../../config/modelConfigs';
import { AIProvider } from '../../types';
import { getProviderCapabilities } from '../../config/providerCapabilities';

export interface ModalityFlag {
  supported: boolean;
  reason?: string;
  models?: string[];
  sizes?: string[];
  resolutions?: string[];
}

export interface ModalityAvailability {
  imageUpload: ModalityFlag;      // Vision input
  documentUpload: ModalityFlag;   // PDF/document input
  voiceInput: ModalityFlag;       // STT via Whisper
  imageGeneration: ModalityFlag;  // Images output
  videoGeneration: ModalityFlag;  // Videos output (future)
}

/**
 * Compute modality availability for a single provider/model combination.
 * - Input modalities come from modelConfigs flags (supportsImageInput, supportsDocuments, supportsVoiceInput)
 * - Generation modalities come from providerCapabilities (imageGeneration, optional videoGeneration)
 */
export function getModalityAvailability(providerId: string, modelId: string): ModalityAvailability {
  const model = getModelById(providerId, modelId);
  const caps = getProviderCapabilities(providerId as AIProvider);

  const imageGen = caps.imageGeneration;
  const videoGen = caps.videoGeneration as { supported?: boolean; models?: string[]; resolutions?: string[] } | undefined;
  // Provider-level fallbacks: enable basic voice input via STT even if model doesn't advertise realtime voice
  const providerSupportsSTT = providerId === 'openai' || providerId === 'google';

  return {
    imageUpload: { supported: Boolean(model?.supportsImageInput || model?.supportsVision) },
    documentUpload: { supported: Boolean(model?.supportsDocuments) },
    voiceInput: { supported: Boolean(model?.supportsVoiceInput || providerSupportsSTT) },
    imageGeneration: {
      supported: Boolean(imageGen?.supported),
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
    voiceInput: { supported: false },
    imageGeneration: { supported: false, models: [], sizes: [] },
    videoGeneration: { supported: false, models: [], resolutions: [] },
  };

  for (const it of items) {
    const a = getModalityAvailability(it.provider, it.model);
    base.imageUpload.supported ||= a.imageUpload.supported;
    base.documentUpload.supported ||= a.documentUpload.supported;
    base.voiceInput.supported ||= a.voiceInput.supported;

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
      voiceInput: { supported: false },
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
    voiceInput: { supported: availabilities.some(a => a.voiceInput.supported) },
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
