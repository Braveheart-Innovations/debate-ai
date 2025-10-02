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
    expect(result).toEqual([{ url: '/cache/images/file.png', mimeType: 'image/png' }]);
  });

  it('passes abort signal and propagates errors', async () => {
    const controller = new AbortController();
    const errorResponse = { ok: false, status: 500, text: jest.fn().mockResolvedValue('bad') } as any;
    mockedFetch.mockResolvedValue(errorResponse);

    await expect(ImageService.generateImage({ provider: 'openai', apiKey: 'key', prompt: 'fail', signal: controller.signal })).rejects.toThrow('OpenAI Images error 500: bad');

    expect(mockedFetch.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});
