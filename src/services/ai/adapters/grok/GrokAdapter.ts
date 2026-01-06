import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig } from '../../types/adapter.types';

export class GrokAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    return {
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-2-1212',
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
      capabilities: {
        streaming: true,
        attachments: true,  // Supports vision models
        supportsImages: true,  // Vision supported via grok-2-vision and grok-3+
        supportsDocuments: false,  // PDFs require separate Files API
        functionCalling: false,
        systemPrompt: true,
        maxTokens: 4096,
        contextWindow: 131072,  // Most models use 131K
      },
    };
  }
}