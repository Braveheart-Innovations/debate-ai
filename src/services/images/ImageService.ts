import { AIProvider } from '../../types';
import {
  ImageBackgroundOption,
  getImageModelDisplayName,
  ImageModerationOption,
  ImageOutputFormat,
  ImageOutputQuality,
  getResolvedImageModel,
  ImageModelConfig,
} from '../../config/imageGenerationModels';
import { persistImageUri, saveBase64Image } from './fileCache';

const PIXEL_SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  auto: '1:1',
  '1024x1024': '1:1',
  '1024x1536': '9:16',
  '1536x1024': '16:9',
};

export interface GenerateImageOptions {
  provider: AIProvider;
  model?: string;
  apiKey: string;
  prompt: string;
  size?: string;
  resolution?: string;
  quality?: ImageOutputQuality;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  background?: ImageBackgroundOption;
  moderation?: ImageModerationOption;
  n?: number;
  signal?: AbortSignal;
  sourceImage?: string;
  sourceImages?: Array<{
    data: string;
    mimeType?: string;
  }>;
}

export interface GeneratedImage {
  url?: string;
  b64?: string;
  mimeType: string;
}

interface OpenAICompatibleImageResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
    mime_type?: string;
  }>;
}

interface GoogleGeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { data: string; mimeType: string };
      }>;
    };
  }>;
}

interface GoogleImagenResponse {
  generatedImages?: Array<{
    image?: {
      imageBytes?: string;
      mimeType?: string;
    };
  }>;
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
    image?: {
      imageBytes?: string;
      mimeType?: string;
    };
  }>;
}

function normalizeAspectRatio(size?: string): string | undefined {
  if (!size) return undefined;
  return PIXEL_SIZE_TO_ASPECT_RATIO[size] || size;
}

function toDataUri(sourceImage: string, mimeType = 'image/png'): string {
  if (sourceImage.startsWith('data:')) {
    return sourceImage;
  }

  const base64Data = sourceImage.includes(',') ? sourceImage.split(',')[1] : sourceImage;
  return `data:${mimeType};base64,${base64Data}`;
}

function getRequestedSourceImages(opts: GenerateImageOptions): Array<{ data: string; mimeType: string }> {
  const sourceImages = opts.sourceImages?.length
    ? opts.sourceImages
    : opts.sourceImage
      ? [{ data: opts.sourceImage }]
      : [];

  return sourceImages
    .filter((source) => source.data)
    .map((source) => ({
      data: source.data,
      mimeType: source.mimeType || 'image/png',
    }));
}

function clampImageCount(model: ImageModelConfig, requested?: number): number {
  const max = Math.max(1, model.maxImagesPerRequest || 1);
  return Math.max(1, Math.min(requested || 1, max));
}

function supportsValue<T extends string>(values: T[] | undefined, requested?: T): requested is T {
  return Boolean(requested && values?.includes(requested));
}

function appendFormValue(formData: FormData, key: string, value?: string | number): void {
  if (value === undefined || value === null || value === '') return;
  formData.append(key, String(value));
}

function getPreferredResolution(model: ImageModelConfig, requestedResolution?: string): string | undefined {
  if (!model.resolutions?.length) {
    return undefined;
  }

  if (requestedResolution && model.resolutions.includes(requestedResolution)) {
    return requestedResolution;
  }

  if (model.resolutions.includes('1K')) {
    return '1K';
  }

  return model.resolutions[0];
}

function normalizeXaiResolution(resolution?: string): '1k' | '2k' | undefined {
  const normalized = resolution?.trim().toLowerCase();
  if (normalized === '1k' || normalized === '2k') {
    return normalized;
  }
  return undefined;
}

function parseProviderErrorBody(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === 'string' ? parsed.error.message : undefined;
  } catch {
    return undefined;
  }
}

