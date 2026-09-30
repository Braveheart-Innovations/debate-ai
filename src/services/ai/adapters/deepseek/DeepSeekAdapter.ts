import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig } from '../../types/adapter.types';
import { getModelById } from '../../../../config/modelConfigs';
import { getDefaultModel } from '../../../../config/providers/modelRegistry';

export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    // Image input is per model: DeepSeek V4.1 Flash is natively multimodal,
    // the older V4 names are not.
    const model = getModelById('deepseek', this.config.model || getDefaultModel('deepseek'));
    const supportsImages = Boolean(model?.supportsVision);

    return {
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: getDefaultModel('deepseek'),
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
      capabilities: {
        streaming: true,
        attachments: supportsImages,
        supportsImages,
        supportsDocuments: false,
        functionCalling: true,
        systemPrompt: true,
        maxTokens: 64000,
        contextWindow: 1048576,
      },
    };
  }
}
