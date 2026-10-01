import { AIProvider } from '../types';

/**
 * Centralized configuration for image generation models.
 * Single source of truth for model IDs, UX labels, capabilities, and transport strategy.
 */

export type ImageModelApiFamily =
  | 'openai-images'
  | 'google-gemini-image'
  | 'google-imagen'
  | 'xai-images';

export type ImageOutputQuality = 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd';
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp';
export type ImageBackgroundOption = 'auto' | 'opaque' | 'transparent';
export type ImageModerationOption = 'auto' | 'low';

export interface ImageModelConfig {
  id: string;
  displayName: string;
  providerDisplayName: string;
  shortProviderName: string;
  description: string;
  apiFamily: ImageModelApiFamily;
  supportsImageInput: boolean;
  sizes: string[];
  aspectRatios?: string[];
  resolutions?: string[];
  maxPromptLength?: number;
  supportsMultipleReferenceImages?: boolean;
  maxImagesPerRequest?: number;
  maxReferenceImages?: number;
  qualityOptions?: ImageOutputQuality[];
  outputFormats?: ImageOutputFormat[];
  supportsOutputCompression?: boolean;
  backgroundOptions?: ImageBackgroundOption[];
  moderationOptions?: ImageModerationOption[];
  isDefault: boolean;
  isPreview?: boolean;
  isDeprecated?: boolean;
}

const OPENAI_IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const;
const GOOGLE_STANDARD_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
const GOOGLE_EXTENDED_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '21:9',
] as const;
const GOOGLE_FLASH_31_ASPECT_RATIOS = [
  ...GOOGLE_EXTENDED_ASPECT_RATIOS,
  '1:4',
  '4:1',
  '1:8',
  '8:1',
] as const;
// Grok Imagine 2.0 added 21:9 (cinematic) and 5:2 (wide banner) in
// August 2026; the older Imagine models keep the original set.
const XAI_IMAGINE_2_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '2:1',
  '1:2',
  '21:9',
  '5:2',
  '19.5:9',
  '9:19.5',
  '20:9',
  '9:20',
] as const;
const XAI_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '2:1',
  '1:2',
  '19.5:9',
  '9:19.5',
  '20:9',
  '9:20',
] as const;

const IMAGE_MODEL_ALIASES: Partial<Record<AIProvider, Record<string, string>>> = {
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
  },
  grok: {
    'grok-2-image-1212': 'grok-imagine-image',
    'grok-image-latest': 'grok-imagine-image',
    'grok-imagine-image-pro': 'grok-imagine-image-quality',
  },
};

function createImageModel(config: ImageModelConfig): ImageModelConfig {
  return {
    maxPromptLength: 4000,
    maxImagesPerRequest: 1,
    maxReferenceImages: config.supportsImageInput ? 1 : 0,
    qualityOptions: ['auto'],
    outputFormats: ['png'],
    supportsOutputCompression: false,
    backgroundOptions: ['auto'],
    moderationOptions: ['auto'],
    ...config,
  };
}

const OPENAI_GPT_IMAGE_QUALITIES: ImageOutputQuality[] = ['auto', 'low', 'medium', 'high'];
const OPENAI_GPT_IMAGE_FORMATS: ImageOutputFormat[] = ['png', 'jpeg', 'webp'];
const OPENAI_GPT_IMAGE_BACKGROUNDS: ImageBackgroundOption[] = ['auto', 'opaque'];
const OPENAI_GPT_IMAGE_MODERATION: ImageModerationOption[] = ['auto', 'low'];
const GOOGLE_IMAGE_QUALITIES: ImageOutputQuality[] = ['auto'];
const XAI_IMAGE_QUALITIES: ImageOutputQuality[] = ['auto'];
const XAI_IMAGE_FORMATS: ImageOutputFormat[] = ['png'];

