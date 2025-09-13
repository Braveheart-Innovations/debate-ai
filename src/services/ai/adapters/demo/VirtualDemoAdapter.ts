import { BaseAdapter } from '../../../ai/base/BaseAdapter';
import { Message, MessageAttachment } from '@/types';
import type { ResumptionContext, SendMessageResponse, AdapterCapabilities } from '../../types/adapter.types';

// Very lightweight virtual adapter that simulates streaming via an async generator
// and returns plausible content without performing any network calls.
export class VirtualDemoAdapter extends BaseAdapter {
  getCapabilities(): AdapterCapabilities {
    return {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
      functionCalling: false,
      systemPrompt: true,
      maxTokens: 4096,
      contextWindow: 128000,
    };
  }

  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    _resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    _modelOverride?: string
  ): Promise<SendMessageResponse> {
    const final = this.composeDemoResponse(message, conversationHistory, attachments);
    return {
      response: final,
      modelUsed: this.config.model || 'demo-model',
      usage: { promptTokens: 120, completionTokens: 180, totalTokens: 300 },
      metadata: {
        providerMetadata: { mode: 'demo', provider: this.config.provider },
      },
    };
  }

  // Streaming generator yielding token-like chunks
  async *streamMessage(
    message: string,
    conversationHistory: Message[] = [],
    attachments?: MessageAttachment[],
    _resumptionContext?: ResumptionContext,
    _modelOverride?: string,
    abortSignal?: AbortSignal,
    onEvent?: (event: unknown) => void
  ): AsyncGenerator<string, void, unknown> {
    const full = this.composeDemoResponse(message, conversationHistory, attachments);
    const words = full.split(/(\s+)/); // keep spaces so buffering can flush at boundaries
    for (const w of words) {
      if (abortSignal?.aborted) {
        return;
      }
      // Occasionally emit a faux event to simulate tool/image hooks
      if (onEvent && Math.random() < 0.001) {
        onEvent({ type: 'tool_call', name: 'search', parameters: { query: 'simulated' } });
      }
      yield w;
      // Let StreamingService control pacing; no delay here
    }
  }

  private composeDemoResponse(
    message: string,
    conversationHistory: Message[],
    attachments?: MessageAttachment[]
  ): string {
    const persona = this.config.personality?.name || 'Balanced';
    const providerName = String(this.config.provider);
    const attachNote = attachments && attachments.length > 0
      ? `\n\n[Simulated: noticed ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}]`
      : '';

    // Use last user message as context if available
    const lastUser = [...conversationHistory].reverse().find(m => m.senderType === 'user');
    const userPrompt = (message || lastUser?.content || '').trim();

    const header = `(${providerName} • ${persona} • Demo)`;
    const body = userPrompt
      ? `Here’s a simulated answer to: "${userPrompt.slice(0, 140)}${userPrompt.length > 140 ? '…' : ''}"\n\n`
      : `Here’s a simulated response in Demo Mode.\n\n`;

    const sample = [
      'Key points:',
      '• Provide a concise overview first.',
      '• Follow with a few concrete details.',
      '• Keep structure readable without heavy formatting.',
      '• End with a brief, actionable suggestion.',
    ].join('\n');

    const footer = '\n\n[Simulated content. No live API calls performed.]';
    return `${header}\n\n${body}${sample}${attachNote}${footer}`;
  }
}

