import { AIProvider } from '../types';

/**
 * Centralized configuration for image generation models.
 * Single source of truth for model IDs, display names, and capabilities.
 */

export interface ImageModelConfig {
  id: string;
  displayName: string;           // e.g., "GPT Image 1"
  providerDisplayName: string;   // e.g., "ChatGPT (gpt-image-1)"
  shortProviderName: string;     // e.g., "ChatGPT"
  supportsImageInput: boolean;   // img2img capability
  sizes: string[];
  isDefault: boolean;
}

export const IMAGE_MODELS: Partial<Record<AIProvider, ImageModelConfig[]>> = {
  openai: [
    {
      id: 'gpt-image-1',
      displayName: 'GPT Image 1',
      providerDisplayName: 'ChatGPT (gpt-image-1)',
      shortProviderName: 'ChatGPT',
      supportsImageInput: true,
      sizes: ['auto', '1024x1024', '1024x1536', '1536x1024'],
      isDefault: true,
    },
    {
      id: 'dall-e-3',
      displayName: 'DALL-E 3',
      providerDisplayName: 'ChatGPT (DALL-E 3)',
      shortProviderName: 'ChatGPT',
      supportsImageInput: false,
      sizes: ['1024x1024', '1024x1792', '1792x1024'],
      isDefault: false,
    },
  ],
  google: [
    {
      id: 'gemini-2.5-flash-image',
      displayName: 'Gemini Flash Image',
      providerDisplayName: 'Gemini (gemini-2.5-flash-image)',
      shortProviderName: 'Gemini',
      supportsImageInput: true,
      sizes: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      isDefault: true,
    },
  ],
  grok: [
    {
      id: 'grok-2-image-1212',
      displayName: 'Grok 2 Image',
      providerDisplayName: 'Grok (grok-2-image-1212)',
      shortProviderName: 'Grok',
      supportsImageInput: false,
      sizes: [],
      isDefault: true,
    },
  ],
};

/**
 * Get the default image model for a provider
 */
export function getDefaultImageModel(provider: AIProvider): ImageModelConfig | undefined {
  const models = IMAGE_MODELS[provider];
  if (!models || models.length === 0) return undefined;
  return models.find(m => m.isDefault) || models[0];
}

/**
 * Get display name for image generation provider
 * @param provider - The AI provider
 * @param includeModel - Whether to include model ID in the name
 */
export function getImageProviderDisplayName(
  provider: AIProvider,
  options?: { includeModel?: boolean }
): string {
  const model = getDefaultImageModel(provider);
  if (!model) return provider;

  if (options?.includeModel) {
    return model.providerDisplayName;
  }
  return model.shortProviderName;
}

/**
 * Get image model by ID
 */
export function getImageModelById(provider: AIProvider, modelId: string): ImageModelConfig | undefined {
  const models = IMAGE_MODELS[provider];
  if (!models) return undefined;
  return models.find(m => m.id === modelId);
}

/**
 * Check if a provider supports image generation
 */
export function supportsImageGeneration(provider: AIProvider): boolean {
  const models = IMAGE_MODELS[provider];
  return models !== undefined && models.length > 0;
}

/**
 * Check if a provider supports img2img (image refinement)
 */
export function supportsImageInput(provider: AIProvider): boolean {
  const model = getDefaultImageModel(provider);
  return model?.supportsImageInput ?? false;
}