export const IMAGE_MODELS: Partial<Record<AIProvider, ImageModelConfig[]>> = {
  openai: [
    createImageModel({
      id: 'gpt-image-2.5-flare',
      displayName: 'GPT Image 2.5 Flare',
      providerDisplayName: 'ChatGPT (GPT Image 2.5 Flare)',
      shortProviderName: 'ChatGPT',
      description: 'Fastest OpenAI image model for high-quality everyday generation and edits.',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      sizes: [...OPENAI_IMAGE_SIZES],
      resolutions: ['1K', '2K', '4K'],
      maxImagesPerRequest: 4,
      maxReferenceImages: 5,
      qualityOptions: [...OPENAI_GPT_IMAGE_QUALITIES],
      outputFormats: [...OPENAI_GPT_IMAGE_FORMATS],
      supportsOutputCompression: true,
      backgroundOptions: [...OPENAI_GPT_IMAGE_BACKGROUNDS],
      moderationOptions: [...OPENAI_GPT_IMAGE_MODERATION],
      isDefault: true,
    }),
    createImageModel({
      id: 'gpt-image-2.5-sunburst',
      displayName: 'GPT Image 2.5 Sunburst',
      providerDisplayName: 'ChatGPT (GPT Image 2.5 Sunburst)',
      shortProviderName: 'ChatGPT',
      description: 'Precision OpenAI image model for premium creative work and detailed edits; slower than Flare.',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      sizes: [...OPENAI_IMAGE_SIZES],
      resolutions: ['1K', '2K', '4K'],
      maxImagesPerRequest: 4,
      maxReferenceImages: 5,
      qualityOptions: [...OPENAI_GPT_IMAGE_QUALITIES],
      outputFormats: [...OPENAI_GPT_IMAGE_FORMATS],
      supportsOutputCompression: true,
      backgroundOptions: [...OPENAI_GPT_IMAGE_BACKGROUNDS],
      moderationOptions: [...OPENAI_GPT_IMAGE_MODERATION],
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-2',
      displayName: 'GPT Image 2',
      providerDisplayName: 'ChatGPT (GPT Image 2)',
      shortProviderName: 'ChatGPT',
      description: 'Previous OpenAI image model for high-quality generation and native edits.',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      sizes: [...OPENAI_IMAGE_SIZES],
      resolutions: ['1K', '2K', '4K'],
      maxImagesPerRequest: 4,
      maxReferenceImages: 5,
      qualityOptions: [...OPENAI_GPT_IMAGE_QUALITIES],
      outputFormats: [...OPENAI_GPT_IMAGE_FORMATS],
      supportsOutputCompression: true,
      backgroundOptions: [...OPENAI_GPT_IMAGE_BACKGROUNDS],
      moderationOptions: [...OPENAI_GPT_IMAGE_MODERATION],
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-1.5',
      displayName: 'GPT Image 1.5',
      providerDisplayName: 'ChatGPT (GPT Image 1.5)',
      shortProviderName: 'ChatGPT',
      description: 'Previous OpenAI image model with native edits and strong prompt fidelity.',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      sizes: [...OPENAI_IMAGE_SIZES],
      maxImagesPerRequest: 4,
      maxReferenceImages: 5,
      qualityOptions: [...OPENAI_GPT_IMAGE_QUALITIES],
      outputFormats: [...OPENAI_GPT_IMAGE_FORMATS],
      supportsOutputCompression: true,
      backgroundOptions: ['auto', 'opaque', 'transparent'],
      moderationOptions: [...OPENAI_GPT_IMAGE_MODERATION],
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-1',
      displayName: 'GPT Image 1',
      providerDisplayName: 'ChatGPT (GPT Image 1)',
      shortProviderName: 'ChatGPT',
      description: 'Earlier GPT Image generation model with native refinement and edits.',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      sizes: [...OPENAI_IMAGE_SIZES],
      maxImagesPerRequest: 4,
      maxReferenceImages: 1,
      qualityOptions: [...OPENAI_GPT_IMAGE_QUALITIES],
      outputFormats: [...OPENAI_GPT_IMAGE_FORMATS],
      supportsOutputCompression: true,
      backgroundOptions: ['auto', 'opaque', 'transparent'],
      moderationOptions: [...OPENAI_GPT_IMAGE_MODERATION],
      isDefault: false,
    }),
    createImageModel({
      id: 'gpt-image-1-mini',
      displayName: 'GPT Image 1 Mini',
      providerDisplayName: 'ChatGPT (GPT Image 1 Mini)',
      shortProviderName: 'ChatGPT',
      description: 'Lighter GPT Image variant for faster, lower-cost generation and edits.',
      apiFamily: 'openai-images',
      supportsImageInput: true,
      sizes: [...OPENAI_IMAGE_SIZES],
      maxImagesPerRequest: 4,
      maxReferenceImages: 1,
      qualityOptions: [...OPENAI_GPT_IMAGE_QUALITIES],
      outputFormats: [...OPENAI_GPT_IMAGE_FORMATS],
      supportsOutputCompression: true,
      backgroundOptions: ['auto', 'opaque', 'transparent'],
      moderationOptions: [...OPENAI_GPT_IMAGE_MODERATION],
      isDefault: false,
    }),
  ],
  google: [
    createImageModel({
      id: 'gemini-2.5-flash-image',
      displayName: 'Gemini 2.5 Flash Image',
      providerDisplayName: 'Gemini (2.5 Flash Image)',
      shortProviderName: 'Gemini',
      description: 'Fast stable Gemini image model with native image refinement and aspect-ratio control.',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      sizes: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      maxImagesPerRequest: 1,
      maxReferenceImages: 1,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: true,
    }),
    createImageModel({
      id: 'gemini-3.1-flash-image',
      displayName: 'Gemini 3.1 Flash Image',
      providerDisplayName: 'Gemini (3.1 Flash Image)',
      shortProviderName: 'Gemini',
      description: 'Fast Gemini 3 image model with native edits, broader framing controls, and optional higher-resolution output.',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      sizes: [...GOOGLE_FLASH_31_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_FLASH_31_ASPECT_RATIOS],
      resolutions: ['1K', '2K', '4K', '512'],
      maxImagesPerRequest: 1,
      maxReferenceImages: 14,
      supportsMultipleReferenceImages: true,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: false,
    }),
    createImageModel({
      id: 'gemini-3.1-flash-lite-image',
      displayName: 'Gemini 3.1 Flash-Lite Image',
      providerDisplayName: 'Gemini (3.1 Flash-Lite Image)',
      shortProviderName: 'Gemini',
      description: 'Fastest, most cost-efficient Gemini image model (Nano Banana 2 Lite) for rapid generation, edits, and multi-image composition.',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      sizes: [...GOOGLE_EXTENDED_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_EXTENDED_ASPECT_RATIOS],
      resolutions: ['1K'],
      maxImagesPerRequest: 1,
      maxReferenceImages: 14,
      supportsMultipleReferenceImages: true,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: false,
    }),
    createImageModel({
      id: 'gemini-3-pro-image',
      displayName: 'Gemini 3 Pro Image',
      providerDisplayName: 'Gemini (3 Pro Image)',
      shortProviderName: 'Gemini',
      description: 'Highest-fidelity Gemini image model with native editing and high-resolution generation options.',
      apiFamily: 'google-gemini-image',
      supportsImageInput: true,
      sizes: [...GOOGLE_EXTENDED_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_EXTENDED_ASPECT_RATIOS],
      resolutions: ['1K', '2K', '4K'],
      maxImagesPerRequest: 1,
      maxReferenceImages: 14,
      supportsMultipleReferenceImages: true,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: false,
    }),
    createImageModel({
      id: 'imagen-4.0-fast-generate-001',
      displayName: 'Imagen 4 Fast',
      providerDisplayName: 'Gemini (Imagen 4 Fast)',
      shortProviderName: 'Gemini',
      description: 'Fast Imagen 4 generation model surfaced through Google’s media generation API.',
      apiFamily: 'google-imagen',
      supportsImageInput: false,
      sizes: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      resolutions: ['1K'],
      maxImagesPerRequest: 4,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: false,
    }),
    createImageModel({
      id: 'imagen-4.0-generate-001',
      displayName: 'Imagen 4',
      providerDisplayName: 'Gemini (Imagen 4)',
      shortProviderName: 'Gemini',
      description: 'Balanced Imagen 4 text-to-image model for more specialized prompt rendering.',
      apiFamily: 'google-imagen',
      supportsImageInput: false,
      sizes: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      resolutions: ['1K', '2K'],
      maxImagesPerRequest: 4,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: false,
    }),
    createImageModel({
      id: 'imagen-4.0-ultra-generate-001',
      displayName: 'Imagen 4 Ultra',
      providerDisplayName: 'Gemini (Imagen 4 Ultra)',
      shortProviderName: 'Gemini',
      description: 'Highest-quality Imagen 4 generation model for premium single-pass image output.',
      apiFamily: 'google-imagen',
      supportsImageInput: false,
      sizes: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      aspectRatios: [...GOOGLE_STANDARD_ASPECT_RATIOS],
      resolutions: ['1K', '2K'],
      maxImagesPerRequest: 4,
      qualityOptions: [...GOOGLE_IMAGE_QUALITIES],
      isDefault: false,
    }),
  ],
  grok: [
    createImageModel({
      id: 'grok-imagine-image-2.0',
      displayName: 'Grok Imagine 2.0',
      providerDisplayName: 'Grok (Imagine 2.0)',
      shortProviderName: 'Grok',
      description: 'Latest xAI image model with quality tiers, edits, and aspect-ratio controls.',
      apiFamily: 'xai-images',
      supportsImageInput: true,
      sizes: [...XAI_IMAGINE_2_ASPECT_RATIOS],
      aspectRatios: [...XAI_IMAGINE_2_ASPECT_RATIOS],
      resolutions: ['1K', '2K'],
      maxPromptLength: 8000,
      supportsMultipleReferenceImages: true,
      maxImagesPerRequest: 10,
      maxReferenceImages: 3,
      qualityOptions: [...XAI_IMAGE_QUALITIES],
      outputFormats: [...XAI_IMAGE_FORMATS],
      // grok-imagine-image stays the resolved default; this flag is
      // load-bearing because getDefaultImageModel falls back to models[0].
      isDefault: false,
    }),
    createImageModel({
      id: 'grok-imagine-image',
      displayName: 'Grok Imagine',
      providerDisplayName: 'Grok (Imagine)',
      shortProviderName: 'Grok',
      description: 'xAI image model with text-to-image generation, edits, and aspect-ratio controls.',
      apiFamily: 'xai-images',
      supportsImageInput: true,
      sizes: [...XAI_ASPECT_RATIOS],
      aspectRatios: [...XAI_ASPECT_RATIOS],
      resolutions: ['1K', '2K'],
      supportsMultipleReferenceImages: true,
      maxImagesPerRequest: 10,
      maxReferenceImages: 3,
      qualityOptions: [...XAI_IMAGE_QUALITIES],
      outputFormats: [...XAI_IMAGE_FORMATS],
      isDefault: true,
    }),
    createImageModel({
      id: 'grok-imagine-image-quality',
      displayName: 'Grok Imagine Quality',
      providerDisplayName: 'Grok (Imagine Quality)',
      shortProviderName: 'Grok',
      description: 'Higher-fidelity xAI image model with text-to-image generation, edits, and aspect-ratio controls.',
      apiFamily: 'xai-images',
      supportsImageInput: true,
      sizes: [...XAI_ASPECT_RATIOS],
      aspectRatios: [...XAI_ASPECT_RATIOS],
      resolutions: ['1K', '2K'],
      supportsMultipleReferenceImages: true,
      maxImagesPerRequest: 10,
      maxReferenceImages: 3,
      qualityOptions: [...XAI_IMAGE_QUALITIES],
      outputFormats: [...XAI_IMAGE_FORMATS],
      isDefault: false,
    }),
  ],
};

