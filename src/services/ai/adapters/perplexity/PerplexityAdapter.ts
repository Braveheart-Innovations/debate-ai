import { Message, MessageAttachment } from '../../../../types';
import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig, ResumptionContext, SendMessageResponse, FormattedMessage } from '../../types/adapter.types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { processPerplexityResponse } from '../../../../utils/responseProcessor';
import EventSource from 'react-native-sse';

// Perplexity-specific content part types
type PerplexityContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file_url'; file_url: { url: string }; file_name?: string };

export class PerplexityAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    return {
      baseUrl: 'https://api.perplexity.ai',
      defaultModel: 'sonar',  // Updated to working model
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      }),
      capabilities: {
        streaming: true,
        attachments: true,  // Supports images and documents
        supportsImages: true,  // Vision supported via image_url
        supportsDocuments: true,  // Documents supported via file_url with raw base64
        functionCalling: false,
        systemPrompt: true,
        maxTokens: 4096,
        contextWindow: 200000,
      },
    };
  }

  /**
   * Override formatUserMessage to use Perplexity-specific format for attachments.
   * Perplexity uses:
   * - image_url for images (with data: URL format)
   * - file_url for documents (with RAW base64, NO data: prefix)
   *
   * This ensures both sendMessage and streamMessage handle attachments correctly.
   */
  protected formatUserMessage(
    message: string,
    attachments?: MessageAttachment[]
  ): string | PerplexityContentPart[] {
    if (!attachments || attachments.length === 0) {
      return message;
    }

    const contentArray: PerplexityContentPart[] = [];

    // Add images first (use data URL format with base64)
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        const imageUrl = attachment.base64
          ? `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.base64}`
          : attachment.uri;

        contentArray.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      }
    }

    // Add documents (use raw base64 without data: prefix per Perplexity docs)
    for (const attachment of attachments) {
      if (attachment.type === 'document' && attachment.base64) {
        contentArray.push({
          type: 'file_url',
          file_url: { url: attachment.base64 }, // Raw base64, no data: prefix
          file_name: attachment.fileName || 'document.pdf',
        });
      }
    }

    // Add text content last
    contentArray.push({ type: 'text', text: message });

    return contentArray;
  }

  /**
   * Override sendMessage to add Perplexity-specific parameters and process citations.
   * Uses the overridden formatUserMessage for attachment handling.
   */
  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const config = this.getProviderConfig();
    const resolvedModel = modelOverride ||
                         resolveModelAlias(this.config.model || getDefaultModel(this.config.provider));

    // Use our overridden formatUserMessage for proper Perplexity attachment format
    const userContent = this.formatUserMessage(message, attachments);

    const messages = [
      { role: 'system' as const, content: this.getSystemPrompt() },
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user' as const, content: userContent }
    ];

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: config.headers(this.config.apiKey),
        body: JSON.stringify({
          model: resolvedModel,
          messages,
          temperature: this.config.parameters?.temperature || 0.7,
          max_tokens: this.config.parameters?.maxTokens || 2048,
          top_p: this.config.parameters?.topP,
          stream: false,
          // Perplexity-specific parameters
          return_citations: true,  // Include source citations
          search_recency_filter: 'month',  // Default to recent results
        }),
      });

      if (!response.ok) {
        await this.handleApiError(response, 'Perplexity');
      }

      const data = await response.json();

      // Process response to extract citations
      const rawContent = data.choices[0].message.content || '';
      const processed = processPerplexityResponse(
        rawContent,
        data.citations,
        data.search_results
      );

      return {
        response: processed.content,
        modelUsed: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
        metadata: {
          citations: processed.citations,
        },
      };
    } catch (error) {
      console.error('Error in Perplexity adapter:', error);
      throw error;
    }
  }

  /**
   * Override streamMessage to use Perplexity-specific attachment format.
   * The base class streamMessage doesn't properly use our formatUserMessage override,
   * so we need to fully override the streaming implementation.
   */
  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string
  ): AsyncGenerator<string, void, unknown> {
    const config = this.getProviderConfig();
    const resolvedModel = modelOverride ||
                         resolveModelAlias(this.config.model || getDefaultModel(this.config.provider));

    // Use our formatUserMessage for proper Perplexity attachment format
    const userContent = this.formatUserMessage(message, attachments);

    // Build history with alternation safeguards
    const history = this.formatHistory(conversationHistory, resumptionContext);

    // Ensure first after system is user
    if (history.length > 0 && history[0].role === 'assistant') {
      const first = history[0];
      if (typeof first.content === 'string') {
        history[0] = { role: 'user', content: `[Previous assistant] ${first.content}` };
      } else {
        history[0] = { role: 'user', content: first.content };
      }
    }

    // Compose messages
    const messages: FormattedMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history,
    ];

    // Handle merging with last user message or adding new one
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      if (typeof last.content === 'string' && typeof userContent === 'string') {
        last.content = `${last.content}\n\n${userContent}`;
      } else if (Array.isArray(userContent)) {
        if (typeof last.content === 'string') {
          last.content = [{ type: 'text', text: last.content }, ...userContent];
        } else if (Array.isArray(last.content)) {
          last.content = [...last.content, ...userContent];
        }
      } else if (typeof userContent === 'string' && Array.isArray(last.content)) {
        last.content = [...last.content, { type: 'text', text: userContent }];
      }
    } else {
      messages.push({ role: 'user', content: userContent });
    }

    const requestBody = JSON.stringify({
      model: resolvedModel,
      messages,
      temperature: this.config.parameters?.temperature || 0.7,
      max_tokens: this.config.parameters?.maxTokens || 2048,
      top_p: this.config.parameters?.topP,
      stream: true,
      // Perplexity-specific parameters
      return_citations: true,
      search_recency_filter: 'month',
    });

    const headers = config.headers(this.config.apiKey);

    // Create EventSource for SSE streaming
    const es = new EventSource(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
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
        if (line === '[DONE]') {
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
          return;
        }
        const data = JSON.parse(line || '{}');
        const content = data.choices?.[0]?.delta?.content as string | undefined;
        const finishReason = data.choices?.[0]?.finish_reason as string | undefined;
        if (content) {
          if (resolver) { const r = resolver; resolver = null; r({ value: content, done: false }); }
          else eventQueue.push(content);
        }
        if (finishReason) {
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        }
      } catch (error) {
        console.error('[Perplexity] Error parsing SSE data:', error);
      }
    });

    es.addEventListener('error', (error) => {
      errorOccurred = new Error(String(error));
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
