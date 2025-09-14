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
      body: JSON.stringify((() => {
        const cfg: Record<string, unknown> = {
          temperature: this.config.parameters?.temperature ?? 0.7,
          topP: this.config.parameters?.topP ?? 0.95,
          topK: this.config.parameters?.topK ?? 40,
        };
        // Do not enforce maxOutputTokens unless explicitly provided by Expert Mode
        if (this.config.parameters?.maxTokens) {
          cfg.maxOutputTokens = this.config.parameters.maxTokens;
        }
        return { contents, generationConfig: cfg };
      })()),
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
    
    const requestBody = JSON.stringify((() => {
      const cfg: Record<string, unknown> = {
        temperature: this.config.parameters?.temperature ?? 0.7,
        topP: this.config.parameters?.topP ?? 0.95,
        topK: this.config.parameters?.topK ?? 40,
      };
      // Do not enforce maxOutputTokens unless explicitly provided by Expert Mode
      if (this.config.parameters?.maxTokens) {
        cfg.maxOutputTokens = this.config.parameters.maxTokens;
      }
      return { contents, generationConfig: cfg };
    })());
    
    // Create EventSource for SSE streaming (React Native)
    // Note: In RN, pass API key via URL
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
    
    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorOccurred: Error | null = null;
    
    // Handle message events
    es.addEventListener('message', (event) => {
      try {
        const line = event.data;
        if (!line) return;
        const data = JSON.parse(line);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
        if (text) {
          if (resolver) { const r = resolver; resolver = null; r({ value: text, done: false }); }
          else eventQueue.push(text);
        }
        const finishReason = data.candidates?.[0]?.finishReason as string | undefined;
        if (finishReason) {
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        }
      } catch (error) {
        console.error('[GeminiAdapter] Error parsing message:', error);
      }
    });
    
    // Handle errors
    es.addEventListener('error', (error) => {
      let errorMessage = 'SSE connection error';
      try {
        if (error && typeof error === 'object' && 'data' in error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorData = JSON.parse((error as any).data);
          if (errorData.error) errorMessage = errorData.error.message || errorData.error.status || errorMessage;
        }
      } catch {
        if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String((error as { message?: string }).message || errorMessage);
        }
      }
      errorOccurred = new Error(errorMessage);
      isComplete = true;
      try { es.close(); } catch { /* noop */ }
      if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
    });
    
    // Handle connection open (no-op)
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
