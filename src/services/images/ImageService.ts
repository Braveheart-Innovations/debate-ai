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
      case 'grok':
        return await this.generateGrok(opts);
      case 'google':
        return await this.generateGoogle(opts);
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

  /**
   * Generate images using Grok (xAI) - OpenAI-compatible API
   * Note: Grok's API does not support size, quality, or style parameters
   */
  private static async generateGrok(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const { apiKey, prompt, n = 1, signal } = opts;
    const body: Record<string, unknown> = {
      model: 'grok-2-image',
      prompt,
    };
    if (n && n > 1) {
      body.n = n;
    }
    if (process.env.NODE_ENV === 'development') {
      try { console.warn('[ImageService] Grok images body keys', Object.keys(body)); } catch (e) { void e; }
    }
    const res = await fetch('https://api.x.ai/v1/images/generations', {
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
      throw new Error(`Grok Images error ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as { data: Array<{ url?: string; b64_json?: string }>; };
    if (process.env.NODE_ENV === 'development') {
      try {
        console.warn('[ImageService] Grok images status', res.status, 'count', data?.data?.length);
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

  /**
   * Generate images using Google Gemini
   * Uses gemini-2.5-flash-image model (production) with aspect_ratio support
   */
  private static async generateGoogle(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const { apiKey, prompt, size, signal } = opts;
    const model = 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Map size to aspect_ratio for Gemini
    const aspectRatioMap: Record<string, string> = {
      '1024x1024': '1:1',
      '1024x1536': '9:16',
      '1536x1024': '16:9',
      'auto': '1:1',
    };
    const aspectRatio = size ? aspectRatioMap[size] || '1:1' : '1:1';

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        aspectRatio,
      },
    };

    if (process.env.NODE_ENV === 'development') {
      try { console.warn('[ImageService] Google images model', model); } catch (e) { void e; }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Google Images error ${res.status}: ${text}`);
    }

    const data = JSON.parse(text) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { data: string; mimeType: string };
          }>;
        };
      }>;
    };

    if (process.env.NODE_ENV === 'development') {
      try {
        console.warn('[ImageService] Google images status', res.status, 'candidates', data?.candidates?.length);
      } catch (e) { void e; }
    }

    const results: GeneratedImage[] = [];
    for (const candidate of (data.candidates || [])) {
      for (const part of (candidate.content?.parts || [])) {
        if (part.inlineData?.data) {
          const fileUri = await saveBase64Image(part.inlineData.data, part.inlineData.mimeType || 'image/png');
          results.push({ url: fileUri, mimeType: part.inlineData.mimeType || 'image/png' });
        }
      }
    }
    return results;
  }
}
