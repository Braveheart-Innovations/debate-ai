export interface ModelPricing {
  inputPer1M: number;  // Cost per 1M input tokens
  outputPer1M: number; // Cost per 1M output tokens
  freeMessages?: number; // Number of free messages per month (if applicable)
  freeTokens?: number; // Free tokens per month (if applicable)
}

export interface ProviderPricing {
  [modelId: string]: ModelPricing;
}

// Pricing as of December 2025
// Source: Official API documentation and web research
export const MODEL_PRICING: { [provider: string]: ProviderPricing } = {
  claude: {
    // Claude 4.5 series (latest)
    'claude-opus-4-5-20251101': {
      inputPer1M: 5.00,
      outputPer1M: 25.00,
    },
    'claude-sonnet-4-5-20250929': {
      inputPer1M: 3.00,
      outputPer1M: 15.00,
    },
    'claude-haiku-4-5-20251001': {
      inputPer1M: 1.00,
      outputPer1M: 5.00,
    },
    // Legacy models
    'claude-opus-4-1-20250805': {
      inputPer1M: 15.00,
      outputPer1M: 75.00,
    },
    'claude-sonnet-4-20250514': {
      inputPer1M: 3.00,
      outputPer1M: 15.00,
    },
    'claude-3-7-sonnet-20250219': {
      inputPer1M: 3.00,
      outputPer1M: 15.00,
    },
    'claude-3-5-haiku-20241022': {
      inputPer1M: 0.80,
      outputPer1M: 4.00,
    },
  },
  openai: {
    // GPT-5.2 (latest)
    'gpt-5.2': {
      inputPer1M: 1.50,
      outputPer1M: 12.00,
    },
    // GPT-5 series
    'gpt-5': {
      inputPer1M: 1.25,
      outputPer1M: 10.00,
    },
    'gpt-5-mini': {
      inputPer1M: 0.30,
      outputPer1M: 1.20,
    },
    'gpt-5-nano': {
      inputPer1M: 0.15,
      outputPer1M: 0.60,
    },
    // GPT-4 series
    'gpt-4.1': {
      inputPer1M: 2.00,
      outputPer1M: 8.00,
    },
    'gpt-4o': {
      inputPer1M: 2.50,
      outputPer1M: 10.00,
    },
    // Reasoning models
    'o3-mini': {
      inputPer1M: 3.00,
      outputPer1M: 12.00,
    },
    'o1': {
      inputPer1M: 15.00,
      outputPer1M: 60.00,
    },
    // Image generation
    'dall-e-3': {
      inputPer1M: 0,
      outputPer1M: 0,
    },
    'gpt-image-1': {
      inputPer1M: 0,
      outputPer1M: 0,
    },
  },
  google: {
    // Gemini 3 (GA)
    'gemini-3-pro-preview': {
      inputPer1M: 2.00,
      outputPer1M: 10.00,
    },
    'gemini-3-pro-image': {
      inputPer1M: 2.00,
      outputPer1M: 10.00,
    },
    // Gemini 2.5 (GA)
    'gemini-2.5-flash': {
      inputPer1M: 0.15,
      outputPer1M: 0.60,
    },
    'gemini-2.5-pro': {
      inputPer1M: 1.25,
      outputPer1M: 10.00,
    },
    'gemini-2.5-flash-lite': {
      inputPer1M: 0.10,
      outputPer1M: 0.40,
    },
    // Gemini 2.0
    'gemini-2.0-flash': {
      inputPer1M: 0.075,
      outputPer1M: 0.30,
    },
  },
  perplexity: {
    'sonar-pro': {
      inputPer1M: 3.00,
      outputPer1M: 15.00,
    },
    'sonar': {
      inputPer1M: 1.00,
      outputPer1M: 1.00,
    },
  },
  mistral: {
    'mistral-large-latest': {
      inputPer1M: 3.00,
      outputPer1M: 9.00,
    },
    'mistral-medium-latest': {
      inputPer1M: 2.00,
      outputPer1M: 6.00,
    },
    'mistral-small-latest': {
      inputPer1M: 1.00,
      outputPer1M: 3.00,
    },
    'pixtral-large-latest': {
      inputPer1M: 3.00,
      outputPer1M: 9.00,
    },
    'codestral-latest': {
      inputPer1M: 1.00,
      outputPer1M: 3.00,
    },
  },
  cohere: {
    'command-r-plus-08-2024': {
      inputPer1M: 3.00,
      outputPer1M: 15.00,
    },
    'command-r7b-12-2024': {
      inputPer1M: 0.30,
      outputPer1M: 0.90,
    },
    'command-r-08-2024': {
      inputPer1M: 0.50,
      outputPer1M: 1.50,
    },
    'command-light': {
      inputPer1M: 0.30,
      outputPer1M: 0.60,
    },
  },
  together: {
    'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
      inputPer1M: 5.00,
      outputPer1M: 15.00,
    },
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': {
      inputPer1M: 0.88,
      outputPer1M: 0.88,
    },
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
      inputPer1M: 0.20,
      outputPer1M: 0.20,
    },
    'Qwen/Qwen2.5-72B-Instruct-Turbo': {
      inputPer1M: 1.20,
      outputPer1M: 1.20,
    },
  },
  deepseek: {
    'deepseek-reasoner': {
      inputPer1M: 0.55,
      outputPer1M: 2.19,
    },
    'deepseek-chat': {
      inputPer1M: 0.14,
      outputPer1M: 0.28,
    },
  },
  grok: {
    'grok-4-0709': {
      inputPer1M: 10.00,
      outputPer1M: 30.00,
    },
    'grok-4-1-fast-reasoning': {
      inputPer1M: 8.00,
      outputPer1M: 24.00,
    },
    'grok-4-fast-reasoning': {
      inputPer1M: 8.00,
      outputPer1M: 24.00,
    },
    'grok-3': {
      inputPer1M: 5.00,
      outputPer1M: 15.00,
    },
    'grok-3-mini': {
      inputPer1M: 2.00,
      outputPer1M: 6.00,
    },
    'grok-code-fast-1': {
      inputPer1M: 3.00,
      outputPer1M: 9.00,
    },
    'grok-2-vision-1212': {
      inputPer1M: 5.00,
      outputPer1M: 15.00,
    },
    'grok-2-image-1212': {
      inputPer1M: 0,
      outputPer1M: 0,
    },
  },
};

