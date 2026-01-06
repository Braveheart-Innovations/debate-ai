export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  isDefault?: boolean;
  supportsVision?: boolean;
  supportsDocuments?: boolean; // Specifically for PDF/document support
  supportsFunctions?: boolean;
  supportsWebSearch?: boolean; // For Perplexity models with web search
  requiresTemperature1?: boolean; // For GPT-5 and O1/O3 models
  useMaxCompletionTokens?: boolean; // For GPT-5 and reasoning models that use max_completion_tokens
  // Extended capability flags:
  supportsImageInput?: boolean; // Alias of supportsVision (explicit)
  supportsImageGeneration?: boolean; // Can generate images (e.g., gpt-image-1, dall-e-3)
}

export interface ProviderModels {
  [providerId: string]: ModelConfig[];
}

// Updated December 2025 - Current model offerings from each provider
export const AI_MODELS: ProviderModels = {
  claude: [
    // Latest 4.5 series (December 2025)
    {
      id: "claude-opus-4-5-20251101",
      name: "Claude 4.5 Opus",
      description: "Premium model with maximum intelligence and practical performance",
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "claude-sonnet-4-5-20250929",
      name: "Claude 4.5 Sonnet",
      description: "Smart model for complex agents and coding (recommended)",
      contextLength: 200000,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude 4.5 Haiku",
      description: "Fastest model with near-frontier intelligence",
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    // Legacy models (still available)
    {
      id: "claude-opus-4-1-20250805",
      name: "Claude 4.1 Opus",
      description: "Previous flagship with enhanced reasoning",
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet",
      description: "Previous generation balanced performance",
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "claude-3-7-sonnet-20250219",
      name: "Claude 3.7 Sonnet",
      description: "Hybrid reasoning with rapid and deep thinking modes",
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      description: "Fast and cost-effective legacy option",
      contextLength: 200000,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
  ],
  openai: [
    // GPT-5.2 series (December 2025)
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      description: "Latest flagship with advanced reasoning (December 2025)",
      contextLength: 272000,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true, // Native file support as of March 2025
      supportsFunctions: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    // GPT-5 series
    {
      id: "gpt-5",
      name: "GPT-5",
      description: "Flagship model with advanced reasoning (August 2025)",
      contextLength: 272000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5-mini",
      name: "GPT-5 Mini",
      description: "Efficient GPT-5 for faster responses",
      contextLength: 272000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5-nano",
      name: "GPT-5 Nano",
      description: "Ultra-fast GPT-5 for simple tasks",
      contextLength: 272000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    // GPT-4 series
    {
      id: "gpt-4.1",
      name: "GPT-4.1",
      description: "Enhanced GPT-4 with improvements (April 2025)",
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      description: "Omni-modal model with vision and audio",
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    // Reasoning models (O-series)
    {
      id: "o3-mini",
      name: "O3 Mini",
      description: "Efficient reasoning model (December 2025)",
      contextLength: 200000,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
    },
    {
      id: "o1",
      name: "O1",
      description: "Advanced reasoning model (December 2024)",
      contextLength: 200000,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
    },
    // Image generation models
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      description: "Advanced image generation model",
      contextLength: 0,
      supportsImageGeneration: true,
    },
    {
      id: "gpt-image-1",
      name: "GPT Image 1",
      description: "Image generation model",
      contextLength: 0,
      supportsImageGeneration: true,
    },
  ],
  google: [
    // Gemini 3 series (December 2025)
    {
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro",
      description: "Latest flagship with advanced reasoning (December 2025)",
      contextLength: 1048576,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
    },
    {
      id: "gemini-3-pro-image-preview",
      name: "Gemini 3 Pro Image",
      description: "Image generation with Gemini 3 (December 2025)",
      contextLength: 65536,
      supportsVision: true,
      supportsImageGeneration: true,
    },
    // Gemini 2.5 series (GA)
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "Fast multimodal model with 1M context",
      contextLength: 1048576,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "Flagship with thinking capabilities",
      contextLength: 1048576,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash-Lite",
      description: "Most cost-effective 2.5 model",
      contextLength: 1048576,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
    },
    // Gemini 2.0
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description: "Fast multimodal model",
      contextLength: 1048576,
      supportsVision: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
    },
  ],
  perplexity: [
    {
      id: "sonar-pro",
      name: "Sonar Pro",
      description: "Advanced model for complex queries with 2x citations",
      contextLength: 200000,
      isDefault: true,
      supportsWebSearch: true,
      supportsVision: true,
      supportsDocuments: true, // Uses file_url with raw base64
    },
    {
      id: "sonar",
      name: "Sonar",
      description: "Fast, cost-efficient with real-time web search",
      contextLength: 127000,
      supportsWebSearch: true,
      supportsVision: true,
      supportsDocuments: true,
    },
  ],
  mistral: [
    {
      id: "mistral-large-latest",
      name: "Mistral Large",
      description: "Latest flagship model with vision",
      contextLength: 128000,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: false, // PDFs require separate OCR API
      supportsFunctions: true,
    },
    {
      id: "mistral-medium-latest",
      name: "Mistral Medium",
      description: "Multimodal flagship model",
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: false,
      supportsFunctions: true,
    },
    {
      id: "mistral-small-latest",
      name: "Mistral Small",
      description: "Enterprise-grade with vision",
      contextLength: 32768,
      supportsVision: true,
      supportsDocuments: false,
      supportsFunctions: true,
    },
    {
      id: "pixtral-large-latest",
      name: "Pixtral Large",
      description: "Advanced vision model",
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: false,
      supportsFunctions: true,
    },
    {
      id: "codestral-latest",
      name: "Codestral",
      description: "Cutting-edge coding model",
      contextLength: 128000,
      supportsFunctions: true,
      supportsVision: true,
      supportsDocuments: false,
    },
  ],
  cohere: [
    {
      id: "command-r-plus-08-2024",
      name: "Command R Plus",
      description: "Most capable for RAG and search",
      contextLength: 128000,
      isDefault: true,
      supportsFunctions: true,
      supportsVision: false, // Vision not working via API
      supportsDocuments: false,
    },
    {
      id: "command-r7b-12-2024",
      name: "Command R7B",
      description: "Efficient model for retrieval tasks",
      contextLength: 128000,
      supportsFunctions: true,
      supportsVision: false,
      supportsDocuments: false,
    },
    {
      id: "command-r-08-2024",
      name: "Command R",
      description: "Optimized for retrieval tasks",
      contextLength: 128000,
      supportsFunctions: true,
      supportsVision: false,
      supportsDocuments: false,
    },
    {
      id: "command-light",
      name: "Command Light",
      description: "Fast and cost-effective",
      contextLength: 4096,
      supportsFunctions: true,
      supportsVision: false,
      supportsDocuments: false,
    },
  ],
  together: [
    {
      id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      name: "Llama 3.1 405B",
      description: "Most capable open-source model",
      contextLength: 130000,
      supportsVision: false, // Vision not working via API
      supportsDocuments: false,
    },
    {
      id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      name: "Llama 3.1 70B",
      description: "Powerful and efficient",
      contextLength: 130000,
      isDefault: true,
      supportsVision: false,
      supportsDocuments: false,
    },
    {
      id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      name: "Llama 3.1 8B",
      description: "Fast and lightweight",
      contextLength: 130000,
      supportsVision: false,
      supportsDocuments: false,
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
      name: "Qwen 2.5 72B",
      description: "Strong multilingual capabilities",
      contextLength: 32768,
      supportsVision: false,
      supportsDocuments: false,
    },
  ],
  deepseek: [
    {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      description: "Advanced reasoning capabilities",
      contextLength: 128000,
      supportsVision: false, // Chat API doesn't support vision
      supportsDocuments: false,
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      description: "General purpose conversation",
      contextLength: 128000,
      isDefault: true,
      supportsVision: false,
      supportsDocuments: false,
    },
  ],
  grok: [
    // Grok 4 series
    {
      id: "grok-4-0709",
      name: "Grok 4",
      description: "Most advanced reasoning model",
      contextLength: 256000,
      isDefault: true,
      supportsVision: true,
      supportsDocuments: false, // PDFs require separate Files API
    },
    {
      id: "grok-4-1-fast-reasoning",
      name: "Grok 4.1 Fast Reasoning",
      description: "Fast reasoning with Grok 4.1",
      contextLength: 256000,
      supportsVision: true,
      supportsDocuments: false,
    },
    {
      id: "grok-4-fast-reasoning",
      name: "Grok 4 Fast Reasoning",
      description: "Fast reasoning model",
      contextLength: 256000,
      supportsVision: true,
      supportsDocuments: false,
    },
    // Grok 3 series
    {
      id: "grok-3",
      name: "Grok 3",
      description: "Enhanced capabilities model",
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: false,
    },
    {
      id: "grok-3-mini",
      name: "Grok 3 Mini",
      description: "Lightweight and cost-effective",
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: false,
    },
    // Specialized models
    {
      id: "grok-code-fast-1",
      name: "Grok Code Fast",
      description: "Optimized for coding tasks",
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: false,
    },
    {
      id: "grok-2-vision-1212",
      name: "Grok 2 Vision",
      description: "Vision-focused model",
      contextLength: 131072,
      supportsVision: true,
      supportsDocuments: false,
    },
    {
      id: "grok-2-image-1212",
      name: "Grok 2 Image",
      description: "Image generation model",
      contextLength: 0,
      supportsImageGeneration: true,
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
  temperature: {
    min: 0,
    max: 2,
    step: 0.1,
    description: "Controls randomness (0 = deterministic, 2 = very creative)",
  },
  maxTokens: {
    min: 1,
    max: 8192,
    step: 1,
    description: "Maximum response length in tokens",
  },
  topP: {
    min: 0,
    max: 1,
    step: 0.01,
    description: "Nucleus sampling threshold for token selection",
  },
  topK: {
    min: 1,
    max: 100,
    step: 1,
    description: "Top-K sampling (Google models only)",
  },
  frequencyPenalty: {
    min: -2,
    max: 2,
    step: 0.1,
    description: "Reduce repetition of tokens (OpenAI only)",
  },
  presencePenalty: {
    min: -2,
    max: 2,
    step: 0.1,
    description: "Encourage topic diversity (OpenAI only)",
  },
};

export const PROVIDER_SUPPORTED_PARAMS: {
  [key: string]: (keyof ModelParameters)[];
} = {
  claude: ["temperature", "maxTokens", "topP", "stopSequences"],
  openai: [
    "temperature",
    "maxTokens",
    "topP",
    "frequencyPenalty",
    "presencePenalty",
    "stopSequences",
    "seed",
  ],
  google: ["temperature", "maxTokens", "topP", "topK", "stopSequences"],
  perplexity: [
    "temperature",
    "maxTokens",
    "topP",
    "frequencyPenalty",
    "presencePenalty",
  ],
  mistral: ["temperature", "maxTokens", "topP", "stopSequences", "seed"],
  cohere: ["temperature", "maxTokens", "topP", "topK", "stopSequences"],
  together: [
    "temperature",
    "maxTokens",
    "topP",
    "topK",
    "frequencyPenalty",
    "stopSequences",
  ],
  deepseek: [
    "temperature",
    "maxTokens",
    "topP",
    "frequencyPenalty",
    "presencePenalty",
    "stopSequences",
  ],
  grok: ["temperature", "maxTokens", "topP", "stopSequences", "seed"],
};

// Curated model IDs per provider (limit 4–5) to avoid overwhelming users in selectors.
export const CURATED_MODEL_IDS: { [providerId: string]: string[] } = {
  claude: [
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001",
    "claude-3-7-sonnet-20250219",
  ],
  openai: ["gpt-5.2", "gpt-5", "gpt-4o", "o3-mini", "dall-e-3"],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3-pro-preview",
    "gemini-2.0-flash",
  ],
  perplexity: ["sonar-pro", "sonar"],
  mistral: [
    "mistral-large-latest",
    "mistral-medium-latest",
    "mistral-small-latest",
    "pixtral-large-latest",
  ],
  cohere: ["command-r-plus-08-2024", "command-r7b-12-2024", "command-r-08-2024"],
  together: [
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
  ],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  grok: [
    "grok-4-0709",
    "grok-3",
    "grok-3-mini",
    "grok-2-image-1212",
  ],
};

// Helper function to get models for a specific provider
export const getProviderModels = (providerId: string): ModelConfig[] => {
  const all = AI_MODELS[providerId] || [];
  const curated = CURATED_MODEL_IDS[providerId];
  if (curated && curated.length) {
    // Preserve declaration order by filtering
    return all.filter((m) => curated.includes(m.id));
  }
  return all;
};

// Helper function to get the default model for a provider
export const getProviderDefaultModel = (
  providerId: string
): ModelConfig | undefined => {
  const models = getProviderModels(providerId);
  return models.find((model) => model.isDefault) || models[0];
};

// Helper function to get a specific model by ID
export const getModelById = (
  providerId: string,
  modelId: string
): ModelConfig | undefined => {
  const models = getProviderModels(providerId);
  return models.find((model) => model.id === modelId);
};
