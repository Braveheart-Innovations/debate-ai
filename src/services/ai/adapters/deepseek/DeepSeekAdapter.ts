import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig } from '../../types/adapter.types';

export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    return {
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
      capabilities: {
        streaming: true,
        attachments: false,  // Chat API doesn't support vision
        supportsImages: false,  // Chat API doesn't support vision
        supportsDocuments: false,  // Chat API doesn't support vision
        functionCalling: true,
        systemPrompt: true,
        maxTokens: 4096,
        contextWindow: 128000,
      },
    };
  }
}