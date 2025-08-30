import { Message, MessageAttachment } from '../../../../types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { BaseAdapter } from '../../base/BaseAdapter';
import { 
  ResumptionContext, 
  SendMessageResponse,
  AdapterCapabilities 
} from '../../types/adapter.types';
import EventSource from 'react-native-sse';

export class GeminiAdapter extends BaseAdapter {
  getCapabilities(): AdapterCapabilities {
    return {
      streaming: true,
      attachments: true,
      supportsImages: true,  // Enabled for testing
      supportsDocuments: true,  // Enabled for testing
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 8192,
      contextWindow: 1048576, // 1M tokens for Gemini 2.5
    };
  }
  
  private formatContents(message: string, attachments?: MessageAttachment[]): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: message }];
    
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType || 'image/jpeg',
              data: attachment.base64 || this.extractBase64FromUri(attachment.uri),
            },
          });
        } else if (attachment.type === 'document' && attachment.mimeType === 'application/pdf') {
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: attachment.base64 || '',
            },
          });
        }
      }
    }
    
    return parts;
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
  
  private formatHistoryForGemini(
    history: Message[], 
    resumptionContext?: ResumptionContext
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    const formattedHistory = this.formatHistory(history, resumptionContext);
    const geminiHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    if (this.getSystemPrompt() !== 'You are a helpful AI assistant.') {
      geminiHistory.push({
        role: 'user',
        parts: [{ text: 'System: ' + this.getSystemPrompt() }]
      });
      geminiHistory.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }
    
    for (const msg of formattedHistory) {
      geminiHistory.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content as string }]
      });
    }
    
    return geminiHistory;
  }
  
  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const resolvedModel = modelOverride || 
                         resolveModelAlias(this.config.model || getDefaultModel('google'));
    
    const contents = [
      ...this.formatHistoryForGemini(conversationHistory, resumptionContext),
      {
        role: 'user',
        parts: this.formatContents(message, attachments)
      }
    ];
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.config.apiKey,
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: this.config.parameters?.temperature || 0.7,
              maxOutputTokens: this.config.parameters?.maxTokens || 2048,
              topP: this.config.parameters?.topP || 0.95,
              topK: this.config.parameters?.topK || 40,
            },
          }),
        }
      );
      
      if (!response.ok) {
        await this.handleApiError(response, 'Gemini');
      }
      
      const data = await response.json();
      
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('No response from Gemini');
      }
      
      return {
        response: responseText,
        modelUsed: resolvedModel,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        } : undefined,
      };
    } catch (error) {
      console.error('Error in GeminiAdapter:', error);
      throw error;
    }
  }
  
  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    _resumptionContext?: ResumptionContext,
    modelOverride?: string
  ): AsyncGenerator<string, void, unknown> {
    const resolvedModel = modelOverride || 
                         resolveModelAlias(this.config.model || getDefaultModel('google'));
    
    const contents = [
      ...this.formatHistoryForGemini(conversationHistory),
      {
        role: 'user',
        parts: this.formatContents(message, attachments)
      }
    ];
    
    const requestBody = JSON.stringify({
      contents,
      generationConfig: {
        temperature: this.config.parameters?.temperature || 0.7,
        maxOutputTokens: this.config.parameters?.maxTokens || 2048,
        topP: this.config.parameters?.topP || 0.95,
        topK: this.config.parameters?.topK || 40,
      },
    });
    
    // Create EventSource for SSE streaming
    // Note: EventSource in React Native may not support custom headers properly,
    // so we need to put the API key in the URL despite what the docs say
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;
    
    const es = new EventSource(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
      timeoutBeforeConnection: 0, // Connect immediately
      pollingInterval: 30000, // 30 second polling
      withCredentials: false,
    });
    
    // Accumulator for text chunks
    const chunks: string[] = [];
    let isComplete = false;
    let errorOccurred: Error | null = null;
    
    // Handle message events
    es.addEventListener('message', (event) => {
      try {
        const line = event.data;
        if (!line) return;
        
        // Parse the JSON data
        const data = JSON.parse(line);
        
        // Extract text from Gemini response
        // Per documentation, Gemini sends INCREMENTAL text chunks, not accumulated
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
          // Push the text chunk directly - it's already incremental
          chunks.push(text);
        }
        
        // Check if stream is complete
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason) {
          isComplete = true;
          es.close();
        }
      } catch (error) {
        console.error('[GeminiAdapter] Error parsing message:', error);
        console.error('[GeminiAdapter] Raw data:', event.data);
      }
    });
    
    // Handle errors
    es.addEventListener('error', (error) => {
      console.error('[GeminiAdapter] SSE error:', error);
      
      // Parse error message if possible
      let errorMessage = 'SSE connection error';
      try {
        if (error && typeof error === 'object' && 'data' in error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorData = JSON.parse((error as any).data);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.status || errorMessage;
          }
        }
      } catch {
        // If we can't parse the error, use the raw message
        if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
        }
      }
      
      errorOccurred = new Error(errorMessage);
      isComplete = true;
      es.close();
    });
    
    // Handle connection open
    es.addEventListener('open', () => {
      // SSE connection opened successfully
    });
    
    // Yield chunks with immediate first chunk for responsiveness
    let lastYieldIndex = 0;
    let firstChunk = true;
    
    try {
      while (!isComplete || lastYieldIndex < chunks.length) {
        if (errorOccurred) {
          throw errorOccurred;
        }
        
        // Yield all accumulated chunks
        while (lastYieldIndex < chunks.length) {
          const chunk = chunks[lastYieldIndex];
          lastYieldIndex++;
          
          // Immediate first chunk, no waiting
          if (firstChunk) {
            yield chunk;
            firstChunk = false;
            continue;
          }
          
          yield chunk;
        }
        
        // If stream isn't complete, wait for more chunks
        if (!isComplete) {
          // Shorter wait for initial chunks, longer for later ones
          const waitTime = firstChunk ? 10 : 50;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    } finally {
      es.close();
    }
  }
}