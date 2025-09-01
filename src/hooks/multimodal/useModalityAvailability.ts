import { getModelById } from '../../config/modelConfigs';
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
  voiceInput: ModalityFlag;       // STT
  voiceOutput: ModalityFlag;      // TTS
  realtime: ModalityFlag;         // Realtime API
  imageGeneration: ModalityFlag;  // Images output
  videoGeneration: ModalityFlag;  // Videos output (future)
}

/**
 * Compute modality availability for a single provider/model combination.
 * - Input modalities come from modelConfigs flags (supportsImageInput, supportsDocuments, supportsVoiceInput/Output, supportsRealtime)
 * - Generation modalities come from providerCapabilities (imageGeneration, optional videoGeneration)
 */
export function getModalityAvailability(providerId: string, modelId: string): ModalityAvailability {
  const model = getModelById(providerId, modelId);
  const caps = getProviderCapabilities(providerId as any);

  const imageGen = caps.imageGeneration;
  const videoGen: any = (caps as any).videoGeneration; // Optional future block

  return {
    imageUpload: { supported: Boolean(model?.supportsImageInput || model?.supportsVision) },
    documentUpload: { supported: Boolean(model?.supportsDocuments) },
    voiceInput: { supported: Boolean(model?.supportsVoiceInput) },
    voiceOutput: { supported: Boolean(model?.supportsVoiceOutput) },
    realtime: { supported: Boolean(model?.supportsRealtime) },
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
    voiceOutput: { supported: false },
    realtime: { supported: false },
    imageGeneration: { supported: false, models: [], sizes: [] },
    videoGeneration: { supported: false, models: [], resolutions: [] },
  };

  for (const it of items) {
    const a = getModalityAvailability(it.provider, it.model);
    base.imageUpload.supported ||= a.imageUpload.supported;
    base.documentUpload.supported ||= a.documentUpload.supported;
    base.voiceInput.supported ||= a.voiceInput.supported;
    base.voiceOutput.supported ||= a.voiceOutput.supported;
    base.realtime.supported ||= a.realtime.supported;

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
 * React hook variant for single selection.
 */
export function useModalityAvailability(providerId: string, modelId: string): ModalityAvailability {
  // No React state used; simple synchronous compute for now to avoid coupling to external stores.
  return getModalityAvailability(providerId, modelId);
}

/**
 * React hook variant for multiple selections.
 */
export function useMergedModalityAvailability(items: Array<{ provider: string; model: string }>): ModalityAvailability {
  return mergeAvailabilities(items);
}

