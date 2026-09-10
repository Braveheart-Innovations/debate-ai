import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';
import { normalizeProviderTemperature, resolveProviderModelId } from './modelRegistry';
import { recordUsageInternal, enforceFreeTierForInteraction } from './usageTracking';
import { buildGeminiGenerationConfig } from './providers/google/thinking';
import {
  type ToolDefinition,
  type ToolChoice,
  type ToolCall,
  type ToolResult,
  transformToolsForClaude,
  transformToolChoiceForClaude,
  parseClaudeToolCalls,
  transformToolsForOpenAI,
  transformToolChoiceForOpenAI,
  parseOpenAIToolCalls,
  transformToolsForGemini,
  parseGeminiToolCalls,
} from './tools';

// Provider streaming endpoints
const PROVIDER_CONFIGS: Record<string, {
  baseUrl: string;
  authHeader: string;
  streamParam?: string;  // Parameter name for enabling streaming
}> = {
  claude: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    streamParam: 'stream',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    authHeader: 'x-goog-api-key',
  },
  perplexity: {
    baseUrl: 'https://api.perplexity.ai/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  cohere: {
    baseUrl: 'https://api.cohere.ai/v2/chat',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
    authHeader: 'Authorization',
    streamParam: 'stream',
  },
};

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Tool call ID for tool result messages */
  toolCallId?: string;
  /** Tool calls made by assistant (for formatting tool_use blocks) */
  toolCalls?: ToolCall[];
  /** Per-message attachments for persisting file context across conversation history */
  attachments?: MessageAttachment[];
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

interface MessageAttachment {
  type: 'image' | 'document';
  uri: string;
  mimeType: string;
  base64?: string;
  fileName?: string;
  fileSize?: number;
}

interface StreamRequest {
  providerId: string;
  model: string;
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  sessionId?: string;
  sessionType?: 'chat' | 'debate' | 'comparison' | 'analyze';
  interactionId?: string;
  searchOptions?: SearchOptions;
  attachments?: MessageAttachment[];
  // Tool calling fields
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  toolResults?: ToolResult[];
}

// SSE event types sent to client
interface SSEDeltaEvent {
  type: 'delta';
  text: string;
}

interface SSEToolCallStartEvent {
  type: 'tool_call_start';
  toolCallId: string;
  toolName: string;
}

interface SSEToolCallDoneEvent {
  type: 'tool_call_done';
  toolCall: ToolCall;
}

interface SSEDoneEvent {
  type: 'done';
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Citation[];
  modelUsed?: string;
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  toolCalls?: ToolCall[];
  requiresToolExecution?: boolean;
}

interface SSEErrorEvent {
  type: 'error';
  error: string;
  code?: string;
}

type SSEEvent = SSEDeltaEvent | SSEToolCallStartEvent | SSEToolCallDoneEvent | SSEDoneEvent | SSEErrorEvent;

/**
 * Extract base64 data from attachment
 */
function getBase64Data(attachment: MessageAttachment): string {
  if (attachment.base64) {
    return attachment.base64;
  }
  const base64Index = attachment.uri.indexOf('base64,');
  if (base64Index >= 0) {
    return attachment.uri.slice(base64Index + 7);
  }
  return '';
}

/**
 * Write an SSE event to the response
 */
function writeSSE(res: any, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Verify Firebase Auth token from Authorization header
 */
async function verifyAuthToken(authHeader: string | undefined): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpsError('unauthenticated', 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    throw new HttpsError('unauthenticated', 'Invalid or expired auth token');
  }
}

/**
 * Stream Claude API response
 */
