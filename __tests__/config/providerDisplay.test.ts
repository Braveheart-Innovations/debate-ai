import { LOGO_CONFIGS, getLogoConfig } from '@/config/logoConfig';
import { getProviderCapabilities } from '@/config/providerCapabilities';
import { IMAGE_GENERATION_CONSTANTS } from '@/constants/imageGeneration';

describe('Provider logo configuration', () => {
  it('returns known provider configuration verbatim', () => {
    expect(getLogoConfig('claude')).toEqual(LOGO_CONFIGS.claude);
  });

  it('provides a sensible fallback for unknown providers', () => {
    expect(getLogoConfig('unknown-provider')).toEqual({
      providerId: 'unknown-provider',
      darkModeStrategy: 'glow',
      glowColor: '#6B7280',
      hasTransparency: true,
    });
  });
});

describe('Provider capability matrix', () => {
  it('supports OpenAI image generation with documented sizes', () => {
    const capabilities = getProviderCapabilities('openai');
    expect(capabilities.imageGeneration).toEqual({
      supported: true,
      supportsImageInput: true,
      models: [
        IMAGE_GENERATION_CONSTANTS.MODELS.OPENAI_IMAGE,
        IMAGE_GENERATION_CONSTANTS.MODELS.DALLE3,
      ],
      sizes: [
        IMAGE_GENERATION_CONSTANTS.SIZES.AUTO,
        IMAGE_GENERATION_CONSTANTS.SIZES.SQUARE_1024,
        IMAGE_GENERATION_CONSTANTS.SIZES.PORTRAIT_1024x1536,
        IMAGE_GENERATION_CONSTANTS.SIZES.LANDSCAPE_1536x1024,
      ],
      maxPromptLength: 4000,
    });
    expect(capabilities.videoGeneration).toEqual({ supported: false });
  });

  it('documents Google image generation constraints', () => {
    const capabilities = getProviderCapabilities('google');
    expect(capabilities).toEqual({
      imageGeneration: {
        supported: true,
        supportsImageInput: true,
        models: [
          'gemini-2.5-flash-image',
          'gemini-3-pro-image',
        ],
        // Google uses aspect ratios instead of pixel sizes
        sizes: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        maxPromptLength: 4000,
      },
      videoGeneration: {
        supported: false,
      },
    });
  });

  it('lists Grok image support and disables video', () => {
    const capabilities = getProviderCapabilities('grok');
    expect(capabilities).toEqual({
      imageGeneration: {
        supported: true,
        supportsImageInput: false,
        models: ['grok-2-image-1212'],
        // Grok does not support size parameter - generates at fixed size
        sizes: [],
        maxPromptLength: 4000,
      },
      videoGeneration: { supported: false },
    });
  });

  it('returns disabled capabilities for unknown providers', () => {
    expect(getProviderCapabilities('mystery')).toEqual({
      imageGeneration: { supported: false },
    });
  });
});