export function getImageModels(provider: AIProvider): ImageModelConfig[] {
  return IMAGE_MODELS[provider] || [];
}

export function getImageInputModels(provider: AIProvider): ImageModelConfig[] {
  return getImageModels(provider).filter((model) => model.supportsImageInput);
}

/**
 * Get the default image model for a provider
 */
export function getDefaultImageModel(provider: AIProvider): ImageModelConfig | undefined {
  const models = getImageModels(provider);
  if (!models || models.length === 0) return undefined;
  return models.find(m => m.isDefault) || models[0];
}

export function getDefaultImageInputModel(provider: AIProvider): ImageModelConfig | undefined {
  const models = getImageInputModels(provider);
  if (models.length === 0) return undefined;
  return models.find((model) => model.isDefault) || models[0];
}

/**
 * Get display name for image generation provider
 * @param provider - The AI provider
 * @param includeModel - Whether to include model ID in the name
 */
export function getImageProviderDisplayName(
  provider: AIProvider,
  options?: { includeModel?: boolean; modelId?: string }
): string {
  const model = getResolvedImageModel(provider, options?.modelId);
  if (!model) return provider;

  if (options?.includeModel) {
    return model.providerDisplayName;
  }
  return model.shortProviderName;
}

export function getImageModelDisplayName(
  provider: AIProvider,
  modelId?: string
): string {
  return getResolvedImageModel(provider, modelId)?.displayName || provider;
}

