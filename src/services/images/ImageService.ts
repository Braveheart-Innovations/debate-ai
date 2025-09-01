import { AIProvider } from '../../types';
import { saveBase64Image } from './fileCache';

export interface GenerateImageOptions {
  provider: AIProvider;
  apiKey: string;
  prompt: string;
  // Canonical UI values are mapped upstream; this accepts provider-ready values for OpenAI
  size?: 'auto' | '1024x1024' | '1024x1536' | '1536x1024';
  n?: number; // number of images
  signal?: AbortSignal;
}

export interface GeneratedImage {
  url?: string;
  b64?: string;
  mimeType: string;
}

export class ImageService {
  static async generateImage(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const { provider } = opts;
    switch (provider) {
      case 'openai':
        return await this.generateOpenAI(opts);
      default:
        throw new Error(`Image generation not implemented for provider: ${provider}`);
    }
  }

  private static async generateOpenAI(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const { apiKey, prompt, size = '1024x1024', n = 1, signal } = opts;
    const body: Record<string, unknown> = {
      model: 'gpt-image-1',
      prompt,
      size,
    };
    if (n && n > 1) {
      body.n = n;
    }
    if (process.env.NODE_ENV === 'development') {
      try { console.warn('[ImageService] OpenAI images body keys', Object.keys(body)); } catch (e) { void e; }
    }
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI Images error ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as { data: Array<{ url?: string; b64_json?: string }>; };
    if (process.env.NODE_ENV === 'development') {
      try {
        console.warn('[ImageService] images status', res.status, 'count', data?.data?.length);
        if (data?.data && data.data[0]) {
          const first = data.data[0] as { url?: string; b64_json?: string };
          console.warn('[ImageService] first image url?', Boolean(first.url), 'b64?', Boolean(first.b64_json));
        }
      } catch (e) { void e; }
    }
    const results: GeneratedImage[] = [];
    for (const item of (data.data || [])) {
      if (item.url) {
        results.push({ url: item.url, mimeType: 'image/png' });
      } else if (item.b64_json) {
        const fileUri = await saveBase64Image(item.b64_json, 'image/png');
        results.push({ url: fileUri, mimeType: 'image/png' });
      }
    }
    return results;
  }
}
