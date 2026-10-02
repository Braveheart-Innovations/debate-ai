// Backwards compatibility wrapper for the new modular AI adapter architecture
// This file maintains the same API as the original monolithic aiAdapter.ts
// but delegates to the new modular architecture in src/services/ai/

import { AIProvider, ModelParameters, PersonalityConfig, RuntimePersonalityConfig, Message, MessageAttachment } from '../types';
import { resolveProviderModelId } from '../config/modelConfigs';
import { PersonalityOption } from '../config/personalities';
import { AdapterFactory, BaseAdapter } from './ai';
import type { AIAdapterConfig, ResumptionContext } from './ai';
import type { StreamFinishReason } from './ai/types/adapter.types';
import APIKeyService from './APIKeyService';
import { isDemoModeEnabled } from './demo/demoMode';

// Re-export types for backwards compatibility
export type { AIAdapterConfig, ResumptionContext } from './ai';

// Export base adapter for type compatibility
export { BaseAdapter as AIAdapter } from './ai';

// Re-export individual adapters with their original names
export { ClaudeAdapter } from './ai';
export { ChatGPTAdapter } from './ai';
export { GeminiAdapter } from './ai';
export { PerplexityAdapter } from './ai';
export { MistralAdapter } from './ai';
export { CohereAdapter } from './ai';
export { DeepSeekAdapter } from './ai';
export { GrokAdapter } from './ai';
export { MockAdapter as MockAIAdapter } from './ai';

// AIFactory for backwards compatibility
export class AIFactory {
  static create(config: AIAdapterConfig): BaseAdapter {
    return AdapterFactory.create(config);
  }
}

// Preset personalities (moved from original file)
export const PERSONALITIES: Record<string, PersonalityConfig> = {
  neutral: {
    id: 'neutral',
    name: 'Neutral',
    description: 'Standard helpful assistant',
    systemPrompt: 'You are a helpful AI assistant. Keep responses concise and friendly.',
    traits: { formality: 0.5, humor: 0.3, technicality: 0.5, empathy: 0.6 },
    isPremium: false,
  },
  // Add other personalities as needed
};

// AIService class for backwards compatibility
export class AIService {
  private adapters: Map<string, BaseAdapter> = new Map();
  
  constructor(apiKeys?: Record<string, string | undefined>) {
    if (apiKeys) {
      this.initializeSync(apiKeys);
    }
  }
  
  private initializeSync(apiKeys: Record<string, string | undefined>): void {
    for (const [provider, apiKey] of Object.entries(apiKeys)) {
      if (apiKey) {
        try {
          this.adapters.set(provider, AdapterFactory.create({
            provider: provider as AIProvider,
            identityId: provider,
            apiKey,
            personality: PERSONALITIES.neutral,
          }));
        } catch (error) {
          console.warn(`Failed to create adapter for ${provider}:`, error);
        }
      }
    }
  }
  
  async initialize(apiKeys?: Record<string, string | undefined>): Promise<void> {
    if (!apiKeys || Object.keys(apiKeys).length === 0) {
      // Create mock adapters
      const mockProviders = ['claude', 'openai', 'google', 'perplexity', 'mistral'];
      for (const provider of mockProviders) {
        this.adapters.set(provider, AdapterFactory.create({
          provider: 'mock' as AIProvider,
          identityId: provider,
          apiKey: 'mock',
          personality: PERSONALITIES.neutral,
        }));
      }
    } else {
      // Create real adapters for available API keys
      for (const [provider, apiKey] of Object.entries(apiKeys)) {
        if (apiKey) {
          try {
            this.adapters.set(provider, AdapterFactory.create({
              provider: provider as AIProvider,
              identityId: provider,
              apiKey,
              personality: PERSONALITIES.neutral,
            }));
          } catch (error) {
            console.warn(`Failed to create adapter for ${provider}:`, error);
          }
        }
      }
    }
  }
  
  getAdapter(provider: string): BaseAdapter | undefined {
    return this.adapters.get(provider);
  }

  async getApiKey(provider: string): Promise<string | null> {
    if (isDemoModeEnabled()) {
      return 'demo';
    }
    return APIKeyService.getKey(provider);
  }

