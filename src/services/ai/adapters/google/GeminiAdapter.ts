import { Message, MessageAttachment } from '../../../../types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { getModelById } from '../../../../config/modelConfigs';
import { BaseAdapter } from '../../base/BaseAdapter';
import {
  ResumptionContext,
  SendMessageResponse,
  AdapterCapabilities
} from '../../types/adapter.types';
import EventSource from 'react-native-sse';
import { extractSSEErrorMessage } from '../../utils/extractSSEErrorMessage';
import { normalizeFinishReason } from '../../utils/normalizeFinishReason';
import { buildGeminiGenerationConfig, extractGeminiText } from './geminiGenerationConfig';

export class GeminiAdapter extends BaseAdapter {
  getCapabilities(): AdapterCapabilities {
    return {
      streaming: true,
      attachments: true,
      supportsImages: true,  // Enabled for testing
      supportsDocuments: true,  // Enabled for testing
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 8192,
      contextWindow: 1048576, // 1M tokens for Gemini 2.5
    };
  }
  
  private formatContents(message: string, attachments?: MessageAttachment[]): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: message }];
    
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType || 'image/jpeg',
              data: attachment.base64 || this.extractBase64FromUri(attachment.uri),
            },
          });
        } else if (attachment.type === 'document' && attachment.mimeType === 'application/pdf') {
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: attachment.base64 || '',
            },
          });
        }
      }
    }
    
    return parts;
  }
  
  private extractBase64FromUri(uri: string): string {
    if (uri.startsWith('data:')) {
      const base64Index = uri.indexOf('base64,');
      if (base64Index !== -1) {
        return uri.substring(base64Index + 7);
      }
    }
    return '';
  }
  
  private formatHistoryForGemini(
    history: Message[], 
    resumptionContext?: ResumptionContext
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    const formattedHistory = this.formatHistory(history, resumptionContext);
    const geminiHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    if (this.getSystemPrompt() !== 'You are a helpful AI assistant.') {
      geminiHistory.push({
        role: 'user',
        parts: [{ text: 'System: ' + this.getSystemPrompt() }]
      });
      geminiHistory.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }
    
    for (const msg of formattedHistory) {
      geminiHistory.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content as string }]
      });
    }
    
    return geminiHistory;
  }
  
  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const resolvedModel = resolveModelAlias(
      modelOverride || this.config.model || getDefaultModel('google')
    );

    const contents = [
      ...this.formatHistoryForGemini(conversationHistory, resumptionContext),
      {
        role: 'user',
        parts: this.formatContents(message, attachments)
      }
    ];

    try {
      const requestBody: Record<string, unknown> = {
        contents,
        generationConfig: buildGeminiGenerationConfig({
          model: resolvedModel,
          temperature: this.resolveSamplingParameters(resolvedModel).temperature ?? 0.7,
          topP: this.config.parameters?.topP ?? 0.95,
          topK: this.config.parameters?.topK ?? 40,
          maxTokens: this.config.parameters?.maxTokens,
          supportsThinking: getModelById('google', resolvedModel)?.supportsThinking,
          reasoningEffort: this.config.parameters?.reasoningEffort,
        }),
      };

      // Add Google Search grounding tool when web search is enabled
      if (this.config.webSearchEnabled) {
        requestBody.tools = [{ google_search: {} }];
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.config.apiKey,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        await this.handleApiError(response, 'Gemini');
      }

      const data = await response.json();

      const rawText = extractGeminiText(data.candidates?.[0]?.content?.parts);
      if (!rawText) {
        throw new Error('No response from Gemini');
      }

      // Extract citations from grounding metadata and inject inline [n] markers
      // so the answer shows numbered chips (like Claude/Grok/Perplexity) plus
      // the source table.
      const citations = this.extractCitationsFromGrounding(data);
      const responseText = this.injectGroundingMarkers(rawText, data, citations);

      return {
        response: responseText,
        modelUsed: resolvedModel,
        finishReason: normalizeFinishReason(data.candidates?.[0]?.finishReason),
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        } : undefined,
        metadata: citations.length > 0 ? { citations } : undefined,
      };
    } catch (error) {
      console.error('Error in GeminiAdapter:', error);
      throw error;
    }
  }

  /**
   * Extract citations from Gemini's grounding metadata
   */
  private extractCitationsFromGrounding(data: Record<string, unknown>): Array<{ index: number; url: string; title?: string; domain?: string }> {
    const citations: Array<{ index: number; url: string; title?: string; domain?: string }> = [];

    const groundingMetadata = (data.candidates as Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri: string; title?: string } }> } }>)?.[0]?.groundingMetadata;
    if (!groundingMetadata) return citations;

    const groundingChunks = groundingMetadata.groundingChunks || [];
    for (let i = 0; i < groundingChunks.length; i++) {
      const chunk = groundingChunks[i];
      if (chunk.web?.uri) {
        const url = chunk.web.uri;
        const title = chunk.web.title;
        // Use title as domain display since Gemini uses redirect URLs
        const domain = title || `Source ${i + 1}`;
        citations.push({ index: i + 1, url, title, domain });
      }
    }

    return citations;
  }

  /**
   * Insert bare [n] citation markers into the answer text using Gemini's
   * groundingSupports (which map answer segments to grounding chunks). Gemini's
   * segment offsets are UTF-8 byte offsets, so they are converted to string
   * indices before splicing. Markers are inserted from the end so earlier
   * offsets stay valid.
   */
  private injectGroundingMarkers(
    text: string,
    data: Record<string, unknown>,
    citations: Array<{ index: number; url: string }>
  ): string {
    if (citations.length === 0) return text;
    const groundingMetadata = (data.candidates as Array<{
      groundingMetadata?: {
        groundingSupports?: Array<{
          segment?: { endIndex?: number };
          groundingChunkIndices?: number[];
        }>;
      };
    }>)?.[0]?.groundingMetadata;
    const supports = groundingMetadata?.groundingSupports;
    if (!Array.isArray(supports) || supports.length === 0) return text;

    const byteToCharOffset = (value: string, byteOffset: number): number => {
      let bytes = 0;
      for (let i = 0; i < value.length; i++) {
        const code = value.codePointAt(i) ?? 0;
        bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
        if (code > 0xffff) i++; // surrogate pair consumes two code units
        if (bytes >= byteOffset) return i + 1;
      }
      return value.length;
    };

    const insertions: Array<{ offset: number; marker: string }> = [];
    for (const support of supports) {
      const endByte = support.segment?.endIndex;
      const chunkIndices = support.groundingChunkIndices;
      if (typeof endByte !== 'number' || !Array.isArray(chunkIndices) || chunkIndices.length === 0) {
        continue;
      }
      const marker = chunkIndices.map((ci) => `[${ci + 1}]`).join('');
      insertions.push({ offset: byteToCharOffset(text, endByte), marker });
    }

    insertions.sort((a, b) => b.offset - a.offset);
    let result = text;
    for (const { offset, marker } of insertions) {
      result = result.slice(0, offset) + marker + result.slice(offset);
    }
    return result;
  }

  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string,
    _abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    // When web search is enabled, use non-streaming request to capture grounding metadata
    // (Gemini streaming doesn't include grounding metadata in chunks)
    if (this.config.webSearchEnabled) {
      const response = await this.sendMessage(
        message,
        conversationHistory,
        resumptionContext,
        attachments,
        modelOverride
      );

      const content = typeof response === 'string' ? response : response.response;
      const citations = typeof response === 'object' ? response.metadata?.citations : undefined;

      // Return in chunks; StreamingService owns display pacing.
      const chunkSize = 64;

      for (let i = 0; i < content.length; i += chunkSize) {
        yield content.slice(i, i + chunkSize);
      }

      // Emit citations via onEvent
      if (citations && citations.length > 0 && onEvent) {
        onEvent({ type: 'citations', citations });
      }

      return;
    }

    // Standard streaming path (no web search)
    const resolvedModel = resolveModelAlias(
      modelOverride || this.config.model || getDefaultModel('google')
    );

    const contents = [
      ...this.formatHistoryForGemini(conversationHistory),
      {
        role: 'user',
        parts: this.formatContents(message, attachments)
      }
    ];

    const requestBody = JSON.stringify({
      contents,
      generationConfig: buildGeminiGenerationConfig({
        model: resolvedModel,
        temperature: this.resolveSamplingParameters(resolvedModel).temperature ?? 0.7,
        topP: this.config.parameters?.topP ?? 0.95,
        topK: this.config.parameters?.topK ?? 40,
        maxTokens: this.config.parameters?.maxTokens,
        supportsThinking: getModelById('google', resolvedModel)?.supportsThinking,
        reasoningEffort: this.config.parameters?.reasoningEffort,
      }),
    });

    // Create EventSource for SSE streaming (React Native).
    // Pass the API key via header, not the URL query string, so it can't be
    // captured by crash reporters / proxy logs that record full URLs.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:streamGenerateContent?alt=sse`;

    const es = new EventSource(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
      },
      body: requestBody,
      timeoutBeforeConnection: 0,
      pollingInterval: 30000,
      withCredentials: false,
    });

    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorOccurred: Error | null = null;

    es.addEventListener('message', (event) => {
      try {
        const line = event.data;
        if (!line) return;
        const data = JSON.parse(line);
        const text = extractGeminiText(data.candidates?.[0]?.content?.parts);
        if (text) {
          if (resolver) { const r = resolver; resolver = null; r({ value: text, done: false }); }
          else eventQueue.push(text);
        }
        const finishReason = data.candidates?.[0]?.finishReason as string | undefined;
        if (finishReason) {
          if (onEvent) {
            try { onEvent({ type: 'finish', reason: normalizeFinishReason(finishReason) ?? 'stop' }); } catch { /* noop */ }
          }
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        }
      } catch (error) {
        console.error('[GeminiAdapter] Error parsing message:', error);
      }
    });

    es.addEventListener('error', (error) => {
      console.error('[GeminiAdapter] SSE error:', error);
      const errorMessage = extractSSEErrorMessage(error, 'Connection failed');
      errorOccurred = new Error(errorMessage);
      isComplete = true;
      try { es.close(); } catch { /* noop */ }
      if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
    });

    es.addEventListener('open', () => {});

    try {
      while (!isComplete || eventQueue.length > 0) {
        if (errorOccurred) throw errorOccurred;
        if (eventQueue.length > 0) {
          const chunk = eventQueue.shift()!;
          yield chunk;
          continue;
        }
        const result = await new Promise<IteratorResult<string, void>>((resolve) => { resolver = resolve; });
        if (errorOccurred) throw errorOccurred;
        if (result.done) break;
        if (result.value) yield result.value;
      }
    } finally {
      try { es.close(); } catch { /* noop */ }
    }
  }
}
