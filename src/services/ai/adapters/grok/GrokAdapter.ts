import { Message, MessageAttachment } from '../../../../types';
import { getDefaultModel, resolveModelAlias } from '../../../../config/providers/modelRegistry';
import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import {
  ProviderConfig,
  ResumptionContext,
  SendMessageResponse,
} from '../../types/adapter.types';
import {
  buildResponsesInput,
  normalizeInlineCitations,
  extractResponsesCitations,
  extractTextFromResponsesOutput,
  type ChatStyleMessage,
  RESPONSES_STREAM_EVENTS,
  type ResponsesStreamEvent,
} from '../../utils/responsesApi';
import { normalizeFinishReason } from '../../utils/normalizeFinishReason';
import { extractSSEErrorMessage } from '../../utils/extractSSEErrorMessage';
import EventSource from 'react-native-sse';

type ResponsesCitation = { index: number; url: string; title?: string; snippet?: string };

export class GrokAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    return {
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: getDefaultModel('grok'),
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
      capabilities: {
        streaming: true,
        attachments: true,  // Supports vision models
        supportsImages: true,  // Vision supported via current Grok chat models
        supportsDocuments: false,  // PDFs require separate Files API
        functionCalling: true,
        systemPrompt: true,
        maxTokens: 100000,
        contextWindow: 2000000,
      },
    };
  }

  // xAI retired the Live Search API (search_parameters on chat/completions,
  // HTTP 410 since Jan 2026). Web search now runs through the xAI Responses
  // API (which mirrors OpenAI's) with the web_search agent tool.
  private buildWebSearchBody(
    resolvedModel: string,
    input: unknown,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: resolvedModel,
      input,
      tools: [{ type: 'web_search' }],
      stream,
    };
    const instructions = this.getSystemPrompt();
    if (instructions) {
      body.instructions = instructions;
    }
    const sampling = this.resolveSamplingParameters(resolvedModel);
    if (sampling.temperature !== undefined) {
      body.temperature = sampling.temperature;
    }
    if (this.config.parameters?.maxTokens) {
      body.max_output_tokens = this.config.parameters.maxTokens;
    }
    return body;
  }

  private async buildWebSearchInput(
    message: string,
    conversationHistory: Message[],
    resumptionContext: ResumptionContext | undefined,
    attachments: MessageAttachment[] | undefined
  ): Promise<unknown> {
    const userContent = await Promise.resolve(this.formatUserMessage(message, attachments));
    const history = this.formatHistory(conversationHistory, resumptionContext)
      .filter((entry): entry is ChatStyleMessage => entry.role === 'user' || entry.role === 'assistant');
    return buildResponsesInput([
      ...history,
      { role: 'user', content: userContent as ChatStyleMessage['content'] },
    ]);
  }

  private async sendWebSearchMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    const config = this.getProviderConfig();
    const resolvedModel = modelOverride ||
                         resolveModelAlias(this.config.model || getDefaultModel(this.config.provider));
    const input = await this.buildWebSearchInput(message, conversationHistory, resumptionContext, attachments);
    const requestBody = this.buildWebSearchBody(resolvedModel, input, false);

    const response = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: config.headers(this.config.apiKey),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      await this.handleApiError(response, 'Grok');
    }

    const data = await response.json();
    const responseText = extractTextFromResponsesOutput(data);
    // Grok inlines citations as [[n]](url); the shared renderer rewrites those
    // to numbered chips, so keep the text as-is and just surface the citations.
    const { citations: inlineCitations } = normalizeInlineCitations(responseText);
    const citations = inlineCitations.length > 0
      ? inlineCitations
      : extractResponsesCitations(data, responseText);
    const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;
    const status = (data as { status?: string }).status;
    const incompleteReason = (data as { incomplete_details?: { reason?: string } }).incomplete_details?.reason;

    return {
      response: responseText,
      modelUsed: typeof data.model === 'string' ? data.model : resolvedModel,
      finishReason: status === 'incomplete'
        ? (normalizeFinishReason(incompleteReason) ?? 'length')
        : 'stop',
      usage: usage ? {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.total_tokens,
      } : undefined,
      metadata: citations.length > 0 ? { citations } : undefined,
    };
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse> {
    if (this.config.webSearchEnabled) {
      return this.sendWebSearchMessage(message, conversationHistory, resumptionContext, attachments, modelOverride);
    }
    return super.sendMessage(message, conversationHistory, resumptionContext, attachments, modelOverride);
  }

  // Real SSE streaming for web search over the xAI Responses API, so output
  // appears progressively (consistent with Claude/OpenAI) instead of blocking
  // until the whole response is ready.
  private async *streamWebSearchMessage(
    message: string,
    conversationHistory: Message[],
    attachments: MessageAttachment[] | undefined,
    resumptionContext: ResumptionContext | undefined,
    modelOverride: string | undefined,
    abortSignal: AbortSignal | undefined,
    onEvent: ((event: unknown) => void) | undefined
  ): AsyncGenerator<string, void, unknown> {
    const config = this.getProviderConfig();
    const resolvedModel = modelOverride ||
                         resolveModelAlias(this.config.model || getDefaultModel(this.config.provider));
    const input = await this.buildWebSearchInput(message, conversationHistory, resumptionContext, attachments);
    const body = this.buildWebSearchBody(resolvedModel, input, true);

    const es = new EventSource<ResponsesStreamEvent>(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        ...config.headers(this.config.apiKey),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      pollingInterval: 0,
      timeoutBeforeConnection: 0,
      withCredentials: false,
    });

    const onAbort = () => { try { es.close(); } catch { /* noop */ } };
    if (abortSignal) abortSignal.addEventListener('abort', onAbort);

    const eventQueue: string[] = [];
    let resolver: ((value: IteratorResult<string, void>) => void) | null = null;
    let isComplete = false;
    let errorMsg: string | null = null;
    let accumulated = '';
    let sawText = false;

    const emitCitations = (completedData: unknown) => {
      const { citations: inline } = normalizeInlineCitations(accumulated);
      const citations = inline.length > 0
        ? inline
        : extractResponsesCitations(completedData, accumulated);
      if (citations.length > 0 && onEvent) {
        try { onEvent({ type: 'citations', citations }); } catch { /* noop */ }
      }
    };

    const push = (text: string) => {
      if (!text) return;
      accumulated += text;
      sawText = true;
      if (resolver) { const r = resolver; resolver = null; r({ value: text, done: false }); }
      else eventQueue.push(text);
    };

    const handle = (dataStr: string | null | undefined, type: string) => {
      if (!dataStr || dataStr === '[DONE]') return;
      try {
        const obj = JSON.parse(dataStr);
        if (type === 'response.output_text.delta' && typeof obj.delta === 'string') {
          push(obj.delta);
        } else if (type === 'response.delta' && obj?.delta?.type === 'output_text.delta' && typeof obj.delta.text === 'string') {
          push(obj.delta.text);
        } else if (type === 'response.output_text.done') {
          const text = (obj as { text?: string })?.text || '';
          if (!sawText && text) push(text);
        } else if (type === 'response.error') {
          errorMsg = obj?.error?.message || 'Upstream error';
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        } else if (type === 'response.completed' || type === 'response.incomplete') {
          const finalText = extractTextFromResponsesOutput(obj?.response ?? obj);
          if (!sawText && finalText) push(finalText);
          emitCitations(obj);
          if (onEvent) {
            const resp = (obj?.response ?? obj) as { status?: string; incomplete_details?: { reason?: string } } | undefined;
            const isIncomplete = type === 'response.incomplete' || resp?.status === 'incomplete';
            const reason = isIncomplete
              ? (normalizeFinishReason(resp?.incomplete_details?.reason) ?? 'length')
              : 'stop';
            try { onEvent({ type: 'finish', reason }); } catch { /* noop */ }
          }
          isComplete = true;
          try { es.close(); } catch { /* noop */ }
          if (resolver) { const r = resolver; resolver = null; r({ value: undefined, done: true }); }
        }
      } catch { /* ignore parse issues */ }
    };

    for (const eventName of RESPONSES_STREAM_EVENTS) {
      es.addEventListener(eventName, (evt) => {
        handle(evt.data, eventName);
      });
    }
    es.addEventListener('message', (evt) => {
      handle(evt.data, 'message');
    });
    es.addEventListener('error', (e: unknown) => {
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
          yield eventQueue.shift()!;
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

  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    resumptionContext?: ResumptionContext,
    modelOverride?: string,
    abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    if (this.config.webSearchEnabled) {
      yield* this.streamWebSearchMessage(
        message,
        conversationHistory,
        attachments,
        resumptionContext,
        modelOverride,
        abortSignal,
        onEvent
      );
      return;
    }

    yield* super.streamMessage(
      message,
      conversationHistory,
      attachments,
      resumptionContext,
      modelOverride,
      abortSignal,
      onEvent
    );
  }
}

export type { ResponsesCitation };
