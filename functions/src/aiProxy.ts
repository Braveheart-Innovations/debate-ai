import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';
import { recordUsageInternal, enforceFreeTierForInteraction } from './usageTracking';
import { normalizeProviderTemperature, resolveProviderModelId, requiresResponsesApi } from './modelRegistry';
import { OPENAI_RESPONSES_URL, buildResponsesBody, parseResponsesOutput } from './providers/openai/responses';
import { buildGeminiGenerationConfig } from './providers/google/thinking';

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
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: 'Authorization',
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    authHeader: 'Authorization',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
    authHeader: 'Authorization',
  },
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
    authHeader: 'Authorization',
  },
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SearchOptions {
  enabled: boolean;
  recencyFilter?: 'hour' | 'day' | 'week' | 'month' | 'year';
  domainFilter?: string[];
  domainExclude?: string[];
}

interface Citation {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
  domain?: string;
}

interface ProviderResult {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Citation[];
  searchPerformed?: boolean;
}

interface MessageAttachment {
  type: 'image' | 'document';
  uri: string;           // Data URL (data:image/jpeg;base64,...)
  mimeType: string;
  base64?: string;       // Pure base64 data
  fileName?: string;
  fileSize?: number;
}

/**
 * Extract base64 data from attachment
 * Prefers the base64 field, falls back to extracting from uri
 */
function getBase64Data(attachment: MessageAttachment): string {
  if (attachment.base64) {
    return attachment.base64;
  }
  // Extract base64 from data URL (data:image/jpeg;base64,xxxxx)
  const base64Index = attachment.uri.indexOf('base64,');
  if (base64Index >= 0) {
    return attachment.uri.slice(base64Index + 7);
  }
  return '';
}

/**
 * Format file size for display (e.g., "1.5 MB")
 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Create fallback text description for attachments when model doesn't support vision
 */
function createAttachmentFallbackText(attachments?: MessageAttachment[]): string {
  if (!attachments || attachments.length === 0) return '';

  const descriptions = attachments.map((att, idx) => {
    const name = att.fileName ? att.fileName : `${att.type} ${idx + 1}`;
    const size = att.fileSize ? ` (${formatFileSize(att.fileSize)})` : '';
    return `[User attached ${att.type}: ${name}${size}]`;
  });

  return descriptions.join('\n');
}

function getCitationDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function compactCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const compacted: Citation[] = [];

  for (const citation of citations) {
    if (!citation.url) continue;
    const key = `${citation.url}|${citation.title || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push({
      ...citation,
      index: compacted.length + 1,
      domain: citation.domain || getCitationDomain(citation.url),
    });
  }

  return compacted;
}

function normalizeProviderResult(result: ProviderResult, providerId: string): ProviderResult {
  const content = typeof result.content === 'string' ? result.content : '';
  const citations = result.citations ? compactCitations(result.citations) : undefined;

  if (!content.trim() && (result.searchPerformed || (citations && citations.length > 0))) {
    console.warn('[proxyAIRequest] Provider returned a search response without answer text; suppressing citations', {
      providerId,
      citationCount: citations?.length || 0,
    });

    const providerName = PROVIDER_NAMES[providerId] || providerId;
    return {
      ...result,
      content: `${providerName} returned a search response without answer text. Please retry the request.`,
      citations: undefined,
      searchPerformed: true,
    };
  }

  return {
    ...result,
    content,
    citations: citations && citations.length > 0 ? citations : undefined,
  };
}

// Provider display names for user-friendly error messages
const PROVIDER_NAMES: Record<string, string> = {
  claude: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
  perplexity: 'Perplexity',
  mistral: 'Mistral',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  grok: 'Grok',
  moonshot: 'Kimi',
  zai: 'GLM',
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
    parsedError?.error?.message ||  // OpenAI, Mistral, Perplexity, Grok
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
      } else if (
        /model (not found|not available|does not exist|is not supported|is unavailable)/i.test(errorMessage) ||
        /invalid model/i.test(errorMessage)
      ) {
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
  // Usage tracking fields (optional for backwards compatibility)
  sessionId?: string;
  sessionType?: 'chat' | 'debate' | 'comparison' | 'analyze';
  // Stable per-interaction id used for server-authoritative free-tier metering.
  interactionId?: string;
  // Web search options for providers that support it
  searchOptions?: SearchOptions;
  // Image/document attachments
  attachments?: MessageAttachment[];
}

/**
 * Proxy AI requests through Firebase Functions
 * This keeps API keys secure on the server side
 */
export const proxyAIRequest = onCall(
  {
    timeoutSeconds: 540,  // 9 minutes max - for large document processing
    memory: '1GiB',       // Increased for large base64 document processing
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

    const { providerId, model, messages, systemPrompt, maxTokens, temperature, sessionId, sessionType, interactionId, searchOptions, attachments } = request.data as ProxyRequest;

    // Only use maxTokens if explicitly provided - otherwise let providers use their defaults
    const resolvedMaxTokens = typeof maxTokens === 'number' && maxTokens > 0 ? Math.floor(maxTokens) : undefined;

    // Validate provider
    if (!providerId || !PROVIDER_CONFIGS[providerId]) {
      throw new HttpsError('invalid-argument', `Invalid provider: ${providerId}`);
    }
    const resolvedModel = resolveProviderModelId(providerId, model);
    if (!resolvedModel) {
      throw new HttpsError('invalid-argument', `No model configured for provider: ${providerId}`);
    }
    const resolvedTemperature = normalizeProviderTemperature(
      providerId,
      resolvedModel,
      typeof temperature === 'number' ? temperature : 0.7
    );
    const providerTemperature = resolvedTemperature ?? 0.7;

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError('invalid-argument', 'Messages are required');
    }

    const uid = request.auth.uid;

    // Server-authoritative free-tier gate (no-op unless the client sends an
    // interactionId; premium/trial users always pass).
    const freeTierGate = await enforceFreeTierForInteraction(uid, sessionType, interactionId);
    if (!freeTierGate.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'You have used all of your free interactions. Subscribe to keep going.'
      );
    }

    // Get the user's API key for this provider
    const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
    if (!apiKey) {
      throw new HttpsError('failed-precondition', `No API key configured for ${providerId}`);
    }

    const config = PROVIDER_CONFIGS[providerId];

    try {
      let result: ProviderResult;

      if (providerId === 'claude') {
        result = await callClaude(apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature, searchOptions, attachments);
      } else if (providerId === 'google') {
        result = await callGemini(apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, searchOptions, attachments);
      } else if (providerId === 'cohere') {
        result = await callCohere(apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, attachments);
      } else if (providerId === 'perplexity') {
        // Perplexity has built-in web search with citations
        result = await callPerplexity(apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, searchOptions, attachments);
      } else {
        // OpenAI-compatible providers (OpenAI, Mistral, DeepSeek, Grok)
        result = await callOpenAICompatible(apiKey, config.baseUrl, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, providerId, searchOptions, attachments);
      }

      result = normalizeProviderResult(result, providerId);

      // Record usage for tracking (non-blocking)
      if (result.usage && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
        const inputTokens = result.usage.inputTokens || 0;
        const outputTokens = result.usage.outputTokens || 0;
        const totalTokens = inputTokens + outputTokens;

        // Fire and forget - don't block the response
        recordUsageInternal(uid, {
          messageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sessionId: sessionId || 'unknown',
          providerId,
          modelId: resolvedModel,
          inputTokens,
          outputTokens,
          totalTokens,
          sessionType: sessionType || 'chat',
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Failed to record usage:', err);
        });
      }

      return {
        success: true,
        content: result.content,
        usage: result.usage,
        providerId,
        model: resolvedModel,
        citations: result.citations,
        searchPerformed: result.searchPerformed,
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
  maxTokens: number | undefined,
  temperature: number | undefined,
  searchOptions?: SearchOptions,
  attachments?: MessageAttachment[]
): Promise<ProviderResult> {
  // Claude requires max_tokens - use 8192 as default for generous responses
  const resolvedMaxTokens = maxTokens ?? 8192;

  type AnthropicContentPart =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

  type AnthropicMessage = {
    role: 'user' | 'assistant';
    content: string | AnthropicContentPart[] | Record<string, unknown>[];
  };

  type AnthropicCitationBlock = {
    type?: string;
    url?: string;
    title?: string;
    cited_text?: string;
  };

  type AnthropicResponseBlock = {
    type?: string;
    text?: string;
    citations?: AnthropicCitationBlock[];
  };

  const extractAnthropicResponse = (data: Record<string, unknown>): { content: string; citations: Citation[] } => {
    const contentBlocks = Array.isArray(data.content) ? data.content as AnthropicResponseBlock[] : [];
    const textParts: string[] = [];
    const citations: Citation[] = [];

    for (const block of contentBlocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
      }

      if (Array.isArray(block.citations)) {
        for (const citation of block.citations) {
          if (citation.type !== 'web_search_result_location' || !citation.url) {
            continue;
          }

          citations.push({
            index: citations.length + 1,
            url: citation.url,
            title: citation.title,
            snippet: citation.cited_text,
            domain: getCitationDomain(citation.url),
          });
        }
      }
    }

    return {
      content: textParts.join(''),
      citations,
    };
  };

  // Build messages, adding attachments to the last user message if present
  const anthropicMessages: AnthropicMessage[] = messages
    .filter(m => m.role !== 'system')
    .map((m, idx, arr) => {
      const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

      // If this is the last user message and we have attachments, create multi-part content
      if (isLastUserMessage && attachments && attachments.length > 0) {
        // Claude supports both images and documents (PDFs)
        // All claude-3-* and claude-sonnet-4-* models support vision
        const contentParts: AnthropicContentPart[] = [];

        // Add attachments first
        for (const att of attachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          if (att.type === 'image') {
            contentParts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType || 'image/jpeg',
                data: base64,
              },
            });
          } else if (att.type === 'document') {
            contentParts.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: att.mimeType || 'application/pdf',
                data: base64,
              },
            });
          }
        }

        // Add the text content
        contentParts.push({ type: 'text', text: m.content });

        return {
          role: m.role as 'user' | 'assistant',
          content: contentParts,
        };
      }

      // Regular text-only message
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      };
    });

  const requestBody: Record<string, unknown> = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: resolvedMaxTokens,
    system: systemPrompt || messages.find(m => m.role === 'system')?.content,
    messages: anthropicMessages,
  };
  if (typeof temperature === 'number') {
    requestBody.temperature = temperature;
  }

  if (searchOptions?.enabled) {
    const webSearchTool: Record<string, unknown> = {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3,
    };

    if (searchOptions.domainFilter && searchOptions.domainFilter.length > 0) {
      webSearchTool.allowed_domains = searchOptions.domainFilter;
    } else if (searchOptions.domainExclude && searchOptions.domainExclude.length > 0) {
      webSearchTool.blocked_domains = searchOptions.domainExclude;
    }

    requestBody.tools = [webSearchTool];
  }

  let latestData: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    requestBody.messages = anthropicMessages;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw { status: response.status, message: error };
    }

    latestData = await response.json() as Record<string, unknown>;

    if (latestData.stop_reason === 'pause_turn' && attempt < 2) {
      const content = Array.isArray(latestData.content)
        ? latestData.content as Record<string, unknown>[]
        : [];

      anthropicMessages.push({
        role: 'assistant',
        content,
      });
      continue;
    }

    const extracted = extractAnthropicResponse(latestData);
    return {
      content: extracted.content,
      usage: {
        inputTokens: (latestData.usage as { input_tokens?: number } | undefined)?.input_tokens || 0,
        outputTokens: (latestData.usage as { output_tokens?: number } | undefined)?.output_tokens || 0,
      },
      citations: extracted.citations.length > 0 ? extracted.citations : undefined,
      searchPerformed: Boolean(searchOptions?.enabled || extracted.citations.length > 0),
    };
  }

  const extracted = latestData ? extractAnthropicResponse(latestData) : { content: '', citations: [] };
  return {
    content: extracted.content,
    usage: {
      inputTokens: (latestData?.usage as { input_tokens?: number } | undefined)?.input_tokens || 0,
      outputTokens: (latestData?.usage as { output_tokens?: number } | undefined)?.output_tokens || 0,
    },
    citations: extracted.citations.length > 0 ? extracted.citations : undefined,
    searchPerformed: Boolean(searchOptions?.enabled || extracted.citations.length > 0),
  };
}

/**
 * Google Gemini API with optional Google Search grounding
 * Docs: https://ai.google.dev/gemini-api/docs/grounding
 */
async function callGemini(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  searchOptions?: SearchOptions,
  attachments?: MessageAttachment[]
): Promise<{
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Citation[];
  searchPerformed?: boolean;
}> {
  const modelId = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  // Build contents with attachments in the last user message
  const contents = messages
    .filter(m => m.role !== 'system')
    .map((m, idx, arr) => {
      const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

      // If this is the last user message and we have attachments, create multi-part content
      if (isLastUserMessage && attachments && attachments.length > 0) {
        type GeminiPart =
          | { text: string }
          | { inline_data: { mime_type: string; data: string } };

        const parts: GeminiPart[] = [];

        // Add attachments first (images and documents)
        // Gemini 1.5+ supports both images and PDFs
        for (const att of attachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          parts.push({
            inline_data: {
              mime_type: att.mimeType || (att.type === 'image' ? 'image/jpeg' : 'application/pdf'),
              data: base64,
            },
          });
        }

        // Add the text content
        parts.push({ text: m.content });

        return {
          role: 'user',
          parts,
        };
      }

      // Regular text-only message
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      };
    });

  const generationConfig = buildGeminiGenerationConfig({
    model: modelId,
    temperature,
    maxTokens,
  });

  const requestBody: Record<string, unknown> = {
    contents,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig,
  };

  // Add Google Search grounding tool when search is enabled
  if (searchOptions?.enabled) {
    requestBody.tools = [{
      google_search: {},
    }];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  // Check finish reason for debugging truncation issues
  const finishReason = data.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`[Gemini] Response finished with reason: ${finishReason}`, {
      model: modelId,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    });
  }

  // Concatenate ALL text parts (Gemini can split responses across multiple parts)
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts
    .filter((p: { text?: string }) => typeof p.text === 'string')
    .map((p: { text: string }) => p.text)
    .join('');

  // Extract citations from grounding metadata if present
  let citations: Citation[] | undefined;
  let searchPerformed = Boolean(searchOptions?.enabled);

  const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
  if (groundingMetadata) {
    searchPerformed = true;

    // Extract grounding chunks (sources used)
    // Gemini returns vertexaisearch redirect URLs, but includes titles
    const groundingChunks = groundingMetadata.groundingChunks || [];
    const extractedCitations: Citation[] = groundingChunks
      .filter((chunk: { web?: { uri: string; title?: string } }) => chunk.web?.uri)
      .map((chunk: { web: { uri: string; title?: string } }, index: number) => {
        const url = chunk.web.uri;
        const title = chunk.web.title;

        // For Gemini, the URL is a redirect URL through vertexaisearch
        // Use the title as the domain display since it contains the actual source name
        // If no title, show "Source N"
        const domain = title || `Source ${index + 1}`;

        return {
          index: index + 1,
          url,
          title,
          domain,
        };
      });

    if (extractedCitations.length > 0) {
      citations = extractedCitations;
    }
  }

  return {
    content,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    },
    citations,
    searchPerformed,
  };
}

async function callCohere(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  attachments?: MessageAttachment[]
) {
  const supportsVision = modelSupportsVision('cohere', model);

  // Cohere v2 Chat API with vision support
  // Format: { type: "image_url", image_url: { url: "data:..." } } or { type: "text", text: "..." }
  type CohereContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  type CohereMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string | CohereContentPart[];
  };

  const formattedMessages: CohereMessage[] = messages.map((m, idx, arr) => {
    const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

    // If this is the last user message and we have attachments
    if (isLastUserMessage && supportsVision && attachments && attachments.length > 0) {
      const imageAttachments = attachments.filter(att => att.type === 'image');
      const documentAttachments = attachments.filter(att => att.type === 'document');

      if (imageAttachments.length > 0 || documentAttachments.length > 0) {
        const contentParts: CohereContentPart[] = [];

        // Add images
        for (const att of imageAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}`,
            },
          });
        }

        // Add documents (Command A Vision supports PDFs as images)
        for (const att of documentAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType || 'application/pdf'};base64,${base64}`,
            },
          });
        }

        // Add text content
        contentParts.push({ type: 'text', text: m.content });

        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: contentParts,
        };
      }
    }

    return {
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    };
  });

  // Add system prompt if present
  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  // Build request body - only include max_tokens if explicitly set
  const cohereRequest: Record<string, unknown> = {
    model: model || 'command-a-plus-05-2026',
    messages: formattedMessages,
    temperature,
  };
  if (maxTokens !== undefined) {
    cohereRequest.max_tokens = maxTokens;
  }

  const response = await fetch('https://api.cohere.ai/v2/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(cohereRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  // Cohere v2 returns a message.content array. Reasoning-capable models may
  // emit non-text blocks before the assistant text, so scan all parts.
  const contentParts = Array.isArray(data.message?.content)
    ? data.message.content
    : [];
  const content = contentParts
    .filter((part: { text?: unknown }) => typeof part?.text === 'string')
    .map((part: { text: string }) => part.text)
    .join('') || data.text || '';
  return {
    content,
    usage: {
      inputTokens: data.usage?.billed_units?.input_tokens || data.meta?.tokens?.input_tokens || 0,
      outputTokens: data.usage?.billed_units?.output_tokens || data.meta?.tokens?.output_tokens || 0,
    },
  };
}

/**
 * Perplexity API with built-in web search and citations
 * Docs: https://docs.perplexity.ai/api-reference/chat-completions
 */
async function callPerplexity(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  searchOptions?: SearchOptions,
  attachments?: MessageAttachment[]
): Promise<{
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Citation[];
  searchPerformed?: boolean;
}> {
  const extractPerplexityText = (value: unknown): string => {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => extractPerplexityText(item))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (!value || typeof value !== 'object') {
      return '';
    }

    const record = value as Record<string, unknown>;
    const preferredKeys = ['text', 'content', 'output_text', 'answer', 'reasoning_content', 'reasoning', 'parts'];

    for (const key of preferredKeys) {
      const extracted = extractPerplexityText(record[key]);
      if (extracted) {
        return extracted;
      }
    }

    return '';
  };

  // Perplexity sonar models support vision AND file attachments
  type PerplexityContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file_url'; file_url: { url: string }; file_name?: string };

  type PerplexityMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string | PerplexityContentPart[];
  };

  const formattedMessages: PerplexityMessage[] = messages.map((m, idx, arr) => {
    const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

    // If this is the last user message and we have attachments
    if (isLastUserMessage && attachments && attachments.length > 0) {
      const imageAttachments = attachments.filter(att => att.type === 'image');
      const documentAttachments = attachments.filter(att => att.type === 'document');

      if (imageAttachments.length > 0 || documentAttachments.length > 0) {
        const contentParts: PerplexityContentPart[] = [];

        // Add images (use data URL format with base64)
        for (const att of imageAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}`,
            },
          });
        }

        // Add documents (use raw base64 without data: prefix per Perplexity docs)
        for (const att of documentAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          contentParts.push({
            type: 'file_url',
            file_url: {
              url: base64, // Raw base64, no data: prefix
            },
            file_name: att.fileName || 'document.pdf',
          });
        }

        // Add text content
        contentParts.push({ type: 'text', text: m.content });

        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: contentParts,
        };
      }
    }

    return {
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    };
  });

  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  // Build request body with Perplexity-specific options
  const requestBody: Record<string, unknown> = {
    model: model || 'sonar',
    messages: formattedMessages,
    temperature,
    // Always request citations - Perplexity's key feature
    return_citations: true,
    return_related_questions: false,
  };

  // Only include max_tokens if explicitly set
  if (maxTokens !== undefined) {
    requestBody.max_tokens = maxTokens;
  }

  // Add search recency filter if specified
  if (searchOptions?.recencyFilter) {
    requestBody.search_recency_filter = searchOptions.recencyFilter;
  }

  // Add domain filters if specified. Perplexity accepts excluded domains with a leading "-".
  const searchDomainFilter = [
    ...(searchOptions?.domainFilter || []),
    ...(searchOptions?.domainExclude || []).map(domain => domain.startsWith('-') ? domain : `-${domain}`),
  ];
  if (searchDomainFilter.length > 0) {
    requestBody.search_domain_filter = searchDomainFilter;
  }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = (
    extractPerplexityText(choice?.message?.content) ||
    extractPerplexityText(choice?.message?.reasoning_content) ||
    extractPerplexityText(choice?.message?.reasoning) ||
    extractPerplexityText(choice?.delta?.content)
  ).trim();

  if (!content) {
    console.warn('[callPerplexity] Empty content response', {
      model,
      hasCitations: Array.isArray(data.citations) && data.citations.length > 0,
      usage: data.usage,
      choiceKeys: choice?.message ? Object.keys(choice.message) : [],
    });
  }

  // Prefer search_results when available because it carries title/snippet metadata.
  const searchResults = Array.isArray(data.search_results)
    ? data.search_results as Array<{ url?: string; title?: string; snippet?: string }>
    : [];
  const searchResultCitations: Citation[] = searchResults
    .filter(result => typeof result.url === 'string' && result.url.length > 0)
    .map((result, index) => ({
      index: index + 1,
      url: result.url as string,
      title: result.title,
      snippet: result.snippet,
      domain: getCitationDomain(result.url as string),
    }));

  // Perplexity also returns citations as an array of URLs in some responses.
  const rawCitations: string[] = Array.isArray(data.citations) ? data.citations : [];
  const urlCitations: Citation[] = rawCitations.map((url: string, index: number) => ({
    index: index + 1,
    url,
    domain: getCitationDomain(url),
  }));
  const citations = searchResultCitations.length > 0 ? searchResultCitations : urlCitations;

  return {
    content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
    citations: citations.length > 0 ? compactCitations(citations) : undefined,
    searchPerformed: true, // Perplexity always performs search
  };
}

