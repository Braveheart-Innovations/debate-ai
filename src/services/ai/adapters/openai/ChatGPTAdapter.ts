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
      const parts = (m.content as Array<{ type: string; text?: string; image_url?: { url: string } }>).
        map(p => {
          if (isAssistant) {
            // Assistant history must use output_text/refusal content types
            if (p.type === 'text' && p.text) return { type: 'output_text', text: p.text } as const;
            return undefined; // ignore images in assistant history
          } else {
            if (p.type === 'text' && p.text) return { type: 'input_text', text: p.text } as const;
            if (p.type === 'image_url' && p.image_url) return { type: 'input_image', image: p.image_url } as const;
            return undefined;
          }
        }).
        filter(Boolean) as Array<{ type: 'input_text' | 'input_image' | 'output_text'; text?: string; image?: { url: string } }>;
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

    if (process.env.NODE_ENV === 'development') {
      console.warn('[ChatGPT] request summary', {
        model: resolvedModel,
        hasInstructions: Boolean(instructions),
        messages: transformed.length,
        temperature: body.temperature,
        max_output_tokens: body.max_output_tokens,
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
    const onAbort = () => {
      try { es.close(); } catch (e) { void e; }
    };
    if (abortSignal) abortSignal.addEventListener('abort', onAbort);

    // Accumulate chunks and stream them out
    const chunks: string[] = [];
    let isComplete = false;
    let errorMsg: string | null = null;
    let messageCount = 0;
    let lastMessageTime = Date.now();
    let awaitingFinal = false;
    let pendingFinal: Promise<void> | null = null;

    es.addEventListener('open', () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ChatGPT] SSE connection opened (Responses API)');
      }
    });

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

    const handleEventData = (dataStr: string | null | undefined, eventType?: string) => {
      if (!dataStr || dataStr === '[DONE]') return;
      try {
        const obj = JSON.parse(dataStr);
        // Surface non-text events to router if provided
        if (onEvent && eventType && eventType !== 'response.output_text.delta' && eventType !== 'response.delta') {
          try { onEvent({ type: eventType, ...obj }); } catch (e) { void e; }
        }
        messageCount++;
        if (process.env.NODE_ENV === 'development' && (messageCount <= 3 || messageCount % 100 === 0)) {
          const preview = (dataStr || '').slice(0, 120);
          console.warn('[ChatGPT] event', messageCount, eventType || obj?.type, preview);
        }
        const type = eventType || obj?.type;
        if (type === 'response.output_text.delta' && typeof obj.delta === 'string') {
          chunks.push(obj.delta);
          lastMessageTime = Date.now();
        } else if (type === 'response.delta' && obj?.delta?.type === 'output_text.delta' && typeof obj.delta.text === 'string') {
          chunks.push(obj.delta.text);
          lastMessageTime = Date.now();
        } else if (type === 'response.error') {
          errorMsg = obj?.error?.message || 'Upstream error';
          isComplete = true;
          try { es.close(); } catch (e) { void e; }
        } else if (type === 'response.output_text.done' || type === 'response.completed') {
          if (chunks.length === 0) {
            // Try to extract from this event
            const finalFromEvent = extractTextFromOutput(obj?.response ?? obj?.output ?? obj);
            if (finalFromEvent) {
              chunks.push(finalFromEvent);
              lastMessageTime = Date.now();
              isComplete = true;
              try { es.close(); } catch (e) { void e; }
              return;
            }
            // Fallback: create a single non-streaming request and await it in the generator loop
            if (!awaitingFinal && !pendingFinal) {
              awaitingFinal = true;
              lastMessageTime = Date.now();
              const reqBody = JSON.stringify({ ...body, stream: false });
              pendingFinal = (async () => {
                try {
                  const resp = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${this.config.apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: reqBody,
                  });
                  const txt = await resp.text();
                  if (resp.ok) {
                    try {
                      const parsed = JSON.parse(txt);
                      const finalText = extractTextFromOutput(parsed?.response ?? parsed?.output ?? parsed);
                      if (finalText) {
                        chunks.push(finalText);
                        lastMessageTime = Date.now();
                      }
                } catch (parseErr) { void parseErr; }
                  } else if (process.env.NODE_ENV === 'development') {
                    console.error('[ChatGPT] fallback fetch failed', resp.status, txt.slice(0,200));
                  }
                } catch (fetchErr) {
                  if (process.env.NODE_ENV === 'development') {
                    console.error('[ChatGPT] fallback fetch error', fetchErr);
                  }
                } finally {
                  awaitingFinal = false;
                  isComplete = true;
                  pendingFinal = null;
                  try { es.close(); } catch (e) { void e; }
                }
              })();
            }
            return; // keep generator alive until pendingFinal resolves
          }
          // We already have chunks, we can finish
          isComplete = true;
          try { es.close(); } catch (e) { void e; }
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
      const anyErr = e as { message?: string; status?: number; response?: unknown } | undefined;
      if (process.env.NODE_ENV === 'development') {
        try { console.error('[ChatGPT] SSE error event', JSON.stringify(anyErr)); } catch { console.error('[ChatGPT] SSE error event'); }
      }
      errorMsg = String(anyErr?.message || `SSE error${anyErr?.status ? ` (${anyErr.status})` : ''}`);
      isComplete = true;
      try { es.close(); } catch (ee) { void ee; }
    });

    // Idle watchdog: extend for GPT-5/O1 due to known latency
    const idleThresholdMs = (isGPT5Model || isO1Model) ? 180000 : 60000; // 3m for GPT-5/O1, 60s otherwise
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ChatGPT] idleThresholdMs', idleThresholdMs);
    }
    const idleTimer = setInterval(() => {
      if (isComplete) return;
      const idleFor = Date.now() - lastMessageTime;
      if (idleFor > idleThresholdMs) {
        errorMsg = `No streaming data from OpenAI for ${Math.round(idleFor/1000)}s`;
        isComplete = true;
        try { es.close(); } catch (ee) { void ee; }
      }
    }, 5000);

    // First-byte diagnostic: if no event in 8s, POST non-streaming with same body to capture error
    const diagnosticTimer = setTimeout(async () => {
      if (isComplete || messageCount > 0) return;
      try {
        const diagRes = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ ...body, stream: false }),
        });
        const diagText = await diagRes.text().catch(() => '');
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ChatGPT] diagnostic status', diagRes.status);
          console.warn('[ChatGPT] diagnostic body', diagText.slice(0, 500));
        }
        if (!diagRes.ok) {
          errorMsg = `Responses preflight failed (${diagRes.status}): ${diagText}`;
          isComplete = true;
          try { es.close(); } catch (ee) { void ee; }
        }
      } catch (dErr) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[ChatGPT] diagnostic error', dErr);
        }
      }
    }, 8000);

    try {
      let lastYield = 0;
      while (!isComplete || lastYield < chunks.length || awaitingFinal || pendingFinal) {
        // Abort requested
        if (abortSignal?.aborted) break;
        while (lastYield < chunks.length) {
          const c = chunks[lastYield++];
          yield c;
        }
        if (pendingFinal) {
          // Await the fallback completion to avoid finishing with chunks=0
          try { await pendingFinal; } catch { /* already logged */ }
          continue;
        }
        if (!isComplete) {
          await new Promise(r => setTimeout(r, 30));
        }
      }
      if (errorMsg) throw new Error(errorMsg);
    } finally {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
      clearInterval(idleTimer);
      clearTimeout(diagnosticTimer);
      try { es.close(); } catch (e) { void e; }
    }
  }
}