  async ensureAdapter(
    adapterId: string,
    provider: string = adapterId,
    model?: string,
    apiKeyOverride?: string | null
  ): Promise<BaseAdapter | undefined> {
    const existing = this.adapters.get(adapterId);
    if (existing) {
      existing.config.identityId = adapterId;
      if (model) {
        existing.config.model = model;
      }
      return existing;
    }

    const apiKey = apiKeyOverride || await this.getApiKey(provider);
    if (!apiKey) {
      return undefined;
    }

    try {
      const config: AIAdapterConfig = {
        provider: provider as AIProvider,
        identityId: adapterId,
        apiKey,
        model,
        personality: PERSONALITIES.neutral,
      };
      const adapter = model
        ? AdapterFactory.createWithModel(config, model)
        : AdapterFactory.create(config);
      this.adapters.set(adapterId, adapter);
      return adapter;
    } catch (error) {
      console.warn(`Failed to create adapter for ${provider}:`, error);
      return undefined;
    }
  }
  
  getAllAdapters(): Map<string, BaseAdapter> {
    return this.adapters;
  }
  
  setPersonality(provider: string, personality: RuntimePersonalityConfig | PersonalityOption | undefined): void {
    const adapter = this.adapters.get(provider);
    if (adapter) {
      adapter.setTemporaryPersonality(personality);
    }
  }
  
  async sendMessage(
    provider: string,
    message: string,
    conversationHistory?: Message[],
    isDebateModeOrPersonality?: boolean | RuntimePersonalityConfig,
    resumptionContextOrModel?: ResumptionContext | string,
    attachmentsOrParams?: MessageAttachment[] | Partial<ModelParameters>,
    modelOrDebateMode?: string | boolean
  ): Promise<{ response: string; modelUsed?: string; finishReason?: StreamFinishReason }> {
    // Handle overloaded parameters based on type checking
    let isDebateMode: boolean | undefined;
    let personality: RuntimePersonalityConfig | undefined;
    let resumptionContext: ResumptionContext | undefined;
    let model: string | undefined;
    let attachments: MessageAttachment[] | undefined;
    let parameters: Partial<ModelParameters> | undefined;

    // Parse the overloaded arguments
    if (typeof isDebateModeOrPersonality === 'boolean') {
      isDebateMode = isDebateModeOrPersonality;
    } else if (isDebateModeOrPersonality) {
      personality = isDebateModeOrPersonality;
    }

    if (resumptionContextOrModel && typeof resumptionContextOrModel === 'object') {
      resumptionContext = resumptionContextOrModel;
    } else if (typeof resumptionContextOrModel === 'string') {
      model = resumptionContextOrModel;
    }

    if (Array.isArray(attachmentsOrParams) && attachmentsOrParams.length > 0) {
      if (attachmentsOrParams[0].type === 'image' || attachmentsOrParams[0].type === 'document') {
        attachments = attachmentsOrParams as MessageAttachment[];
      }
    } else if (attachmentsOrParams && typeof attachmentsOrParams === 'object') {
      parameters = attachmentsOrParams as Partial<ModelParameters>;
    }

    if (typeof modelOrDebateMode === 'string') {
      model = modelOrDebateMode;
    } else if (typeof modelOrDebateMode === 'boolean') {
      isDebateMode = modelOrDebateMode;
    }

    const resolvedModel = model ? resolveProviderModelId(provider, model) : undefined;
    const adapter = await this.ensureAdapter(provider, provider, resolvedModel);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }
    
    // Apply configurations
    if (personality) {
      adapter.setTemporaryPersonality(personality);
    }
    
    if (model) {
      adapter.config.model = resolvedModel;
    }

    if (parameters) {
      adapter.config.parameters = parameters;
    }
    
    if (isDebateMode !== undefined) {
      adapter.config.isDebateMode = isDebateMode;
    }
    
    const result = await adapter.sendMessage(
      message,
      conversationHistory,
      resumptionContext,
      attachments,
      resolvedModel
    );
    
    // Return the full result object for compatibility
    if (typeof result === 'string') {
      return { response: result, modelUsed: resolvedModel || adapter.config.model };
    }
    return result;
  }
}
