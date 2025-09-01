export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  isPremium?: boolean;
  isDefault?: boolean;
  supportsVision?: boolean;
  supportsDocuments?: boolean;  // Specifically for PDF/document support
  supportsFunctions?: boolean;
  supportsWebSearch?: boolean;  // For Perplexity models with web search
  requiresTemperature1?: boolean;  // For GPT-5 and O1 models
  useMaxCompletionTokens?: boolean;  // For GPT-5 models that use max_completion_tokens
  // Extended capability flags (2025-08):
  supportsImageInput?: boolean;      // Alias of supportsVision (explicit)
  supportsImageGeneration?: boolean; // Can generate images (e.g., gpt-image-1)
  supportsVoiceInput?: boolean;      // Realtime voice input (STT)
  supportsVoiceOutput?: boolean;     // Realtime voice output (TTS)
  supportsRealtime?: boolean;        // Realtime API support
}

export interface ProviderModels {
  [providerId: string]: ModelConfig[];
}

// Updated August 2025 - Current model offerings from each provider
export const AI_MODELS: ProviderModels = {
  claude: [
    {
      id: 'claude-opus-4-1-20250805',
      name: 'Claude 4.1 Opus',
      description: 'Most powerful model with enhanced reasoning and search',
      contextLength: 200000,
      isDefault: false,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,  // Supports PDF files
      supportsFunctions: true,
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude 4 Sonnet',
      description: 'Superior coding and reasoning, balanced performance',
      contextLength: 200000,
      isDefault: false,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,  // Supports PDF files
      supportsFunctions: true,
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      description: 'Hybrid reasoning model with rapid and deep thinking modes',
      contextLength: 200000,
      isDefault: true, // Free tier default
      supportsVision: true,
      supportsDocuments: true,  // Supports PDF files
      supportsFunctions: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'Previous generation, excellent general performance',
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,  // Supports PDF files
      supportsFunctions: true,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      description: 'Fastest and most cost-effective option',
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,  // Supports PDF files
      supportsFunctions: true,
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      description: 'Previous generation flagship, powerful but older',
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: false,  // Does NOT support PDFs
      supportsFunctions: true,
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      description: 'Legacy model, very economical',
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: false,  // Does NOT support PDFs
    },
  ],
  openai: [
    {
      id: 'gpt-5',
      name: 'GPT-5',
      description: 'Latest flagship model with advanced reasoning (August 2025)',
      contextLength: 272000,
      isDefault: false,
      isPremium: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      requiresTemperature1: true, // GPT-5 models require temperature=1
      useMaxCompletionTokens: true, // Uses max_completion_tokens instead of max_tokens
    },
    {
      id: 'gpt-5-mini',
      name: 'GPT-5 Mini',
      description: 'Efficient GPT-5 for faster responses',
      contextLength: 272000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: 'gpt-5-nano',
      name: 'GPT-5 Nano',
      description: 'Ultra-fast GPT-5 for simple tasks',
      contextLength: 272000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      description: 'Enhanced GPT-4 with improvements (April 2025)',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 Mini',
      description: 'Efficient GPT-4.1 variant',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Omni-modal model with vision and audio',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsRealtime: true,
      supportsVoiceInput: true,
      supportsVoiceOutput: true,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Cost-effective multimodal model',
      contextLength: 128000,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      description: 'Fast GPT-4 with latest knowledge',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'o1',
      name: 'O1',
      description: 'Advanced reasoning model (December 2024)',
      contextLength: 200000,
      isPremium: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
    },
    {
      id: 'o1-mini',
      name: 'O1 Mini',
      description: 'Fast reasoning for coding and math',
      contextLength: 128000,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
    },
    {
      id: 'o1-pro',
      name: 'O1 Pro',
      description: 'Most capable reasoning model (March 2025)',
      contextLength: 200000,
      isPremium: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'Legacy model, very cost-effective',
      contextLength: 16385,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    // Images generation model (Responses tool or Images API)
    {
      id: 'gpt-image-1',
      name: 'GPT Image 1',
      description: 'Image generation model',
      contextLength: 0,
      supportsImageGeneration: true,
      // Not a chat-completion model; no document/vision input here
    },
  ],
  google: [
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash-Lite',
      description: 'Most cost-effective 2.5 model (July 2025)',
      contextLength: 1048576,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Latest flagship with thinking capabilities (June 2025)',
      contextLength: 1048576,
      isDefault: false,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Fast multimodal model with 1M context (June 2025)',
      contextLength: 1048576,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      description: 'Fast and versatile (January 2025)',
      contextLength: 1048576,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      description: 'Stable with 2M context window (May 2024)',
      contextLength: 2000000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      description: 'Fast with 1M context',
      contextLength: 1000000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'gemini-1.5-flash-8b',
      name: 'Gemini 1.5 Flash-8B',
      description: 'Smallest and most cost-effective (Oct 2024)',
      contextLength: 1000000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
  ],
  perplexity: [
    {
      id: 'sonar',
      name: 'Sonar',
      description: 'Fast, cost-efficient with real-time web search and vision',
      contextLength: 127000,
      isDefault: true,
      supportsWebSearch: true,
      supportsVision: true,  // Supports image analysis
      supportsDocuments: true,
    },
    {
      id: 'sonar-pro',
      name: 'Sonar Pro',
      description: 'Advanced model for complex queries with 2x citations and vision',
      contextLength: 200000,
      isPremium: true,
      supportsWebSearch: true,
      supportsVision: true,  // Supports image analysis
      supportsDocuments: true,
    },
  ],
  mistral: [
    {
      id: 'mistral-medium-latest',
      name: 'Mistral Medium',
      description: 'Latest multimodal flagship (August 2025)',
      contextLength: 128000,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'magistral-medium-latest',
      name: 'Magistral Medium',
      description: 'Frontier-class reasoning model (July 2025)',
      contextLength: 128000,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'magistral-small-latest',
      name: 'Magistral Small',
      description: 'Efficient reasoning model (July 2025)',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'codestral-latest',
      name: 'Codestral',
      description: 'Cutting-edge coding model (August 2025)',
      contextLength: 128000,
      supportsFunctions: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'mistral-small-latest',
      name: 'Mistral Small',
      description: 'Enterprise-grade with vision (June 2025)',
      contextLength: 32768,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'pixtral-large-latest',
      name: 'Pixtral Large',
      description: 'Advanced vision model (November 2024)',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: 'mistral-large-2411',
      name: 'Mistral Large',
      description: 'High-complexity tasks (November 2024)',
      contextLength: 128000,
      supportsFunctions: true,
      supportsVision: true,
      supportsDocuments: true,
    },
  ],
  cohere: [
    {
      id: 'command-r-plus-08-2024',
      name: 'Command R Plus',
      description: 'Most capable for RAG and search',
      contextLength: 128000,
      isDefault: false,
      isPremium: true,
      supportsFunctions: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'command-r-08-2024',
      name: 'Command R',
      description: 'Optimized for retrieval tasks',
      contextLength: 128000,
      isDefault: true,
      supportsFunctions: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'command-light',
      name: 'Command Light',
      description: 'Fast and cost-effective',
      contextLength: 4096,
      supportsFunctions: true,
      supportsVision: true,
      supportsDocuments: true,
    },
  ],
  together: [
    {
      id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
      name: 'Qwen 2.5 72B',
      description: 'Strong multilingual capabilities',
      contextLength: 32768,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      name: 'Llama 3.1 405B',
      description: 'Most capable open-source model',
      contextLength: 130000,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      name: 'Llama 3.1 70B',
      description: 'Powerful and efficient',
      contextLength: 130000,
      isDefault: false,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      name: 'Llama 3.1 8B',
      description: 'Fast and lightweight',
      contextLength: 130000,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
    },
  ],
  deepseek: [
    {
      id: 'deepseek-reasoning',
      name: 'DeepSeek Reasoning',
      description: 'Advanced reasoning capabilities',
      contextLength: 128000,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'deepseek-coder',
      name: 'DeepSeek Coder',
      description: 'Optimized for code generation',
      contextLength: 128000,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      description: 'General purpose conversation',
      contextLength: 128000,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
    },
  ],
  grok: [
    {
      id: 'grok-4-0709',
      name: 'Grok 4',
      description: 'Most advanced reasoning model',
      contextLength: 256000,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'grok-3',
      name: 'Grok 3',
      description: 'Latest generation with enhanced capabilities',
      contextLength: 131072,
      isPremium: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'grok-3-fast',
      name: 'Grok 3 Fast',
      description: 'Optimized for speed with Grok 3 capabilities',
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'grok-3-mini',
      name: 'Grok 3 Mini',
      description: 'Lightweight and cost-effective',
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'grok-3-mini-fast',
      name: 'Grok 3 Mini Fast',
      description: 'Fastest lightweight model',
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'grok-2-1212',
      name: 'Grok 2',
      description: 'Advanced reasoning with real-time X data',
      contextLength: 131072,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
    },
    {
      id: 'grok-2-vision-1212',
      name: 'Grok 2 Vision',
      description: 'Multimodal model with image understanding',
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: true,
      isPremium: true,
    },
    {
      id: 'grok-2-image-1212',
      name: 'Grok 2 Image',
      description: 'Specialized for image generation/analysis',
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: true,
    },
  ],
};

export interface ModelParameters {
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
}

export const DEFAULT_PARAMETERS: ModelParameters = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.95,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

export const PARAMETER_RANGES = {
  temperature: { min: 0, max: 2, step: 0.1, description: 'Controls randomness (0 = deterministic, 2 = very creative)' },
  maxTokens: { min: 1, max: 8192, step: 1, description: 'Maximum response length in tokens' },
  topP: { min: 0, max: 1, step: 0.01, description: 'Nucleus sampling threshold for token selection' },
  topK: { min: 1, max: 100, step: 1, description: 'Top-K sampling (Google models only)' },
  frequencyPenalty: { min: -2, max: 2, step: 0.1, description: 'Reduce repetition of tokens (OpenAI only)' },
  presencePenalty: { min: -2, max: 2, step: 0.1, description: 'Encourage topic diversity (OpenAI only)' },
};

export const PROVIDER_SUPPORTED_PARAMS: { [key: string]: (keyof ModelParameters)[] } = {
  claude: ['temperature', 'maxTokens', 'topP', 'stopSequences'],
  openai: ['temperature', 'maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty', 'stopSequences', 'seed'],
  google: ['temperature', 'maxTokens', 'topP', 'topK', 'stopSequences'],
  perplexity: ['temperature', 'maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty'],
  mistral: ['temperature', 'maxTokens', 'topP', 'stopSequences', 'seed'],
  cohere: ['temperature', 'maxTokens', 'topP', 'topK', 'stopSequences'],
  together: ['temperature', 'maxTokens', 'topP', 'topK', 'frequencyPenalty', 'stopSequences'],
  deepseek: ['temperature', 'maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty', 'stopSequences'],
  grok: ['temperature', 'maxTokens', 'topP', 'stopSequences', 'seed'],
};

// Curated model IDs per provider (limit 4–5) to avoid overwhelming users in selectors.
// Defaults reflect mid-tier choices for free users; flagship/frontier marked premium.
export const CURATED_MODEL_IDS: { [providerId: string]: string[] } = {
  claude: [
    'claude-3-7-sonnet-20250219',
    'claude-sonnet-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-3-5-haiku-20241022',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1',
    'gpt-5',
    'gpt-image-1',
  ],
  google: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
  ],
  perplexity: [
    'sonar',
    'sonar-pro',
  ],
  mistral: [
    'mistral-small-latest',
    'mistral-medium-latest',
    'mistral-large-2411',
    'pixtral-large-latest',
  ],
  cohere: [
    'command-r-08-2024',
    'command-r-plus-08-2024',
    'command-light',
  ],
  together: [
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    'Qwen/Qwen2.5-72B-Instruct-Turbo',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoning',
  ],
  grok: [
    'grok-2-1212',
    'grok-3',
    'grok-4-0709',
    'grok-2-vision-1212',
    'grok-2-image-1212',
  ],
};

// Helper function to get models for a specific provider
export const getProviderModels = (providerId: string): ModelConfig[] => {
  const all = AI_MODELS[providerId] || [];
  const curated = CURATED_MODEL_IDS[providerId];
  if (curated && curated.length) {
    // Preserve declaration order by filtering
    return all.filter(m => curated.includes(m.id));
  }
  return all;
};

// Helper function to get the default model for a provider
export const getProviderDefaultModel = (providerId: string): ModelConfig | undefined => {
  const models = getProviderModels(providerId);
  return models.find(model => model.isDefault) || models[0];
};

// Helper function to get a specific model by ID
export const getModelById = (providerId: string, modelId: string): ModelConfig | undefined => {
  const models = getProviderModels(providerId);
  return models.find(model => model.id === modelId);
};
