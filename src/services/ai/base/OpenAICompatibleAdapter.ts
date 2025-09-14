import { Message, MessageAttachment } from '../../../types';
import { getDefaultModel, resolveModelAlias } from '../../../config/providers/modelRegistry';
import { BaseAdapter } from './BaseAdapter';
import { 
  ResumptionContext, 
  SendMessageResponse,
  FormattedMessage,
  AdapterCapabilities,
  ProviderConfig 
} from '../types/adapter.types';
import EventSource from 'react-native-sse';

export abstract class OpenAICompatibleAdapter extends BaseAdapter {
  protected abstract getProviderConfig(): ProviderConfig;
  
  getCapabilities(): AdapterCapabilities {
    return this.getProviderConfig().capabilities;
  }
  
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
    
    const userContent = await Promise.resolve(this.formatUserMessage(message, attachments));

    // Build history with alternation safeguards
    const history = this.formatHistory(conversationHistory, resumptionContext);

    // Ensure first after system is user: if leading assistant, convert to user with attribution
    if (history.length > 0 && history[0].role === 'assistant') {
      const first = history[0];
      if (typeof first.content === 'string') {
        history[0] = { role: 'user', content: `[Previous assistant] ${first.content}` };
      } else {
        history[0] = { role: 'user', content: first.content };
      }
    }

    // Compose messages, merging consecutive user with the new user content
    const messages: FormattedMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history,
    ];

    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      // Merge userContent into last user message
      if (typeof last.content === 'string' && typeof userContent === 'string') {
        last.content = `${last.content}\n\n${userContent}`;
      } else if (Array.isArray(userContent)) {
        // Convert string content to array parts if needed
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
    
    try {
      const requestBody: Record<string, unknown> = {
        model: resolvedModel,
        messages,
        temperature: this.config.parameters?.temperature || 0.7,
        stream: false,
      };
      
      // Only set optional parameters if provided
      if (this.config.parameters?.maxTokens) {
        requestBody.max_tokens = this.config.parameters.maxTokens;
      }
      if (this.config.parameters?.topP !== undefined) {
        requestBody.top_p = this.config.parameters.topP;
      }
      
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: config.headers(this.config.apiKey),
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        await this.handleApiError(response, this.config.provider);
      }
      
      const data = await response.json();
      
      return {
        response: data.choices[0].message.content,
        modelUsed: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      console.error(`Error in ${this.config.provider} adapter:`, error);
      throw error;
    }
  }
  
  protected formatUserMessage(message: string, attachments?: MessageAttachment[]): string | Array<{ type: string; text?: string; image_url?: { url: string }; file?: { file_name: string; file_data: string } }> | Promise<string | Array<{ type: string; text?: string; image_url?: { url: string }; file?: { file_name: string; file_data: string } }>> {
    if (!attachments || attachments.length === 0) {
      return message;
    }
    
    const capabilities = this.getCapabilities();
    if (!capabilities.attachments) {
      return message;
    }
    
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string }; file?: { file_name: string; file_data: string } }> = [{ type: 'text', text: message }];
    
    for (const attachment of attachments) {
      if (attachment.type === 'image' && capabilities.supportsImages) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: attachment.uri.startsWith('data:') 
              ? attachment.uri 
              : `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.base64}`
          }
        });
      } else if (attachment.type === 'document' && capabilities.supportsDocuments) {
        // Document support is disabled in base class
        // Each provider must override formatUserMessage to implement their own document handling
        console.warn(`[${this.config.provider}] Document support not implemented in base adapter`);
        contentParts.push({
          type: 'text',
          text: `[Document attachments not supported for ${this.config.provider}]`
        });
      }
    }
    
    return contentParts;
  }
  
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
    
    const userContent = await Promise.resolve(this.formatUserMessage(message, attachments));

    // Build history with alternation safeguards
    const history = this.formatHistory(conversationHistory, resumptionContext);

    // Ensure first after system is user: if leading assistant, convert to user with attribution
    if (history.length > 0 && history[0].role === 'assistant') {
      const first = history[0];
      if (typeof first.content === 'string') {
        history[0] = { role: 'user', content: `[Previous assistant] ${first.content}` };
      } else {
        history[0] = { role: 'user', content: first.content };
      }
    }

    // Compose messages, merging consecutive user with the new user content
    const messages: FormattedMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history,
    ];

    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      // Merge userContent into last user message
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
    
    // Build request body with proper token parameter handling
    const requestBodyObj: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      stream: true,
    };
    
    // Check if this is an OpenAI provider and model requires special handling
    if (this.config.provider === 'openai') {
      // Import getModelById for OpenAI model config checking
      const { getModelById } = await import('../../../config/modelConfigs');
      const modelConfig = getModelById('openai', resolvedModel);
      
      const isO1Model = resolvedModel.startsWith('o1');
      const isGPT5Model = resolvedModel.startsWith('gpt-5');
      
      // Handle temperature requirements
      if (modelConfig?.requiresTemperature1 || isGPT5Model || isO1Model) {
        // GPT-5 and O1 models require temperature=1
        requestBodyObj.temperature = 1;
      } else {
        requestBodyObj.temperature = this.config.parameters?.temperature || 0.7;
      }
      
      // Handle token parameter - GPT-5 and O1 use max_completion_tokens, others use max_tokens
      if (isGPT5Model || isO1Model) {
        // Don't set a default - let OpenAI use its own defaults
        if (this.config.parameters?.maxTokens) {
          requestBodyObj.max_completion_tokens = this.config.parameters.maxTokens;
        }
      } else if (this.config.parameters?.maxTokens) {
        requestBodyObj.max_tokens = this.config.parameters.maxTokens;
      }
    } else {
      // Non-OpenAI providers use standard parameters
      requestBodyObj.temperature = this.config.parameters?.temperature || 0.7;
      // Only set max_tokens if explicitly configured
      if (this.config.parameters?.maxTokens) {
        requestBodyObj.max_tokens = this.config.parameters.maxTokens;
      }
    }
    
    const requestBody = JSON.stringify(requestBodyObj);
    const headers = config.headers(this.config.apiKey);
    
    // Create EventSource - React Native SSE
    const es = new EventSource(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: requestBody,
      timeoutBeforeConnection: 0, // Connect immediately like Claude
      pollingInterval: 30000, // 30 second polling like Claude
      withCredentials: false,
    });
    // Queue-based streaming: adapters yield raw deltas; StreamingService owns pacing
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
        console.error(`[${this.config.provider}] Error parsing SSE data:`, error);
      }
    });

    // Handle errors
    es.addEventListener('error', (error) => {
      errorOccurred = new Error(String(error));
      isComplete = true;
      try { es.close(); } catch { /* noop */ }
      if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
    });

    // Connection open (no-op)
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
