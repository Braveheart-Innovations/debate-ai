/**
 * Model Version Management Configuration
 * 
 * This file contains mappings for model versioning and easy updates.
 * Update this file when new model versions are released.
 * 
 * Last updated: September 2026
 */

export interface ModelVersionInfo {
  id: string;
  version: string;
  releaseDate: string;
  isLatest: boolean;
  isDeprecated?: boolean;
  deprecationDate?: string;
  replacedBy?: string;
}

export interface ProviderVersions {
  [providerId: string]: {
    [modelFamily: string]: ModelVersionInfo[];
  };
}

/**
 * Current model versions by provider and family
 * This makes it easy to update model versions without changing business logic
 */
export const MODEL_VERSIONS: ProviderVersions = {
  claude: {
    premium: [
      {
        id: 'claude-opus-5-5',
        version: '5.5-opus',
        releaseDate: '2026-09-30',
        isLatest: true,
      },
      {
        id: 'claude-opus-5',
        version: '5-opus',
        releaseDate: '2026-08-17',
        isLatest: false,
      },
      {
        id: 'claude-opus-4-8',
        version: '4.8-opus',
        releaseDate: '2026-05-28',
        isLatest: false,
      },
      {
        id: 'claude-opus-4-7',
        version: '4.7-opus',
        releaseDate: '2026-03-01',
        isLatest: false,
      },
      {
        id: 'claude-opus-4-6',
        version: '4.6-opus',
        releaseDate: '2026-03-01',
        isLatest: false,
      },
      {
        id: 'claude-opus-4-5-20251101',
        version: '4.5-opus',
        releaseDate: '2025-11-01',
        isLatest: false,
      },
      {
        id: 'claude-opus-4-1-20250805',
        version: '4.1-opus',
        releaseDate: '2025-08-05',
        isLatest: false,
      },
      {
        id: 'claude-3-opus-20240229',
        version: '3.0-opus',
        releaseDate: '2024-02-29',
        isLatest: false,
        isDeprecated: true,
        deprecationDate: '2025-06-30',
        replacedBy: 'claude-opus-4-8',
      },
    ],
    fable: [
      {
        id: 'claude-fable-5-1',
        version: '5.1-fable',
        releaseDate: '2026-09-03',
        isLatest: true,
      },
      {
        id: 'claude-fable-5',
        version: '5-fable',
        releaseDate: '2026-06-10',
        isLatest: false,
      },
    ],
    balanced: [
      {
        id: 'claude-sonnet-5-5',
        version: '5.5-sonnet',
        releaseDate: '2026-09-30',
        isLatest: true,
      },
      {
        id: 'claude-sonnet-5',
        version: '5-sonnet',
        releaseDate: '2026-07-16',
        isLatest: false,
      },
      {
        id: 'claude-sonnet-4-6',
        version: '4.6-sonnet',
        releaseDate: '2026-03-01',
        isLatest: false,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        version: '4.5-sonnet',
        releaseDate: '2025-09-29',
        isLatest: false,
      },
      {
        id: 'claude-sonnet-4-20250514',
        version: '4.0-sonnet',
        releaseDate: '2025-05-14',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'claude-sonnet-5',
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        version: '3.7-sonnet',
        releaseDate: '2025-02-19',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'claude-sonnet-4-6',
      },
    ],
    economy: [
      {
        id: 'claude-haiku-4-5-20251001',
        version: '4.5-haiku',
        releaseDate: '2025-10-01',
        isLatest: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        version: '3.5-haiku',
        releaseDate: '2024-10-22',
        isLatest: false,
      },
    ],
  },
  openai: {
    flagship: [
      {
        id: 'gpt-6.1-sol',
        version: '6.1-sol',
        releaseDate: '2026-09-30',
        isLatest: true,
      },
      {
        id: 'gpt-6-astra',
        version: '6-astra',
        releaseDate: '2026-09-03',
        isLatest: false,
      },
      {
        id: 'gpt-6-sol',
        version: '6-sol',
        releaseDate: '2026-09-30',
        isLatest: false,
      },
      {
        id: 'gpt-5.6-sol',
        version: '5.6-sol',
        releaseDate: '2026-07-16',
        isLatest: false,
      },
      {
        id: 'gpt-5.6-terra',
        version: '5.6-terra',
        releaseDate: '2026-07-16',
        isLatest: false,
      },
      {
        id: 'gpt-5.5',
        version: '5.5',
        releaseDate: '2026-04-23',
        isLatest: false,
      },
      {
        id: 'gpt-5.5-pro',
        version: '5.5-pro',
        releaseDate: '2026-04-23',
        isLatest: false,
      },
      {
        id: 'gpt-5.4',
        version: '5.4',
        releaseDate: '2026-03-01',
        isLatest: false,
      },
      {
        id: 'gpt-5.2',
        version: '5.2',
        releaseDate: '2025-12-01',
        isLatest: false,
      },
      {
        id: 'gpt-5',
        version: '5.0',
        releaseDate: '2025-08-01',
        isLatest: false,
      },
      {
        id: 'gpt-4.1',
        version: '4.1',
        releaseDate: '2025-04-01',
        isLatest: false,
      },
    ],
    efficient: [
      {
        id: 'gpt-6-luna',
        version: '6-luna',
        releaseDate: '2026-09-30',
        isLatest: true,
      },
      {
        id: 'gpt-5.6-luna',
        version: '5.6-luna',
        releaseDate: '2026-07-16',
        isLatest: false,
      },
      {
        id: 'gpt-5.4-mini',
        version: '5.4-mini',
        releaseDate: '2026-03-17',
        isLatest: false,
      },
      {
        id: 'gpt-5.4-nano',
        version: '5.4-nano',
        releaseDate: '2026-03-17',
        isLatest: false,
      },
      {
        id: 'gpt-5-mini',
        version: '5-mini',
        releaseDate: '2025-08-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'gpt-5.4-mini',
      },
      {
        id: 'gpt-5-nano',
        version: '5-nano',
        releaseDate: '2025-08-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'gpt-5.4-nano',
      },
    ],
    reasoning: [
      {
        id: 'o3',
        version: 'o3',
        releaseDate: '2025-04-01',
        isLatest: true,
      },
      {
        id: 'o4-mini',
        version: 'o4-mini',
        releaseDate: '2025-04-01',
        isLatest: false,
      },
      {
        id: 'o1',
        version: 'o1',
        releaseDate: '2024-12-01',
        isLatest: false,
      },
    ],
  },
  google: {
    flagship: [
      {
        id: 'gemini-3.1-pro-preview',
        version: '3.1-pro-preview',
        releaseDate: '2026-03-01',
        isLatest: true,
      },
      {
        id: 'gemini-2.5-pro',
        version: '2.5',
        releaseDate: '2025-06-17',
        isLatest: false,
      },
      {
        id: 'gemini-1.5-pro',
        version: '001',
        releaseDate: '2024-05-01',
        isLatest: false,
      },
    ],
    fast: [
      {
        id: 'gemini-3.8-flash',
        version: '3.8-flash',
        releaseDate: '2026-09-03',
        isLatest: true,
      },
      {
        id: 'gemini-3.7-flash',
        version: '3.7-flash',
        releaseDate: '2026-08-17',
        isLatest: false,
      },
      {
        id: 'gemini-3.6-flash',
        version: '3.6-flash',
        releaseDate: '2026-07-01',
        isLatest: false,
      },
      {
        id: 'gemini-3.5-flash',
        version: '3.5-flash',
        releaseDate: '2026-05-19',
        isLatest: false,
      },
      {
        id: 'gemini-3.5-flash-lite',
        version: '3.5-flash-lite',
        releaseDate: '2026-07-01',
        isLatest: false,
      },
      {
        id: 'gemini-3-flash-preview',
        version: '3-flash-preview',
        releaseDate: '2026-03-01',
        isLatest: false,
      },
      {
        id: 'gemini-3.1-flash-lite',
        version: '3.1-flash-lite',
        releaseDate: '2026-05-19',
        isLatest: false,
      },
      {
        id: 'gemini-3.1-flash-lite-preview',
        version: '3.1-flash-lite-preview',
        releaseDate: '2026-03-01',
        isLatest: false,
        isDeprecated: true,
        deprecationDate: '2026-05-25',
        replacedBy: 'gemini-3.1-flash-lite',
      },
      {
        id: 'gemini-2.5-flash',
        version: '001',
        releaseDate: '2025-06-01',
        isLatest: false,
      },
      {
        id: 'gemini-2.5-flash-lite',
        version: '001',
        releaseDate: '2025-07-01',
        isLatest: false,
      },
      {
        id: 'gemini-2.0-flash',
        version: '2.0',
        releaseDate: '2025-01-01',
        isLatest: false,
      },
      {
        id: 'gemini-1.5-flash',
        version: '001',
        releaseDate: '2024-05-01',
        isLatest: false,
      },
      {
        id: 'gemini-1.5-flash-8b',
        version: '001',
        releaseDate: '2024-10-01',
        isLatest: false,
      },
    ],
  },
  grok: {
    main: [
      {
        id: 'grok-4.3',
        version: '4.3',
        releaseDate: '2026-04-17',
        isLatest: true,
      },
      {
        id: 'grok-4.7',
        version: '4.7',
        releaseDate: '2026-09-30',
        isLatest: false,
      },
      {
        id: 'grok-4.6',
        version: '4.6',
        releaseDate: '2026-08-17',
        isLatest: false,
      },
      {
        id: 'grok-4.5',
        version: '4.5',
        releaseDate: '2026-07-16',
        isLatest: false,
      },
      {
        id: 'grok-build-0.1',
        version: 'build-0.1',
        releaseDate: '2026-06-01',
        isLatest: false,
      },
      {
        id: 'grok-4.20-0309-non-reasoning',
        version: '4.20-non-reasoning',
        releaseDate: '2026-03-09',
        isLatest: false,
      },
      {
        id: 'grok-4.20-0309-reasoning',
        version: '4.20-reasoning',
        releaseDate: '2026-03-09',
        isLatest: false,
      },
      {
        id: 'grok-4-1-fast-non-reasoning',
        version: '4.1-fast-non-reasoning',
        releaseDate: '2026-04-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'grok-4.3',
      },
      {
        id: 'grok-4-1-fast-reasoning',
        version: '4.1-fast-reasoning',
        releaseDate: '2026-04-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'grok-4.3',
      },
      {
        id: 'grok-4-0709',
        version: '4',
        releaseDate: '2025-07-09',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'grok-4.3',
      },
      {
        id: 'grok-3',
        version: '3',
        releaseDate: '2025-02-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'grok-4.3',
      },
    ],
    vision: [
      {
        id: 'grok-imagine-image',
        version: 'imagine',
        releaseDate: '2025-01-01',
        isLatest: true,
      },
    ],
  },
  perplexity: {
    online: [
      {
        id: 'sonar-pro',
        version: 'pro',
        releaseDate: '2025-01-01',
        isLatest: true,
      },
      {
        id: 'sonar',
        version: 'standard',
        releaseDate: '2025-01-01',
        isLatest: false,
      },
    ],
    reasoning: [
      {
        id: 'sonar-reasoning',
        version: 'reasoning',
        releaseDate: '2025-01-01',
        isLatest: true,
      },
      {
        id: 'sonar-reasoning-pro',
        version: 'reasoning-pro',
        releaseDate: '2025-01-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'sonar-reasoning',
      },
    ],
    research: [
      {
        id: 'sonar-deep-research',
        version: 'deep-research',
        releaseDate: '2025-03-01',
        isLatest: true,
      },
    ],
  },
  mistral: {
    large: [
      {
        id: 'mistral-large-2512',
        version: '2512',
        releaseDate: '2025-12-01',
        isLatest: true,
        isDeprecated: true,
        replacedBy: 'mistral-medium-2604',
      },
    ],
    medium: [
      {
        id: 'mistral-medium-2604',
        version: '2604',
        releaseDate: '2026-04-01',
        isLatest: true,
      },
      {
        id: 'mistral-medium-2508',
        version: '2508',
        releaseDate: '2025-08-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'mistral-medium-2604',
      },
      {
        id: 'devstral-2512',
        version: '2512',
        releaseDate: '2025-12-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'mistral-medium-2604',
      },
    ],
    small: [
      {
        id: 'mistral-small-2603',
        version: '2603',
        releaseDate: '2026-03-01',
        isLatest: true,
        isDeprecated: true,
      },
      {
        id: 'mistral-small-2506',
        version: '2506',
        releaseDate: '2025-06-01',
        isLatest: false,
      },
    ],
    ministral: [
      {
        id: 'ministral-14b-2512',
        version: '14b-2512',
        releaseDate: '2025-12-01',
        isLatest: true,
      },
      {
        id: 'ministral-8b-2512',
        version: '8b-2512',
        releaseDate: '2025-12-01',
        isLatest: false,
      },
      {
        id: 'ministral-3b-2512',
        version: '3b-2512',
        releaseDate: '2025-12-01',
        isLatest: false,
      },
    ],
    reasoning: [
      {
        id: 'magistral-medium-2509',
        version: '2509',
        releaseDate: '2025-09-01',
        isLatest: true,
      },
      {
        id: 'magistral-small-2509',
        version: 'small-2509',
        releaseDate: '2025-09-01',
        isLatest: false,
        isDeprecated: true,
      },
    ],
    coding: [
      {
        id: 'codestral-2508',
        version: '2508',
        releaseDate: '2025-08-01',
        isLatest: true,
      },
    ],
  },
  cohere: {
    command: [
      {
        id: 'command-a-plus-05-2026',
        version: 'a-plus-05-2026',
        releaseDate: '2026-05-20',
        isLatest: true,
      },
      {
        id: 'command-a-reasoning-08-2025',
        version: 'a-reasoning-08-2025',
        releaseDate: '2025-08-01',
        isLatest: false,
      },
      {
        id: 'command-a-vision-07-2025',
        version: 'a-vision-07-2025',
        releaseDate: '2025-07-01',
        isLatest: false,
      },
      {
        id: 'command-a-03-2025',
        version: 'a-03-2025',
        releaseDate: '2025-03-01',
        isLatest: false,
      },
      {
        id: 'command-a-translate-08-2025',
        version: 'a-translate-08-2025',
        releaseDate: '2025-08-01',
        isLatest: false,
      },
      {
        id: 'north-small-translate-09-2026',
        version: 'north-small-translate-09-2026',
        releaseDate: '2026-09-10',
        isLatest: false,
      },
      {
        id: 'command-r-08-2024',
        version: 'r-08-2024',
        releaseDate: '2024-08-01',
        isLatest: false,
      },
      {
        id: 'command-r7b-12-2024',
        version: 'r7b-12-2024',
        releaseDate: '2024-12-01',
        isLatest: false,
      },
    ],
  },
  deepseek: {
    chat: [
      {
        id: 'deepseek-flash',
        version: 'v4.1-flash',
        releaseDate: '2026-09-10',
        isLatest: true,
      },
      {
        id: 'deepseek-v4-flash',
        version: 'v4-flash',
        releaseDate: '2026-04-24',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'deepseek-flash',
      },
    ],
    pro: [
      {
        id: 'deepseek-v4-pro',
        version: 'v4-pro',
        releaseDate: '2026-04-24',
        isLatest: true,
        isDeprecated: true,
        replacedBy: 'deepseek-flash',
      },
    ],
    reasoning: [
      {
        id: 'deepseek-flash',
        version: 'v4.1-flash-thinking',
        releaseDate: '2026-09-10',
        isLatest: true,
      },
      {
        id: 'deepseek-reasoner',
        version: 'reasoner',
        releaseDate: '2025-06-01',
        isLatest: false,
        isDeprecated: true,
        replacedBy: 'deepseek-flash',
      },
    ],
  },
  moonshot: {
    main: [
      {
        id: 'kimi-k3',
        version: 'k3',
        releaseDate: '2026-06-10',
        isLatest: true,
      },
      {
        id: 'kimi-k2.6',
        version: 'k2.6',
        releaseDate: '2026-02-20',
        isLatest: false,
      },
    ],
    code: [
      {
        id: 'kimi-k2.7-code',
        version: 'k2.7-code',
        releaseDate: '2026-05-05',
        isLatest: true,
      },
      {
        id: 'kimi-k2.7-code-highspeed',
        version: 'k2.7-code-highspeed',
        releaseDate: '2026-05-05',
        isLatest: false,
      },
    ],
  },
  zai: {
    main: [
      {
        id: 'glm-5.3',
        version: '5.3',
        releaseDate: '2026-09-03',
        isLatest: true,
      },
      {
        id: 'glm-5.2',
        version: '5.2',
        releaseDate: '2026-05-28',
        isLatest: false,
      },
      {
        id: 'glm-5.1',
        version: '5.1',
        releaseDate: '2026-02-11',
        isLatest: false,
      },
    ],
    flash: [
      {
        id: 'glm-5.3-flash',
        version: '5.3-flash',
        releaseDate: '2026-09-03',
        isLatest: true,
      },
      {
        id: 'glm-5.3-flashx',
        version: '5.3-flashx',
        releaseDate: '2026-09-30',
        isLatest: false,
      },
    ],
    turbo: [
      {
        id: 'glm-5-turbo',
        version: '5-turbo',
        releaseDate: '2026-03-02',
        isLatest: true,
      },
    ],
  },
};