export function getImageModelApiFamily(
  provider: AIProvider,
  modelId?: string
): ImageModelApiFamily | undefined {
  return getResolvedImageModel(provider, modelId)?.apiFamily;
}

/**
 * Get image model by ID
 */
export function getImageModelById(provider: AIProvider, modelId: string): ImageModelConfig | undefined {
  return getImageModels(provider).find(m => m.id === modelId);
}

export function resolveImageModelId(
  provider: AIProvider,
  modelId?: string
): string | undefined {
  const resolvedModelId = modelId
    ? IMAGE_MODEL_ALIASES[provider]?.[modelId] || modelId
    : undefined;

  if (modelId) {
    const requestedModel = getImageModelById(provider, resolvedModelId || modelId);
    if (requestedModel) {
      return requestedModel.id;
    }
  }

  return getDefaultImageModel(provider)?.id;
}

export function getResolvedImageModel(
  provider: AIProvider,
  modelId?: string
): ImageModelConfig | undefined {
  const resolvedModelId = resolveImageModelId(provider, modelId);
  if (!resolvedModelId) return undefined;
  return getImageModelById(provider, resolvedModelId);
}

/**
 * Check if a provider supports image generation
 */
export function supportsImageGeneration(provider: AIProvider): boolean {
  const models = getImageModels(provider);
  return models.length > 0;
}

