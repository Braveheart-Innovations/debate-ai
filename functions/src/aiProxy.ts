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
        result = await callOpenAICompatible(apiKey, config.baseUrl, model, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature);
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

      // Don't expose internal error details
      if (error.status === 401 || error.message?.includes('401')) {
        throw new HttpsError('permission-denied', 'Invalid API key');
      }
      if (error.status === 429 || error.message?.includes('429')) {
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
      }

      throw new HttpsError('internal', `Failed to get response from ${providerId}`);
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
  temperature: number
) {
  const formattedMessages = [...messages];
  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
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
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}
