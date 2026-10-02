import { Message, MessageAttachment } from '../../../../types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { getModelById } from '../../../../config/modelConfigs';
import { BaseAdapter } from '../../base/BaseAdapter';
import {
  ResumptionContext,
  SendMessageResponse,
  AdapterCapabilities
} from '../../types/adapter.types';
import EventSource, { CustomEvent } from 'react-native-sse';
import { extractSSEErrorMessage, mapErrorTypeToMessage } from '../../utils/extractSSEErrorMessage';
import { normalizeFinishReason } from '../../utils/normalizeFinishReason';

// Define Claude's custom SSE event types
type ClaudeEventTypes = 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_stop' | 'ping' | 'message';

export class ClaudeAdapter extends BaseAdapter {
  private lastModelUsed?: string;

  getCapabilities(): AdapterCapabilities {
    const modelId = resolveModelAlias(this.config.model || getDefaultModel('claude'));
    const model = getModelById('claude', modelId);
    // Uncataloged legacy IDs without PDF support
    const legacyNoDocuments = ['claude-3-opus-20240229', 'claude-3-haiku-20240307'].includes(modelId);

    return {
      streaming: true,
      attachments: true,  // All Claude models support at least images
      supportsImages: model?.supportsVision ?? true,
      supportsDocuments: model?.supportsDocuments ?? !legacyNoDocuments,
      functionCalling: true,
      systemPrompt: true,
      maxTokens: model?.maxOutputTokens ?? 8192,
      contextWindow: model?.contextLength ?? 200000,
    };
  }
  
  public getLastModelUsed(): string | undefined {
    return this.lastModelUsed;
  }

