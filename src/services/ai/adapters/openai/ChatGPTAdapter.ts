import { Message, MessageAttachment } from '../../../../types';
import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig, ResumptionContext, SendMessageResponse } from '../../types/adapter.types';
import { getModelById } from '../../../../config/modelConfigs';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import EventSource from 'react-native-sse';

export class ChatGPTAdapter extends OpenAICompatibleAdapter {
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[ChatGPT] API test failed:', response.status, error);
        return false;
      }
      
      const data = await response.json();
      // Log success for debugging
      if (process.env.NODE_ENV === 'development') {
        const models = data.data?.map((m: { id: string }) => m.id).slice(0, 5);
        console.warn('[ChatGPT] API test successful. Sample models:', models);
      }
      return true;
    } catch (error) {
      console.error('[ChatGPT] Connection test error:', error);
      return false;
    }
  }
  
  protected getProviderConfig(): ProviderConfig {
    // Check if the model supports vision (images only, not PDFs)
    const model = this.config.model || 'gpt-5';
    const supportsImages = model.startsWith('gpt-4o') || 
                          model.startsWith('gpt-4-turbo') ||
                          model.startsWith('gpt-4-vision') ||
                          model.startsWith('gpt-5') || 
                          model.startsWith('o1');
    
    return {
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5',  // Updated to GPT-5 as default
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
      capabilities: {
        streaming: true,
        attachments: supportsImages,  // Only if model supports vision
        supportsImages,  // Supported via multimodal models
        supportsDocuments: false,  // Chat Completions API doesn't support PDFs
        functionCalling: true,
        systemPrompt: true,
        maxTokens: 128000,  // GPT-5 max output
        contextWindow: 272000,  // GPT-5 context
      },
    };
  }
  
  /**
   * Override formatUserMessage to handle images for OpenAI
   * Note: PDFs are not supported by Chat Completions API
   */
  protected formatUserMessage(
    message: string,
    attachments?: MessageAttachment[]
  ): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    if (!attachments || attachments.length === 0) {
      return message;
    }
    
    const capabilities = this.getCapabilities();
    if (!capabilities.attachments) {
      return message;
    }
    
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: message }
    ];
    
    let hasUnsupportedDocs = false;
    
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        // Images are supported via vision API
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: attachment.uri.startsWith('data:') 
              ? attachment.uri 
              : `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.base64}`
          }
        });
      } else if (attachment.type === 'document') {
        // PDFs are not supported by Chat Completions API
        hasUnsupportedDocs = true;
      }
    }
    
    // Add a note about unsupported documents
    if (hasUnsupportedDocs) {
      contentParts.push({
        type: 'text',
        text: '\n\n[Note: PDF documents cannot be processed via the API. Please copy and paste the text content instead, or use the ChatGPT web interface which supports PDF uploads.]'
      });
    }
    
    return contentParts;
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
    
    // Get model configuration to check for special requirements
    const modelConfig = getModelById('openai', resolvedModel);
    
    // O1 models don't support system messages
    const isO1Model = resolvedModel.startsWith('o1');
    
    // Format user message (images only, PDFs not supported)
    const userContent = this.formatUserMessage(message, attachments);
    
    const messages = isO1Model ? [
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user' as const, content: userContent }
    ] : [
      { role: 'system' as const, content: this.getSystemPrompt() },
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user' as const, content: userContent }
    ];
    
    // Build request body based on model requirements
    const requestBody: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      stream: false,
    };
    
    // Handle special model requirements
    if (modelConfig?.requiresTemperature1 || isO1Model) {
      // GPT-5 and O1 models require temperature=1
      requestBody.temperature = 1;
    } else {
      requestBody.temperature = this.config.parameters?.temperature || 0.7;
    }
    
    // Handle token limits - GPT-5 and O1 use max_completion_tokens, others use max_tokens
    const isGPT5 = resolvedModel.startsWith('gpt-5');
    if (isGPT5 || isO1Model) {
      // Don't set a default - let OpenAI use its own defaults
      if (this.config.parameters?.maxTokens) {
        requestBody.max_completion_tokens = this.config.parameters.maxTokens;
      }
    } else if (this.config.parameters?.maxTokens) {
      requestBody.max_tokens = this.config.parameters.maxTokens;
    }
    
    // Add other parameters only if not restricted by model
    if (!modelConfig?.requiresTemperature1) {
      if (this.config.parameters?.topP !== undefined) {
        requestBody.top_p = this.config.parameters.topP;
      }
    }
    
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: config.headers(this.config.apiKey),
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        await this.handleApiError(response, 'OpenAI');
      }
      
      const data = await response.json();
      
      return {
        response: data.choices[0].message.content || '',
        modelUsed: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      console.error(`Error in OpenAI adapter:`, error);
      throw error;
    }
  }
  
  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string
  ): AsyncGenerator<string, void, unknown> {
    // Test connection first if in debug mode
    if (process.env.NODE_ENV === 'development') {
      await this.testConnection();
    }
    
    try {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ChatGPT] Starting streaming with model:', modelOverride || this.config.model);
      }
      
      // We need to handle file uploads before streaming
      const config = this.getProviderConfig();
      const resolvedModel = modelOverride || 
                           resolveModelAlias(this.config.model || getDefaultModel(this.config.provider));
      
      // Get model configuration
      const modelConfig = getModelById('openai', resolvedModel);
      const isO1Model = resolvedModel.startsWith('o1');
      const isGPT5Model = resolvedModel.startsWith('gpt-5');
      
      // Format user message (images only, PDFs not supported)
      const userContent = this.formatUserMessage(message, attachments);
      
      // Build messages
      const messages = isO1Model ? [
        ...this.formatHistory(conversationHistory, resumptionContext),
        { role: 'user' as const, content: userContent }
      ] : [
        { role: 'system' as const, content: this.getSystemPrompt() },
        ...this.formatHistory(conversationHistory, resumptionContext),
        { role: 'user' as const, content: userContent }
      ];
      
      // Build request body with proper parameters
      const requestBodyObj: Record<string, unknown> = {
        model: resolvedModel,
        messages,
        stream: true,
      };
      
      // Handle temperature requirements
      if (modelConfig?.requiresTemperature1 || isGPT5Model || isO1Model) {
        requestBodyObj.temperature = 1;
      } else {
        requestBodyObj.temperature = this.config.parameters?.temperature || 0.7;
      }
      
      // Handle token parameter - GPT-5 and O1 use max_completion_tokens
      if (isGPT5Model || isO1Model) {
        if (this.config.parameters?.maxTokens) {
          requestBodyObj.max_completion_tokens = this.config.parameters.maxTokens;
        }
      } else if (this.config.parameters?.maxTokens) {
        requestBodyObj.max_tokens = this.config.parameters.maxTokens;
      }
      
      // Now stream with our properly formatted messages
      yield* this.streamWithRequestBody(requestBodyObj, config);
    } catch (error) {
      // Check if this is a verification error
      if (error instanceof Error && 
          (error.message.includes('organization must be verified') || 
           error.message.includes('Verify Organization') ||
           error.message.includes('organization verification') ||
           error.message.includes('Streaming requires organization verification'))) {
        console.warn('[ChatGPT] Organization verification required for streaming. Falling back to non-streaming mode.');
        
        // The error will be handled by the hook which will set the Redux state
        throw error;
      }
      console.error('[ChatGPT] Error in streamMessage:', error);
      throw error;
    }
  }
  
  /**
   * Helper method to stream with a pre-built request body
   */
  private async *streamWithRequestBody(
    requestBodyObj: Record<string, unknown>,
    config: ProviderConfig
  ): AsyncGenerator<string, void, unknown> {
    const requestBody = JSON.stringify(requestBodyObj);
    const headers = config.headers(this.config.apiKey);
    
    // Create EventSource for streaming
    console.warn(`[ChatGPT] Creating EventSource connection...`);
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
        
        if (messageCount % 50 === 0 || messageCount <= 5) {
          console.warn(`[ChatGPT] Message ${messageCount}:`, line?.substring(0, 100));
        }
        
        if (line === '[DONE]') {
          console.warn(`[ChatGPT] Received [DONE] signal`);
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
          console.warn(`[ChatGPT] Finish reason: ${finishReason}`);
          isComplete = true;
          es.close();
        }
      } catch (error) {
        console.error(`[ChatGPT] Error parsing SSE data:`, error);
      }
    });
    
    // Handle errors
    es.addEventListener('error', (error) => {
      console.error(`[ChatGPT] SSE error:`, error);
      errorOccurred = new Error(String(error));
      isComplete = true;
      es.close();
    });
    
    // Handle connection open
    es.addEventListener('open', () => {
      console.warn(`[ChatGPT] SSE connection opened`);
    });
    
    // Yield chunks as they accumulate
    let lastYieldIndex = 0;
    let iterations = 0;
    
    try {
      while (!isComplete || lastYieldIndex < chunks.length) {
        iterations++;
        
        if (errorOccurred) {
          throw errorOccurred;
        }
        
        // Yield all accumulated chunks
        while (lastYieldIndex < chunks.length) {
          yield chunks[lastYieldIndex];
          lastYieldIndex++;
        }
        
        // If stream isn't complete, wait for more chunks
        if (!isComplete) {
          const idleTime = Date.now() - lastMessageTime;
          if (idleTime > 10000 && chunks.length > 0) {
            console.warn(`[ChatGPT] No new messages for ${idleTime}ms, ending stream`);
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } finally {
      console.warn(`[ChatGPT] Stream complete. Messages: ${messageCount}, Chunks: ${chunks.length}, Iterations: ${iterations}`);
      es.close();
    }
  }
}