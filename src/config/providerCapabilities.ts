import { AIProvider } from '../types';
import { IMAGE_GENERATION_CONSTANTS } from '../constants/imageGeneration';

export interface ProviderCapabilities {
  imageGeneration?: {
    supported: boolean;
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
          models: [IMAGE_GENERATION_CONSTANTS.MODELS.OPENAI_IMAGE],
          sizes: [
            IMAGE_GENERATION_CONSTANTS.SIZES.AUTO,
            IMAGE_GENERATION_CONSTANTS.SIZES.SQUARE_1024,
            IMAGE_GENERATION_CONSTANTS.SIZES.PORTRAIT_1024x1536,
            IMAGE_GENERATION_CONSTANTS.SIZES.LANDSCAPE_1536x1024,
          ],
          maxPromptLength: 4000,
        },
        videoGeneration: {
          supported: true,
          models: ['gpt-video-1'],
          resolutions: ['720p', '1080p'],
          maxPromptLength: 4000,
        },
      };
    case 'google':
      return {
        imageGeneration: {
          supported: true,
          // Imagen models are handled via Google Generative Language API
          models: ['imagen-3', 'gemini-2.0-flash-image-generation'],
          sizes: [
            IMAGE_GENERATION_CONSTANTS.SIZES.SQUARE_1024,
          ],
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
          models: ['grok-2-image-1212'],
          sizes: [IMAGE_GENERATION_CONSTANTS.SIZES.SQUARE_1024],
          maxPromptLength: 4000,
        },
        videoGeneration: { supported: false },
      };
    default:
      return { imageGeneration: { supported: false } };
  }
}