export class ImageService {
  static async generateImage(opts: GenerateImageOptions): Promise<GeneratedImage[]> {
    const normalizedOpts = {
      ...opts,
      apiKey: opts.apiKey.trim(),
    };
    const model = getResolvedImageModel(normalizedOpts.provider, normalizedOpts.model);
    if (!model) {
      throw new Error(`Image generation not implemented for provider: ${normalizedOpts.provider}`);
    }

    if (!normalizedOpts.apiKey) {
      throw new Error(`No API key for ${normalizedOpts.provider}`);
    }

    if (getRequestedSourceImages(normalizedOpts).length > 0 && !model.supportsImageInput) {
      throw new Error(`${getImageModelDisplayName(normalizedOpts.provider, model.id)} does not support image refinement.`);
    }

    switch (model.apiFamily) {
      case 'openai-images':
        return this.generateOpenAI(model, normalizedOpts);
      case 'google-gemini-image':
        return this.generateGoogleGemini(model, normalizedOpts);
      case 'google-imagen':
        return this.generateGoogleImagen(model, normalizedOpts);
      case 'xai-images':
        return this.generateXai(model, normalizedOpts);
      default:
        throw new Error(`Image generation not implemented for model: ${model.id}`);
    }
  }

  private static async generateOpenAI(
    model: ImageModelConfig,
    opts: GenerateImageOptions
  ): Promise<GeneratedImage[]> {
    if (getRequestedSourceImages(opts).length > 0) {
      return this.generateOpenAIEdit(model, opts);
    }

    const body: Record<string, unknown> = {
      model: model.id,
      prompt: opts.prompt,
    };

    if (opts.size) {
      body.size = opts.size;
    }
    const count = clampImageCount(model, opts.n);
    if (count > 1) {
      body.n = count;
    }
    if (supportsValue(model.qualityOptions, opts.quality)) {
      body.quality = opts.quality;
    }
    if (supportsValue(model.outputFormats, opts.outputFormat)) {
      body.output_format = opts.outputFormat;
    }
    if (
      opts.outputCompression !== undefined &&
      opts.outputFormat &&
      opts.outputFormat !== 'png' &&
      model.supportsOutputCompression
    ) {
      body.output_compression = Math.max(0, Math.min(100, Math.round(opts.outputCompression)));
    }
    if (supportsValue(model.backgroundOptions, opts.background)) {
      body.background = opts.background;
    }
    if (supportsValue(model.moderationOptions, opts.moderation)) {
      body.moderation = opts.moderation;
    }

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI Images error ${res.status}: ${text}`);
    }

    return this.parseOpenAICompatibleImages(JSON.parse(text) as OpenAICompatibleImageResponse);
  }

  private static async generateOpenAIEdit(
    model: ImageModelConfig,
    opts: GenerateImageOptions
  ): Promise<GeneratedImage[]> {
    const sourceImages = getRequestedSourceImages(opts);
    if (sourceImages.length === 0) {
      throw new Error('sourceImage is required for img2img');
    }

    const formData = new FormData();
    formData.append('model', model.id);
    formData.append('prompt', opts.prompt);
    appendFormValue(formData, 'n', clampImageCount(model, opts.n));
    appendFormValue(formData, 'size', opts.size);
    if (supportsValue(model.qualityOptions, opts.quality)) {
      appendFormValue(formData, 'quality', opts.quality);
    }
    if (supportsValue(model.outputFormats, opts.outputFormat)) {
      appendFormValue(formData, 'output_format', opts.outputFormat);
    }
    if (
      opts.outputCompression !== undefined &&
      opts.outputFormat &&
      opts.outputFormat !== 'png' &&
      model.supportsOutputCompression
    ) {
      appendFormValue(formData, 'output_compression', Math.max(0, Math.min(100, Math.round(opts.outputCompression))));
    }
    if (supportsValue(model.backgroundOptions, opts.background)) {
      appendFormValue(formData, 'background', opts.background);
    }
    if (supportsValue(model.moderationOptions, opts.moderation)) {
      appendFormValue(formData, 'moderation', opts.moderation);
    }

    for (const [index, source] of sourceImages.slice(0, model.maxReferenceImages || 1).entries()) {
      const base64Data = source.data.includes(',') ? source.data.split(',')[1] : source.data;
      const fileUri = await saveBase64Image(base64Data, source.mimeType, {
        location: 'cache',
        prefix: 'edit-source',
      });

      formData.append(sourceImages.length === 1 ? 'image' : 'image[]', {
        uri: fileUri,
        type: source.mimeType,
        name: `image_${index + 1}.png`,
      });
    }

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: formData,
      signal: opts.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI Images Edit error ${res.status}: ${text}`);
    }

    return this.parseOpenAICompatibleImages(JSON.parse(text) as OpenAICompatibleImageResponse);
  }

  private static async generateXai(
    model: ImageModelConfig,
    opts: GenerateImageOptions
  ): Promise<GeneratedImage[]> {
    if (getRequestedSourceImages(opts).length > 0) {
      return this.generateXaiEdit(model, opts);
    }

    const body: Record<string, unknown> = {
      model: model.id,
      prompt: opts.prompt,
    };

    const aspectRatio = normalizeAspectRatio(opts.size);
    if (aspectRatio) {
      body.aspect_ratio = aspectRatio;
    }
    const count = clampImageCount(model, opts.n);
    if (count > 1) {
      body.n = count;
    }
    const preferredResolution = normalizeXaiResolution(getPreferredResolution(model, opts.resolution));
    if (preferredResolution) {
      body.resolution = preferredResolution;
    }

    const res = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Grok Images error ${res.status}: ${text}`);
    }

    return this.parseOpenAICompatibleImages(JSON.parse(text) as OpenAICompatibleImageResponse);
  }

  private static async generateXaiEdit(
    model: ImageModelConfig,
    opts: GenerateImageOptions
  ): Promise<GeneratedImage[]> {
    const sourceImages = getRequestedSourceImages(opts);
    if (sourceImages.length === 0) {
      throw new Error('sourceImage is required for img2img');
    }

    const body: Record<string, unknown> = {
      model: model.id,
      prompt: opts.prompt,
    };

    const limitedSources = sourceImages.slice(0, model.maxReferenceImages || 1);
    if (limitedSources.length === 1) {
      body.image = {
        url: toDataUri(limitedSources[0].data, limitedSources[0].mimeType),
      };
    } else {
      body.images = limitedSources.map((source) => ({
        type: 'image_url',
        url: toDataUri(source.data, source.mimeType),
      }));
    }

    const aspectRatio = normalizeAspectRatio(opts.size);
    if (aspectRatio) {
      body.aspect_ratio = aspectRatio;
    }
    const preferredResolution = normalizeXaiResolution(getPreferredResolution(model, opts.resolution));
    if (preferredResolution) {
      body.resolution = preferredResolution;
    }
    const count = clampImageCount(model, opts.n);
    if (count > 1) {
      body.n = count;
    }

    const res = await fetch('https://api.x.ai/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Grok Images Edit error ${res.status}: ${text}`);
    }

    return this.parseOpenAICompatibleImages(JSON.parse(text) as OpenAICompatibleImageResponse);
  }

  private static async generateGoogleGemini(
    model: ImageModelConfig,
    opts: GenerateImageOptions
  ): Promise<GeneratedImage[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`;
    const aspectRatio = normalizeAspectRatio(opts.size) || '1:1';

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    const sourceImages = getRequestedSourceImages(opts).slice(0, model.maxReferenceImages || 1);

    if (sourceImages.length > 0) {
      sourceImages.forEach((source) => {
        const base64Data = source.data.includes(',') ? source.data.split(',')[1] : source.data;
        parts.push({
          inlineData: {
            mimeType: source.mimeType,
            data: base64Data,
          },
        });
      });
      parts.push({
        text: `GENERATE A NEW IMAGE: Use the provided image reference${sourceImages.length > 1 ? 's' : ''} and create a new image. Do NOT only describe the image - return generated image data.\n\n${opts.prompt}`,
      });
    } else {
      parts.push({ text: opts.prompt });
    }

    const imageConfig: Record<string, string> = { aspectRatio };

    const preferredResolution = getPreferredResolution(model, opts.resolution);
    if (preferredResolution) {
      imageConfig.imageSize = preferredResolution;
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      const message = parseProviderErrorBody(text) || text;
      throw new Error(`Google Images error ${res.status}: ${message}`);
    }

    const data = JSON.parse(text) as GoogleGeminiResponse;
    return this.parseGoogleGeminiImages(data);
  }

  private static async generateGoogleImagen(
    model: ImageModelConfig,
    opts: GenerateImageOptions
  ): Promise<GeneratedImage[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:predict`;
    const aspectRatio = normalizeAspectRatio(opts.size) || '1:1';

    const parameters: Record<string, unknown> = {
      sampleCount: clampImageCount(model, opts.n),
      aspectRatio,
    };

    const preferredResolution = getPreferredResolution(model, opts.resolution);
    if (preferredResolution && model.id !== 'imagen-4.0-fast-generate-001') {
      parameters.imageSize = preferredResolution;
    }

    const body = {
      instances: [{ prompt: opts.prompt }],
      parameters,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      const message = parseProviderErrorBody(text) || text;
      throw new Error(`Google Images error ${res.status}: ${message}`);
    }

    const data = JSON.parse(text) as GoogleImagenResponse;
    return this.parseGoogleImagenImages(data);
  }

  private static async parseOpenAICompatibleImages(
    data: OpenAICompatibleImageResponse
  ): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];

    for (const item of data.data || []) {
      const mimeType = item.mime_type || 'image/png';

      if (item.b64_json) {
        const fileUri = await saveBase64Image(item.b64_json, mimeType);
        results.push({ url: fileUri, b64: item.b64_json, mimeType });
        continue;
      }

      if (item.url) {
        const persistedUri = await persistImageUri(item.url, { mimeType, prefix: 'generated' });
        results.push({ url: persistedUri || item.url, mimeType });
      }
    }

    return results;
  }

  private static async parseGoogleGeminiImages(
    data: GoogleGeminiResponse
  ): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];

    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (!part.inlineData?.data) {
          continue;
        }

        const mimeType = part.inlineData.mimeType || 'image/png';
        const fileUri = await saveBase64Image(part.inlineData.data, mimeType);
        results.push({
          url: fileUri,
          b64: part.inlineData.data,
          mimeType,
        });
      }
    }

    if (results.length === 0) {
      const textPart = data.candidates
        ?.flatMap((candidate) => candidate.content?.parts || [])
        .find((part) => part.text);
      if (textPart?.text) {
        throw new Error(`Google returned text instead of image data: ${textPart.text.slice(0, 160)}`);
      }
      throw new Error('Google returned no image data.');
    }

    return results;
  }

  private static async parseGoogleImagenImages(
    data: GoogleImagenResponse
  ): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];

    for (const item of data.generatedImages || []) {
      const base64 = item.image?.imageBytes;
      if (!base64) {
        continue;
      }

      const mimeType = item.image?.mimeType || 'image/png';
      const fileUri = await saveBase64Image(base64, mimeType);
      results.push({
        url: fileUri,
        b64: base64,
        mimeType,
      });
    }

    for (const item of data.predictions || []) {
      const base64 = item.bytesBase64Encoded || item.image?.imageBytes;
      if (!base64) {
        continue;
      }

      const mimeType = item.mimeType || item.image?.mimeType || 'image/png';
      const fileUri = await saveBase64Image(base64, mimeType);
      results.push({
        url: fileUri,
        b64: base64,
        mimeType,
      });
    }

    if (results.length === 0) {
      throw new Error('Google returned no Imagen image data.');
    }

    return results;
  }

  static async generateMultiple(
    providers: Array<{ provider: AIProvider; apiKey: string }>,
    opts: Omit<GenerateImageOptions, 'provider' | 'apiKey'>
  ): Promise<Map<AIProvider, GeneratedImage[] | Error>> {
    const results = new Map<AIProvider, GeneratedImage[] | Error>();

    await Promise.all(
      providers.map(async ({ provider, apiKey }) => {
        try {
          const images = await this.generateImage({
            ...opts,
            provider,
            apiKey,
          });
          results.set(provider, images);
        } catch (error) {
          results.set(provider, error as Error);
        }
      })
    );

    return results;
  }
}
