import type { AIProvider } from '@/types';
import {
  getDefaultImageInputModel,
  getImageInputModels,
  getImageGenerationCapabilities,
  getImageModelApiFamily,
  getImageModelDisplayName,
  getImageModels,
  getImageProviderDisplayName,
  resolveImageModelId,
  supportsImageInput,
} from '@/config/imageGenerationModels';

describe('Image generation model config', () => {
  const providers: AIProvider[] = ['openai', 'google', 'grok'];

  it.each(providers)('exposes at least one image model for %s', (provider) => {
    expect(getImageModels(provider).length).toBeGreaterThan(0);
  });

  it('resolves defaults and explicit model selections safely', () => {
    expect(resolveImageModelId('openai')).toBe('gpt-image-2.5-flare');
    expect(resolveImageModelId('openai', 'unknown-openai-image-model')).toBe('gpt-image-2.5-flare');
    expect(resolveImageModelId('openai', 'gpt-image-latest')).toBe('gpt-image-2.5-flare');
    expect(resolveImageModelId('openai', 'gpt-image-2.5-sunburst-2026-09-08')).toBe('gpt-image-2.5-sunburst');
    expect(resolveImageModelId('openai', 'gpt-image-2')).toBe('gpt-image-2');
    expect(resolveImageModelId('google', 'imagen-4.0-generate-001')).toBe('imagen-4.0-generate-001');
    expect(resolveImageModelId('google', 'gemini-3.1-flash-image-preview')).toBe('gemini-3.1-flash-image');
    expect(resolveImageModelId('google', 'gemini-3-pro-image-preview')).toBe('gemini-3-pro-image');
    expect(resolveImageModelId('google', 'nano-banana-2-lite')).toBe('gemini-3.1-flash-lite-image');
    expect(resolveImageModelId('openai', 'dall-e-3')).toBe('gpt-image-2.5-flare');
  });

  it('exposes model-aware labels and capabilities', () => {
    expect(getImageProviderDisplayName('openai')).toBe('ChatGPT');
    expect(getImageProviderDisplayName('openai', {
      includeModel: true,
      modelId: 'unknown-openai-image-model',
    })).toBe('ChatGPT (GPT Image 2.5 Flare)');
    expect(getImageModelDisplayName('openai', 'unknown-openai-image-model')).toBe('GPT Image 2.5 Flare');
    expect(supportsImageInput('openai', 'gpt-image-2.5-sunburst')).toBe(true);
    expect(supportsImageInput('openai', 'gpt-image-2')).toBe(true);
    expect(supportsImageInput('openai', 'unknown-openai-image-model')).toBe(true);
    expect(supportsImageInput('google', 'imagen-4.0-generate-001')).toBe(false);
    expect(supportsImageInput('grok', 'grok-imagine-image')).toBe(true);
  });

  it('surfaces only refinement-capable models for model-aware img2img flows', () => {
    expect(getImageInputModels('openai').map((model) => model.id)).toEqual(expect.arrayContaining([
      'gpt-image-2',
      'gpt-image-1.5',
      'gpt-image-1',
      'gpt-image-1-mini',
    ]));
    expect(getDefaultImageInputModel('google')?.id).toBe('gemini-2.5-flash-image');
  });

  it('groups models by transport family for scalable routing', () => {
    expect(getImageModelApiFamily('openai', 'gpt-image-1-mini')).toBe('openai-images');
    expect(getImageModelApiFamily('google', 'gemini-3-pro-image')).toBe('google-gemini-image');
    expect(getImageModelApiFamily('google', 'imagen-4.0-fast-generate-001')).toBe('google-imagen');
    expect(getImageModelApiFamily('grok', 'grok-imagine-image')).toBe('xai-images');
    expect(resolveImageModelId('grok', 'grok-imagine-image-pro')).toBe('grok-imagine-image-quality');
  });

  it('expands provider offerings beyond the original minimal registry', () => {
    expect(getImageModels('openai').map((model) => model.id)).toEqual(expect.arrayContaining([
      'gpt-image-2',
      'gpt-image-1.5',
      'gpt-image-1',
      'gpt-image-1-mini',
    ]));
    expect(getImageModels('openai').every((model) => model.isDeprecated !== true)).toBe(true);
    expect(getImageModels('google').map((model) => model.id)).toEqual(expect.arrayContaining([
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image',
      'gemini-3-pro-image',
      'imagen-4.0-fast-generate-001',
      'imagen-4.0-generate-001',
      'imagen-4.0-ultra-generate-001',
    ]));
  });

  it('exposes adaptive output capabilities for Image Studio controls', () => {
    const openaiCapabilities = getImageGenerationCapabilities('openai');
    expect(openaiCapabilities.maxImagesPerRequest).toBeGreaterThanOrEqual(4);
    expect(openaiCapabilities.maxReferenceImages).toBeGreaterThanOrEqual(5);
    expect(openaiCapabilities.qualityOptions).toEqual(expect.arrayContaining(['auto', 'low', 'medium', 'high']));
    expect(openaiCapabilities.qualityOptions).not.toEqual(expect.arrayContaining(['standard', 'hd']));
    expect(openaiCapabilities.outputFormats).toEqual(expect.arrayContaining(['png', 'jpeg', 'webp']));
    expect(openaiCapabilities.backgroundOptions).toContain('transparent');
    expect(openaiCapabilities.moderationOptions).toContain('low');
    expect(openaiCapabilities.supportsOutputCompression).toBe(true);

    const googlePro = getImageModels('google').find((model) => model.id === 'gemini-3-pro-image');
    expect(googlePro).toMatchObject({
      supportsMultipleReferenceImages: true,
      maxReferenceImages: 14,
    });
    expect(googlePro?.resolutions).toEqual(expect.arrayContaining(['1K', '2K', '4K']));

    const googleFlash31 = getImageModels('google').find((model) => model.id === 'gemini-3.1-flash-image');
    expect(googleFlash31?.resolutions).toEqual(expect.arrayContaining(['1K', '2K', '4K', '512']));
    expect(googleFlash31?.resolutions).not.toContain('0.5K');
    expect(googleFlash31?.aspectRatios).toEqual(expect.arrayContaining(['1:4', '4:1', '1:8', '8:1']));

    const grokCapabilities = getImageGenerationCapabilities('grok');
    expect(grokCapabilities.maxImagesPerRequest).toBeGreaterThanOrEqual(10);
    expect(grokCapabilities.maxReferenceImages).toBeGreaterThanOrEqual(3);
    expect(grokCapabilities.resolutions).toEqual(expect.arrayContaining(['1K', '2K']));
  });
});
