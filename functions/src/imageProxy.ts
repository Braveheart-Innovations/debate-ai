import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';
import {
  getImageModels,
  getResolvedImageModel,
  isImageProvider,
  type ImageModelConfig,
} from './imageModelRegistry';

// Simplified request - just prompt and basic options
interface ImageProxyRequest {
  providerId: string;
  model?: string;
  prompt: string;
  size?: string;
  resolution?: string;
  n?: number;              // Number of images (usually 1)
  sourceImage?: string;    // Base64 image for img2img
  responseFormat?: 'url' | 'b64_json'; // Always returns b64_json regardless
}

interface GeneratedImage {
  url: string;
  base64?: string;
  revisedPrompt?: string;
  mimeType?: string;
}

/**
 * Proxy image generation requests through Firebase Functions
 * Keeps API keys secure on the server side
 */
export const proxyImageGeneration = onCall(
  {
    timeoutSeconds: 300,  // 5 minutes for image generation
    memory: '512MiB',     // More memory for image processing
    secrets: [encryptionKey],
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to generate images');
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const {
      providerId,
      model,
      prompt,
      size,
      resolution,
      n = 1,
      sourceImage,
    } = request.data as ImageProxyRequest;

    // Validate provider
    if (!providerId || !isImageProvider(providerId) || getImageModels(providerId).length === 0) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid or unsupported image provider: ${providerId}. Supported: openai, google, grok`
      );
    }
    const modelConfig = getResolvedImageModel(providerId, model);
    if (!modelConfig) {
      throw new HttpsError('invalid-argument', `Invalid or unsupported image model for provider: ${providerId}`);
    }

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Prompt is required');
    }

    if (prompt.length > (modelConfig.maxPromptLength || 4000)) {
      throw new HttpsError('invalid-argument', `Prompt exceeds maximum length of ${modelConfig.maxPromptLength || 4000} characters`);
    }

    const uid = request.auth.uid;
    const resolvedModel = modelConfig.id;

    // Log img2img request info for debugging
    if (sourceImage) {
      console.log(`[ImageProxy] img2img request for ${providerId}/${resolvedModel}, sourceImage length: ${sourceImage.length}`);
      if (!modelConfig.supportsImageInput) {
        throw new HttpsError(
          'invalid-argument',
          `${modelConfig.displayName} does not support image-to-image generation`
        );
      }
    }

    // Get the user's API key for this provider
    const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
    if (!apiKey) {
      throw new HttpsError('failed-precondition', `No API key configured for ${providerId}`);
    }

    try {
      let result: { images: GeneratedImage[] };

      switch (modelConfig.apiFamily) {
        case 'openai-images':
          result = await generateOpenAI(apiKey, resolvedModel, prompt, { n, sourceImage, size });
          break;
        case 'google-gemini-image':
          result = await generateGemini(apiKey, resolvedModel, prompt, { sourceImage, size, resolution });
          break;
        case 'xai-images':
          result = await generateGrok(apiKey, resolvedModel, prompt, { n, sourceImage, size });
          break;
        default:
          throw new HttpsError('invalid-argument', `Unsupported image model family for ${providerId}`);
      }

      // Transform images to the expected response format
      const data = result.images.map((img) => ({
        url: img.url,
        b64_json: img.base64,
        revised_prompt: img.revisedPrompt,
      }));

      // Log success with base64 availability for debugging
      console.log(`[ImageProxy] ${providerId} generated ${data.length} image(s), has base64: ${data.every(d => !!d.b64_json)}`);

      return {
        success: true,
        data,
        providerId,
        model: resolvedModel,
      };
    } catch (error: any) {
      console.error(`Error generating image with ${providerId}:`, error);

      // Extract error message from various error formats
      let errorMessage = 'Unknown error';
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.message) {
        // Try to parse JSON error messages from APIs
        try {
          const parsed = JSON.parse(error.message);
          errorMessage = parsed.error?.message || parsed.message || error.message;
        } catch {
          errorMessage = error.message;
        }
      }

      // Handle specific error types
      if (error.status === 401 || errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
        throw new HttpsError('permission-denied', 'Invalid API key');
      }
      if (error.status === 429 || errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
      }
      if (errorMessage.toLowerCase().includes('content policy') || errorMessage.toLowerCase().includes('safety')) {
        throw new HttpsError('invalid-argument', 'Content policy violation. Please modify your prompt.');
      }
      if (error.code) {
        throw error; // Re-throw HttpsError
      }

      // For other errors, include the actual error message for debugging
      throw new HttpsError('internal', `Image generation failed: ${errorMessage}`);
    }
  }
);

function normalizeAspectRatio(size?: string): string | undefined {
  if (!size) return undefined;

  switch (size) {
    case '1024x1024':
      return '1:1';
    case '1024x1536':
    case '1024x1792':
      return '9:16';
    case '1536x1024':
    case '1792x1024':
      return '16:9';
    default:
      return size;
  }
}

/**
 * OpenAI Image Generation (gpt-image-1, dall-e-3)
 * Uses default API settings - all styling is in the prompt
 */
async function generateOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  options: { n?: number; sourceImage?: string; size?: string }
): Promise<{ images: GeneratedImage[] }> {
  const { n = 1, sourceImage, size } = options;

  // GPT Image models support image editing. DALL-E 3 remains generation-only.
  if (sourceImage && model !== 'dall-e-3') {
    return generateOpenAIEdit(apiKey, model, prompt, sourceImage, { n });
  }

  // Standard image generation - let API use defaults
  const body: Record<string, any> = {
    model,
    prompt,
    n: Math.min(n, model === 'dall-e-3' ? 1 : 10),
  };

  if (size) {
    body.size = size;
  }

  // GPT image models don't support response_format - they always return base64
  // Legacy models (dall-e-3) need response_format to get base64
  if (!model.startsWith('gpt-image') && !model.startsWith('chatgpt-image')) {
    body.response_format = 'b64_json';
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI image generation error:', error);
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  return {
    images: data.data.map((item: any) => ({
      url: item.url || `data:image/png;base64,${item.b64_json}`,
      base64: item.b64_json,
      revisedPrompt: item.revised_prompt,
      mimeType: 'image/png',
    })),
  };
}

/**
 * OpenAI Image Editing (for img2img with gpt-image-1)
 */
async function generateOpenAIEdit(
  apiKey: string,
  model: string,
  prompt: string,
  sourceImage: string,
  options: { n?: number }
): Promise<{ images: GeneratedImage[] }> {
  const { n = 1 } = options;

  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('n', String(n));
  // GPT image models always return base64, no response_format needed

  // Convert base64 to blob for the image
  const imageBlob = base64ToBlob(sourceImage, 'image/png');
  formData.append('image', imageBlob, 'image.png');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI image edit error:', error);
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  return {
    images: data.data.map((item: any) => ({
      url: item.url || `data:image/png;base64,${item.b64_json}`,
      base64: item.b64_json,
      revisedPrompt: item.revised_prompt,
      mimeType: 'image/png',
    })),
  };
}

/**
 * Google Gemini Image Generation
 * Uses default API settings - all styling is in the prompt
 */
async function generateGemini(
  apiKey: string,
  model: string,
  prompt: string,
  options: { sourceImage?: string; size?: string; resolution?: string }
): Promise<{ images: GeneratedImage[] }> {
  const { sourceImage, size, resolution } = options;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Build content parts
  const parts: any[] = [];

  if (sourceImage) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: sourceImage,
      },
    });
    parts.push({
      text: `Based on this image: ${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: normalizeAspectRatio(size) || '1:1',
        ...(resolution ? { imageSize: resolution } : {}),
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey.trim(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini image generation error:', error);
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  // Log Gemini response structure for debugging
  console.log(`[Gemini] Response structure: candidates=${data.candidates?.length || 0}, promptFeedback=${JSON.stringify(data.promptFeedback || {})}`);

  // Extract images from Gemini response
  const images: GeneratedImage[] = [];
  const candidates = data.candidates || [];

  for (const candidate of candidates) {
    const content = candidate.content;
    if (!content?.parts) continue;

    for (const part of content.parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        images.push({
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        });
      }
    }
  }

  if (images.length === 0) {
    const textPart = candidates[0]?.content?.parts?.find((p: any) => p.text);
    if (textPart) {
      throw new HttpsError('failed-precondition', `Gemini returned text instead of image: ${textPart.text.substring(0, 100)}`);
    }
    throw new HttpsError('internal', 'No image generated by Gemini');
  }

  return { images };
}

/**
 * Grok (xAI) Image Generation
 * Uses default API settings - all styling is in the prompt
 */
async function generateGrok(
  apiKey: string,
  model: string,
  prompt: string,
  options: { n?: number; sourceImage?: string; size?: string }
): Promise<{ images: GeneratedImage[] }> {
  const { n = 1, sourceImage, size } = options;

  if (sourceImage) {
    return generateGrokEdit(apiKey, model, prompt, sourceImage, { n });
  }

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n,
      ...(size ? { aspect_ratio: normalizeAspectRatio(size) } : {}),
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Grok image generation error:', error);
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  return {
    images: data.data.map((item: any) => ({
      url: item.url || `data:image/png;base64,${item.b64_json}`,
      base64: item.b64_json,
      mimeType: 'image/png',
    })),
  };
}

async function generateGrokEdit(
  apiKey: string,
  model: string,
  prompt: string,
  sourceImage: string,
  options: { n?: number }
): Promise<{ images: GeneratedImage[] }> {
  const { n = 1 } = options;

  const response = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n,
      image: {
        url: toDataUri(sourceImage),
      },
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Grok image edit error:', error);
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  return {
    images: data.data.map((item: any) => ({
      url: item.url || `data:image/png;base64,${item.b64_json}`,
      base64: item.b64_json,
      mimeType: 'image/png',
    })),
  };
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function toDataUri(sourceImage: string, mimeType = 'image/png'): string {
  if (sourceImage.startsWith('data:')) {
    return sourceImage;
  }

  const base64Data = sourceImage.includes(',') ? sourceImage.split(',')[1] : sourceImage;
  return `data:${mimeType};base64,${base64Data}`;
}
