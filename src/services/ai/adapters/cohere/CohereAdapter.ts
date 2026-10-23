import { Message, MessageAttachment } from '../../../../types';
import { getModelById } from '../../../../config/modelConfigs';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { BaseAdapter } from '../../base/BaseAdapter';
import {
  ResumptionContext,
  SendMessageResponse,
  AdapterCapabilities
} from '../../types/adapter.types';
import EventSource, { CustomEvent } from 'react-native-sse';
import { extractSSEErrorMessage } from '../../utils/extractSSEErrorMessage';
import { normalizeFinishReason } from '../../utils/normalizeFinishReason';

// Define Cohere's SSE event types
type CohereEventTypes = 'message-start' | 'content-start' | 'content-delta' | 'content-end' | 'message-end' | 'message';
type CohereContentPart = { type?: string; text?: string };
type CohereRequestContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
type CohereChatResponse = {
  message?: {
    content?: CohereContentPart[];
  };
  text?: string;
  finish_reason?: string;
};

export class CohereAdapter extends BaseAdapter {
  private extractResponseText(data: CohereChatResponse): string {
    const content = data.message?.content;
    if (Array.isArray(content)) {
      return content
        .filter((part) => typeof part?.text === 'string')
        .map((part) => part.text)
        .join('');
    }

    return data.text || '';
  }

  private resolveModel(modelOverride?: string): string {
    return modelOverride || resolveModelAlias(this.config.model || getDefaultModel('cohere'));
  }

  private modelSupportsImageInput(model: string): boolean {
    const modelConfig = getModelById('cohere', model);
    return Boolean(modelConfig?.supportsImageInput || modelConfig?.supportsVision);
  }

  private formatImageUrl(attachment: MessageAttachment): string | null {
    if (attachment.uri?.startsWith('data:') || attachment.uri?.startsWith('http')) {
      return attachment.uri;
    }

    if (attachment.base64) {
      return `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.base64}`;
    }

    return null;
  }

  private formatUserContent(
    message: string,
    attachments: MessageAttachment[] | undefined,
    model: string
  ): string | CohereRequestContentPart[] {
    if (!attachments?.length || !this.modelSupportsImageInput(model)) {
      return message;
    }

    const imageParts = attachments
      .filter((attachment) => attachment.type === 'image')
      .map((attachment) => {
        const url = this.formatImageUrl(attachment);
        return url ? ({ type: 'image_url' as const, image_url: { url } }) : null;
      })
      .filter((part): part is { type: 'image_url'; image_url: { url: string } } => part !== null);

    if (imageParts.length === 0) {
      return message;
    }

    return [
      { type: 'text', text: message },
      ...imageParts,
    ];
  }

  getCapabilities(): AdapterCapabilities {
    const model = this.resolveModel();
    const modelConfig = getModelById('cohere', model);
    const supportsImages = this.modelSupportsImageInput(model);

    return {
      streaming: true,
      attachments: supportsImages,
      supportsImages,
      supportsDocuments: false,
      functionCalling: true,  // Cohere supports tool use
      systemPrompt: true,
      maxTokens: modelConfig?.maxOutputTokens || 4096,
      contextWindow: modelConfig?.contextLength || 128000,
    };
  }

