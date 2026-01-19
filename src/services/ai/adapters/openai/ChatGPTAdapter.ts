import { Message, MessageAttachment } from '../../../../types';
import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig, ResumptionContext, SendMessageResponse } from '../../types/adapter.types';
import { getModelById } from '../../../../config/modelConfigs';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import EventSource from 'react-native-sse';
import { extractSSEErrorMessage } from '../../utils/extractSSEErrorMessage';

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
    // Check if the model supports vision
    const model = this.config.model || 'gpt-5';
    const supportsImages = model.startsWith('gpt-4o') ||
                          model.startsWith('gpt-4-turbo') ||
                          model.startsWith('gpt-4-vision') ||
                          model.startsWith('gpt-4.1') ||
                          model.startsWith('gpt-5') ||
                          model.startsWith('o1') ||
                          model.startsWith('o3');

    // OpenAI now supports documents natively (as of March 2025)
    const supportsDocuments = supportsImages;

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
        supportsDocuments,  // Native file support as of March 2025
        functionCalling: true,
        systemPrompt: true,
        maxTokens: 128000,  // GPT-5 max output
        contextWindow: 272000,  // GPT-5 context
      },
    };
  }
  
  /**
   * Override formatUserMessage to handle images and documents for OpenAI
   * Documents are supported natively via type: "file" as of March 2025
   */
  protected formatUserMessage(
    message: string,
    attachments?: MessageAttachment[]
  ): string | Array<{ type: string; text?: string; image_url?: { url: string }; file?: { file_name: string; file_data: string } }> {
    if (!attachments || attachments.length === 0) {
      return message;
    }

    const capabilities = this.getCapabilities();
    if (!capabilities.attachments) {
      return message;
    }

    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string }; file?: { file_name: string; file_data: string } }> = [
      { type: 'text', text: message }
    ];

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
      } else if (attachment.type === 'document' && capabilities.supportsDocuments) {
        // Documents supported natively via type: "file" as of March 2025
        const base64Data = attachment.base64 || '';
        const mimeType = attachment.mimeType || 'application/pdf';
        contentParts.push({
          type: 'file',
          file: {
            file_name: attachment.fileName || 'document.pdf',
            file_data: attachment.uri.startsWith('data:')
              ? attachment.uri
              : `data:${mimeType};base64,${base64Data}`
          }
        });
      }
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
    
    // Format user message with attachments (images and documents supported)
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
    modelOverride?: string,
    abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    // Test connection first if in debug mode (best-effort)
    if (process.env.NODE_ENV === 'development') {
      try { await this.testConnection(); } catch (err) { void err; }
    }

    // Prepare request
    const resolvedModel = modelOverride || resolveModelAlias(this.config.model || getDefaultModel(this.config.provider));
    const modelConfig = getModelById('openai', resolvedModel);
    const isO1Model = resolvedModel.startsWith('o1');
    const isGPT5Model = resolvedModel.startsWith('gpt-5');

    // Build chat-style messages; pass system as Responses "instructions" (not a system item)
    const instructions = isO1Model ? undefined : this.getSystemPrompt();
    const userContent = this.formatUserMessage(message, attachments);
    const messages = [
      ...this.formatHistory(conversationHistory, resumptionContext),
      { role: 'user' as const, content: userContent }
    ];

    // Transform to Responses API typed input
    const transformed = messages.map(m => {
      const isAssistant = m.role === 'assistant';
      if (typeof m.content === 'string') {
        return { role: m.role, content: [{ type: isAssistant ? 'output_text' : 'input_text', text: m.content }] };
      }
      // m.content is an array of chat parts
      type ContentPart = { type: string; text?: string; image_url?: { url: string }; file?: { file_name: string; file_data: string } };
      const parts = (m.content as Array<ContentPart>).
        map(p => {
          if (isAssistant) {
            // Assistant history must use output_text/refusal content types
            if (p.type === 'text' && p.text) return { type: 'output_text', text: p.text } as const;
            return undefined; // ignore images/files in assistant history
          } else {
            if (p.type === 'text' && p.text) return { type: 'input_text', text: p.text } as const;
            // Responses API expects image_url as direct string, not object
            if (p.type === 'image_url' && p.image_url) return { type: 'input_image', image_url: p.image_url.url } as const;
            // Files use input_file format in Responses API
            if (p.type === 'file' && p.file) return { type: 'input_file', filename: p.file.file_name, file_data: p.file.file_data } as const;
            return undefined;
          }
        }).
        filter(Boolean) as Array<{ type: 'input_text' | 'input_image' | 'input_file' | 'output_text'; text?: string; image_url?: string; filename?: string; file_data?: string }>;
      return { role: m.role, content: parts };
    });

    // Assemble body
    const body: Record<string, unknown> = {
      model: resolvedModel,
      input: transformed,
      stream: true,
    };
    if (instructions) {
      body.instructions = instructions;
    }
    // Temperature rules
    if (modelConfig?.requiresTemperature1 || isGPT5Model || isO1Model) {
      body.temperature = 1;
    } else if (this.config.parameters?.temperature !== undefined) {
      body.temperature = this.config.parameters.temperature;
    }
    // Optional token cap: only set if explicitly configured by user
    if (this.config.parameters?.maxTokens) {
      body.max_output_tokens = this.config.parameters.maxTokens;
    }

    // Web search: add web_search tool when enabled
    if (this.config.webSearchEnabled) {
      body.tools = [{ type: 'web_search' }];
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn('[ChatGPT] request summary', {
        model: resolvedModel,
        hasInstructions: Boolean(instructions),
        messages: transformed.length,
        temperature: body.temperature,
        max_output_tokens: body.max_output_tokens,
        webSearchEnabled: this.config.webSearchEnabled,
      });
    }

    // Create EventSource (POST-SSE)
    const es = new EventSource('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      pollingInterval: 0,
      timeoutBeforeConnection: 0,
      withCredentials: false,
    });

    // Hook abort -> close
    const onAbort = () => { try { es.close(); } catch { /* noop */ } };
    if (abortSignal) abortSignal.addEventListener('abort', onAbort);

    // Queue-based streaming (no adapter pacing)
    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorMsg: string | null = null;

    es.addEventListener('open', () => {});

    const extractTextFromOutput = (root: unknown): string => {
      // Strictly extract only output_text payloads from Responses format
      const pickText = (node: Record<string, unknown> | null | undefined): string => {
        if (!node) return '';
        // output_text "text" can be a string or { value }
        const t = (node as { text?: unknown }).text;
        if (typeof t === 'string') return t;
        if (t && typeof t === 'object' && typeof (t as { value?: unknown }).value === 'string') return (t as { value: string }).value;
        return '';
      };

      const res = (root as { response?: unknown } | undefined)?.response ?? root;
      const output = (res as { output?: unknown } | undefined)?.output as unknown;
      if (!Array.isArray(output)) return '';

      const texts: string[] = [];
      for (const item of output as Array<Record<string, unknown>>) {
        const t = item?.type as string | undefined;
        if (t && (t.includes('output_text') || t.includes('refusal'))) {
          const textVal = pickText(item);
          if (textVal) texts.push(textVal);
          const content = item?.content as unknown;
          if (Array.isArray(content)) {
            for (const part of content as Array<Record<string, unknown>>) {
              if (part?.type === 'output_text' || part?.type === 'refusal') {
                const pv = pickText(part);
                if (pv) texts.push(pv);
              }
            }
          }
        } else if (t === 'message') {
          // Some Responses payloads return a message with content parts
          const content = item?.content as unknown;
          if (Array.isArray(content)) {
            for (const part of content as Array<Record<string, unknown>>) {
              if (part?.type === 'output_text') {
                const pv = pickText(part);
                if (pv) texts.push(pv);
              }
              if (part?.type === 'refusal') {
                const pv = pickText(part);
                if (pv) texts.push(pv);
              }
            }
          }
        }
      }
      return texts.join('');
    };

    // Extract URL citations from OpenAI streaming response
    // In streaming mode, citations are embedded as markdown links in the text: ([title](url))
    const extractCitationsFromText = (text: string): Array<{ index: number; url: string; title?: string }> => {
      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();

      // Match markdown links: [title](url) - capture title and url
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      return citations;
    };

    const handleEventData = (dataStr: string | null | undefined, eventType?: string) => {
      if (!dataStr || dataStr === '[DONE]') return;
      try {
        const obj = JSON.parse(dataStr);

        // Surface non-text events to router if provided
        if (onEvent && eventType && eventType !== 'response.output_text.delta' && eventType !== 'response.delta') {
          try { onEvent({ type: eventType, ...obj }); } catch { /* noop */ }
        }
        const type = eventType || obj?.type;
        if (type === 'response.output_text.delta' && typeof obj.delta === 'string') {
          if (resolver) { const r = resolver; resolver = null; r({ value: obj.delta, done: false }); }
          else eventQueue.push(obj.delta);
        } else if (type === 'response.delta' && obj?.delta?.type === 'output_text.delta' && typeof obj.delta.text === 'string') {
          const t = obj.delta.text as string;
          if (resolver) { const r = resolver; resolver = null; r({ value: t, done: false }); }
          else eventQueue.push(t);
        } else if (type === 'response.error') {
          errorMsg = obj?.error?.message || 'Upstream error';
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        } else if (type === 'response.output_text.done') {
          // Extract text from the done event
          const text = (obj as { text?: string })?.text || '';

          // Extract citations from inline markdown links in the text
          if (onEvent && text) {
            const citations = extractCitationsFromText(text);
            if (process.env.NODE_ENV === 'development') {
              console.warn('[ChatGPT] Extracted citations from text:', citations.length, citations.map(c => c.url).slice(0, 3));
            }
            if (citations.length > 0) {
              try { onEvent({ type: 'citations', citations }); } catch { /* noop */ }
            }
          }

          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        } else if (type === 'response.completed') {
          // Try to extract a final text from the completed event and enqueue once
          const finalFromEvent = extractTextFromOutput(obj?.response ?? obj?.output ?? obj);
          if (finalFromEvent) {
            if (resolver) { const r = resolver; resolver = null; r({ value: finalFromEvent, done: false }); }
            else eventQueue.push(finalFromEvent);
          }

          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        } else {
          // ignore other event kinds for now
        }
      } catch (e) {
        void e;
      }
    };

    // Listen to named Responses events (primary path)
    const esAny = es as unknown as { addEventListener: (type: string, cb: (evt: unknown) => void) => void };
    esAny.addEventListener('response.output_text.delta', (evt) => {
      const anyEvt = evt as unknown as { data: string | null };
      handleEventData(anyEvt?.data, 'response.output_text.delta');
    });
    esAny.addEventListener('response.output_text.done', (evt) => {
      const anyEvt = evt as unknown as { data: string | null };
      handleEventData(anyEvt?.data, 'response.output_text.done');
    });
    esAny.addEventListener('response.completed', (evt) => {
      const anyEvt = evt as unknown as { data: string | null };
      handleEventData(anyEvt?.data, 'response.completed');
    });
    esAny.addEventListener('response.delta', (evt) => {
      const anyEvt = evt as unknown as { data: string | null };
      handleEventData(anyEvt?.data, 'response.delta');
    });
    esAny.addEventListener('response.error', (evt) => {
      const anyEvt = evt as unknown as { data: string | null };
      handleEventData(anyEvt?.data, 'response.error');
    });
    // Fallback: some deployments emit unnamed events
    es.addEventListener('message', (evt) => {
      const anyEvt = evt as unknown as { data: string | null };
      handleEventData(anyEvt?.data, 'message');
    });

    es.addEventListener('error', (e: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ChatGPT] SSE error:', e);
      }
      errorMsg = extractSSEErrorMessage(e, 'Connection failed');
      isComplete = true;
      try { es.close(); } catch { /* noop */ }
      if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
    });

    try {
      while (!isComplete || eventQueue.length > 0) {
        if (abortSignal?.aborted) break;
        if (errorMsg) throw new Error(errorMsg);
        if (eventQueue.length > 0) {
          const c = eventQueue.shift()!;
          yield c;
          continue;
        }
        const result = await new Promise<IteratorResult<string, void>>((resolve) => { resolver = resolve; });
        if (errorMsg) throw new Error(errorMsg);
        if (result.done) break;
        if (result.value) yield result.value;
      }
      if (errorMsg) throw new Error(errorMsg);
    } finally {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
      try { es.close(); } catch { /* noop */ }
    }
  }
}
