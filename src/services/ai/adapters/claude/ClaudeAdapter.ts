import { Message, MessageAttachment } from '../../../../types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { BaseAdapter } from '../../base/BaseAdapter';
import { 
  ResumptionContext, 
  SendMessageResponse,
  AdapterCapabilities 
} from '../../types/adapter.types';
import EventSource, { CustomEvent } from 'react-native-sse';

// Define Claude's custom SSE event types
type ClaudeEventTypes = 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_stop' | 'ping';

export class ClaudeAdapter extends BaseAdapter {
  private lastModelUsed?: string;
  
  getCapabilities(): AdapterCapabilities {
    // Check if the current model supports documents (PDFs)
    const model = this.config.model || 'claude-3-7-sonnet-20250219';
    const supportsDocuments = ![
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307'
    ].includes(model);
    
    return {
      streaming: true,
      attachments: true,  // All Claude models support at least images
      supportsImages: true,  // All Claude models support images
      supportsDocuments,  // Most models support PDFs, except older ones
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 8192,
      contextWindow: 200000,
    };
  }
  
  public getLastModelUsed(): string | undefined {
    return this.lastModelUsed;
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
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: this.config.parameters?.maxTokens || 8192, // Claude requires this, use maximum
            temperature: this.config.parameters?.temperature || 0.7,
            top_p: this.config.parameters?.topP,
            top_k: this.config.parameters?.topK,
            system: this.getSystemPrompt(),
            messages: [
              ...formattedHistory,
              { role: 'user', content: userContent }
            ],
          }),
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
        
        return {
          response: data.content[0].text,
          modelUsed: data.model,
          usage: data.usage ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          } : undefined,
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
    modelOverride?: string
  ): AsyncGenerator<string, void, unknown> {
    const modelId = modelOverride || 
                   resolveModelAlias(this.config.model || getDefaultModel('claude'));
    
    const userContent = this.formatMessageContent(message, attachments);
    const formattedHistory = this.formatHistory(conversationHistory, resumptionContext);
    
    // Create the request body
    const requestBody = JSON.stringify({
      model: modelId,
      max_tokens: this.config.parameters?.maxTokens || 8192, // Claude requires this, use maximum
      temperature: this.config.parameters?.temperature || 0.7,
      stream: true,
      system: this.getSystemPrompt(),
      messages: [
        ...formattedHistory,
        { role: 'user', content: userContent }
      ],
    });
    
    
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
    
    // Queue to handle SSE events
    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorOccurred: Error | null = null;
    
    // Claude sends typed events, not generic 'message' events
    // Handle content_block_delta events for streaming text
    es.addEventListener('content_block_delta', (event: CustomEvent<'content_block_delta'>) => {
      try {
        const data = JSON.parse(event.data || '{}');
          
        if (data.delta?.text) {
          if (resolver) {
            resolver({ value: data.delta.text, done: false });
            resolver = null;
          } else {
            eventQueue.push(data.delta.text);
          }
        }
      } catch (error) {
        console.error('[ClaudeAdapter] Error parsing content_block_delta:', error);
      }
    });
    
    // Handle message_stop event for stream completion
    es.addEventListener('message_stop', () => {
      isComplete = true;
      if (resolver) {
        resolver({ value: undefined, done: true });
        resolver = null;
      }
    });
    
    // Handle other SSE events
    es.addEventListener('message_start', () => {});
    es.addEventListener('content_block_start', () => {});
    es.addEventListener('content_block_stop', () => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    es.addEventListener('ping' as any, () => {}); // Keep-alive signals
    
    // Handle errors
    es.addEventListener('error', (error) => {
      console.error('[ClaudeAdapter] SSE error event:', error);
      
      // Parse the error data to check for specific error types
      let errorMessage = 'SSE connection error';
      let isOverloaded = false;
      
      try {
        if (error && typeof error === 'object' && 'data' in error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorData = JSON.parse((error as any).data);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorMessage;
            isOverloaded = errorData.error.type === 'overloaded_error';
          }
        }
      } catch {
        // If we can't parse the error, use the default message
      }
      
      // Create appropriate error with user-friendly message
      if (isOverloaded) {
        errorOccurred = new Error(`Claude is temporarily overloaded. The service will retry automatically.`);
      } else if (errorMessage.includes('rate_limit')) {
        errorOccurred = new Error(`Rate limit reached. Please wait a moment before trying again.`);
      } else if (errorMessage.includes('authentication') || errorMessage.includes('api_key')) {
        errorOccurred = new Error(`Authentication failed. Please check your API key in Settings.`);
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        errorOccurred = new Error(`Connection error. Please check your internet connection.`);
      } else {
        errorOccurred = new Error(errorMessage);
      }
      
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
    
    // Yield chunks as they arrive
    let yieldCount = 0;
    
    try {
      while (!isComplete) {
        // Check for errors immediately
        if (errorOccurred) {
          console.error(`[ClaudeAdapter] Error occurred, throwing:`, (errorOccurred as Error).message);
          throw errorOccurred;
        }
        
        if (eventQueue.length > 0) {
          const chunk = eventQueue.shift()!;
          yieldCount++;
          yield chunk;
        } else {
          // Wait for next event
          const result = await new Promise<IteratorResult<string, void>>((resolve) => {
            resolver = resolve;
            // Set a timeout to prevent hanging
            setTimeout(() => {
              if (resolver === resolve) {
                resolve({ value: undefined, done: true });
                resolver = null;
                isComplete = true;
              }
            }, 30000); // 30 second timeout
          });
          
          // Check for errors after waiting
          if (errorOccurred) {
            console.error(`[ClaudeAdapter] Error occurred after waiting, throwing:`, (errorOccurred as Error).message);
            throw errorOccurred;
          }
          
          if (!result.done && result.value) {
            yieldCount++;
            yield result.value;
          }
        }
      }
      
      // Final error check before completing
      if (errorOccurred && yieldCount === 0) {
        throw errorOccurred;
      }
      
    } finally {
      es.close();
    }
  }
}