  private formatMessagesV2(
    message: string,
    history: Message[],
    resumptionContext: ResumptionContext | undefined,
    attachments: MessageAttachment[] | undefined,
    model: string
  ): Array<{ role: string; content: string | CohereRequestContentPart[] }> {
    const messages: Array<{ role: string; content: string | CohereRequestContentPart[] }> = [];

    // Add system message
    const systemPrompt = this.getSystemPrompt();
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add formatted history
    const formattedHistory = this.formatHistory(history, resumptionContext);
    for (const msg of formattedHistory) {
      messages.push({
        role: msg.role,
        content: msg.content as string,
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: this.formatUserContent(message, attachments, model) });

    return messages;
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const model = this.resolveModel(modelOverride);
    const messages = this.formatMessagesV2(message, conversationHistory, resumptionContext, attachments, model);

    try {
      const response = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: this.resolveSamplingParameters(model).temperature ?? 0.7,
          // Only a limit the user set; v2/chat takes none (live-verified
          // 2026-10-23) and then runs to the model's own limit.
          max_tokens: this.config.parameters?.maxTokens,
        }),
      });

      if (!response.ok) {
        await this.handleApiError(response, 'Cohere');
      }

      const data = await response.json();

      const responseText = this.extractResponseText(data);

      return {
        response: responseText,
        modelUsed: model,
        finishReason: normalizeFinishReason(data.finish_reason),
        usage: data.usage ? {
          promptTokens: data.usage.tokens?.input_tokens || data.usage.billed_units?.input_tokens,
          completionTokens: data.usage.tokens?.output_tokens || data.usage.billed_units?.output_tokens,
          totalTokens: data.usage.tokens?.total_tokens,
        } : undefined,
      };
    } catch (error) {
      console.error('Error in CohereAdapter:', error);
      throw error;
    }
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
    const model = this.resolveModel(modelOverride);
    const messages = this.formatMessagesV2(message, conversationHistory, resumptionContext, attachments, model);

    const requestBody = JSON.stringify({
      model,
      messages,
      temperature: this.resolveSamplingParameters(model).temperature ?? 0.7,
      max_tokens: this.config.parameters?.maxTokens,
      stream: true,
    });

    // Create EventSource for SSE streaming with typed events
    const es = new EventSource<CohereEventTypes>('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: requestBody,
      timeoutBeforeConnection: 0,
      pollingInterval: 30000,
    });

    // Queue-based streaming
    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorOccurred: Error | null = null;

    // Handle abort signal
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

    // Handle content-delta events (named SSE event type)
    es.addEventListener('content-delta', (event: CustomEvent<'content-delta'>) => {
      try {
        const data = JSON.parse(event.data || '{}');

        if (onEvent) {
          try { onEvent({ type: 'content-delta', ...data }); } catch { /* noop */ }
        }

        // Extract text from delta - Cohere v2 format
        const text = data.delta?.message?.content?.text;
        if (text) {
          if (resolver) {
            const r = resolver;
            resolver = null;
            r({ value: text, done: false });
          } else {
            eventQueue.push(text);
          }
        }
      } catch (parseError) {
        console.error('[CohereAdapter] Error parsing content-delta:', parseError);
      }
    });

    // Handle message-end event for stream completion
    es.addEventListener('message-end', (event: CustomEvent<'message-end'>) => {
      let parsed: Record<string, unknown> = {};
      try { parsed = event?.data ? JSON.parse(event.data) : {}; } catch { /* noop */ }
      if (onEvent) {
        try { onEvent({ type: 'message-end', ...parsed }); } catch { /* noop */ }
        // Cohere v2 carries the stop reason on `delta.finish_reason` (e.g. MAX_TOKENS, COMPLETE).
        // message-end is a definitive completion, so absence of a reason means a normal stop.
        const rawFinish = (parsed?.delta as { finish_reason?: string } | undefined)?.finish_reason
          ?? (parsed as { finish_reason?: string }).finish_reason;
        try { onEvent({ type: 'finish', reason: normalizeFinishReason(rawFinish) ?? 'stop' }); } catch { /* noop */ }
      }
      isComplete = true;
      try { es.close(); } catch { /* noop */ }
      if (resolver) {
        resolver({ value: undefined, done: true });
        resolver = null;
      }
    });

    // Handle other event types for debugging/forwarding
    es.addEventListener('message-start', (event: CustomEvent<'message-start'>) => {
      if (onEvent) {
        try { onEvent({ type: 'message-start', ...(event?.data ? JSON.parse(event.data) : {}) }); } catch { /* noop */ }
      }
    });

    es.addEventListener('content-start', (event: CustomEvent<'content-start'>) => {
      if (onEvent) {
        try { onEvent({ type: 'content-start', ...(event?.data ? JSON.parse(event.data) : {}) }); } catch { /* noop */ }
      }
    });

    es.addEventListener('content-end', (event: CustomEvent<'content-end'>) => {
      if (onEvent) {
        try { onEvent({ type: 'content-end', ...(event?.data ? JSON.parse(event.data) : {}) }); } catch { /* noop */ }
      }
    });

    // Fallback: handle generic 'message' events in case server sends them
    es.addEventListener('message', (event: CustomEvent<'message'>) => {
      try {
        const dataStr = event.data;
        if (!dataStr || dataStr === '[DONE]') {
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) {
            resolver({ value: undefined, done: true });
            resolver = null;
          }
          return;
        }

        const data = JSON.parse(dataStr);
        if (onEvent) {
          try { onEvent(data); } catch { /* noop */ }
        }

        // Handle content-delta in case it comes via message event
        if (data.type === 'content-delta' && data.delta?.message?.content?.text) {
          const text = data.delta.message.content.text;
          if (resolver) {
            const r = resolver;
            resolver = null;
            r({ value: text, done: false });
          } else {
            eventQueue.push(text);
          }
        }

        if (data.type === 'message-end') {
          if (onEvent) {
            const rawFinish = data.delta?.finish_reason ?? data.finish_reason;
            try { onEvent({ type: 'finish', reason: normalizeFinishReason(rawFinish) ?? 'stop' }); } catch { /* noop */ }
          }
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) {
            resolver({ value: undefined, done: true });
            resolver = null;
          }
        }
      } catch (parseError) {
        console.error('[CohereAdapter] Error parsing message event:', parseError);
      }
    });

    // Handle errors
    es.addEventListener('error', (error) => {
      console.error('[CohereAdapter] SSE error:', error);
      const errorMessage = extractSSEErrorMessage(error, 'Connection failed');
      errorOccurred = new Error(errorMessage);
      isComplete = true;
      try { es.close(); } catch { /* noop */ }

      if (resolver) {
        resolver({ value: undefined, done: true });
        resolver = null;
      }
    });

    // Handle connection open
    es.addEventListener('open', () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CohereAdapter] SSE connection opened');
      }
    });

    // Yield chunks from the queue
    try {
      while (!isComplete || eventQueue.length > 0) {
        if (errorOccurred) throw errorOccurred;
        if (eventQueue.length > 0) {
          const chunk = eventQueue.shift()!;
          yield chunk;
          continue;
        }
        // Wait for next event or completion
        const result = await new Promise<IteratorResult<string, void>>((resolve) => {
          resolver = resolve;
        });
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
