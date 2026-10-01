import { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import { ProviderConfig } from '../../types/adapter.types';
import { getModelById } from '../../../../config/modelConfigs';
import { getDefaultModel } from '../../../../config/providers/modelRegistry';

export class ZaiAdapter extends OpenAICompatibleAdapter {
  protected getProviderConfig(): ProviderConfig {
    // Image input is per model: GLM-5.3 Flash/FlashX take images, the GLM-5.x
    // flagship line is text-only (glm-5v-* is retired).
    const model = getModelById('zai', this.config.model || getDefaultModel('zai'));
    const supportsImages = Boolean(model?.supportsVision);

    return {
      baseUrl: 'https://api.z.ai/api/paas/v4',
      defaultModel: getDefaultModel('zai'),
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
        maxTokens: 128000,
        contextWindow: 1000000,
      },
    };
  }
}
