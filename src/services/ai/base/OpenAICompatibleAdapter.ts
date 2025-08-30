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
    
    const messages: FormattedMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user', content: userContent }
    ];
    
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
    
    const messages: FormattedMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user', content: userContent }
    ];
    
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
    
    // Create EventSource - THIS IS REQUIRED FOR REACT NATIVE
    console.warn(`[${this.config.provider}] Creating EventSource connection...`);
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
    
    // Simple accumulator for chunks
    const chunks: string[] = [];
    let isComplete = false;
    let errorOccurred: Error | null = null;
    let lastMessageTime = Date.now();
    
    // Handle message events
    let messageCount = 0;
    es.addEventListener('message', (event) => {
      messageCount++;
      try {
        const line = event.data;
        
        // Log every 50th message to see what's happening
        if (messageCount % 50 === 0 || messageCount <= 5) {
          console.warn(`[${this.config.provider}] Message ${messageCount}:`, line?.substring(0, 100));
        }
        
        if (line === '[DONE]') {
          console.warn(`[${this.config.provider}] Received [DONE] signal`);
          isComplete = true;
          es.close();
          return;
        }
        
        const data = JSON.parse(line || '{}');
        const content = data.choices?.[0]?.delta?.content;
        const finishReason = data.choices?.[0]?.finish_reason;
        
        if (content) {
          chunks.push(content);
          lastMessageTime = Date.now();
        }
        
        if (finishReason) {
          console.warn(`[${this.config.provider}] Finish reason: ${finishReason}`);
          isComplete = true;
          es.close();
        }
        
        // Check for empty delta which might indicate end
        if (data.choices?.[0]?.delta && Object.keys(data.choices[0].delta).length === 0 && !content) {
          console.warn(`[${this.config.provider}] Empty delta detected, might be end of stream`);
        }
      } catch (error) {
        console.error(`[${this.config.provider}] Error parsing SSE data:`, error);
      }
    });
    
    // Handle errors
    es.addEventListener('error', (error) => {
      console.error(`[${this.config.provider}] SSE error:`, error);
      errorOccurred = new Error(String(error));
      isComplete = true;
      es.close();
    });
    
    // Handle connection open
    es.addEventListener('open', () => {
      console.warn(`[${this.config.provider}] SSE connection opened`);
    });
    
    // Yield chunks with immediate first chunk for responsiveness
    let lastYieldIndex = 0;
    let iterations = 0;
    let firstChunk = true;
    
    try {
      while (!isComplete || lastYieldIndex < chunks.length) {
        iterations++;
        
        if (errorOccurred) {
          throw errorOccurred;
        }
        
        // Yield all accumulated chunks
        while (lastYieldIndex < chunks.length) {
          const chunk = chunks[lastYieldIndex];
          lastYieldIndex++;
          
          // Immediate first chunk for responsiveness
          if (firstChunk) {
            yield chunk;
            firstChunk = false;
            continue;
          }
          
          yield chunk;
        }
        
        // If stream isn't complete, wait for more chunks
        if (!isComplete) {
          // Check for idle timeout
          const idleTime = Date.now() - lastMessageTime;
          if (idleTime > 10000 && chunks.length > 0) {
            console.warn(`[${this.config.provider}] No new messages for ${idleTime}ms, ending stream`);
            break;
          }
          
          // Shorter initial delay for responsiveness, then normal accumulation
          const waitTime = firstChunk ? 10 : 50;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    } finally {
      console.warn(`[${this.config.provider}] Stream complete. Messages: ${messageCount}, Chunks: ${chunks.length}, Iterations: ${iterations}`);
      es.close();
    }
  }
}