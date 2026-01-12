import { ModelConfig } from '../modelConfigs';
import { ModelPricing } from '../modelPricing';

export interface ModelDefinition extends ModelConfig {
  pricing: ModelPricing;
  maxOutput: number;
  capabilities: {
    vision?: boolean;
    functions?: boolean;
    streaming: boolean;
    webSearch?: boolean;
    imageInput?: boolean;
    documentInput?: boolean;
    imageGeneration?: boolean;
    voiceInput?: boolean;
    voiceOutput?: boolean;
    realtime?: boolean;
  };
  releaseDate?: string;
  deprecated?: boolean;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  company: string;
  models: ModelDefinition[];
  defaultModel: string;
  supportedParameters: string[];
  rateLimits: {
    rpm: number;  // Requests per minute
    tpm: number;  // Tokens per minute
    rpd?: number; // Requests per day
  };
}

// Model aliases for version management - Updated December 2025
export const MODEL_ALIASES: Record<string, string> = {
  // Claude aliases
  'claude-latest': 'claude-sonnet-4-5-20250929',
  'claude-opus-latest': 'claude-opus-4-5-20251101',
  'claude-sonnet-latest': 'claude-sonnet-4-5-20250929',
  'claude-haiku-latest': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-opus-4-5': 'claude-opus-4-5-20251101',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',

  // OpenAI aliases
  'gpt-latest': 'gpt-5.2',
  'gpt-5-latest': 'gpt-5',
  'gpt-5.2-latest': 'gpt-5.2',
  'gpt-5-mini-latest': 'gpt-5-mini',
  'gpt-5-nano-latest': 'gpt-5-nano',
  'gpt-4o-latest': 'gpt-4o',
  'o1-latest': 'o1',
  'o3-mini-latest': 'o3-mini',

  // Google aliases
  'gemini-latest': 'gemini-2.5-flash',
  'gemini-pro-latest': 'gemini-2.5-pro',
  'gemini-flash-latest': 'gemini-2.5-flash',
  'gemini-3-latest': 'gemini-3-pro',

  // Grok aliases
  'grok-latest': 'grok-4-0709',
  'grok-4-latest': 'grok-4-0709',
  'grok-3-latest': 'grok-3',
  'grok-vision-latest': 'grok-2-vision-1212',
  'grok-image-latest': 'grok-2-image-1212',

  // Perplexity aliases
  'sonar-latest': 'sonar-pro',
  'sonar-pro-latest': 'sonar-pro',

  // Mistral aliases (using -latest suffix models directly)
  'mistral-latest': 'mistral-large-latest',

  // Cohere aliases
  'command-r-plus-latest': 'command-r-plus-08-2024',
  'command-r-latest': 'command-r-08-2024',
  'command-light-latest': 'command-light',

  // Together aliases
  'llama-405b-latest': 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  'llama-70b-latest': 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'llama-8b-latest': 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'qwen-72b-latest': 'Qwen/Qwen2.5-72B-Instruct-Turbo',

  // DeepSeek aliases
  'deepseek-chat-latest': 'deepseek-chat',
  'deepseek-reasoner-latest': 'deepseek-reasoner',
};

export const resolveModelAlias = (modelId: string): string => {
  return MODEL_ALIASES[modelId] || modelId;
};

// Helper function to get default model for a provider
// Updated December 2025 - All models available to all users (no premium gatekeeping)
export const getDefaultModel = (providerId: string): string => {
  const defaults: Record<string, string> = {
    claude: 'claude-sonnet-4-5-20250929',
    openai: 'gpt-5.2',
    google: 'gemini-2.5-flash',
    grok: 'grok-4-0709',
    perplexity: 'sonar-pro',
    mistral: 'mistral-large-latest',
    cohere: 'command-r-plus-08-2024',
    together: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    deepseek: 'deepseek-chat',
  };

  return defaults[providerId] || '';
};

// Migration helper for existing sessions without model field
export const migrateAIConfig = (config: Partial<{ provider: string; model: string }> & Record<string, unknown>): typeof config & { model: string } => {
  if (!config.model && config.provider) {
    config.model = getDefaultModel(config.provider);
  }
  return config as typeof config & { model: string };
};
