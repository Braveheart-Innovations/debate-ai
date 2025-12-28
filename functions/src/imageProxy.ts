import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';

/**
 * Image Generation Proxy
 * Supports OpenAI (DALL-E), Google Gemini, and Grok (xAI)
 *
 * All styling/sizing is done via natural language in the prompt.
 * This simplifies the API and ensures universal compatibility.
 */

// Provider-specific configurations
const IMAGE_PROVIDERS: Record<string, {
  models: string[];
  defaultModel: string;
  supportsImageInput: boolean;
}> = {
  openai: {
    models: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
    defaultModel: 'gpt-image-1',
    supportsImageInput: true,
  },
  google: {
    models: ['gemini-2.0-flash-exp'],
    defaultModel: 'gemini-2.0-flash-exp',
    supportsImageInput: true,
  },
  grok: {
    models: ['grok-2-image-1212'],
    defaultModel: 'grok-2-image-1212',
    supportsImageInput: false,
  },
};

// Simplified request - just prompt and basic options
interface ImageProxyRequest {
  providerId: string;
  model?: string;
  prompt: string;
  n?: number;              // Number of images (usually 1)
  sourceImage?: string;    // Base64 image for img2img
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
    timeoutSeconds: 120,  // 2 minutes for image generation
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
      n = 1,
      sourceImage,
    } = request.data as ImageProxyRequest;

    // Validate provider
    if (!providerId || !IMAGE_PROVIDERS[providerId]) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid or unsupported image provider: ${providerId}. Supported: ${Object.keys(IMAGE_PROVIDERS).join(', ')}`
      );
    }

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Prompt is required');
    }

    if (prompt.length > 4000) {
      throw new HttpsError('invalid-argument', 'Prompt exceeds maximum length of 4000 characters');
    }

    const uid = request.auth.uid;
    const providerConfig = IMAGE_PROVIDERS[providerId];
    const resolvedModel = model || providerConfig.defaultModel;

    // Validate model
    if (!providerConfig.models.includes(resolvedModel)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid model: ${resolvedModel}. Supported for ${providerId}: ${providerConfig.models.join(', ')}`
      );
    }

    // Get the user's API key for this provider
    const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
    if (!apiKey) {
      throw new HttpsError('failed-precondition', `No API key configured for ${providerId}`);
    }

    try {
      let result: { images: GeneratedImage[] };

      switch (providerId) {
        case 'openai':
          result = await generateOpenAI(apiKey, resolvedModel, prompt, { n, sourceImage });
          break;
        case 'google':
          result = await generateGemini(apiKey, resolvedModel, prompt, { sourceImage });
          break;
        case 'grok':
          result = await generateGrok(apiKey, resolvedModel, prompt, { n });
          break;
        default:
          throw new HttpsError('invalid-argument', `Unsupported provider: ${providerId}`);
      }

      // Transform images to the expected response format
      const data = result.images.map((img) => ({
        url: img.url,
        b64_json: img.base64,
        revised_prompt: img.revisedPrompt,
      }));

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

/**
 * OpenAI Image Generation (DALL-E)
 * Uses default API settings - all styling is in the prompt
 */
async function generateOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  options: { n?: number; sourceImage?: string }
): Promise<{ images: GeneratedImage[] }> {
  const { n = 1, sourceImage } = options;

  // Image editing with gpt-image-1
  if (model === 'gpt-image-1' && sourceImage) {
    return generateOpenAIEdit(apiKey, model, prompt, sourceImage, { n });
  }

  // Standard image generation - let API use defaults
  const body: Record<string, any> = {
    model,
    prompt,
    n: Math.min(n, model === 'dall-e-3' ? 1 : 10),
  };

  // GPT image models don't support response_format - they always return base64
  // DALL-E models need response_format to get base64
  if (!model.startsWith('gpt-image')) {
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
  options: { sourceImage?: string }
): Promise<{ images: GeneratedImage[] }> {
  const { sourceImage } = options;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini image generation error:', error);
    throw { status: response.status, message: error };
  }

  const data = await response.json();

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
  options: { n?: number }
): Promise<{ images: GeneratedImage[] }> {
  const { n = 1 } = options;

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
