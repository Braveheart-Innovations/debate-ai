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
  // Base64-encoded source image for img2img operations (round-robin)
  sourceImage?: string;
}

export interface GeneratedImage {
  url?: string;
  b64?: string;  // Base64 data for img2img chaining
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
    const { apiKey, prompt, size = '1024x1024', n = 1, signal, sourceImage } = opts;

    // If sourceImage is provided, use the edits endpoint for img2img
    if (sourceImage) {
      return this.generateOpenAIEdit(opts);
    }

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
      if (item.b64_json) {
        // Always save and include b64 for potential img2img chaining
        const fileUri = await saveBase64Image(item.b64_json, 'image/png');
        results.push({ url: fileUri, b64: item.b64_json, mimeType: 'image/png' });
      } else if (item.url) {
        results.push({ url: item.url, mimeType: 'image/png' });
      }
    }
    return results;
  }

  /**
   * OpenAI image editing using /v1/images/edits endpoint
   * This endpoint supports gpt-image-1 for img2img transformations
   */
  private static async generateOpenAIEdit(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const { apiKey, prompt, n = 1, signal, sourceImage } = opts;

    if (!sourceImage) {
      throw new Error('sourceImage is required for img2img');
    }

    // Convert base64 to Blob for FormData
    const base64Data = sourceImage.includes(',') ? sourceImage.split(',')[1] : sourceImage;

    console.warn('[ImageService] OpenAI img2img via /v1/images/edits, sourceImage length:', base64Data.length);

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const imageBlob = new Blob([byteArray], { type: 'image/png' });

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', prompt);
    formData.append('n', String(n));
    formData.append('image', imageBlob, 'image.png');

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
      signal,
    });

    const text = await res.text();
    console.warn('[ImageService] OpenAI img2img response status:', res.status);

    if (!res.ok) {
      console.error('[ImageService] OpenAI img2img error:', text);
      throw new Error(`OpenAI Images Edit error ${res.status}: ${text}`);
    }

    const data = JSON.parse(text) as { data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>; };
    console.warn('[ImageService] OpenAI img2img result count:', data.data?.length);

    const results: GeneratedImage[] = [];
    for (const item of (data.data || [])) {
      if (item.b64_json) {
        const fileUri = await saveBase64Image(item.b64_json, 'image/png');
        results.push({ url: fileUri, b64: item.b64_json, mimeType: 'image/png' });
      } else if (item.url) {
        results.push({ url: item.url, mimeType: 'image/png' });
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
   * Uses gemini-2.5-flash-image model with aspect_ratio support
   * Supports img2img when sourceImage is provided
   */
  private static async generateGoogle(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const { apiKey, prompt, size, signal, sourceImage } = opts;
    const model = 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.warn('[ImageService] Google request - model:', model, 'img2img:', Boolean(sourceImage), 'sourceImage length:', sourceImage?.length || 0);

    // Map size to aspect_ratio for Gemini
    const aspectRatioMap: Record<string, string> = {
      '1024x1024': '1:1',
      '1024x1536': '9:16',
      '1536x1024': '16:9',
      'auto': '1:1',
    };
    const aspectRatio = size ? aspectRatioMap[size] || '1:1' : '1:1';

    // Build content parts - include source image for img2img
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (sourceImage) {
      // Add source image for img2img
      const base64Data = sourceImage.includes(',') ? sourceImage.split(',')[1] : sourceImage;
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data,
        },
      });
      // Explicit instruction to GENERATE a new improved image, not just describe or copy
      parts.push({
        text: `GENERATE A NEW IMAGE: Take the provided image and create an improved, enhanced version of it. Do NOT just describe or copy the image - you must generate a new, better version.

${prompt}

Requirements:
- Generate a completely new image file
- Improve visual quality, details, and artistic refinement
- Maintain the core subject matter and composition
- Make noticeable improvements that distinguish it from the original`,
      });
    } else {
      parts.push({ text: prompt });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    };

    if (process.env.NODE_ENV === 'development') {
      try { console.warn('[ImageService] Google images model', model, 'img2img:', Boolean(sourceImage)); } catch (e) { void e; }
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

    console.warn('[ImageService] Google response status:', res.status, 'candidates:', data?.candidates?.length);

    // Debug: log parts info
    if (data?.candidates?.[0]?.content?.parts) {
      const partsInfo = data.candidates[0].content.parts.map((p: { text?: string; inlineData?: { data: string; mimeType: string } }) => ({
        hasText: Boolean(p.text),
        hasInlineData: Boolean(p.inlineData?.data),
        dataLength: p.inlineData?.data?.length || 0,
      }));
      console.warn('[ImageService] Google response parts:', JSON.stringify(partsInfo));
    }

    const results: GeneratedImage[] = [];
    for (const candidate of (data.candidates || [])) {
      for (const part of (candidate.content?.parts || [])) {
        if (part.inlineData?.data) {
          console.warn('[ImageService] Google found image, b64 length:', part.inlineData.data.length);
          const fileUri = await saveBase64Image(part.inlineData.data, part.inlineData.mimeType || 'image/png');
          // Include b64 data for potential img2img chaining
          results.push({
            url: fileUri,
            b64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png',
          });
        }
      }
    }

    console.warn('[ImageService] Google result count:', results.length);
    return results;
  }
}