/**
 * Helper functions for model version management
 */

export const getLatestModelInFamily = (providerId: string, family: string): string | null => {
  const providerVersions = MODEL_VERSIONS[providerId];
  if (!providerVersions) return null;
  
  const familyVersions = providerVersions[family];
  if (!familyVersions) return null;
  
  const latestModel = familyVersions.find(model => model.isLatest);
  return latestModel ? latestModel.id : null;
};

export const getAllModelsForProvider = (providerId: string): ModelVersionInfo[] => {
  const providerVersions = MODEL_VERSIONS[providerId];
  if (!providerVersions) return [];
  
  return Object.values(providerVersions).flat();
};

export const getModelInfo = (modelId: string): ModelVersionInfo | null => {
  for (const provider of Object.values(MODEL_VERSIONS)) {
    for (const family of Object.values(provider)) {
      const model = family.find(m => m.id === modelId);
      if (model) return model;
    }
  }
  return null;
};

export const isModelDeprecated = (modelId: string): boolean => {
  const modelInfo = getModelInfo(modelId);
  return modelInfo?.isDeprecated === true;
};

/**
 * Migration guide for updating models:
 * 
 * 1. Add new model to appropriate family in MODEL_VERSIONS
 * 2. Set isLatest: true for the new model
 * 3. Set isLatest: false for the previous model
 * 4. Update MODEL_ALIASES in modelRegistry.ts if needed
 * 5. Update pricing in modelPricing.ts
 * 6. Add model to AI_MODELS in modelConfigs.ts
 * 7. Test with TypeScript and ESLint
 */
