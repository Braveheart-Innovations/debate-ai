import { Message, MessageAttachment } from '../../../../types';
import { BaseAdapter } from '../../base/BaseAdapter';
import {
  ResumptionContext,
  SendMessageResponse,
  AdapterCapabilities
} from '../../types/adapter.types';
import EventSource, { CustomEvent } from 'react-native-sse';

// Define Cohere's SSE event types
type CohereEventTypes = 'message-start' | 'content-start' | 'content-delta' | 'content-end' | 'message-end' | 'message';

export class CohereAdapter extends BaseAdapter {
  getCapabilities(): AdapterCapabilities {
    return {
      streaming: true,
      attachments: false,  // Cohere v2 chat doesn't support attachments yet
      supportsImages: false,
      supportsDocuments: false,
      functionCalling: true,  // Cohere supports tool use
      systemPrompt: true,
      maxTokens: 4096,
      contextWindow: 128000,
    };
  }

  private formatMessagesV2(
    message: string,
    history: Message[],
    resumptionContext?: ResumptionContext
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

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
    messages.push({ role: 'user', content: message });

    return messages;
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    _attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const model = modelOverride || this.config.model || 'command-r-plus';
    const messages = this.formatMessagesV2(message, conversationHistory, resumptionContext);

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
          temperature: this.config.parameters?.temperature || 0.7,
          max_tokens: this.config.parameters?.maxTokens || 2048,
        }),
      });

      if (!response.ok) {
        await this.handleApiError(response, 'Cohere');
      }

      const data = await response.json();

      // v2 API returns message.content array
      const responseText = data.message?.content?.[0]?.text || data.text || '';

      return {
        response: responseText,
        modelUsed: model,
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
    _attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string,
    abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    const model = modelOverride || this.config.model || 'command-r-plus';
    const messages = this.formatMessagesV2(message, conversationHistory, resumptionContext);

    const requestBody = JSON.stringify({
      model,
      messages,
      temperature: this.config.parameters?.temperature || 0.7,
      max_tokens: this.config.parameters?.maxTokens || 2048,
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
      if (onEvent) {
        try { onEvent({ type: 'message-end', ...(event?.data ? JSON.parse(event.data) : {}) }); } catch { /* noop */ }
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

      let errorMessage = 'SSE connection error';
      try {
        if (error && typeof error === 'object' && 'data' in error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorData = JSON.parse((error as any).data);
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        }
      } catch {
        // Use default error message
      }

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