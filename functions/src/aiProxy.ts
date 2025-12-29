import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';

// Provider API endpoints
const PROVIDER_CONFIGS: Record<string, {
  baseUrl: string;
  authHeader: string;
}> = {
  claude: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'Authorization',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    authHeader: 'x-goog-api-key',
  },
  perplexity: {
    baseUrl: 'https://api.perplexity.ai/chat/completions',
    authHeader: 'Authorization',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    authHeader: 'Authorization',
  },
  cohere: {
    baseUrl: 'https://api.cohere.ai/v1/chat',
    authHeader: 'Authorization',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    authHeader: 'Authorization',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: 'Authorization',
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    authHeader: 'Authorization',
  },
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Provider display names for user-friendly error messages
const PROVIDER_NAMES: Record<string, string> = {
  claude: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
  perplexity: 'Perplexity',
  mistral: 'Mistral',
  cohere: 'Cohere',
  together: 'Together',
  deepseek: 'DeepSeek',
  grok: 'Grok',
};

/**
 * Parse provider error responses into user-friendly messages
 */
function parseProviderError(
  error: any,
  providerId: string
): { status: number; userMessage: string; technicalDetails: string } {
  const displayName = PROVIDER_NAMES[providerId] || providerId;
  const status = error.status || 500;
  let technicalDetails = '';
  let userMessage = `${displayName} encountered an error. Please try again.`;

  // Try to parse the error message as JSON (most providers return JSON errors)
  let parsedError: any = null;
  if (typeof error.message === 'string') {
    try {
      parsedError = JSON.parse(error.message);
    } catch {
      // Not JSON, use as-is
      technicalDetails = error.message;
    }
  }

  // Extract the actual error message from various provider formats
  const errorMessage =
    parsedError?.error?.message ||  // OpenAI, Mistral, Together, Perplexity, Grok
    parsedError?.message ||          // Generic
    parsedError?.error ||            // Some providers
    error.message ||
    'Unknown error';

  technicalDetails = errorMessage;

  // Generate user-friendly messages based on status code and error content
  switch (status) {
    case 400:
      if (errorMessage.includes('max_tokens') || errorMessage.includes('max_completion_tokens')) {
        userMessage = `${displayName} request failed due to a parameter issue. This is a bug - please report it.`;
      } else if (errorMessage.includes('model')) {
        userMessage = `${displayName} model not available. Please try a different model.`;
      } else if (errorMessage.includes('content') || errorMessage.includes('safety') || errorMessage.includes('moderation')) {
        userMessage = `${displayName} declined this request due to content policy.`;
      } else {
        userMessage = `${displayName} couldn't process this request. ${errorMessage}`;
      }
      break;

    case 401:
      userMessage = `Your ${displayName} API key is invalid. Please update it in Settings.`;
      break;

    case 402:
      userMessage = `Your ${displayName} account has insufficient credits or quota.`;
      break;

    case 403:
      userMessage = `Your ${displayName} API key doesn't have access to this model or feature.`;
      break;

    case 404:
      userMessage = `${displayName} model not found. It may have been deprecated or renamed.`;
      break;

    case 429:
      userMessage = `${displayName} is rate limiting requests. Please wait a moment and try again.`;
      break;

    case 500:
      userMessage = `${displayName} server error. Please try again.`;
      break;

    case 502:
      userMessage = `Unable to reach ${displayName}. Please try again.`;
      break;

    case 503:
    case 529:
      userMessage = `${displayName} is temporarily overloaded. Please try again in a moment.`;
      break;

    case 504:
      userMessage = `${displayName} took too long to respond. Please try again.`;
      break;

    default:
      if (status >= 500) {
        userMessage = `${displayName} service error. Please try again.`;
      }
  }

  return { status, userMessage, technicalDetails };
}

