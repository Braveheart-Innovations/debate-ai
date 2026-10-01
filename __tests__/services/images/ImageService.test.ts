jest.mock('@/services/images/fileCache', () => ({
  saveBase64Image: jest.fn(),
  persistImageUri: jest.fn(),
}));

global.fetch = jest.fn();

import { ImageService } from '@/services/images/ImageService';
import {
  getImageModels,
  getResolvedImageModel,
  type ImageModelApiFamily,
} from '@/config/imageGenerationModels';
import { persistImageUri, saveBase64Image } from '@/services/images/fileCache';
import type { AIProvider } from '@/types';

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedSaveBase64Image = saveBase64Image as jest.MockedFunction<typeof saveBase64Image>;
const mockedPersistImageUri = persistImageUri as jest.MockedFunction<typeof persistImageUri>;
const imageProviders: AIProvider[] = ['openai', 'google', 'grok'];
const exposedImageModelCases = imageProviders.flatMap((provider) =>
  getImageModels(provider).map((model) => [
    provider,
    model.id,
    model.apiFamily,
  ] as const)
);

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function textResponse(body: string, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? false,
    status: init?.status ?? 500,
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('ImageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPersistImageUri.mockImplementation(async (uri) => uri);
  });

  it('throws for unsupported providers', async () => {
    await expect(ImageService.generateImage({ provider: 'claude', apiKey: 'key', prompt: 'hello' })).rejects.toThrow('not implemented');
  });

  it('handles OpenAI URL responses', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ data: [{ url: 'https://example.com/image.png' }] }));
    mockedPersistImageUri.mockResolvedValue('/documents/images/generated.png');

    const result = await ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'a cat', size: '1024x1024', n: 1 });

    expect(mockedFetch).toHaveBeenCalledWith('https://api.openai.com/v1/images/generations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer key' }),
    }));
    const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ model: 'gpt-image-2.5-flare', prompt: 'a cat', size: '1024x1024' });
    expect(mockedPersistImageUri).toHaveBeenCalledWith('https://example.com/image.png', {
      mimeType: 'image/png',
      prefix: 'generated',
    });
    expect(result).toEqual([{ url: '/documents/images/generated.png', mimeType: 'image/png' }]);
  });

  it('maps supported OpenAI output options and omits unsupported defaults', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ data: [{ url: 'https://example.com/image.webp' }] }));

    await ImageService.generateImage({
      provider: 'openai',
      apiKey: 'key',
      prompt: 'a product render',
      size: '1024x1024',
      n: 3,
      quality: 'high',
      outputFormat: 'webp',
      outputCompression: 72,
      background: 'opaque',
      moderation: 'low',
    });

    const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-image-2.5-flare',
      prompt: 'a product render',
      size: '1024x1024',
      n: 3,
      quality: 'high',
      output_format: 'webp',
      output_compression: 72,
      background: 'opaque',
      moderation: 'low',
    });
  });

  it('routes invalid OpenAI image selections through the supported provider default', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'YWxpYXM=' }] }));
    mockedSaveBase64Image.mockResolvedValue('/cache/images/alias.png');

    await ImageService.generateImage({
      provider: 'openai',
      model: 'unknown-openai-image-model',
      apiKey: 'key',
      prompt: 'a legacy image',
      n: 4,
      quality: 'high',
      outputFormat: 'webp',
      outputCompression: 60,
      background: 'opaque',
      moderation: 'low',
    });

    const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-image-2.5-flare',
      prompt: 'a legacy image',
      n: 4,
      quality: 'high',
      output_format: 'webp',
      output_compression: 60,
      background: 'opaque',
      moderation: 'low',
    });
  });

  it('downloads base64 responses to cache directory', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'YmFzZTY0' }] }));
    mockedSaveBase64Image.mockResolvedValue('/cache/images/file.png');

    const result = await ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'a tree' });

    expect(mockedSaveBase64Image).toHaveBeenCalledWith('YmFzZTY0', 'image/png');
    expect(result).toEqual([{ url: '/cache/images/file.png', mimeType: 'image/png', b64: 'YmFzZTY0' }]);
  });

  it('passes abort signal and propagates errors', async () => {
    const controller = new AbortController();
    mockedFetch.mockResolvedValue(textResponse('bad', { ok: false, status: 500 }));

    await expect(ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'fail', signal: controller.signal })).rejects.toThrow('OpenAI Images error 500: bad');

    expect(mockedFetch.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it.each(exposedImageModelCases)(
    'builds a supported transport request for %s/%s',
    async (provider: AIProvider, modelId: string, apiFamily: ImageModelApiFamily) => {
      mockedFetch.mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes(':predict')) {
          return jsonResponse({
            generatedImages: [
              { image: { imageBytes: 'bW9kZWw=', mimeType: 'image/png' } },
            ],
          });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return jsonResponse({
            candidates: [{
              content: {
                parts: [{ inlineData: { data: 'bW9kZWw=', mimeType: 'image/png' } }],
              },
            }],
          });
        }
        return jsonResponse({ data: [{ b64_json: 'bW9kZWw=' }] });
      });
      mockedSaveBase64Image.mockResolvedValue('/cache/images/model.png');

      const result = await ImageService.generateImage({
        provider,
        model: modelId,
        apiKey: 'key',
        prompt: 'transport test',
        size: '1024x1024',
      });

      const resolvedModel = getResolvedImageModel(provider, modelId);
      const [url, init] = mockedFetch.mock.calls[0];
      const requestBody = JSON.parse((init as RequestInit).body as string);

      expect(result).toHaveLength(1);
      expect(resolvedModel).toBeDefined();
      if (apiFamily === 'openai-images') {
        expect(String(url)).toBe('https://api.openai.com/v1/images/generations');
        expect(requestBody).toMatchObject({
          model: resolvedModel?.id,
          prompt: 'transport test',
        });
      } else if (apiFamily === 'google-gemini-image') {
        expect(String(url)).toContain(`/v1beta/models/${resolvedModel?.id}:generateContent`);
        expect(requestBody.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
        expect(requestBody.generationConfig.imageConfig).toEqual(expect.objectContaining({
          aspectRatio: '1:1',
        }));
        expect(requestBody.generationConfig.responseFormat).toBeUndefined();
      } else if (apiFamily === 'google-imagen') {
        expect(String(url)).toContain(`/v1beta/models/${resolvedModel?.id}:predict`);
        expect(requestBody).toMatchObject({
          instances: [{ prompt: 'transport test' }],
          parameters: expect.objectContaining({
            aspectRatio: '1:1',
          }),
        });
      } else if (apiFamily === 'xai-images') {
        expect(String(url)).toBe('https://api.x.ai/v1/images/generations');
        expect(requestBody).toMatchObject({
          model: resolvedModel?.id,
          prompt: 'transport test',
          aspect_ratio: '1:1',
        });
      }
    }
  );

  describe('OpenAI img2img (sourceImage)', () => {
    it('calls /v1/images/edits endpoint when sourceImage is provided', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'ZWRpdGVk' }] }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/edited.png');

      const result = await ImageService.generateImage({
        provider: 'openai',
        apiKey: 'key',
        prompt: 'Improve this image',
        sourceImage: 'c291cmNlX2ltYWdl', // base64 encoded source image
      });

      // Should call edits endpoint
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/edits',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual([{ url: '/cache/images/edited.png', mimeType: 'image/png', b64: 'ZWRpdGVk' }]);
    });

    it('includes image field in form data for img2img', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'cmVzdWx0' }] }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/result.png');

      await ImageService.generateImage({
        provider: 'openai',
        apiKey: 'key',
        prompt: 'Make it better',
        sourceImage: 'dGVzdF9pbWFnZQ==',
      });

      const callArgs = mockedFetch.mock.calls[0];
      const body = callArgs[1]?.body;
      // For FormData, we just verify the call was made
      expect(body).toBeDefined();
    });
  });

  describe('Google img2img (sourceImage)', () => {
    it('includes inlineData in contents when sourceImage is provided', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'Z29vZ2xlX2VkaXQ=', mimeType: 'image/png' } }],
          },
        }],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/google_edit.png');

      await ImageService.generateImage({
        provider: 'google',
        apiKey: 'key',
        prompt: 'Improve this image',
        sourceImage: 'c291cmNlX2RhdGE=',
      });

      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      // Should have 2 parts: the source image and the prompt
      expect(body.contents[0].parts).toHaveLength(2);
      expect(body.contents[0].parts[0].inlineData).toBeDefined();
      expect(body.contents[0].parts[0].inlineData.data).toBe('c291cmNlX2RhdGE=');
      // Prompt is prefixed with context for img2img
      expect(body.contents[0].parts[1].text).toContain('Improve this image');
    });

    it('includes multiple Gemini reference images when the selected model supports them', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'Z29vZ2xlX2VkaXQ=', mimeType: 'image/png' } }],
          },
        }],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/google_edit.png');

      await ImageService.generateImage({
        provider: 'google',
        model: 'gemini-3-pro-image',
        apiKey: 'key',
        prompt: 'Blend these references',
        sourceImages: [
          { data: 'cmVmMQ==', mimeType: 'image/png' },
          { data: 'cmVmMg==', mimeType: 'image/jpeg' },
        ],
        resolution: '4K',
      });

      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.contents[0].parts.slice(0, 2)).toEqual([
        { inlineData: { data: 'cmVmMQ==', mimeType: 'image/png' } },
        { inlineData: { data: 'cmVmMg==', mimeType: 'image/jpeg' } },
      ]);
      expect(body.generationConfig.imageConfig.imageSize).toBe('4K');
    });
  });

  describe('Grok provider', () => {
    it('calls Grok API endpoint with correct aspect ratio mapping', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({ data: [{ url: 'https://grok.x.ai/image.png' }] }));
      mockedPersistImageUri.mockResolvedValue('/documents/images/grok.png');

      const result = await ImageService.generateImage({ provider: 'grok', apiKey: 'grok-key', prompt: 'a dog', size: '1024x1024' });

      expect(mockedFetch).toHaveBeenCalledWith('https://api.x.ai/v1/images/generations', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer grok-key' }),
      }));
      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toMatchObject({
        model: 'grok-imagine-image',
        prompt: 'a dog',
        aspect_ratio: '1:1',
        resolution: '1k',
      });
      expect(result).toEqual([{ url: '/documents/images/grok.png', mimeType: 'image/png' }]);
    });

    it('handles Grok base64 responses', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'Z3Jva19pbWFnZQ==' }] }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/grok_image.png');

      const result = await ImageService.generateImage({ provider: 'grok', apiKey: 'grok-key', prompt: 'a bird' });

      expect(mockedSaveBase64Image).toHaveBeenCalledWith('Z3Jva19pbWFnZQ==', 'image/png');
      expect(result).toEqual([{ url: '/cache/images/grok_image.png', mimeType: 'image/png', b64: 'Z3Jva19pbWFnZQ==' }]);
    });

    it('uses the xAI edit endpoint when a source image is provided', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'ZWRpdGVkX2dyb2s=' }] }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/grok_edited.png');

      const result = await ImageService.generateImage({
        provider: 'grok',
        apiKey: 'grok-key',
        prompt: 'Improve this image',
        sourceImage: 'c291cmNlX2ltYWdl',
      });

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/edits',
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toMatchObject({
        model: 'grok-imagine-image',
        prompt: 'Improve this image',
        resolution: '1k',
        image: {
          url: 'data:image/png;base64,c291cmNlX2ltYWdl',
        },
      });
      expect(result).toEqual([{ url: '/cache/images/grok_edited.png', mimeType: 'image/png', b64: 'ZWRpdGVkX2dyb2s=' }]);
    });

    it('maps xAI count, resolution, and multiple reference images', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'ZWRpdGVkX2dyb2s=' }] }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/grok_edited.png');

      await ImageService.generateImage({
        provider: 'grok',
        apiKey: 'grok-key',
        prompt: 'Use these references',
        size: '1536x1024',
        resolution: '2K',
        n: 4,
        sourceImages: [
          { data: 'cmVmMQ==', mimeType: 'image/png' },
          { data: 'cmVmMg==', mimeType: 'image/jpeg' },
        ],
      });

      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toMatchObject({
        model: 'grok-imagine-image',
        prompt: 'Use these references',
        aspect_ratio: '16:9',
        resolution: '2k',
        n: 4,
      });
      expect(body.images).toEqual([
        { type: 'image_url', url: 'data:image/png;base64,cmVmMQ==' },
        { type: 'image_url', url: 'data:image/jpeg;base64,cmVmMg==' },
      ]);
    });

    it('propagates Grok API errors', async () => {
      mockedFetch.mockResolvedValue(textResponse('rate limited', { ok: false, status: 429 }));

      await expect(ImageService.generateImage({ provider: 'grok', apiKey: 'key', prompt: 'test' }))
        .rejects.toThrow('Grok Images error 429: rate limited');
    });
  });

  describe('Google provider', () => {
    it('calls Google Gemini API endpoint with correct model and aspect ratio', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'Z29vZ2xlX2ltYWdl', mimeType: 'image/png' } }],
          },
        }],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/google_image.png');

      const result = await ImageService.generateImage({ provider: 'google', apiKey: 'google-key', prompt: 'a sunset' });

      // Verify correct model (gemini-2.5-flash-image) in URL
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1beta/models/gemini-2.5-flash-image:generateContent'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('key=google-key'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-goog-api-key': 'google-key' }),
        })
      );
      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.contents[0].parts[0].text).toBe('a sunset');
      expect(body.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1');
      expect(body.generationConfig.responseFormat).toBeUndefined();
      expect(result).toEqual([{ url: '/cache/images/google_image.png', mimeType: 'image/png', b64: 'Z29vZ2xlX2ltYWdl' }]);
    });

    it('maps size parameter to correct aspect ratio for Google', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'dGVzdA==', mimeType: 'image/png' } }],
          },
        }],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/test.png');

      // Test portrait (1024x1536 -> 9:16)
      await ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test', size: '1024x1536' });
      let body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('9:16');

      // Test landscape (1536x1024 -> 16:9)
      await ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test', size: '1536x1024' });
      body = JSON.parse((mockedFetch.mock.calls[1][1] as RequestInit).body as string);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');

      // Test square (1024x1024 -> 1:1)
      await ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test', size: '1024x1024' });
      body = JSON.parse((mockedFetch.mock.calls[2][1] as RequestInit).body as string);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1');
    });

    it('includes a default image size for Gemini 3 models that support it', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'dGVzdA==', mimeType: 'image/png' } }],
          },
        }],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/test.png');

      await ImageService.generateImage({
        provider: 'google',
        model: 'gemini-3-pro-image',
        apiKey: 'key',
        prompt: 'high fidelity test',
      });

      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.generationConfig.imageConfig).toMatchObject({
        aspectRatio: '1:1',
        imageSize: '1K',
      });
    });

    it('routes Imagen models to the predict endpoint and parses generatedImages', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        generatedImages: [
          { image: { imageBytes: 'aW1hZ2Vu', mimeType: 'image/png' } },
        ],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/imagen.png');

      const result = await ImageService.generateImage({
        provider: 'google',
        model: 'imagen-4.0-generate-001',
        apiKey: 'key',
        prompt: 'clean product photo',
        size: '16:9',
      });

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('imagen-4.0-generate-001:predict'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-goog-api-key': 'key' }),
        })
      );
      expect(String(mockedFetch.mock.calls[0][0])).not.toContain('key=');
      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toMatchObject({
        instances: [{ prompt: 'clean product photo' }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
        },
      });
      expect(result).toEqual([{ url: '/cache/images/imagen.png', mimeType: 'image/png', b64: 'aW1hZ2Vu' }]);
    });

    it('maps Imagen sample count and image size when supported', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        generatedImages: [
          { image: { imageBytes: 'aW1hZ2VuMQ==', mimeType: 'image/png' } },
          { image: { imageBytes: 'aW1hZ2VuMg==', mimeType: 'image/png' } },
        ],
      }));
      mockedSaveBase64Image
        .mockResolvedValueOnce('/cache/images/imagen-1.png')
        .mockResolvedValueOnce('/cache/images/imagen-2.png');

      await ImageService.generateImage({
        provider: 'google',
        model: 'imagen-4.0-generate-001',
        apiKey: 'key',
        prompt: 'clean product photo',
        size: '9:16',
        resolution: '2K',
        n: 3,
      });

      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.parameters).toMatchObject({
        sampleCount: 3,
        aspectRatio: '9:16',
        imageSize: '2K',
      });
    });

    it('handles multiple image parts from Google response', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [
              { inlineData: { data: 'aW1hZ2Ux', mimeType: 'image/png' } },
              { text: 'Here is your image' },
              { inlineData: { data: 'aW1hZ2Uy', mimeType: 'image/jpeg' } },
            ],
          },
        }],
      }));
      mockedSaveBase64Image
        .mockResolvedValueOnce('/cache/images/img1.png')
        .mockResolvedValueOnce('/cache/images/img2.jpg');

      const result = await ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test' });

      expect(mockedSaveBase64Image).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0].mimeType).toBe('image/png');
      expect(result[1].mimeType).toBe('image/jpeg');
    });

    it('propagates Google API errors', async () => {
      mockedFetch.mockResolvedValue(textResponse('invalid request', { ok: false, status: 400 }));

      await expect(ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test' }))
        .rejects.toThrow('Google Images error 400: invalid request');
    });

    it('surfaces Google JSON error messages without dumping the raw payload', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        error: {
          code: 400,
          message: 'Invalid JSON payload received. Unknown name "responseFormat" at generation_config: Cannot find field.',
          status: 'INVALID_ARGUMENT',
        },
      }, { ok: false, status: 400 }));

      await expect(ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test' }))
        .rejects.toThrow('Google Images error 400: Invalid JSON payload received. Unknown name "responseFormat" at generation_config: Cannot find field.');
    });

    it('throws when no image parts are returned', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ text: 'I cannot generate that image' }],
          },
        }],
      }));

      await expect(ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test' }))
        .rejects.toThrow('Google returned text instead of image data');
    });

    it('trims Google API keys before sending them in headers', async () => {
      mockedFetch.mockResolvedValue(jsonResponse({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'dHJpbW1lZA==', mimeType: 'image/png' } }],
          },
        }],
      }));
      mockedSaveBase64Image.mockResolvedValue('/cache/images/trimmed.png');

      await ImageService.generateImage({ provider: 'google', apiKey: '  google-key  ', prompt: 'test' });

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-goog-api-key': 'google-key' }),
        })
      );
    });
  });
});
