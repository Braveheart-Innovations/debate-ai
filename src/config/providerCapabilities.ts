import { AIProvider } from '../types';
import { IMAGE_GENERATION_CONSTANTS } from '../constants/imageGeneration';

export interface ProviderCapabilities {
  imageGeneration?: {
    supported: boolean;
    supportsImageInput?: boolean;  // img2img capability for round-robin
    models?: string[];
    sizes?: string[];
    maxPromptLength?: number;
  };
  videoGeneration?: {
    supported: boolean;
    models?: string[];
    resolutions?: string[];
    maxPromptLength?: number;
  };
}

export function getProviderCapabilities(provider: AIProvider): ProviderCapabilities {
  switch (provider) {
    case 'openai':
      return {
        imageGeneration: {
          supported: true,
          supportsImageInput: true,  // gpt-image-1 supports img2img
          models: [
            IMAGE_GENERATION_CONSTANTS.MODELS.DALLE3,
            IMAGE_GENERATION_CONSTANTS.MODELS.OPENAI_IMAGE,
            IMAGE_GENERATION_CONSTANTS.MODELS.DALLE2,
          ],
          sizes: [
            IMAGE_GENERATION_CONSTANTS.SIZES.AUTO,
            IMAGE_GENERATION_CONSTANTS.SIZES.SQUARE_1024,
            IMAGE_GENERATION_CONSTANTS.SIZES.PORTRAIT_1024x1536,
            IMAGE_GENERATION_CONSTANTS.SIZES.LANDSCAPE_1536x1024,
          ],
          maxPromptLength: 4000,
        },
        // Video generation is out of scope for v1; keep disabled
        videoGeneration: { supported: false },
      };
    case 'google':
      return {
        imageGeneration: {
          supported: true,
          supportsImageInput: true,  // Gemini supports img2img
          models: [
            'gemini-2.5-flash-image',
            'gemini-3-pro-image-preview',
          ],
          // Google uses aspect ratios, not pixel sizes
          sizes: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          maxPromptLength: 4000,
        },
        videoGeneration: {
          supported: false,
        },
      };
    case 'grok':
      return {
        imageGeneration: {
          supported: true,
          supportsImageInput: false,  // Grok does NOT support img2img
          models: ['grok-2-image'],
          // Grok does not support size parameter - generates at fixed size
          sizes: [],
          maxPromptLength: 4000,
        },
        videoGeneration: { supported: false },
      };
    default:
      return { imageGeneration: { supported: false } };
  }
}
