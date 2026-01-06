import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig } from '../../types/adapter.types';

export class TogetherAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    return {
      baseUrl: 'https://api.together.xyz/v1',
      defaultModel: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
      capabilities: {
        streaming: true,
        attachments: false,  // Llama 3.1 models don't support vision via API
        supportsImages: false,  // Llama 3.1 models don't support vision via API
        supportsDocuments: false,  // No document support via API
        functionCalling: false,
        systemPrompt: true,
        maxTokens: 4096,
        contextWindow: 128000,
      },
    };
  }
}