/**
 * OpenAI Responses API (non-streaming) for models that are not usable on
 * /v1/chat/completions. Shares the request/response translation with the V2
 * streaming runtime (providers/openai/responses.ts).
 */
async function callOpenAIResponses(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  attachments?: MessageAttachment[]
): Promise<{
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const body = buildResponsesBody({
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    systemPrompt,
    attachments: modelSupportsVision('openai', model) ? attachments : undefined,
    maxTokens,
    stream: false,
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const parsed = parseResponsesOutput(await response.json());
  return {
    content: parsed.content,
    usage: parsed.usage,
  };
}

/**
 * OpenAI Responses API with web search
 * Docs: https://platform.openai.com/docs/guides/tools-web-search
 * Note: Web search requires the Responses API, not Chat Completions
 */
async function callOpenAIWithSearch(
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number
): Promise<{
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Citation[];
  searchPerformed?: boolean;
}> {
  // Convert messages to a single input string for Responses API
  // Include system prompt and conversation history
  let input = '';
  if (systemPrompt) {
    input += `System: ${systemPrompt}\n\n`;
  }
  for (const msg of messages) {
    if (msg.role === 'system') continue; // Already added
    const role = msg.role === 'assistant' ? 'Assistant' : 'User';
    input += `${role}: ${msg.content}\n\n`;
  }

  // Build request body - only include max_output_tokens if explicitly set
  const openAIRequest: Record<string, unknown> = {
    model,
    tools: [{ type: 'web_search' }],
    input: input.trim(),
  };
  // Responses-only reasoning models reject `temperature` outright.
  if (!requiresResponsesApi(model)) {
    openAIRequest.temperature = temperature;
  }
  if (maxTokens !== undefined) {
    openAIRequest.max_output_tokens = maxTokens;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(openAIRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();

  // Extract content from Responses API format
  // The response has an 'output' array with items
  const contentParts: string[] = [];
  const citations: Citation[] = [];
  const searchPerformed = true;

  const output = data.output || [];
  for (const item of output) {
    if (item.type === 'message' && item.content) {
      for (const contentItem of item.content) {
        if (contentItem.type === 'output_text') {
          if (typeof contentItem.text === 'string') {
            contentParts.push(contentItem.text);
          }

          // Extract citations from annotations
          const annotations = contentItem.annotations || [];
          const urlCitations = annotations.filter((a: { type: string }) => a.type === 'url_citation');

          if (urlCitations.length > 0) {
            citations.push(...urlCitations.map((annotation: {
              url: string;
              title?: string;
            }, index: number) => {
              return {
                index: citations.length + index + 1,
                url: annotation.url,
                title: annotation.title,
                domain: getCitationDomain(annotation.url),
              };
            }));
          }
        }
      }
    }
  }

  return {
    content: contentParts.join(''),
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
    citations: citations.length > 0 ? compactCitations(citations) : undefined,
    searchPerformed,
  };
}

/**
 * Check if a model supports vision based on provider and model name
 * Updated January 2026 with accurate API capabilities
 */
function modelSupportsVision(providerId: string, model: string): boolean {
  const modelLower = model.toLowerCase();

  switch (providerId) {
    case 'openai':
      // OpenAI vision models: gpt-4o, gpt-4.1, gpt-4-vision, gpt-4-turbo, gpt-5 series, o1, o3
      return modelLower.includes('gpt-4o') ||
             modelLower.includes('gpt-4.1') ||
             modelLower.includes('gpt-4-vision') ||
             modelLower.includes('gpt-4-turbo') ||
             modelLower.includes('gpt-5') ||
             modelLower.includes('gpt-6') ||
             modelLower.includes('o1') ||
             modelLower.includes('o3');
    case 'grok':
      // Grok 3, Grok 4, and grok-2-vision models support vision
      return modelLower.includes('grok-4') ||
             modelLower.includes('grok-3') ||
             modelLower.includes('vision');
    case 'mistral':
      // Pixtral models and latest Mistral models support vision
      return modelLower.includes('pixtral') ||
             modelLower.includes('mistral-large') ||
             modelLower.includes('mistral-medium') ||
             modelLower.includes('mistral-small');
    case 'perplexity':
      // Sonar and sonar-pro support vision
      return modelLower.includes('sonar');
    case 'cohere':
      // Command A Vision model supports vision
      return modelLower.includes('vision') ||
             modelLower.includes('command-a');
    case 'deepseek':
      // DeepSeek V4.1 Flash (deepseek-flash, 2026-09-10) is natively
      // multimodal, and the retired deepseek-v4-flash / -vision-exp names are
      // served by it. deepseek-v4-pro does not accept images.
      return modelLower.includes('flash') || modelLower.includes('vision');
    case 'moonshot':
      // Kimi K3 and K2.x are natively multimodal
      return modelLower.includes('kimi-k');
    case 'zai':
      // Only the GLM vision line (glm-5v-*) accepts image input
      // GLM-5.3 Flash is the first natively multimodal GLM-5 model; the
      // flagship glm-5.3 rejects image content (verified 2026-09-03).
      return modelLower.includes('glm-5v') ||
             modelLower.includes('glm-5.3-flash');
    default:
      // DeepSeek doesn't support vision via their chat API
      return false;
  }
}

/**
 * OpenAI-compatible API handler for various providers
 * Supports: OpenAI, Mistral, DeepSeek, Grok
 */
async function callOpenAICompatible(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  providerId: string,
  searchOptions?: SearchOptions,
  attachments?: MessageAttachment[]
): Promise<{
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Citation[];
  searchPerformed?: boolean;
}> {
  // OpenAI with web search uses a different API (Responses API)
  if (providerId === 'openai' && searchOptions?.enabled) {
    return callOpenAIWithSearch(apiKey, model, messages, systemPrompt, maxTokens, temperature);
  }

  // Responses-only OpenAI models (gpt-5.5-pro, gpt-6-astra).
  if (providerId === 'openai' && requiresResponsesApi(model)) {
    return callOpenAIResponses(apiKey, model, messages, systemPrompt, maxTokens, attachments);
  }

  const supportsVision = modelSupportsVision(providerId, model);

  // OpenAI supports documents natively (as of March 2025), other providers may not
  const supportsDocuments = providerId === 'openai' && supportsVision;

  // Build messages, potentially with attachments
  type OpenAIContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; file_data: string } };

  type OpenAIMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string | OpenAIContentPart[];
  };

  const formattedMessages: OpenAIMessage[] = messages.map((m, idx, arr) => {
    const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

    // If this is the last user message and we have attachments
    if (isLastUserMessage && attachments && attachments.length > 0) {
      const imageAttachments = attachments.filter(att => att.type === 'image');
      const documentAttachments = attachments.filter(att => att.type === 'document');

      // Check if we have any attachments to process
      const hasProcessableImages = supportsVision && imageAttachments.length > 0;
      const hasProcessableDocs = supportsDocuments && documentAttachments.length > 0;

      if (hasProcessableImages || hasProcessableDocs) {
        const contentParts: OpenAIContentPart[] = [];

        // Add images (if vision supported)
        if (hasProcessableImages) {
          for (const att of imageAttachments) {
            const base64 = getBase64Data(att);
            if (!base64) continue;

            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}`,
              },
            });
          }
        }

        // Add documents (OpenAI uses type: "file" format as of March 2025)
        if (hasProcessableDocs) {
          for (const att of documentAttachments) {
            const base64 = getBase64Data(att);
            if (!base64) continue;

            contentParts.push({
              type: 'file',
              file: {
                filename: att.fileName || 'document.pdf',
                file_data: `data:${att.mimeType || 'application/pdf'};base64,${base64}`,
              },
            });
          }
        }

        // Add text content
        contentParts.push({ type: 'text', text: m.content });

        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: contentParts,
        };
      }

      // Model doesn't support vision/documents - don't mention attachments at all
      // (fallback text confuses models into thinking they should see something)
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      };
    }

    // Regular text-only message
    return {
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    };
  });

  // Add system prompt if not already present
  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  // Build base request body
  const requestBody: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    temperature,
  };

  // Only include token limit if explicitly set
  // OpenAI's newer models use max_completion_tokens, other providers use max_tokens
  if (maxTokens !== undefined) {
    const isOpenAI = providerId === 'openai';
    if (isOpenAI) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const data = await response.json();
  const messageContent = data.choices?.[0]?.message?.content;
  const content = typeof messageContent === 'string'
    ? messageContent
    : Array.isArray(messageContent)
      ? messageContent
        .map((part: { text?: unknown; content?: unknown }) => {
          if (typeof part.text === 'string') return part.text;
          if (typeof part.content === 'string') return part.content;
          return '';
        })
        .join('')
      : '';

  return {
    content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}