export function getImageGenerationCapabilities(provider: AIProvider): {
  supported: boolean;
  supportsImageInput: boolean;
  models: string[];
  sizes: string[];
  resolutions: string[];
  maxImagesPerRequest: number;
  maxReferenceImages: number;
  qualityOptions: ImageOutputQuality[];
  outputFormats: ImageOutputFormat[];
  backgroundOptions: ImageBackgroundOption[];
  moderationOptions: ImageModerationOption[];
  supportsOutputCompression: boolean;
  maxPromptLength?: number;
} {
  const models = getImageModels(provider);
  if (models.length === 0) {
    return {
      supported: false,
      supportsImageInput: false,
      models: [],
      sizes: [],
      resolutions: [],
      maxImagesPerRequest: 1,
      maxReferenceImages: 0,
      qualityOptions: [],
      outputFormats: [],
      backgroundOptions: [],
      moderationOptions: [],
      supportsOutputCompression: false,
    };
  }

  const defaultModel = getDefaultImageModel(provider);

  return {
    supported: true,
    supportsImageInput: defaultModel?.supportsImageInput ?? false,
    models: models.map((model) => model.id),
    sizes: Array.from(new Set(models.flatMap((model) => model.sizes))),
    resolutions: Array.from(new Set(models.flatMap((model) => model.resolutions || []))),
    maxImagesPerRequest: Math.max(...models.map((model) => model.maxImagesPerRequest || 1)),
    maxReferenceImages: Math.max(...models.map((model) => model.maxReferenceImages || 0)),
    qualityOptions: Array.from(new Set(models.flatMap((model) => model.qualityOptions || []))),
    outputFormats: Array.from(new Set(models.flatMap((model) => model.outputFormats || []))),
    backgroundOptions: Array.from(new Set(models.flatMap((model) => model.backgroundOptions || []))),
    moderationOptions: Array.from(new Set(models.flatMap((model) => model.moderationOptions || []))),
    supportsOutputCompression: models.some((model) => model.supportsOutputCompression),
    maxPromptLength: Math.max(...models.map((model) => model.maxPromptLength || 0)),
  };
}

/**
 * Check if a provider supports img2img (image refinement)
 */
export function supportsImageInput(provider: AIProvider, modelId?: string): boolean {
  const model = getResolvedImageModel(provider, modelId);
  return model?.supportsImageInput ?? false;
}
