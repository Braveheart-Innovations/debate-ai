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

// Model aliases for version management
export const MODEL_ALIASES: Record<string, string> = {
  // Claude aliases - Updated August 2025 with correct model IDs
  'claude-latest': 'claude-3-7-sonnet-20250219',
  'claude-opus-latest': 'claude-opus-4-1-20250805',
  'claude-sonnet-latest': 'claude-3-7-sonnet-20250219',
  'claude-haiku-latest': 'claude-3-5-haiku-20241022',
  
  // OpenAI aliases
  'gpt-latest': 'gpt-5',
  'gpt-5-latest': 'gpt-5',
  'gpt-5-mini-latest': 'gpt-5-mini',
  'gpt-5-nano-latest': 'gpt-5-nano',
  'gpt-4o-latest': 'gpt-4o',
  'o1-latest': 'o1-2025',
  'o1-mini-latest': 'o1-mini-2025',
  
  // Google aliases - Updated with actual available models
  'gemini-latest': 'gemini-2.0-flash-exp',
  'gemini-pro-latest': 'gemini-1.5-pro-002',
  'gemini-flash-latest': 'gemini-2.0-flash-exp',
  'gemini-1.5-pro-latest': 'gemini-1.5-pro-002',
  'gemini-1.5-flash-latest': 'gemini-1.5-flash-002',
  'gemini-thinking': 'gemini-2.0-flash-thinking-exp-1219',
  
  // Grok aliases
  'grok-latest': 'grok-3',
  'grok-2-latest': 'grok-2-1212',
  'grok-vision-latest': 'grok-2-vision-1212',
  
  // Perplexity aliases
  'sonar-large-latest': 'llama-3.1-sonar-large-128k-online',
  'sonar-small-latest': 'llama-3.1-sonar-small-128k-online',
  'sonar-huge-latest': 'llama-3.1-sonar-huge-128k-online',
  
  // Mistral aliases
  'mistral-large-latest': 'mistral-large-2407',
  'mistral-small-latest': 'mistral-small-2402',
  'mixtral-8x7b-latest': 'mixtral-8x7b-32768',
  'mixtral-8x22b-latest': 'mixtral-8x22b-32768',
  
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
  'deepseek-coder-latest': 'deepseek-coder',
  'deepseek-reasoning-latest': 'deepseek-reasoning',
};

export const resolveModelAlias = (modelId: string): string => {
  return MODEL_ALIASES[modelId] || modelId;
};

// Helper function to get default model for a provider
export const getDefaultModel = (providerId: string): string => {
  // Return the model marked as isDefault: true for each provider
  // Updated August 2025 based on actual model availability
  const defaults: Record<string, string> = {
    claude: 'claude-3-7-sonnet-20250219',  // Claude 3.7 Sonnet is default for free users
    openai: 'gpt-5',  // GPT-5 is default for free users
    google: 'gemini-2.5-flash',  // Gemini 2.5 Flash for efficiency
    grok: 'grok-2-1212',
    perplexity: 'sonar',
    mistral: 'mistral-medium-latest',
    cohere: 'command-r-plus-08-2024',
    together: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    deepseek: 'deepseek-chat',
  };
  
  return defaults[providerId] || '';
};

// Helper function to get non-premium default model for free users
export const getFreeDefaultModel = (providerId: string): string => {
  const freeDefaults: Record<string, string> = {
    claude: 'claude-4-sonnet-20250522',  // Claude 4 Sonnet for free users
    openai: 'gpt-5',  // GPT-5 is default for free users per web search
    google: 'gemini-2.5-flash',
    grok: 'grok-2-1212',
    perplexity: 'sonar',
    mistral: 'mistral-small-2402',
    cohere: 'command-r-08-2024',
    together: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    deepseek: 'deepseek-chat',
  };
  
  return freeDefaults[providerId] || getDefaultModel(providerId);
};

// Migration helper for existing sessions without model field
export const migrateAIConfig = (config: Partial<{ provider: string; model: string }> & Record<string, unknown>): typeof config & { model: string } => {
  if (!config.model && config.provider) {
    config.model = getDefaultModel(config.provider);
  }
  return config as typeof config & { model: string };
};
