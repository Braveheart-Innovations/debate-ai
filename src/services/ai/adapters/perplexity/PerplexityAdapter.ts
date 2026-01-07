import { Message, MessageAttachment } from '../../../../types';
import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig, ResumptionContext, SendMessageResponse } from '../../types/adapter.types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { processPerplexityResponse } from '../../../../utils/responseProcessor';

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
   * Override streamMessage to use non-streaming request + simulated streaming.
   * This approach (matching the web app) ensures we capture citations from Perplexity's response.
   *
   * Perplexity's SSE streaming doesn't include citations in the stream chunks,
   * so we make a non-streaming request to get the full response with citations,
   * then simulate streaming for a better UX.
   */
  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string,
    _abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    // Make non-streaming request to get full response with citations
    const response = await this.sendMessage(
      message,
      conversationHistory,
      resumptionContext,
      attachments,
      modelOverride
    );

    // Extract content and citations from response
    const content = typeof response === 'string' ? response : response.response;
    const citations = typeof response === 'object' ? response.metadata?.citations : undefined;

    // Simulate streaming by yielding content in chunks
    // This provides a smooth typing effect while preserving citation data
    const chunkSize = 8; // Characters per chunk for natural typing feel
    const delayMs = 12; // Delay between chunks

    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      yield chunk;

      // Small delay for natural streaming feel
      if (i + chunkSize < content.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Emit citations via onEvent so they can be captured by the streaming service
    if (citations && citations.length > 0 && onEvent) {
      onEvent({
        type: 'citations',
        citations,
      });
    }
  }
}