export function calculateMessageCost(
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[provider]?.[modelId];
  if (!pricing) return 0;
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  
  return inputCost + outputCost;
}

export function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.001) return '<$0.001';
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  if (cost < 0.10) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function getEstimatedCostPerMessage(
  provider: string,
  modelId: string,
  avgInputTokens: number = 200,  // Average prompt (~50 words)
  avgOutputTokens: number = 800  // Average response (~200 words)
): string {
  // Check for specific model or default pricing
  const pricing = MODEL_PRICING[provider]?.[modelId] || MODEL_PRICING[provider]?.['default'];
  if (!pricing) {
    const cost = calculateMessageCost(provider, modelId, avgInputTokens, avgOutputTokens);
    return formatCost(cost);
  }
  
  // Calculate cost for this specific pricing
  const inputCost = (avgInputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (avgOutputTokens / 1_000_000) * pricing.outputPer1M;
  return formatCost(inputCost + outputCost);
}

export function getFreeMessageInfo(provider: string, modelId: string): string | null {
  const pricing = MODEL_PRICING[provider]?.[modelId] || MODEL_PRICING[provider]?.['default'];
  if (!pricing?.freeMessages) return null;
  
  if (pricing.freeMessages === -1) {
    return 'Unlimited with subscription';
  }
  
  return `${pricing.freeMessages} free messages/month`;
}