  // Anthropic server-side web search tool. web_search_20250305 works on every
  // catalog model; max_uses keeps pause_turn continuations rare.
  private buildWebSearchTools(): Array<Record<string, unknown>> | undefined {
    if (!this.config.webSearchEnabled) return undefined;
    return [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }

  // With web search enabled, content interleaves text, server_tool_use, and
  // web_search_tool_result blocks. Join the text blocks and inject a bare [n]
  // marker after each cited span so the app renders inline citation chips (in
  // addition to the source table) — both keyed off the returned citations.
  private buildAnswerFromContent(
    content: unknown
  ): { text: string; citations: Array<{ index: number; url: string; title?: string; snippet?: string }> } {
    const citations: Array<{ index: number; url: string; title?: string; snippet?: string }> = [];
    const urlToIndex = new Map<string, number>();
    const add = (url: unknown, title?: unknown, snippet?: unknown): number | undefined => {
      if (typeof url !== 'string' || !url) return undefined;
      let index = urlToIndex.get(url);
      if (index === undefined) {
        index = citations.length + 1;
        urlToIndex.set(url, index);
        citations.push({
          index,
          url,
          ...(typeof title === 'string' && title ? { title } : {}),
          ...(typeof snippet === 'string' && snippet ? { snippet } : {}),
        });
      }
      return index;
    };

    if (!Array.isArray(content)) return { text: '', citations };

    let text = '';
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as { type?: string; text?: unknown; citations?: unknown };
      if ((b.type === undefined || b.type === 'text') && typeof b.text === 'string') {
        text += b.text;
        if (Array.isArray(b.citations)) {
          // A block citing one source several times still gets a single chip.
          const blockIndices = new Set<number>();
          for (const c of b.citations) {
            const cit = c as { type?: string; url?: unknown; title?: unknown; cited_text?: unknown } | null;
            if (cit && cit.type === 'web_search_result_location') {
              const index = add(cit.url, cit.title, cit.cited_text);
              if (index !== undefined) blockIndices.add(index);
            }
          }
          for (const index of blockIndices) text += `[${index}]`;
        }
      }
    }

    // Fallback: no per-text citations — surface the raw search result URLs so
    // the source table still renders (no inline markers possible here). A
    // web_search_tool_result_error payload has object (not array) content and
    // is skipped without throwing.
    if (citations.length === 0) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as { type?: string; content?: unknown };
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const r of b.content) {
            const res = r as { type?: string; url?: unknown; title?: unknown } | null;
            if (res && res.type === 'web_search_result') {
              add(res.url, res.title);
            }
          }
        }
      }
    }

    return { text, citations };
  }
  
  private formatMessageContent(message: string, attachments?: MessageAttachment[]): string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> {
    if (!attachments || attachments.length === 0) {
      return message;
    }
    
    const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [{ type: 'text', text: message }];
    
    // Check if current model supports documents
    const capabilities = this.getCapabilities();
    
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: attachment.mimeType || 'image/jpeg',
            data: attachment.base64 || this.extractBase64FromUri(attachment.uri),
          },
        });
      } else if (attachment.type === 'document' && capabilities.supportsDocuments) {
        // Only add document if model supports it
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: attachment.mimeType || 'application/pdf',
            data: attachment.base64 || '',
          },
        });
      }
    }
    
    return content;
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
  
  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const modelId = modelOverride || 
                   resolveModelAlias(this.config.model || getDefaultModel('claude'));
    
    const userContent = this.formatMessageContent(message, attachments);
    const formattedHistory = this.formatHistory(conversationHistory, resumptionContext);
    
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const requestBody: Record<string, unknown> = {
          model: modelId,
          max_tokens: this.config.parameters?.maxTokens || 8192,
          system: this.getSystemPrompt(),
          messages: [
            ...formattedHistory,
            { role: 'user', content: userContent }
          ],
        };

        const sampling = this.resolveSamplingParameters(modelId);
        if (sampling.temperature !== undefined) {
          requestBody.temperature = sampling.temperature;
        }
        if (sampling.topP !== undefined) {
          requestBody.top_p = sampling.topP;
        }
        if (sampling.topK !== undefined) {
          requestBody.top_k = sampling.topK;
        }

        const tools = this.buildWebSearchTools();
        if (tools) {
          requestBody.tools = tools;
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`[ClaudeAdapter] API Error ${response.status} for model ${modelId}:`, errorData);
          
          // Handle overloaded errors with retry
          if (response.status === 529 || response.status === 503 || 
              (errorData.error?.type === 'overloaded_error')) {
            lastError = new Error(`Claude API is temporarily overloaded (attempt ${attempt + 1}/${maxRetries})`);
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
          
          throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        this.lastModelUsed = data.model;

        const { text, citations } = this.buildAnswerFromContent(data.content);

        return {
          response: text,
          modelUsed: data.model,
          finishReason: normalizeFinishReason(data.stop_reason),
          usage: data.usage ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          } : undefined,
          metadata: citations.length > 0 ? { citations } : undefined,
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries - 1) {
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('Failed to send message to Claude');
  }
  
  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string,
    abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    const modelId = modelOverride || 
                   resolveModelAlias(this.config.model || getDefaultModel('claude'));
    
    const userContent = this.formatMessageContent(message, attachments);
    const formattedHistory = this.formatHistory(conversationHistory, resumptionContext);
    
    const requestBodyObj: Record<string, unknown> = {
      model: modelId,
      max_tokens: this.config.parameters?.maxTokens || 8192,
      stream: true,
      system: this.getSystemPrompt(),
      messages: [
        ...formattedHistory,
        { role: 'user', content: userContent }
      ],
    };

    const streamSampling = this.resolveSamplingParameters(modelId);
    if (streamSampling.temperature !== undefined) {
      requestBodyObj.temperature = streamSampling.temperature;
    }
    if (streamSampling.topP !== undefined) {
      requestBodyObj.top_p = streamSampling.topP;
    }

    const webSearchTools = this.buildWebSearchTools();
    if (webSearchTools) {
      requestBodyObj.tools = webSearchTools;
    }

    // Create the request body
    const requestBody = JSON.stringify(requestBodyObj);
    
    
    // Create EventSource for real streaming in React Native
    const es = new EventSource<ClaudeEventTypes>('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: requestBody,
      timeoutBeforeConnection: 0, // Connect immediately
      pollingInterval: 30000, // 30 second polling (shouldn't be needed for streaming)
    });
    
    // Queue to handle SSE events; StreamingService will own pacing/buffering
    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorOccurred: Error | null = null;

    // Push a chunk into the stream (or queue it until the consumer is ready).
    const emitText = (nextText: string) => {
      if (!nextText) return;
      if (resolver) {
        const r = resolver; resolver = null;
        r({ value: nextText, done: false });
      } else {
        eventQueue.push(nextText);
      }
    };

    // Web-search citations accumulated over the stream: citations_delta is the
    // primary source; web_search_tool_result blocks are the URL fallback.
    const streamCitations: Array<{ index: number; url: string; title?: string; snippet?: string }> = [];
    const fallbackCitations: Array<{ index: number; url: string; title?: string }> = [];
    const citationIndexByUrl = new Map<string, number>();
    const seenFallbackUrls = new Set<string>();
    // Indices cited by the in-flight text block. citations_delta can arrive
    // before the block's text deltas, so markers are buffered here and flushed
    // as bare [n] chips at content_block_stop — after the cited span — with the
    // Set collapsing repeat citations of one source within a block.
    const pendingBlockCitations = new Set<number>();
    const flushBlockCitations = () => {
      if (pendingBlockCitations.size === 0) return;
      const markers = Array.from(pendingBlockCitations, (i) => `[${i}]`).join('');
      pendingBlockCitations.clear();
      emitText(markers);
    };
    const emitCitations = () => {
      const citations = streamCitations.length > 0 ? streamCitations : fallbackCitations;
      if (citations.length > 0 && onEvent) {
        try { onEvent({ type: 'citations', citations }); } catch { /* noop */ }
      }
    };

    // Claude sends typed events, not generic 'message' events
    // Handle content_block_delta events for streaming text
    es.addEventListener('content_block_delta', (event: CustomEvent<'content_block_delta'>) => {
      try {
        const data = JSON.parse(event.data || '{}');

        if (data.delta?.type === 'citations_delta') {
          const citation = data.delta.citation as
            | { type?: string; url?: unknown; title?: unknown; cited_text?: unknown }
            | undefined;
          const url = citation && typeof citation.url === 'string' ? citation.url : undefined;
          if (url) {
            let index = citationIndexByUrl.get(url);
            if (index === undefined) {
              index = streamCitations.length + 1;
              citationIndexByUrl.set(url, index);
              streamCitations.push({
                index,
                url,
                ...(typeof citation?.title === 'string' && citation.title ? { title: citation.title } : {}),
                ...(typeof citation?.cited_text === 'string' && citation.cited_text ? { snippet: citation.cited_text } : {}),
              });
            }
            pendingBlockCitations.add(index);
          }
        }

        if (data.delta?.text) {
          // text_delta is incremental and never repeats earlier text, so emit it verbatim.
          // (Trimming "overlap" with the previous delta used to eat real characters:
          // "nar" + "row" became "narow".)
          emitText(data.delta.text);
        }
        if (onEvent) onEvent({ type: 'content_block_delta', ...data });
      } catch (error) {
        console.error('[ClaudeAdapter] Error parsing content_block_delta:', error);
      }
    });
    
    // Mark content block completion (sometimes message_stop can be delayed)
    es.addEventListener('content_block_stop', (event: CustomEvent<'content_block_stop'>) => {
      flushBlockCitations();
      try { if (onEvent) onEvent({ type: 'content_block_stop', ...(event?.data ? JSON.parse(event.data) : {}) }); } catch { /* noop */ }
    });

    // Handle message_stop event for stream completion
    es.addEventListener('message_stop', () => {
      // Safety net in case the final content_block_stop never arrived; the
      // generator drains queued text before honoring isComplete.
      flushBlockCitations();
      // Citations must surface before the generator resolves done so the
      // orchestrator captures them into message metadata.
      emitCitations();
      isComplete = true;
      // Close the stream proactively
      try { es.close(); } catch { /* noop */ }
      if (resolver) {
        resolver({ value: undefined, done: true });
        resolver = null;
      }
    });
    
    // Handle other SSE events
    es.addEventListener('message_start', (event: CustomEvent<'message_start'>) => {
      if (onEvent) {
        try { onEvent({ type: 'message_start', ...(event?.data ? JSON.parse(event.data) : {}) }); } catch { /* noop */ }
      }
    });
    es.addEventListener('content_block_start', (event: CustomEvent<'content_block_start'>) => {
      try {
        const data = event?.data ? JSON.parse(event.data) : {};
        // Search results arrive fully populated in the start event; stash the
        // URLs as fallback citations for when no citations_delta follows.
        const block = data?.content_block as { type?: string; content?: unknown } | undefined;
        if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) {
            const res = r as { type?: string; url?: unknown; title?: unknown } | null;
            const url = res && res.type === 'web_search_result' && typeof res.url === 'string' ? res.url : undefined;
            if (url && !seenFallbackUrls.has(url)) {
              seenFallbackUrls.add(url);
              fallbackCitations.push({
                index: fallbackCitations.length + 1,
                url,
                ...(typeof res?.title === 'string' && res.title ? { title: res.title } : {}),
              });
            }
          }
        }
        if (onEvent) onEvent({ type: 'content_block_start', ...data });
      } catch { /* noop */ }
    });
    // Non-typed events like message_delta aren't declared in ClaudeEventTypes, but react-native-sse can emit them
    // We attach via 'message' and forward if present in payload.
    es.addEventListener('message', (evt: CustomEvent<'message'>) => {
      try {
        const data = evt?.data ? JSON.parse(evt.data) : {};
        const t = data?.type as string | undefined;
        if (t && onEvent) onEvent(data);
        // Claude reports its stop reason on message_delta (e.g. 'max_tokens', 'end_turn', 'refusal').
        const stopReason = data?.delta?.stop_reason as string | undefined;
        if (t === 'message_delta' && stopReason && onEvent) {
          try { onEvent({ type: 'finish', reason: normalizeFinishReason(stopReason) ?? 'stop' }); } catch { /* noop */ }
        }
      } catch { /* ignore parse issues */ }
    });
    es.addEventListener('ping', () => {}); // Keep-alive signals
    
    // Support external cancellation quickly
    const abortHandler = () => {
      try { es.close(); } catch { /* noop */ }
      isComplete = true;
      if (resolver) {
        resolver({ value: undefined, done: true });
        resolver = null;
      }
    };
    if (abortSignal) {
      if (abortSignal.aborted) {
        abortHandler();
      } else {
        abortSignal.addEventListener('abort', abortHandler);
      }
    }

    // Handle errors
    es.addEventListener('error', (error) => {
      console.error('[ClaudeAdapter] SSE error event:', error);

      // Check for Claude-specific error types first
      let errorType: string | undefined;
      try {
        if (error && typeof error === 'object' && 'data' in error) {
          const errorData = JSON.parse((error as { data: string }).data);
          errorType = errorData?.error?.type;
        }
      } catch {
        // Ignore parsing errors
      }

      // Use mapped message for known error types, otherwise extract from event
      const mappedMessage = errorType ? mapErrorTypeToMessage(errorType) : null;
      const errorMessage = mappedMessage || extractSSEErrorMessage(error, 'Connection failed');

      errorOccurred = new Error(errorMessage);
      isComplete = true;
      es.close();

      // Resolve any pending promise to unblock the generator
      if (resolver) {
        resolver({ value: undefined, done: true });
        resolver = null;
      }
    });
    
    // Handle connection open
    es.addEventListener('open', () => {});
    
    // Yield raw deltas promptly; StreamingService will handle pacing/buffering
    try {
      while (!isComplete || eventQueue.length > 0) {
        if (errorOccurred) throw errorOccurred;
        if (eventQueue.length > 0) {
          const chunk = eventQueue.shift()!;
          yield chunk;
          continue;
        }
        // Wait until next event or completion
        const result = await new Promise<IteratorResult<string, void>>((resolve) => { resolver = resolve; });
        if (errorOccurred) throw errorOccurred;
        if (result.done) break;
        if (result.value) yield result.value;
      }
    } finally {
      try { es.close(); } catch { /* noop */ }
      if (abortSignal) {
        try { abortSignal.removeEventListener('abort', abortHandler); } catch { /* noop */ }
      }
    }
  }
}
