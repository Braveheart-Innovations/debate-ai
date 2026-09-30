import type { ModelConfig } from '../modelConfigs';
import type { ModelPricing } from '../modelPricing';

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

// Model aliases for version management and persisted-session compatibility - Updated September 2026
export const MODEL_ALIASES: Record<string, string> = {
  // Claude aliases
  'claude-latest': 'claude-sonnet-5-5',
  'claude-fable-latest': 'claude-fable-5-1',
  'claude-opus-latest': 'claude-opus-5-5',
  'claude-sonnet-latest': 'claude-sonnet-5-5',
  'claude-haiku-latest': 'claude-haiku-4-5-20251001',
  'claude-opus-4-8-20260520': 'claude-opus-4-8',
  'claude-opus-4-8-20260528': 'claude-opus-4-8',
  'claude-opus-4-7-20260301': 'claude-opus-4-7',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-opus-4-5': 'claude-opus-4-5-20251101',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',

  // OpenAI aliases
  'gpt-latest': 'gpt-6.1-sol',
  'gpt-6-latest': 'gpt-6-astra',
  'gpt-5.6-latest': 'gpt-5.6-sol',
  'gpt-5-latest': 'gpt-5.5',
  'gpt-5.5-latest': 'gpt-5.5',
  'gpt-5.5-2026-04-23': 'gpt-5.5',
  'gpt-5.5-pro-latest': 'gpt-5.5-pro',
  'gpt-5.5-pro-2026-04-23': 'gpt-5.5-pro',
  'gpt-5.2-latest': 'gpt-5.2',
  // gpt-5-mini/nano were removed from the catalog; keep persisted sessions working
  'gpt-5-mini': 'gpt-5.4-mini',
  'gpt-5-nano': 'gpt-5.4-nano',
  'gpt-5-mini-latest': 'gpt-5.4-mini',
  'gpt-5-nano-latest': 'gpt-5.4-nano',
  'gpt-5.4-mini-latest': 'gpt-5.4-mini',
  'gpt-5.4-mini-2026-03-17': 'gpt-5.4-mini',
  'gpt-5.4-nano-latest': 'gpt-5.4-nano',
  'gpt-5.4-nano-2026-03-17': 'gpt-5.4-nano',
  'gpt-4o-latest': 'gpt-4o',
  'o1-latest': 'o1',
  'o3-latest': 'o3',
  'o4-mini-latest': 'o4-mini',
  'o3-mini-latest': 'o3-mini',

  // Google aliases (mobile resolves gemini-*-latest to concrete IDs; there is
  // no unknown-ID passthrough here, unlike the web app)
  'gemini-latest': 'gemini-3.8-flash',
  'gemini-pro-latest': 'gemini-3.1-pro-preview',
  'gemini-flash-latest': 'gemini-3.6-flash',
  'gemini-flash-lite-latest': 'gemini-3.5-flash-lite',
  'gemini-3-latest': 'gemini-3.8-flash',
  'gemini-3.8-latest': 'gemini-3.8-flash',
  'gemini-3.7-latest': 'gemini-3.7-flash',
  'gemini-3.6-latest': 'gemini-3.6-flash',
  'gemini-3.5-latest': 'gemini-3.5-flash',
  'gemini-3.1-latest': 'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-latest': 'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
  'gemini-2.5-latest': 'gemini-2.5-flash',

  // Grok aliases
  'grok-latest': 'grok-4.3',
  'grok-4-latest': 'grok-4.3',
  'grok-4.3-latest': 'grok-4.3',
  'grok-4.5-latest': 'grok-4.5',
  // xAI resolves grok-4.20 to the reasoning variant and grok-build-latest to
  // grok-4.5 (verified via /v1/models aliases) — keep these matching the API.
  'grok-4.20': 'grok-4.20-0309-reasoning',
  'grok-build-latest': 'grok-4.5',
  'grok-coding-latest': 'grok-4.5',
  'grok-4.20-non-reasoning': 'grok-4.20-0309-non-reasoning',
  'grok-4.20-reasoning': 'grok-4.20-0309-reasoning',
  // grok-4-1-fast models are retired; persisted sessions resolve to the
  // deprecated entries and route to the provider default at request time
  'grok-fast-latest': 'grok-4-1-fast-non-reasoning',
  'grok-4.1-fast': 'grok-4-1-fast-non-reasoning',
  'grok-4-1-fast': 'grok-4-1-fast-non-reasoning',
  'grok-4-1-fast-reasoning-latest': 'grok-4-1-fast-reasoning',
  'grok-4-1-fast-non-reasoning-latest': 'grok-4-1-fast-non-reasoning',
  'grok-3-latest': 'grok-3',
  'grok-vision-latest': 'grok-4.20-0309-non-reasoning',
  'grok-image-latest': 'grok-imagine-image',

  // Perplexity aliases
  'sonar-latest': 'sonar-pro',
  'sonar-pro-latest': 'sonar-pro',
  'sonar-reasoning-latest': 'sonar-reasoning-pro',
  'sonar-reasoning': 'sonar-reasoning-pro',
  'sonar-research-latest': 'sonar-deep-research',

  // Mistral aliases
  // mistral-large-2512 is tier-gated for standard keys (2026-09); the Mistral
  // API itself now serves Mistral Medium 3.5 for the retired Devstral 2 and
  // Mistral Medium 3.1 ids, so route them the same way.
  'mistral-latest': 'mistral-medium-2604',
  'mistral-large-latest': 'mistral-large-2512',
  'mistral-medium-latest': 'mistral-medium-2604',
  // mistral-medium-3-5 was a mobile-only ID; the live API ID is mistral-medium-2604
  'mistral-medium-3-5': 'mistral-medium-2604',
  'mistral-medium-3.5': 'mistral-medium-2604',
  'mistral-medium-c21211-r0-75': 'mistral-medium-2604',
  'mistral-small-latest': 'mistral-small-2603',
  'devstral-medium-2512': 'mistral-medium-2604',
  'devstral-2512': 'mistral-medium-2604',
  'mistral-medium-2508': 'mistral-medium-2604',
  'magistral-latest': 'mistral-small-2603',
  // magistral-medium-2509 was retired; the Mistral API now resolves
  // magistral-medium-latest to mistral-medium-latest (verified 2026-09-30).
  'magistral-medium-latest': 'mistral-medium-2604',
  'codestral-latest': 'codestral-2508',
  'pixtral-large-latest': 'pixtral-large-2411',

  // Cohere aliases
  'command-a-plus-latest': 'command-a-plus-05-2026',
  'command-a-plus': 'command-a-plus-05-2026',
  'command-a-reasoning-latest': 'command-a-reasoning-08-2025',
  'command-a-vision-latest': 'command-a-vision-07-2025',
  'command-a-latest': 'command-a-03-2025',
  'command-a-translate-latest': 'command-a-translate-08-2025',
  'north-small-translate-latest': 'north-small-translate-09-2026',
  'command-r-plus-latest': 'command-a-reasoning-08-2025',
  'command-r-latest': 'command-r-08-2024',
  'command-light-latest': 'command-r7b-12-2024',

  // DeepSeek aliases
  // DeepSeek retired the V4 Flash names on 2026-09-10; all of them (and the
  // legacy chat/reasoner names) are served as V4.1 Flash = deepseek-flash.
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-flash',
  'deepseek-chat-latest': 'deepseek-flash',
  'deepseek-reasoner-latest': 'deepseek-flash',
  'deepseek-latest': 'deepseek-flash',
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
};

export const resolveModelAlias = (modelId: string): string => {
  return MODEL_ALIASES[modelId] || modelId;
};

// Default model per provider - Updated September 2026, verified live model IDs.
// Exported as a plain map so tooling (scripts/discover-provider-models.mjs)
// can statically parse it.
export const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-5-5',
  openai: 'gpt-6.1-sol',
  google: 'gemini-3.8-flash',
  grok: 'grok-4.3',
  perplexity: 'sonar-pro',
  mistral: 'mistral-medium-2604',
  cohere: 'command-a-reasoning-08-2025',
  deepseek: 'deepseek-flash',
  moonshot: 'kimi-k3',
  zai: 'glm-5.3',
};

// Helper function to get default model for a provider
export const getDefaultModel = (providerId: string): string => {
  return DEFAULT_PROVIDER_MODELS[providerId] || '';
};

// Migration helper for existing sessions without model field
export const migrateAIConfig = (config: Partial<{ provider: string; model: string }> & Record<string, unknown>): typeof config & { model: string } => {
  if (!config.model && config.provider) {
    config.model = getDefaultModel(config.provider);
  }
  return config as typeof config & { model: string };
};
