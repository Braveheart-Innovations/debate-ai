export type ImageProviderId = 'openai' | 'google' | 'grok';

export type ImageModelApiFamily =
  | 'openai-images'
  | 'google-gemini-image'
  | 'xai-images';

export interface ImageModelConfig {
  id: string;
  displayName: string;
  apiFamily: ImageModelApiFamily;
  supportsImageInput: boolean;
  isDefault: boolean;
  maxPromptLength?: number;
  isPreview?: boolean;
  isDeprecated?: boolean;
}

const IMAGE_MODEL_ALIASES: Partial<Record<ImageProviderId, Record<string, string>>> = {
  openai: {
    'gpt-image-latest': 'gpt-image-2.5-flare',
    'gpt-image-2.5-flare-2026-09-08': 'gpt-image-2.5-flare',
    'gpt-image-2.5-sunburst-2026-09-08': 'gpt-image-2.5-sunburst',
    'gpt-image-2-2026-04-21': 'gpt-image-2',
    'chatgpt-image-latest': 'gpt-image-2.5-flare',
    'dall-e-3': 'gpt-image-2.5-flare',
  },
  google: {
    'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image',
    'nano-banana-pro-preview': 'gemini-3-pro-image',
    'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
    // Google shut down the Imagen 4 endpoints on the Gemini API (2026-08-17;
    // 404 since) and names Gemini 3.1 Flash Image as the replacement.
    'imagen-4.0-fast-generate-001': 'gemini-3.1-flash-image',
    'imagen-4.0-generate-001': 'gemini-3.1-flash-image',
    'imagen-4.0-ultra-generate-001': 'gemini-3.1-flash-image',
  },
  grok: {
    'grok-2-image-1212': 'grok-imagine-image',
    'grok-image-latest': 'grok-imagine-image',
    // xAI retires grok-imagine-image-quality on 2026-11-02 and serves it as
    // grok-imagine-image-2.0; route persisted selections there now.
    'grok-imagine-image-quality': 'grok-imagine-image-2.0',
    'grok-imagine-image-pro': 'grok-imagine-image-2.0',
  },
};

function createImageModel(config: ImageModelConfig): ImageModelConfig {
  return {
    maxPromptLength: 4000,
    ...config,
  };
}

export const IMAGE_MODELS: Record<ImageProviderId, ImageModelConfig[]> = {
  openai: [
    createImageModel({
      id: 'gpt-image-2.5-flare',
      displayName: 'GPT Image 2.5 Flare',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      isDefault: true,
    }),
    createImageModel({
      id: 'gpt-image-2.5-sunburst',
      displayName: 'GPT Image 2.5 Sunburst',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-2',
      displayName: 'GPT Image 2',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-1.5',
      displayName: 'GPT Image 1.5',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-1',
      displayName: 'GPT Image 1',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-1-mini',
      displayName: 'GPT Image 1 Mini',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      isDefault: false,
    }),
  ],
  google: [
    createImageModel({
      id: 'gemini-2.5-flash-image',
      displayName: 'Gemini 2.5 Flash Image',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      isDefault: true,
    }),
    // Nano Banana 2.1 (October 2026). Live-verified 2026-10-15 with the
    // generateGemini request shape, including imageSize 2K.
    createImageModel({
      id: 'gemini-nano-banana-2.1',
      displayName: 'Nano Banana 2.1',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      isDefault: false,
    }),
    createImageModel({
      id: 'gemini-3.1-flash-image',
      displayName: 'Gemini 3.1 Flash Image',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      isDefault: false,
    }),
    // Offered by the web client since July 2026 but missing here, so requests
    // for it silently fell back to the Google default model.
    createImageModel({
      id: 'gemini-3.1-flash-lite-image',
      displayName: 'Gemini 3.1 Flash-Lite Image',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      isDefault: false,
    }),
    createImageModel({
      id: 'gemini-3-pro-image',
      displayName: 'Gemini 3 Pro Image',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      isDefault: false,
    }),
  ],
  grok: [
    createImageModel({
      id: 'grok-imagine-image-2.0',
      displayName: 'Grok Imagine 2.0',
      apiFamily: 'xai-images',
      supportsImageInput: true,
      isDefault: false,
      maxPromptLength: 8000,
    }),
    createImageModel({
      id: 'grok-imagine-image',
      displayName: 'Grok Imagine',
      apiFamily: 'xai-images',
      supportsImageInput: true,
      isDefault: true,
    }),
  ],
};

export function isImageProvider(providerId: string): providerId is ImageProviderId {
  return providerId === 'openai' || providerId === 'google' || providerId === 'grok';
}

export function getImageModels(providerId: ImageProviderId): ImageModelConfig[] {
  return IMAGE_MODELS[providerId] || [];
}

export function getImageModelById(
  providerId: ImageProviderId,
  modelId: string
): ImageModelConfig | undefined {
  return getImageModels(providerId).find((model) => model.id === modelId);
}

export function getDefaultImageModel(providerId: ImageProviderId): ImageModelConfig | undefined {
  const models = getImageModels(providerId);
  return models.find((model) => model.isDefault) || models[0];
}

export function resolveImageModelId(
  providerId: ImageProviderId,
  modelId?: string
): string | undefined {
  const resolvedModelId = modelId
    ? IMAGE_MODEL_ALIASES[providerId]?.[modelId] || modelId
    : undefined;

  if (resolvedModelId) {
    const requestedModel = getImageModelById(providerId, resolvedModelId);
    if (requestedModel) {
      return requestedModel.id;
    }
  }

  return getDefaultImageModel(providerId)?.id;
}

export function getResolvedImageModel(
  providerId: ImageProviderId,
  modelId?: string
): ImageModelConfig | undefined {
  const resolvedModelId = resolveImageModelId(providerId, modelId);
  if (!resolvedModelId) return undefined;
  return getImageModelById(providerId, resolvedModelId);
}
