import { LOGO_CONFIGS, getLogoConfig } from '@/config/logoConfig';
import { getProviderCapabilities } from '@/config/providerCapabilities';
import { malformed } from '@test-utils/queries';


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
  it('derives OpenAI image capabilities from the shared image model registry', () => {
    const capabilities = getProviderCapabilities('openai');
    expect(capabilities.imageGeneration).toEqual(expect.objectContaining({
      supported: true,
      supportsImageInput: true,
      models: [
        'gpt-image-2.5-flare',
        'gpt-image-2.5-sunburst',
        'gpt-image-2',
        'gpt-image-1.5',
        'gpt-image-1',
        'gpt-image-1-mini',
      ],
      sizes: [
        '1024x1024',
        '1024x1536',
        '1536x1024',
      ],
      maxPromptLength: 4000,
    }));
    expect(capabilities.videoGeneration).toEqual({ supported: false });
  });

  it('surfaces both Gemini and Imagen offerings for Google', () => {
    const capabilities = getProviderCapabilities('google');
    expect(capabilities.videoGeneration).toEqual({ supported: false });
    expect(capabilities.imageGeneration).toEqual(expect.objectContaining({
      supported: true,
      supportsImageInput: true,
      models: [
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image',
        'gemini-3.1-flash-lite-image',
        'gemini-3-pro-image',
        'imagen-4.0-fast-generate-001',
        'imagen-4.0-generate-001',
        'imagen-4.0-ultra-generate-001',
      ],
      sizes: [
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
        '1:4',
        '4:1',
        '1:8',
        '8:1',
      ],
      maxPromptLength: 4000,
    }));
  });

  it('marks Grok refinement and aspect-ratio support correctly', () => {
    const capabilities = getProviderCapabilities('grok');
    expect(capabilities.imageGeneration).toEqual(expect.objectContaining({
      supported: true,
      supportsImageInput: true,
      models: ['grok-imagine-image-2.0', 'grok-imagine-image', 'grok-imagine-image-quality'],
      // Grok Imagine 2.0 (listed first) adds 21:9 and 5:2.
      sizes: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '21:9', '5:2', '19.5:9', '9:19.5', '20:9', '9:20'],
      maxPromptLength: 8000,
    }));
    expect(capabilities.videoGeneration).toEqual({ supported: false });
  });

  it('returns disabled capabilities for unknown providers', () => {
    expect(getProviderCapabilities(malformed<Parameters<typeof getProviderCapabilities>[0]>('mystery', 'unknown provider id from persisted data'))).toEqual({
      imageGeneration: { supported: false },
    });
  });
});
