import { Message, MessageAttachment } from '../../../../types';
import { BaseAdapter } from '../../base/BaseAdapter';
import { 
  ResumptionContext, 
  SendMessageResponse,
  AdapterCapabilities
} from '../../types/adapter.types';
import EventSource from 'react-native-sse';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';

/**
 * GPT-5 Responses API Adapter
 * 
 * This adapter implements OpenAI's new Responses API which is required for GPT-5.
 * The Responses API uses semantic events instead of simple SSE data chunks.
 * 
 * Note: GPT-5 has known latency issues (40-150 seconds) documented by OpenAI.
 */
export class GPT5ResponsesAdapter extends BaseAdapter {
  getCapabilities(): AdapterCapabilities {
    return {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: false, // Responses API doesn't support PDFs either
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 128000,  // GPT-5 max output
      contextWindow: 272000,  // GPT-5 context window
    };
  }

  private formatInputMessages(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[]
  ): Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> {
    const userContent = this.formatUserMessage(message, attachments);
    
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
      { role: 'system', content: this.getSystemPrompt() },
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user', content: userContent }
    ];
    
    return messages;
  }

  protected formatUserMessage(message: string, attachments?: MessageAttachment[]): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    if (!attachments || attachments.length === 0) {
      return message;
    }
    
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: message }
    ];
    
    let hasUnsupportedDocs = false;
    
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        // Images are supported
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: attachment.uri.startsWith('data:') 
              ? attachment.uri 
              : `data:${attachment.mimeType || 'image/jpeg'};base64,${attachment.base64}`
          }
        });
      } else if (attachment.type === 'document') {
        // PDFs are not supported by Responses API
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
    const resolvedModel = modelOverride || 
                         resolveModelAlias(this.config.model || getDefaultModel('openai'));
    
    const input = this.formatInputMessages(message, conversationHistory, resumptionContext, attachments);
    
    try {
      // Note: The Responses API endpoint is different from chat/completions
      // This is a placeholder - the actual endpoint needs to be confirmed
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: resolvedModel,
          input,
          stream: false,
          // GPT-5 specific parameters
          temperature: 1, // GPT-5 requires temperature=1
          // Don't set max_completion_tokens unless explicitly configured
          ...(this.config.parameters?.maxTokens && {
            max_completion_tokens: this.config.parameters.maxTokens
          }),
        }),
      });
      
      if (!response.ok) {
        await this.handleApiError(response, 'OpenAI GPT-5');
      }
      
      const data = await response.json();
      
      // Extract response from Responses API format
      // The exact format needs to be confirmed from actual API response
      const responseText = data.output?.text || 
                          data.output?.[0]?.text || 
                          data.choices?.[0]?.message?.content || 
                          '';
      
      return {
        response: responseText,
        modelUsed: data.model || resolvedModel,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens || data.usage.input_tokens,
          completionTokens: data.usage.completion_tokens || data.usage.output_tokens,
          totalTokens: data.usage.total_tokens || 
                      ((data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0)),
        } : undefined,
      };
    } catch (error) {
      console.error(`Error in GPT-5 Responses adapter:`, error);
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
    const resolvedModel = modelOverride || 
                         resolveModelAlias(this.config.model || getDefaultModel('openai'));
    
    const input = this.formatInputMessages(message, conversationHistory, resumptionContext, attachments);
    
    // Build request body for Responses API
    const requestBody = JSON.stringify({
      model: resolvedModel,
      input,
      stream: true,
      temperature: 1, // GPT-5 requires temperature=1
      ...(this.config.parameters?.maxTokens && {
        max_completion_tokens: this.config.parameters.maxTokens
      }),
    });
    
    console.warn(`[GPT-5] Creating Responses API EventSource connection...`);
    console.warn(`[GPT-5] Note: GPT-5 has known latency issues (40-150 seconds). This is an OpenAI API issue.`);
    
    // Create EventSource for Responses API
    const es = new EventSource('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: requestBody,
      timeoutBeforeConnection: 0,
      pollingInterval: 30000,
      withCredentials: false,
    });
    
    // Handle semantic events from Responses API
    const chunks: string[] = [];
    let isComplete = false;
    let errorOccurred: Error | null = null;
    let eventCount = 0;
    
    // Listen for semantic events
    es.addEventListener('message', (event) => {
      eventCount++;
      try {
        const data = JSON.parse(event.data || '{}');
        
        // Log first few events to understand the format
        if (eventCount <= 5) {
          console.warn(`[GPT-5] Event ${eventCount} type:`, data.type, 'data:', JSON.stringify(data).substring(0, 200));
        }
        
        // Handle different semantic event types
        switch (data.type) {
          case 'response.created':
            console.warn(`[GPT-5] Response created`);
            break;
            
          case 'response.output_text.delta':
            // This is the main text streaming event
            if (data.text) {
              chunks.push(data.text);
            }
            break;
            
          case 'response.output.text.delta':
            // Alternative format
            if (data.delta?.text) {
              chunks.push(data.delta.text);
            }
            break;
            
          case 'response.completed':
            console.warn(`[GPT-5] Response completed after ${eventCount} events`);
            isComplete = true;
            es.close();
            break;
            
          case 'error':
            console.error(`[GPT-5] Error event:`, data);  // Keep as error - this is an actual error
            errorOccurred = new Error(data.message || 'Unknown error from Responses API');
            isComplete = true;
            es.close();
            break;
            
          default:
            // Handle unknown event types
            if (data.type && eventCount % 100 === 0) {
              console.warn(`[GPT-5] Unknown event type: ${data.type}`);
            }
        }
      } catch (error) {
        console.error(`[GPT-5] Error parsing event:`, error);
      }
    });
    
    // Handle connection errors
    es.addEventListener('error', (error) => {
      console.error(`[GPT-5] EventSource error:`, error);
      errorOccurred = new Error(`Connection error: ${String(error)}`);
      isComplete = true;
      es.close();
    });
    
    // Handle connection open
    es.addEventListener('open', () => {
      console.warn(`[GPT-5] EventSource connection opened. Warning: GPT-5 typically has 40-150 second latency.`);
    });
    
    // Yield chunks as they accumulate
    let lastYieldIndex = 0;
    const startTime = Date.now();
    let firstChunkTime: number | null = null;
    
    try {
      while (!isComplete || lastYieldIndex < chunks.length) {
        if (errorOccurred) {
          throw errorOccurred;
        }
        
        // Yield all accumulated chunks
        while (lastYieldIndex < chunks.length) {
          if (firstChunkTime === null) {
            firstChunkTime = Date.now();
            const latency = (firstChunkTime - startTime) / 1000;
            console.warn(`[GPT-5] First chunk received after ${latency.toFixed(1)} seconds`);
          }
          yield chunks[lastYieldIndex];
          lastYieldIndex++;
        }
        
        // If not complete, wait for more events
        if (!isComplete) {
          // Check for timeout (3 minutes for GPT-5 due to known latency)
          const elapsed = Date.now() - startTime;
          if (elapsed > 180000) {
            console.warn(`[GPT-5] Timeout after ${elapsed / 1000} seconds`);
            break;
          }
          
          // Log progress every 10 seconds to show we're still waiting
          if (elapsed % 10000 < 100) {
            console.warn(`[GPT-5] Still waiting... ${Math.floor(elapsed / 1000)} seconds elapsed`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      const totalTime = (Date.now() - startTime) / 1000;
      console.warn(`[GPT-5] Stream complete. Total time: ${totalTime.toFixed(1)}s, Events: ${eventCount}, Chunks: ${chunks.length}`);
      es.close();
    }
  }
}