interface ProxyRequest {
  providerId: string;
  model: string;
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Proxy AI requests through Firebase Functions
 * This keeps API keys secure on the server side
 */
export const proxyAIRequest = onCall(
  {
    timeoutSeconds: 300,  // 5 minutes for long responses
    memory: '256MiB',
    secrets: [encryptionKey],
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to use AI');
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const { providerId, model, messages, systemPrompt, maxTokens, temperature } = request.data as ProxyRequest;

    // Ensure maxTokens and temperature are valid numbers
    const resolvedMaxTokens = typeof maxTokens === 'number' && maxTokens > 0 ? Math.floor(maxTokens) : 2048;
    const resolvedTemperature = typeof temperature === 'number' ? temperature : 0.7;

    // Validate provider
    if (!providerId || !PROVIDER_CONFIGS[providerId]) {
      throw new HttpsError('invalid-argument', `Invalid provider: ${providerId}`);
    }

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError('invalid-argument', 'Messages are required');
    }

    const uid = request.auth.uid;

    // Get the user's API key for this provider
    const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
    if (!apiKey) {
      throw new HttpsError('failed-precondition', `No API key configured for ${providerId}`);
    }

    const config = PROVIDER_CONFIGS[providerId];

    try {
      let result: { content: string; usage?: { inputTokens: number; outputTokens: number } };

      if (providerId === 'claude') {
        result = await callClaude(apiKey, model, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature);
      } else if (providerId === 'google') {
        result = await callGemini(apiKey, model, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature);
      } else if (providerId === 'cohere') {
        result = await callCohere(apiKey, model, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature);
      } else {
        // OpenAI-compatible providers
        result = await callOpenAICompatible(apiKey, config.baseUrl, model, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature, providerId);
      }

      return {
        success: true,
        content: result.content,
        usage: result.usage,
        providerId,
        model,
      };
    } catch (error: any) {
      console.error(`Error calling ${providerId}:`, error);

      // Parse the error to extract meaningful information
      const { status, userMessage, technicalDetails } = parseProviderError(error, providerId);

      // Map HTTP status codes to Firebase HttpsError codes
      if (status === 401 || status === 403) {
        throw new HttpsError('permission-denied', userMessage, { technicalDetails });
      }
      if (status === 429) {
        throw new HttpsError('resource-exhausted', userMessage, { technicalDetails });
      }
      if (status === 400) {
        throw new HttpsError('invalid-argument', userMessage, { technicalDetails });
      }
      if (status === 402) {
        throw new HttpsError('resource-exhausted', userMessage, { technicalDetails });
      }
      if (status === 404) {
        throw new HttpsError('not-found', userMessage, { technicalDetails });
      }
      if (status === 503 || status === 529) {
        throw new HttpsError('unavailable', userMessage, { technicalDetails });
      }
      if (status >= 500) {
        throw new HttpsError('internal', userMessage, { technicalDetails });
      }

      throw new HttpsError('internal', userMessage, { technicalDetails });
    }
  }
);

async function callClaude(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
) {
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt || messages.find(m => m.role === 'system')?.content,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  return {
    content: data.content[0]?.text || '',
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
) {
  const modelId = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

async function callCohere(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number
) {
  const chatHistory = messages
    .filter(m => m.role !== 'system')
    .slice(0, -1)
    .map(m => ({
      role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: m.content,
    }));

  const lastMessage = messages[messages.length - 1];

  const response = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'command-r-plus',
      message: lastMessage?.content || '',
      chat_history: chatHistory,
      preamble: systemPrompt || messages.find(m => m.role === 'system')?.content,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  return {
    content: data.text || '',
    usage: {
      inputTokens: data.meta?.tokens?.input_tokens || 0,
      outputTokens: data.meta?.tokens?.output_tokens || 0,
    },
  };
}

async function callOpenAICompatible(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number,
  temperature: number,
  providerId: string
) {
  const formattedMessages = [...messages];
  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  // OpenAI's newer models (o1, o1-mini, o1-preview, gpt-4o, etc.) require max_completion_tokens
  // Other OpenAI-compatible providers still use max_tokens
  const isOpenAI = providerId === 'openai';
  const tokenParam = isOpenAI ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      ...tokenParam,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}
