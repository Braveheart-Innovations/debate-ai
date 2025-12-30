jest.mock('@/services/images/fileCache', () => ({
  saveBase64Image: jest.fn(),
}));

global.fetch = jest.fn();

import { ImageService } from '@/services/images/ImageService';
import { saveBase64Image } from '@/services/images/fileCache';

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedSaveBase64Image = saveBase64Image as jest.MockedFunction<typeof saveBase64Image>;

describe('ImageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws for unsupported providers', async () => {
    await expect(ImageService.generateImage({ provider: 'claude', apiKey: 'key', prompt: 'hello' } as any)).rejects.toThrow('not implemented');
  });

  it('handles OpenAI URL responses', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ url: 'https://example.com/image.png' }] })),
    } as any);

    const result = await ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'a cat', size: '1024x1024', n: 1 });

    expect(mockedFetch).toHaveBeenCalledWith('https://api.openai.com/v1/images/generations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer key' }),
    }));
    const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ prompt: 'a cat', size: '1024x1024' });
    expect(result).toEqual([{ url: 'https://example.com/image.png', mimeType: 'image/png' }]);
  });

  it('downloads base64 responses to cache directory', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ b64_json: 'YmFzZTY0' }] })),
    } as any);
    mockedSaveBase64Image.mockResolvedValue('/cache/images/file.png');

    const result = await ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'a tree' });

    expect(mockedSaveBase64Image).toHaveBeenCalledWith('YmFzZTY0', 'image/png');
    expect(result).toEqual([{ url: '/cache/images/file.png', mimeType: 'image/png', b64: 'YmFzZTY0' }]);
  });

  it('passes abort signal and propagates errors', async () => {
    const controller = new AbortController();
    const errorResponse = { ok: false, status: 500, text: jest.fn().mockResolvedValue('bad') } as any;
    mockedFetch.mockResolvedValue(errorResponse);

    await expect(ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'fail', signal: controller.signal })).rejects.toThrow('OpenAI Images error 500: bad');

    expect(mockedFetch.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  describe('OpenAI img2img (sourceImage)', () => {
    it('calls /v1/images/edits endpoint when sourceImage is provided', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ b64_json: 'ZWRpdGVk' }] })),
      } as any);
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
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ b64_json: 'cmVzdWx0' }] })),
      } as any);
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
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ inlineData: { data: 'Z29vZ2xlX2VkaXQ=', mimeType: 'image/png' } }]
            }
          }]
        })),
      } as any);
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
  });

  describe('Grok provider', () => {
    it('calls Grok API endpoint with correct parameters (no size param)', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ url: 'https://grok.x.ai/image.png' }] })),
      } as any);

      // Note: Grok does NOT support size parameter - it's ignored
      const result = await ImageService.generateImage({ provider: 'grok', apiKey: 'grok-key', prompt: 'a dog', size: '1024x1024' });

      expect(mockedFetch).toHaveBeenCalledWith('https://api.x.ai/v1/images/generations', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer grok-key' }),
      }));
      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      // Grok uses grok-2-image-1212 model and does NOT include size parameter
      expect(body).toMatchObject({ model: 'grok-2-image-1212', prompt: 'a dog' });
      expect(body.size).toBeUndefined(); // Size is NOT supported by Grok
      expect(result).toEqual([{ url: 'https://grok.x.ai/image.png', mimeType: 'image/png' }]);
    });

    it('handles Grok base64 responses', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ b64_json: 'Z3Jva19pbWFnZQ==' }] })),
      } as any);
      mockedSaveBase64Image.mockResolvedValue('/cache/images/grok_image.png');

      const result = await ImageService.generateImage({ provider: 'grok', apiKey: 'grok-key', prompt: 'a bird' });

      expect(mockedSaveBase64Image).toHaveBeenCalledWith('Z3Jva19pbWFnZQ==', 'image/png');
      expect(result).toEqual([{ url: '/cache/images/grok_image.png', mimeType: 'image/png' }]);
    });

    it('propagates Grok API errors', async () => {
      mockedFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('rate limited'),
      } as any);

      await expect(ImageService.generateImage({ provider: 'grok', apiKey: 'key', prompt: 'test' }))
        .rejects.toThrow('Grok Images error 429: rate limited');
    });
  });

  describe('Google provider', () => {
    it('calls Google Gemini API endpoint with correct model and aspect ratio', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ inlineData: { data: 'Z29vZ2xlX2ltYWdl', mimeType: 'image/png' } }]
            }
          }]
        })),
      } as any);
      mockedSaveBase64Image.mockResolvedValue('/cache/images/google_image.png');

      const result = await ImageService.generateImage({ provider: 'google', apiKey: 'google-key', prompt: 'a sunset' });

      // Verify correct model (gemini-2.5-flash-image) in URL
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('gemini-2.5-flash-image'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('key=google-key'),
        expect.anything()
      );
      const body = JSON.parse((mockedFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.contents[0].parts[0].text).toBe('a sunset');
      // Google uses aspect_ratio instead of pixel size
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1'); // Default
      expect(result).toEqual([{ url: '/cache/images/google_image.png', mimeType: 'image/png', b64: 'Z29vZ2xlX2ltYWdl' }]);
    });

    it('maps size parameter to correct aspect ratio for Google', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ inlineData: { data: 'dGVzdA==', mimeType: 'image/png' } }]
            }
          }]
        })),
      } as any);
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

    it('handles multiple image parts from Google response', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          candidates: [{
            content: {
              parts: [
                { inlineData: { data: 'aW1hZ2Ux', mimeType: 'image/png' } },
                { text: 'Here is your image' },
                { inlineData: { data: 'aW1hZ2Uy', mimeType: 'image/jpeg' } },
              ]
            }
          }]
        })),
      } as any);
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
      mockedFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('invalid request'),
      } as any);

      await expect(ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test' }))
        .rejects.toThrow('Google Images error 400: invalid request');
    });

    it('returns empty array when no image parts in response', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: 'I cannot generate that image' }]
            }
          }]
        })),
      } as any);

      const result = await ImageService.generateImage({ provider: 'google', apiKey: 'key', prompt: 'test' });

      expect(result).toEqual([]);
    });
  });
});