async function streamClaude(
  res: any,
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number | undefined,
  attachments?: MessageAttachment[],
  tools?: ToolDefinition[],
  toolChoice?: ToolChoice,
  toolResults?: ToolResult[]
): Promise<{ inputTokens: number; outputTokens: number; toolCalls?: ToolCall[]; finishReason?: string }> {
  const resolvedMaxTokens = maxTokens ?? 8192;

  // Log tools status
  console.log('[streamClaude] Request info:', {
    hasTools: !!(tools && tools.length > 0),
    toolCount: tools?.length || 0,
    toolNames: tools?.map(t => t.name) || [],
    hasToolResults: !!(toolResults && toolResults.length > 0),
    toolResultsCount: toolResults?.length || 0,
  });

  // Build messages with attachments
  const anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
  }> = [];

  for (let idx = 0; idx < messages.length; idx++) {
    const m = messages[idx];

    // Skip system messages (handled separately)
    if (m.role === 'system') continue;

    // Handle tool role messages - these become user messages with tool_result blocks
    if (m.role === 'tool' && m.toolCallId) {
      anthropicMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.toolCallId,
          content: m.content,
        }],
      });
      continue;
    }

    const isLastUserMessage = m.role === 'user' && idx === messages.length - 1;

    // Per-message attachments with global fallback for backward compat
    const msgAttachments = m.attachments || (isLastUserMessage ? attachments : undefined);
    if (m.role === 'user' && msgAttachments && msgAttachments.length > 0) {
      type ContentPart =
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
        | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

      const contentParts: ContentPart[] = [];

      for (const att of msgAttachments) {
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

      contentParts.push({ type: 'text', text: m.content });

      anthropicMessages.push({
        role: m.role as 'user' | 'assistant',
        content: contentParts,
      });
      continue;
    }

    // Check if this assistant message has tool calls to format
    console.log('[streamClaude] Processing message:', {
      role: m.role,
      hasToolCalls: !!(m.toolCalls && Array.isArray(m.toolCalls)),
      toolCallCount: m.toolCalls?.length || 0,
    });
    if (m.role === 'assistant' && m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      // Format as assistant message with tool_use blocks
      const contentBlocks: Array<Record<string, unknown>> = [];

      // Add any text content first
      if (m.content) {
        contentBlocks.push({ type: 'text', text: m.content });
      }

      // Add tool_use blocks
      for (const tc of m.toolCalls) {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }

      anthropicMessages.push({
        role: 'assistant',
        content: contentBlocks,
      });
      continue;
    }

    anthropicMessages.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    });
  }

  // If toolResults provided separately, append them as a user message
  if (toolResults && toolResults.length > 0) {
    console.log('[streamClaude] Adding tool results:', {
      count: toolResults.length,
      toolCallIds: toolResults.map(r => r.toolCallId),
    });
    anthropicMessages.push({
      role: 'user',
      content: toolResults.map(result => ({
        type: 'tool_result',
        tool_use_id: result.toolCallId,
        content: result.success ? result.content : `Error: ${result.error}`,
        is_error: !result.success,
      })),
    });
  }

  // Debug: log final messages being sent to Claude
  console.log('[streamClaude] Final messages:', JSON.stringify(anthropicMessages.map(m => ({
    role: m.role,
    contentType: typeof m.content === 'string' ? 'string' : 'array',
    contentLength: typeof m.content === 'string' ? m.content.length : m.content.length,
    hasToolUse: Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_use'),
    hasToolResult: Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_result'),
  })), null, 2));

  // Build request body with optional tools
  const requestBody: Record<string, unknown> = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: resolvedMaxTokens,
    stream: true,
    system: systemPrompt || messages.find(m => m.role === 'system')?.content,
    messages: anthropicMessages,
  };
  if (typeof temperature === 'number') {
    requestBody.temperature = temperature;
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = transformToolsForClaude(tools);
    if (toolChoice) {
      requestBody.tool_choice = transformToolChoiceForClaude(toolChoice);
    }
  }

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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = 'stop';
  const toolCallsInProgress: Map<number, { id: string; name: string; input: string }> = new Map();
  const completedToolCalls: ToolCall[] = [];

  let deltaCount = 0;
  let totalTextLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'content_block_delta' && event.delta?.text) {
              deltaCount++;
              totalTextLength += event.delta.text.length;
              writeSSE(res, { type: 'delta', text: event.delta.text });
            } else if (event.type === 'content_block_start') {
              console.log('[streamClaude] content_block_start:', { type: event.content_block?.type, index: event.index });
            }
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              // Tool call starting
              const block = event.content_block;
              const index = event.index;
              toolCallsInProgress.set(index, {
                id: block.id,
                name: block.name,
                input: '',
              });
              writeSSE(res, {
                type: 'tool_call_start',
                toolCallId: block.id,
                toolName: block.name,
              });
            } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
              // Tool call argument streaming
              const index = event.index;
              const toolCall = toolCallsInProgress.get(index);
              if (toolCall) {
                toolCall.input += event.delta.partial_json || '';
              }
            } else if (event.type === 'content_block_stop') {
              // Content block completed - check if it was a tool call
              const index = event.index;
              const toolCall = toolCallsInProgress.get(index);
              if (toolCall) {
                const completedCall: ToolCall = {
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.name,
                    arguments: toolCall.input,
                  },
                };
                completedToolCalls.push(completedCall);
                writeSSE(res, { type: 'tool_call_done', toolCall: completedCall });
                toolCallsInProgress.delete(index);
              }
            } else if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens || 0;
            } else if (event.type === 'message_delta') {
              if (event.usage) {
                outputTokens = event.usage.output_tokens || 0;
              }
              if (event.delta?.stop_reason) {
                finishReason = event.delta.stop_reason === 'tool_use' ? 'tool_calls' : event.delta.stop_reason;
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log('[streamClaude] Stream complete:', {
    deltaCount,
    totalTextLength,
    inputTokens,
    outputTokens,
    finishReason,
    toolCallCount: completedToolCalls.length,
  });

  return {
    inputTokens,
    outputTokens,
    toolCalls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
    finishReason,
  };
}

/**
 * Stream Gemini API response
 * Gemini uses a different streaming format (streamGenerateContent)
 */
async function streamGemini(
  res: any,
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  searchOptions?: SearchOptions,
  attachments?: MessageAttachment[]
): Promise<{ inputTokens: number; outputTokens: number; citations?: Citation[] }> {
  const modelId = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`;

  // Build contents with attachments
  const contents = messages
    .filter(m => m.role !== 'system')
    .map((m, idx, arr) => {
      const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

      // Per-message attachments with global fallback for backward compat
      const msgAttachments = m.attachments || (isLastUserMessage ? attachments : undefined);
      if (m.role === 'user' && msgAttachments && msgAttachments.length > 0) {
        type GeminiPart =
          | { text: string }
          | { inline_data: { mime_type: string; data: string } };

        const parts: GeminiPart[] = [];

        for (const att of msgAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          parts.push({
            inline_data: {
              mime_type: att.mimeType || (att.type === 'image' ? 'image/jpeg' : 'application/pdf'),
              data: base64,
            },
          });
        }

        parts.push({ text: m.content });

        return {
          role: 'user',
          parts,
        };
      }

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

  if (searchOptions?.enabled) {
    requestBody.tools = [{ google_search: {} }];
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let citations: Citation[] | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);

            // Extract text from candidates
            const parts = event.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (typeof part.text === 'string' && part.text) {
                writeSSE(res, { type: 'delta', text: part.text });
              }
            }

            // Extract usage
            if (event.usageMetadata) {
              inputTokens = event.usageMetadata.promptTokenCount || inputTokens;
              outputTokens = event.usageMetadata.candidatesTokenCount || outputTokens;
            }

            // Extract citations from grounding metadata
            const groundingMetadata = event.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
              citations = groundingMetadata.groundingChunks
                .filter((chunk: { web?: { uri: string; title?: string } }) => chunk.web?.uri)
                .map((chunk: { web: { uri: string; title?: string } }, index: number) => ({
                  index: index + 1,
                  url: chunk.web.uri,
                  title: chunk.web.title,
                  domain: chunk.web.title || `Source ${index + 1}`,
                }));
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { inputTokens, outputTokens, citations };
}

/**
 * Stream OpenAI-compatible API response (OpenAI, Mistral, DeepSeek, Grok)
 */
async function streamOpenAICompatible(
  res: any,
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  providerId: string,
  attachments?: MessageAttachment[],
  tools?: ToolDefinition[],
  toolChoice?: ToolChoice
): Promise<{ inputTokens: number; outputTokens: number; toolCalls?: ToolCall[]; finishReason?: string }> {
  // Check vision support
  const supportsVision = modelSupportsVision(providerId, model);
  const supportsDocuments = providerId === 'openai' && supportsVision;

  type OpenAIContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; file_data: string } };

  type OpenAIMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string | OpenAIContentPart[];
  };

  const formattedMessages: Array<Record<string, unknown>> = [];
  for (let idx = 0; idx < messages.length; idx++) {
    const m = messages[idx];
    const isLastUserMessage = m.role === 'user' && idx === messages.length - 1;

    // Handle tool result messages (role: 'tool')
    if (m.role === 'tool' && m.toolCallId) {
      formattedMessages.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content || '',
      });
      continue;
    }

    // Handle assistant messages with tool calls
    if (m.role === 'assistant' && m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      formattedMessages.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc: ToolCall) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments || '{}',
          },
        })),
      });
      continue;
    }

    // Per-message attachments with global fallback for backward compat
    const msgAttachments = m.attachments || (isLastUserMessage ? attachments : undefined);
    if (m.role === 'user' && msgAttachments && msgAttachments.length > 0) {
      const imageAttachments = msgAttachments.filter(att => att.type === 'image');
      const documentAttachments = msgAttachments.filter(att => att.type === 'document');

      const hasProcessableImages = supportsVision && imageAttachments.length > 0;
      const hasProcessableDocs = supportsDocuments && documentAttachments.length > 0;

      if (hasProcessableImages || hasProcessableDocs) {
        const contentParts: OpenAIContentPart[] = [];

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

        contentParts.push({ type: 'text', text: m.content });

        formattedMessages.push({
          role: m.role,
          content: contentParts,
        });
        continue;
      }
    }

    formattedMessages.push({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    });
  }

  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (maxTokens !== undefined) {
    const isOpenAI = providerId === 'openai';
    if (isOpenAI) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = transformToolsForOpenAI(tools);
    if (toolChoice) {
      requestBody.tool_choice = transformToolChoiceForOpenAI(toolChoice);
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = 'stop';
  const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();
  const completedToolCalls: ToolCall[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            const choice = event.choices?.[0];

            // Extract delta content
            const deltaContent = choice?.delta?.content;
            if (deltaContent) {
              writeSSE(res, { type: 'delta', text: deltaContent });
            }

            // Handle tool calls
            const toolCalls = choice?.delta?.tool_calls;
            if (toolCalls && Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                const index = tc.index ?? 0;

                if (tc.id) {
                  // New tool call starting
                  toolCallsInProgress.set(index, {
                    id: tc.id,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  });
                  if (tc.function?.name) {
                    writeSSE(res, {
                      type: 'tool_call_start',
                      toolCallId: tc.id,
                      toolName: tc.function.name,
                    });
                  }
                } else if (tc.function?.arguments) {
                  // Streaming arguments
                  const existing = toolCallsInProgress.get(index);
                  if (existing) {
                    existing.arguments += tc.function.arguments;
                  }
                }
              }
            }

            // Check finish reason
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason;

              // Complete any in-progress tool calls
              for (const [, tc] of toolCallsInProgress) {
                const completedCall: ToolCall = {
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                };
                completedToolCalls.push(completedCall);
                writeSSE(res, { type: 'tool_call_done', toolCall: completedCall });
              }
              toolCallsInProgress.clear();
            }

            // Extract usage from final message
            if (event.usage) {
              inputTokens = event.usage.prompt_tokens || inputTokens;
              outputTokens = event.usage.completion_tokens || outputTokens;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    inputTokens,
    outputTokens,
    toolCalls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
    finishReason,
  };
}

/**
 * Stream Cohere API response
 */
async function streamCohere(
  res: any,
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  attachments?: MessageAttachment[]
): Promise<{ inputTokens: number; outputTokens: number }> {
  const supportsVision = modelSupportsVision('cohere', model);

  type CohereContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  type CohereMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string | CohereContentPart[];
  };

  const formattedMessages: CohereMessage[] = messages.map((m, idx, arr) => {
    const isLastUserMessage = m.role === 'user' && idx === arr.length - 1;

    // Per-message attachments with global fallback for backward compat
    const msgAttachments = m.attachments || (isLastUserMessage ? attachments : undefined);
    if (m.role === 'user' && supportsVision && msgAttachments && msgAttachments.length > 0) {
      const contentParts: CohereContentPart[] = [];

      for (const att of msgAttachments) {
        const base64 = getBase64Data(att);
        if (!base64) continue;

        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}`,
          },
        });
      }

      contentParts.push({ type: 'text', text: m.content });

      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: contentParts,
      };
    }

    return {
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    };
  });

  if (systemPrompt && !messages.some(m => m.role === 'system')) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const cohereRequest: Record<string, unknown> = {
    model: model || 'command-a-plus-05-2026',
    messages: formattedMessages,
    temperature,
    stream: true,
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Cohere v2 uses SSE format with data: prefix
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            // Cohere streaming events
            // content-delta contains the text in delta.message.content.text
            if (event.type === 'content-delta' && event.delta?.message?.content?.text) {
              writeSSE(res, { type: 'delta', text: event.delta.message.content.text });
            } else if (event.type === 'message-end' && event.delta?.usage) {
              inputTokens = event.delta.usage.billed_units?.input_tokens || 0;
              outputTokens = event.delta.usage.billed_units?.output_tokens || 0;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { inputTokens, outputTokens };
}

/**
 * Stream Perplexity API response (always performs web search)
 */
async function streamPerplexity(
  res: any,
  apiKey: string,
  model: string,
  messages: Message[],
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number,
  searchOptions?: SearchOptions,
  attachments?: MessageAttachment[]
): Promise<{ inputTokens: number; outputTokens: number; citations?: Citation[] }> {
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

    // Per-message attachments with global fallback for backward compat
    const msgAttachments = m.attachments || (isLastUserMessage ? attachments : undefined);
    if (m.role === 'user' && msgAttachments && msgAttachments.length > 0) {
      const imageAttachments = msgAttachments.filter(att => att.type === 'image');
      const documentAttachments = msgAttachments.filter(att => att.type === 'document');

      if (imageAttachments.length > 0 || documentAttachments.length > 0) {
        const contentParts: PerplexityContentPart[] = [];

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

        for (const att of documentAttachments) {
          const base64 = getBase64Data(att);
          if (!base64) continue;

          contentParts.push({
            type: 'file_url',
            file_url: { url: base64 },
            file_name: att.fileName || 'document.pdf',
          });
        }

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

  const requestBody: Record<string, unknown> = {
    model: model || 'sonar',
    messages: formattedMessages,
    temperature,
    stream: true,
    return_citations: true,
    return_related_questions: false,
  };

  if (maxTokens !== undefined) {
    requestBody.max_tokens = maxTokens;
  }

  if (searchOptions?.recencyFilter) {
    requestBody.search_recency_filter = searchOptions.recencyFilter;
  }

  if (searchOptions?.domainFilter && searchOptions.domainFilter.length > 0) {
    requestBody.search_domain_filter = searchOptions.domainFilter;
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let citations: Citation[] | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            // Extract delta content
            const deltaContent = event.choices?.[0]?.delta?.content;
            if (deltaContent) {
              writeSSE(res, { type: 'delta', text: deltaContent });
            }

            // Extract usage
            if (event.usage) {
              inputTokens = event.usage.prompt_tokens || inputTokens;
              outputTokens = event.usage.completion_tokens || outputTokens;
            }

            // Extract citations (usually in final message)
            if (event.citations && !citations) {
              citations = event.citations.map((url: string, index: number) => {
                let domain = '';
                try {
                  domain = new URL(url).hostname.replace(/^www\./, '');
                } catch {
                  domain = url;
                }
                return { index: index + 1, url, domain };
              });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { inputTokens, outputTokens, citations };
}

/**
 * Check if a model supports vision
 */
function modelSupportsVision(providerId: string, model: string): boolean {
  const modelLower = model.toLowerCase();

  switch (providerId) {
    case 'openai':
      return modelLower.includes('gpt-4o') ||
             modelLower.includes('gpt-4.1') ||
             modelLower.includes('gpt-4-vision') ||
             modelLower.includes('gpt-4-turbo') ||
             modelLower.includes('gpt-5') ||
             modelLower.includes('gpt-6') ||
             modelLower.includes('o1') ||
             modelLower.includes('o3');
    case 'grok':
      return modelLower.includes('grok-4') ||
             modelLower.includes('grok-3') ||
             modelLower.includes('vision');
    case 'mistral':
      return modelLower.includes('pixtral') ||
             modelLower.includes('mistral-large') ||
             modelLower.includes('mistral-medium') ||
             modelLower.includes('mistral-small');
    case 'perplexity':
      return modelLower.includes('sonar');
    case 'cohere':
      return modelLower.includes('vision') ||
             modelLower.includes('command-a');
    case 'deepseek':
      // DeepSeek V4.1 Flash (deepseek-flash, 2026-09-10) is natively
      // multimodal, and the retired deepseek-v4-flash / -vision-exp names are
      // served by it. deepseek-v4-pro does not accept images.
      return modelLower.includes('flash') || modelLower.includes('vision');
    case 'moonshot':
      return modelLower.includes('kimi-k');
    case 'zai':
      // GLM-5.3 Flash is the first natively multimodal GLM-5 model; the
      // flagship glm-5.3 rejects image content (verified 2026-09-03).
      return modelLower.includes('glm-5v') ||
             modelLower.includes('glm-5.3-flash');
    default:
      return false;
  }
}

/**
 * Provider display names for user-friendly error messages
 */
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
 * Streaming AI Proxy - HTTP endpoint for SSE streaming
 *
 * Unlike the callable proxyAIRequest, this is an HTTP endpoint that:
 * 1. Validates Firebase Auth token from Authorization header
 * 2. Makes streaming request to provider
 * 3. Pipes SSE events to client
 */
export const proxyAIRequestStream = onRequest(
  {
    timeoutSeconds: 540,  // 9 minutes max
    memory: '1GiB',
    cors: ['https://symposiumai.app', 'https://www.symposiumai.app', 'http://localhost:3000'],
    secrets: [encryptionKey],
  },
  async (req, res) => {
    // Only allow POST
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering

    try {
      // Verify authentication
      const uid = await verifyAuthToken(req.headers.authorization);

      const keyValue = encryptionKey.value();
      if (!keyValue) {
        writeSSE(res, { type: 'error', error: 'Encryption not configured', code: 'internal' });
        res.end();
        return;
      }

      const data = req.body as StreamRequest;
      const {
        providerId,
        model,
        messages,
        systemPrompt,
        maxTokens,
        temperature = 0.7,
        sessionId,
        sessionType,
        interactionId,
        searchOptions,
        attachments,
        tools,
        toolChoice,
      } = data;

      // Validate provider
      if (!providerId || !PROVIDER_CONFIGS[providerId]) {
        writeSSE(res, { type: 'error', error: `Invalid provider: ${providerId}`, code: 'invalid-argument' });
        res.end();
        return;
      }
      const resolvedModel = resolveProviderModelId(providerId, model);
      if (!resolvedModel) {
        writeSSE(res, { type: 'error', error: `No model configured for provider: ${providerId}`, code: 'invalid-argument' });
        res.end();
        return;
      }

      // Validate messages
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        writeSSE(res, { type: 'error', error: 'Messages are required', code: 'invalid-argument' });
        res.end();
        return;
      }

      // Server-authoritative free-tier gate (no-op unless the client sends an
      // interactionId; premium/trial users always pass).
      const freeTierGate = await enforceFreeTierForInteraction(uid, sessionType, interactionId);
      if (!freeTierGate.allowed) {
        writeSSE(res, {
          type: 'error',
          error: 'You have used all of your free interactions. Subscribe to keep going.',
          code: 'resource-exhausted',
        });
        res.end();
        return;
      }

      // Get API key
      const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
      if (!apiKey) {
        writeSSE(res, { type: 'error', error: `No API key configured for ${providerId}`, code: 'failed-precondition' });
        res.end();
        return;
      }

      const config = PROVIDER_CONFIGS[providerId];
      const resolvedMaxTokens = typeof maxTokens === 'number' && maxTokens > 0 ? Math.floor(maxTokens) : undefined;
      const resolvedTemperature = normalizeProviderTemperature(providerId, resolvedModel, temperature);
      const providerTemperature = resolvedTemperature ?? temperature;

      let result: {
        inputTokens: number;
        outputTokens: number;
        citations?: Citation[];
        toolCalls?: ToolCall[];
        finishReason?: string;
      };

      // Route to provider-specific streaming function
      if (providerId === 'claude') {
        result = await streamClaude(res, apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, resolvedTemperature, attachments, tools, toolChoice, data.toolResults);
      } else if (providerId === 'google') {
        result = await streamGemini(res, apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, searchOptions, attachments);
      } else if (providerId === 'cohere') {
        result = await streamCohere(res, apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, attachments);
      } else if (providerId === 'perplexity') {
        result = await streamPerplexity(res, apiKey, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, searchOptions, attachments);
      } else {
        // OpenAI-compatible providers (OpenAI, Mistral, DeepSeek, Grok)
        result = await streamOpenAICompatible(res, apiKey, config.baseUrl, resolvedModel, messages, systemPrompt, resolvedMaxTokens, providerTemperature, providerId, attachments, tools, toolChoice);
      }

      // Determine if tool execution is required
      const requiresToolExecution = result.finishReason === 'tool_calls' && result.toolCalls && result.toolCalls.length > 0;

      // Send completion event
      writeSSE(res, {
        type: 'done',
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        citations: result.citations,
        modelUsed: resolvedModel,
        finishReason: result.finishReason as SSEDoneEvent['finishReason'],
        toolCalls: result.toolCalls,
        requiresToolExecution,
      });

      // Record usage (non-blocking)
      if (result.inputTokens > 0 || result.outputTokens > 0) {
        recordUsageInternal(uid, {
          messageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sessionId: sessionId || 'unknown',
          providerId,
          modelId: resolvedModel,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.inputTokens + result.outputTokens,
          sessionType: sessionType || 'chat',
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Failed to record usage:', err);
        });
      }

      res.end();
    } catch (error: any) {
      console.error('Streaming error:', error);

      const displayName = PROVIDER_NAMES[req.body?.providerId] || 'AI';
      let userMessage = `${displayName} encountered an error. Please try again.`;
      let code = 'internal';

      const status = error.status || 500;

      // Try to parse the error body for specific messages
      let errorDetails = '';
      if (error.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error?.message) {
            errorDetails = parsed.error.message;
          }
        } catch {
          // Not JSON, use raw message
          errorDetails = error.message;
        }
      }

      if (status === 401 || status === 403) {
        userMessage = `Your ${displayName} API key is invalid. Please update it in Settings.`;
        code = 'permission-denied';
      } else if (status === 429) {
        userMessage = `${displayName} is rate limiting requests. Please wait and try again.`;
        code = 'resource-exhausted';
      } else if (status === 400) {
        // Surface specific error details for 400 errors
        if (errorDetails.toLowerCase().includes('credit balance') || errorDetails.toLowerCase().includes('billing')) {
          userMessage = `Your ${displayName} API account has insufficient credits. Please add credits in your ${displayName} account settings.`;
          code = 'failed-precondition';
        } else {
          userMessage = `${displayName} couldn't process this request.`;
        }
        code = code || 'invalid-argument';
      }

      writeSSE(res, { type: 'error', error: userMessage, code });
      res.end();
    }
  }
);
