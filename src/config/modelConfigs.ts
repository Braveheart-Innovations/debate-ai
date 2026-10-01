import { resolveModelAlias } from './providers/modelRegistry';
import type { ModelParameters } from '../types';

// Canonical ModelParameters lives in src/types/index.ts; re-exported here so
// existing `from '@/config/modelConfigs'` imports keep working.
export type { ModelParameters };

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  contextLabel?: string | null; // Optional UI label when the provider publishes a friendly label or no numeric window
  maxOutputTokens?: number; // Maximum output tokens the model supports
  // Floor for the max_tokens sent with each request, for models whose hidden
  // reasoning spends the same budget as the visible answer: below it they stop
  // with finish_reason "length" before writing any text. Settings can raise the
  // budget above the floor, never below it.
  minOutputTokens?: number;
  isDefault?: boolean;
  isPreview?: boolean;
  supportsVision?: boolean;
  supportsDocuments?: boolean; // Specifically for PDF/document support
  supportsFunctions?: boolean;
  supportsWebSearch?: boolean; // Model supports provider-backed live web search with citations
  supportsThinking?: boolean; // For reasoning models (O-series, DeepSeek V4, etc.)
  supportsStreaming?: boolean; // False when the provider only serves this model non-streaming
  requiresTemperature1?: boolean; // For GPT-5 and O1/O3 models
  useMaxCompletionTokens?: boolean; // For GPT-5 and reasoning models that use max_completion_tokens
  isDeprecated?: boolean; // Model is deprecated by provider
  // Extended capability flags:
  supportsImageInput?: boolean; // Alias of supportsVision (explicit)
  supportsImageGeneration?: boolean; // Can generate images (e.g., gpt-image-1)
  unsupportedParams?: (keyof ModelParameters)[]; // Params the provider rejects for this model
}

export interface ProviderModels {
  [providerId: string]: ModelConfig[];
}

// Updated September 2026 using verified live model IDs plus current provider docs.
export const AI_MODELS: ProviderModels = {
  claude: [
    {
      id: "claude-sonnet-5-5",
      name: "Claude Sonnet 5.5",
      description: "Latest balanced Claude model with adaptive thinking and effort control for chat, coding, and agentic work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-opus-5-5",
      name: "Claude Opus 5.5",
      description: "Current Claude Opus model for complex agentic coding, deep reasoning, and enterprise work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      description: "Previous balanced Claude model with adaptive thinking and effort control for chat, coding, and agentic work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-fable-5-1",
      name: "Claude Fable 5.1",
      description: "Anthropic's most capable widely released model for the most demanding reasoning and long-horizon agentic work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-fable-5",
      name: "Claude Fable 5",
      description: "Previous Fable-tier model, still served by Anthropic for demanding reasoning and long-horizon agentic work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-opus-5",
      name: "Claude Opus 5",
      description: "Previous Claude Opus model for complex agentic coding, deep reasoning, and enterprise work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      description: "Previous balanced Claude model for production chat, coding, and agentic work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "claude-opus-4-7",
      name: "Claude Opus 4.7",
      description: "Most capable Claude model for complex reasoning, agentic coding, and high-resolution vision",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      description: "Previous Claude Opus model for complex reasoning, agentic coding, and high-resolution vision",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["temperature", "topP"],
    },
    {
      id: "claude-opus-4-6",
      name: "Claude Opus 4.6",
      description: "Previous flagship Claude model kept for compatibility",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "claude-opus-4-20250514",
      name: "Claude 4 Opus",
      description: "Legacy Claude Opus release no longer served by the Anthropic API",
      contextLength: 200000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "claude-opus-4-5-20251101",
      name: "Claude 4.5 Opus",
      description: "Previous flagship Claude release with strong reasoning depth",
      contextLength: 200000,
      maxOutputTokens: 64000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "claude-sonnet-4-5-20250929",
      name: "Claude 4.5 Sonnet",
      description: "Previous balanced Claude release for agents and coding",
      contextLength: 1000000,
      maxOutputTokens: 64000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude 4.5 Haiku",
      description: "Fast Claude option for lightweight chat workloads",
      contextLength: 200000,
      maxOutputTokens: 64000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "claude-opus-4-1-20250805",
      name: "Claude 4.1 Opus",
      description: "Legacy Claude flagship retired by the Anthropic API on 2026-08-05",
      contextLength: 200000,
      maxOutputTokens: 32000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet",
      description: "Legacy Claude Sonnet release no longer served by the Anthropic API",
      contextLength: 200000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "claude-3-7-sonnet-20250219",
      name: "Claude 3.7 Sonnet",
      description: "Deprecated Claude release kept for compatibility with existing configurations",
      contextLength: 200000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      description: "Fast and cost-effective legacy option",
      contextLength: 200000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      isDeprecated: true,
    },
  ],
  openai: [
    {
      // GPT-6 family (live-verified 2026-09-30): temperature must be 1. Chat
      // completions serve plain chat; web search goes through the Responses
      // API like every other OpenAI web-search request.
      id: "gpt-6.1-sol",
      name: "GPT-6.1 Sol",
      description: "Latest GPT-6 Sol model with near-Astra reasoning, coding, and professional work at a fraction of the cost",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-6-astra",
      name: "GPT-6 Astra",
      description: "OpenAI's most capable model for the hardest end-to-end reasoning, coding, and research work",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-6-sol",
      name: "GPT-6 Sol",
      description: "GPT-6 Sol model for complex reasoning, coding, and professional work",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-6-luna",
      name: "GPT-6 Luna",
      description: "Fast, affordable GPT-6 model for high-volume tasks",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      description: "Previous flagship GPT-5.6 model for complex reasoning, coding, and professional work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT-5.6 Terra",
      description: "Balanced GPT-5.6 model for everyday work",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      description: "Fast, affordable GPT-5.6 model for high-volume tasks",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.5",
      name: "GPT-5.5",
      description: "Previous flagship OpenAI model for complex reasoning, coding, and professional work",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.5-pro",
      name: "GPT-5.5 Pro",
      description: "Long-running GPT-5.5 variant for the hardest tasks; served non-streaming only",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      supportsStreaming: false,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      description: "Previous GPT-5 family model kept for compatibility",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      description: "Lower-latency GPT-5.4-class model for cost-sensitive workloads",
      contextLength: 400000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.4-nano",
      name: "GPT-5.4 Nano",
      description: "Smallest GPT-5.4-class model for high-volume lightweight tasks",
      contextLength: 400000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      description: "Documented GPT-5.2 release with 400K context",
      contextLength: 400000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-5",
      name: "GPT-5",
      description: "Primary GPT-5 production model",
      contextLength: 400000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-4.1",
      name: "GPT-4.1",
      description: "High-capability GPT-4.1 model with 1M context",
      contextLength: 1047576,
      maxOutputTokens: 32768,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-4.1-mini",
      name: "GPT-4.1 Mini",
      description: "Fast, affordable small model for focused tasks",
      contextLength: 1047576,
      maxOutputTokens: 32768,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-4.1-nano",
      name: "GPT-4.1 Nano",
      description: "Smallest GPT-4.1 model for cheap low-latency tasks",
      contextLength: 1047576,
      maxOutputTokens: 32768,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      description: "Previous flagship multimodal model",
      contextLength: 128000,
      maxOutputTokens: 16384,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      description: "Small, fast, affordable model from GPT-4o family",
      contextLength: 128000,
      maxOutputTokens: 16384,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "o3",
      name: "O3",
      description: "Advanced reasoning model for complex problem-solving",
      contextLength: 200000,
      maxOutputTokens: 100000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "o4-mini",
      name: "O4 Mini",
      description: "Compact reasoning model with image input support",
      contextLength: 200000,
      maxOutputTokens: 100000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "o3-mini",
      name: "O3 Mini",
      description: "Smaller reasoning model, faster and more affordable",
      contextLength: 200000,
      maxOutputTokens: 100000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "o1",
      name: "O1",
      description: "Flagship reasoning model from the O-series",
      contextLength: 200000,
      maxOutputTokens: 100000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsThinking: true,
      requiresTemperature1: true,
      useMaxCompletionTokens: true,
    },
    {
      id: "gpt-image-2.5-flare",
      name: "GPT Image 2.5 Flare",
      description: "Fastest OpenAI image model for high-quality everyday generation and edits",
      contextLength: 0,
      supportsImageInput: true,
      supportsImageGeneration: true,
    },
    {
      id: "gpt-image-2.5-sunburst",
      name: "GPT Image 2.5 Sunburst",
      description: "Precision OpenAI image model for premium creative work and detailed edits",
      contextLength: 0,
      supportsImageInput: true,
      supportsImageGeneration: true,
    },
    {
      id: "gpt-image-2",
      name: "GPT Image 2",
      description: "Previous OpenAI image generation and editing model",
      contextLength: 0,
      supportsImageInput: true,
      supportsImageGeneration: true,
    },
    {
      id: "gpt-image-1.5",
      name: "GPT Image 1.5",
      description: "Previous OpenAI image generation model",
      contextLength: 0,
      supportsImageInput: true,
      supportsImageGeneration: true,
    },
    {
      id: "gpt-image-1",
      name: "GPT Image 1",
      description: "Legacy OpenAI image generation model",
      contextLength: 0,
      supportsImageInput: true,
      supportsImageGeneration: true,
    },
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      description: "Legacy image generation model",
      contextLength: 0,
      supportsImageGeneration: true,
      isDeprecated: true,
    },
  ],
  google: [
    {
      id: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      description: "Current stable Gemini default for fast frontier-class agentic, coding, and multimodal work",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      description: "Previous stable fast Gemini default retained while available from Google",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      description: "Older stable Gemini Flash release still served by Google; out of the picker but resolvable for existing sessions",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      description: "Previous stable fast Gemini model, superseded by Gemini 3.6 Flash",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.5-flash-lite",
      name: "Gemini 3.5 Flash-Lite",
      description: "Fastest, most cost-effective Gemini 3.5 model for high-volume lightweight tasks",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      description: "Latest Gemini flagship preview with advanced reasoning and multimodal inputs",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      isPreview: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      description: "Previous Gemini Flash preview retained while available from Google",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      isPreview: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash-Lite",
      description: "Stable low-latency Gemini model for high-volume lightweight tasks",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash Lite Preview",
      description: "Deprecated preview ID that resolves to Gemini 3.1 Flash-Lite",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      isPreview: true,
      isDeprecated: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro Preview",
      description: "Deprecated Gemini 3 Pro preview retained for migration to Gemini 3.1 Pro",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "Previous-gen high-capability Gemini model",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "Previous-gen fast Gemini model",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash-Lite",
      description: "Previous-gen cost-effective Gemini model",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description: "Deprecated Gemini 2.0 model scheduled for shutdown by Google",
      contextLength: 1048576,
      maxOutputTokens: 8192,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
  ],
  perplexity: [
    {
      id: "sonar-pro",
      name: "Sonar Pro",
      description: "High-accuracy Perplexity search model with grounding and citations",
      contextLength: 200000,
      contextLabel: "Context unpublished",
      maxOutputTokens: 8000,
      isDefault: true,
      supportsWebSearch: true,
    },
    {
      id: "sonar",
      name: "Sonar",
      description: "Fast search model with real-time web access and citations",
      contextLength: 128000,
      contextLabel: "Context unpublished",
      maxOutputTokens: 8000,
      supportsWebSearch: true,
    },
    {
      id: "sonar-reasoning-pro",
      name: "Sonar Reasoning Pro",
      description: "Advanced reasoning with web search and citations",
      contextLength: 128000,
      contextLabel: "Context unpublished",
      maxOutputTokens: 8000,
      supportsWebSearch: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "sonar-reasoning",
      name: "Sonar Reasoning",
      description: "Cost-conscious reasoning model with web search and citations",
      contextLength: 128000,
      contextLabel: "Context unpublished",
      maxOutputTokens: 8000,
      supportsWebSearch: true,
      supportsThinking: true,
    },
    {
      // Live-verified 2026-09-30: a full report is ~13K completion tokens on
      // top of ~80-110K reasoning tokens. max_tokens 512/2048 returned empty
      // text and 8000 a cut-off report (finish_reason "length"); 128000 was
      // accepted and finished ("stop"). Cost is billed on tokens used.
      id: "sonar-deep-research",
      name: "Sonar Deep Research",
      description: "Expert research model for exhaustive searches and comprehensive reports",
      contextLength: 128000,
      contextLabel: "Context unpublished",
      maxOutputTokens: 128000,
      minOutputTokens: 32768,
      supportsWebSearch: true,
      supportsThinking: true,
    },
  ],
  mistral: [
    {
      // Tier-gated: free (Experiment) keys get 403 tier_not_allowed and it
      // drops out of their /v1/models, but paid keys list it and chat works
      // (live-verified 2026-09-30). Selectable; Medium 3.5 is the default.
      id: "mistral-large-2512",
      name: "Mistral Large 3",
      description: "Open-weight Mistral flagship multimodal model with 256K context (paid Mistral API tiers)",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      // Reasoning prompt mode is rejected ("not enabled for this model"), so
      // no supportsThinking; chat, tools, and image input are live-verified.
      id: "mistral-medium-2604",
      name: "Mistral Medium 3.5",
      description: "Current Mistral default: frontier-class multimodal model for agentic and coding work with 256K context",
      contextLength: 262144,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
    },
    {
      id: "mistral-medium-2508",
      name: "Mistral Medium 3.1",
      description: "Legacy Mistral Medium 3.1 id; the Mistral API now serves Mistral Medium 3.5 for it",
      contextLength: 131072,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
    {
      id: "mistral-small-2603",
      name: "Mistral Small 4",
      description: "Efficient hybrid Mistral model for instruct, reasoning, and coding with 256K context",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "mistral-small-2506",
      name: "Mistral Small 3.2",
      description: "Legacy small Mistral model no longer served by the Mistral API",
      contextLength: 131072,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
    {
      id: "ministral-14b-2512",
      name: "Ministral 14B",
      description: "Compact Mistral model with vision for cost-sensitive workloads",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
    },
    {
      id: "ministral-8b-2512",
      name: "Ministral 8B",
      description: "Small Mistral edge model with vision support",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
    },
    {
      id: "ministral-3b-2512",
      name: "Ministral 3B",
      description: "Smallest Mistral edge model for high-volume lightweight tasks",
      contextLength: 131072,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
    },
    {
      id: "magistral-medium-2509",
      name: "Magistral Medium 1.2",
      description: "Legacy Mistral reasoning model no longer served by the Mistral API",
      contextLength: 131072,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "magistral-small-2509",
      name: "Magistral Small 1.2",
      description: "Smaller Mistral reasoning model",
      contextLength: 128000,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "devstral-2512",
      name: "Devstral 2",
      description: "Retired by Mistral on 2026-07-31; the Mistral API now serves Mistral Medium 3.5 for this id",
      contextLength: 262144,
      supportsFunctions: true,
      isDeprecated: true,
    },
    {
      id: "codestral-2508",
      name: "Codestral 2508",
      description: "Coding-focused Mistral model",
      contextLength: 256000,
      supportsFunctions: true,
    },
    {
      id: "pixtral-large-2411",
      name: "Pixtral Large",
      description: "Legacy vision-focused Mistral model",
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
  ],
  cohere: [
    {
      id: "command-a-plus-05-2026",
      name: "Command A+",
      description: "Cohere MoE model for agentic, reasoning, multilingual, and multimodal tasks",
      contextLength: 436000,
      maxOutputTokens: 64000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "command-a-reasoning-08-2025",
      name: "Command A Reasoning",
      description: "Current Cohere reasoning model with extended context",
      contextLength: 288768,
      isDefault: true,
      supportsDocuments: true,
      supportsFunctions: true,
      supportsThinking: true,
      maxOutputTokens: 32000,
    },
    {
      id: "command-a-03-2025",
      name: "Command A",
      description: "Cohere enterprise model for tool use, RAG, agents, and multilingual chat",
      contextLength: 288000,
      maxOutputTokens: 8000,
      supportsDocuments: true,
      supportsFunctions: true,
    },
    {
      id: "command-a-translate-08-2025",
      name: "Command A Translate",
      description: "Cohere translation model for 23 supported languages",
      contextLength: 8992,
      maxOutputTokens: 8000,
      supportsFunctions: true,
    },
    {
      // Released 2026-09-10. Chat-only: tool use is rejected with
      // TOOL_USE_NOT_SUPPORTED (live-verified 2026-09-10).
      id: "north-small-translate-09-2026",
      name: "North Small Translate",
      description: "Cohere translation model covering 50+ languages, succeeding Command A Translate",
      contextLength: 32768,
      maxOutputTokens: 16000,
    },
    {
      id: "command-a-vision-07-2025",
      name: "Command A Vision",
      description: "Current Cohere multimodal model with image inputs",
      contextLength: 128000,
      maxOutputTokens: 8000,
      supportsVision: true,
      supportsImageInput: true,
      supportsDocuments: true,
    },
    {
      id: "command-r-08-2024",
      name: "Command R",
      description: "Stable retrieval-oriented Cohere chat model",
      contextLength: 128000,
      supportsFunctions: true,
    },
    {
      id: "command-r7b-12-2024",
      name: "Command R7B",
      description: "Lower-cost Cohere chat model",
      contextLength: 132000,
      maxOutputTokens: 4000,
      supportsFunctions: true,
    },
  ],
  deepseek: [
    {
      // DeepSeek V4.1 Flash (2026-09-10): natively multimodal, thinking on by
      // default; tools, vision, streaming, and sampling params live-verified.
      id: "deepseek-flash",
      name: "DeepSeek Flash",
      description: "DeepSeek V4.1 Flash: multimodal default with thinking and non-thinking modes, tools, and a 1M-token context",
      contextLength: 1000000,
      maxOutputTokens: 384000,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      // From 2026-09-14 DeepSeek routes every deepseek-v4-pro request to V4.1
      // Flash at Flash pricing until a V4.1 Pro ships.
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      description: "Retiring DeepSeek V4 model; served as DeepSeek V4.1 Flash from 2026-09-14",
      contextLength: 1000000,
      maxOutputTokens: 384000,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      description: "Retired DeepSeek name; temporarily served as DeepSeek V4.1 Flash for compatibility",
      contextLength: 1000000,
      maxOutputTokens: 384000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      description: "Deprecated DeepSeek compatibility name; maps to DeepSeek V4.1 Flash non-thinking mode",
      contextLength: 1000000,
      maxOutputTokens: 384000,
      supportsFunctions: true,
      isDeprecated: true,
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      description: "Deprecated DeepSeek compatibility name; maps to DeepSeek V4.1 Flash thinking mode",
      contextLength: 1000000,
      maxOutputTokens: 384000,
      supportsThinking: true,
      isDeprecated: true,
    },
  ],
  grok: [
    {
      id: "grok-4.3",
      name: "Grok 4.3",
      description: "Current xAI default for production chat, agentic tool calling, coding, vision, and low-hallucination work",
      contextLength: 1000000,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      id: "grok-4.7",
      name: "Grok 4.7",
      description: "xAI flagship for coding, agents, and knowledge work with always-on configurable reasoning and 500K context",
      contextLength: 500000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      description: "Previous xAI model for coding, agents, and knowledge work with configurable reasoning and 500K context",
      contextLength: 500000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      id: "grok-4.5",
      name: "Grok 4.5",
      description: "Previous xAI model for coding, agents, and knowledge work with configurable reasoning and 500K context",
      contextLength: 500000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      id: "grok-build-0.1",
      name: "Grok Build 0.1",
      description: "Fast xAI coding model trained for agentic software engineering workflows",
      contextLength: 256000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      id: "grok-4.20-0309-non-reasoning",
      name: "Grok 4.20 Non-Reasoning",
      description: "Previous xAI Grok 4.20 API model for production chat, vision, structured output, and tool calling",
      contextLength: 1000000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      id: "grok-4.20-0309-reasoning",
      name: "Grok 4.20 Reasoning",
      description: "Current xAI Grok 4.20 reasoning model for harder multi-step tasks",
      contextLength: 1000000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsWebSearch: true,
      supportsThinking: true,
      unsupportedParams: ["frequencyPenalty", "presencePenalty", "stopSequences"],
    },
    {
      // Retired by xAI but retained (deprecated) so persisted mobile sessions
      // still resolve capabilities; alias resolution falls back to grok-4.3.
      id: "grok-4-1-fast-non-reasoning",
      name: "Grok 4.1 Fast",
      description: "Retired cost-efficient Grok 4.1 Fast model no longer served by the xAI API",
      contextLength: 2000000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
    {
      id: "grok-4-1-fast-reasoning",
      name: "Grok 4.1 Fast Reasoning",
      description: "Retired Grok 4.1 Fast reasoning variant no longer served by the xAI API",
      contextLength: 2000000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "grok-4-0709",
      name: "Grok 4",
      description: "Legacy Grok 4 model kept for compatibility",
      contextLength: 256000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "grok-3",
      name: "Grok 3",
      description: "Retired xAI model no longer served by the xAI API",
      contextLength: 131072,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
    {
      id: "grok-3-mini",
      name: "Grok 3 Mini",
      description: "Retired lightweight xAI model no longer served by the xAI API",
      contextLength: 131072,
      supportsFunctions: true,
      supportsThinking: true,
      isDeprecated: true,
    },
    {
      id: "grok-imagine-image",
      name: "Grok Imagine",
      description: "Image generation model from xAI",
      contextLength: 0,
      supportsImageGeneration: true,
    },
    {
      id: "grok-imagine-image-2.0",
      name: "Grok Imagine 2.0",
      description: "Latest image generation model from xAI",
      contextLength: 0,
      supportsImageGeneration: true,
    },
  ],
  moonshot: [
    {
      id: "kimi-k3",
      requiresTemperature1: true,
      name: "Kimi K3",
      description: "Moonshot flagship multimodal reasoning model with a 1M-token context window",
      contextLength: 1048576,
      isDefault: true,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "kimi-k2.7-code",
      requiresTemperature1: true,
      name: "Kimi K2.7 Code",
      description: "Dedicated Moonshot coding model with reasoning and vision input",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "kimi-k2.7-code-highspeed",
      requiresTemperature1: true,
      name: "Kimi K2.7 Code High-Speed",
      description: "High-throughput variant of Kimi K2.7 Code (~180 tokens/s output)",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "kimi-k2.6",
      requiresTemperature1: true,
      name: "Kimi K2.6",
      description: "Previous-generation Kimi multimodal model with thinking modes and agent support",
      contextLength: 262144,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
  ],
  zai: [
    {
      // Standard-key access opened in September 2026 (chat, tools, and
      // thinking live-verified; image input is rejected — text only).
      id: "glm-5.3",
      name: "GLM-5.3",
      description: "Current Z.ai flagship for coding and agentic work with up to 1M context (text only)",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      isDefault: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "glm-5.3-flash",
      name: "GLM-5.3 Flash",
      description: "Fast natively multimodal GLM with image and video input, tool calling, and always-on thinking",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "glm-5.3-flashx",
      name: "GLM-5.3 FlashX",
      description: "High-speed GLM-5.3 Flash with image and video input, tool calling, and always-on thinking",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "glm-5.2",
      name: "GLM-5.2",
      description: "Previous GLM flagship for coding and agentic work with up to 1M context",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "glm-5-turbo",
      name: "GLM-5 Turbo",
      description: "Fast GLM model tuned for agent tasks with strong tool calling and thinking modes",
      contextLength: 200000,
      maxOutputTokens: 128000,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "glm-5.1",
      name: "GLM-5.1",
      description: "Previous-generation GLM model with thinking modes and tool invocation",
      contextLength: 200000,
      maxOutputTokens: 128000,
      supportsFunctions: true,
      supportsThinking: true,
    },
    {
      id: "glm-5v-turbo",
      name: "GLM-5V Turbo",
      description: "Legacy GLM multimodal model no longer served by the Z.ai API",
      contextLength: 200000,
      maxOutputTokens: 128000,
      supportsVision: true,
      supportsImageInput: true,
      supportsFunctions: true,
      isDeprecated: true,
    },
  ],
};

// Model IDs shown in selectors. Keep this aligned with the verified runtime catalog.
export const CURATED_MODEL_IDS: { [providerId: string]: string[] } = {
  claude: [
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-1",
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
  // Mobile caps pickers at 7. gpt-6-sol (same price as its 6.1 successor) is
  // left out so gpt-4.1 stays: it is the only curated OpenAI model that takes
  // a temperature, which Expert Mode's sampling controls rely on.
  openai: [
    "gpt-6.1-sol",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-4.1",
  ],
  google: [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ],
  perplexity: [
    "sonar-pro",
    "sonar",
    "sonar-reasoning-pro",
    "sonar-deep-research",
  ],
  mistral: [
    "mistral-medium-2604",
    "mistral-large-2512",
    "mistral-small-2603",
    "ministral-14b-2512",
    "codestral-2508",
  ],
  cohere: [
    "command-a-plus-05-2026",
    "command-a-reasoning-08-2025",
    "command-a-03-2025",
    "command-a-translate-08-2025",
    "north-small-translate-09-2026",
    "command-a-vision-07-2025",
    "command-r-08-2024",
  ],
  deepseek: ["deepseek-flash"],
  grok: [
    "grok-4.3",
    "grok-4.7",
    "grok-4.6",
    "grok-4.5",
    "grok-build-0.1",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
  ],
  moonshot: ["kimi-k3", "kimi-k2.7-code", "kimi-k2.6"],
  zai: ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx", "glm-5.2", "glm-5-turbo", "glm-5.1"],
};

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
    description:
      "Controls randomness (0 = deterministic, 2 = very creative)",
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

// Provider-specific parameter range overrides applied on top of PARAMETER_RANGES
export const PROVIDER_PARAMETER_RANGES: {
  [providerId: string]: {
    [param: string]: { min: number; max: number; step: number; description?: string };
  };
} = {
  claude: {
    temperature: {
      min: 0,
      max: 1,
      step: 0.1,
      description: "Controls randomness (0 = deterministic, 1 = creative)",
    },
  },
  cohere: {
    temperature: {
      min: 0,
      max: 1,
      step: 0.1,
      description: "Controls randomness (0 = deterministic, 1 = creative)",
    },
  },
};

export function getParameterRange(
  providerId: string,
  param: keyof typeof PARAMETER_RANGES,
  modelId?: string
): { min: number; max: number; step: number; description: string } {
  if (param === 'temperature' && modelId) {
    const model = getModelById(providerId, modelId);
    if (model?.requiresTemperature1) {
      return {
        min: 1,
        max: 1,
        step: 1,
        description: 'This model only supports the default temperature of 1.',
      };
    }
  }

  const providerOverride = PROVIDER_PARAMETER_RANGES[providerId]?.[param];
  const defaultRange = PARAMETER_RANGES[param];

  if (providerOverride) {
    return {
      ...defaultRange,
      ...providerOverride,
    };
  }

  return defaultRange;
}

export function normalizeTemperatureForModel(
  providerId: string,
  modelId: string | undefined,
  temperature: number | undefined
): number | undefined {
  const range = getParameterRange(providerId, 'temperature', modelId);

  if (temperature === undefined) {
    return range.min === range.max ? range.min : undefined;
  }

  return Math.max(range.min, Math.min(temperature, range.max));
}

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
  deepseek: [
    "temperature",
    "maxTokens",
    "topP",
    "frequencyPenalty",
    "presencePenalty",
    "stopSequences",
  ],
  grok: ["temperature", "maxTokens", "topP", "stopSequences", "seed"],
  moonshot: [
    "temperature",
    "maxTokens",
    "topP",
    "frequencyPenalty",
    "presencePenalty",
    "stopSequences",
  ],
  zai: ["temperature", "maxTokens", "topP", "stopSequences"],
};

export function getSupportedParams(
  providerId: string,
  modelId?: string
): (keyof ModelParameters)[] {
  const providerParams = PROVIDER_SUPPORTED_PARAMS[providerId] || [];
  const model = modelId ? getModelById(providerId, modelId) : undefined;
  if (!model?.unsupportedParams?.length) {
    return providerParams;
  }

  return providerParams.filter((param) => !model.unsupportedParams?.includes(param));
}

const trimDecimal = (value: string): string =>
  value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');

export const formatContextLength = (contextLength: number): string => {
  if (contextLength >= 1_000_000) {
    if (contextLength % (1024 * 1024) === 0) {
      return `${contextLength / (1024 * 1024)}M`;
    }
    return `${trimDecimal((contextLength / 1_000_000).toFixed(2))}M`;
  }

  if (contextLength >= 1_000) {
    if (contextLength % 1024 === 0) {
      return `${contextLength / 1024}K`;
    }
    return `${trimDecimal((contextLength / 1_000).toFixed(contextLength >= 100_000 ? 0 : 1))}K`;
  }

  return `${contextLength}`;
};

export const getModelContextLabel = (model: ModelConfig): string | null => {
  if (model.contextLabel !== undefined) {
    return model.contextLabel;
  }

  if (!model.contextLength) {
    return null;
  }

  return `${formatContextLength(model.contextLength)} context`;
};

// Helper function to get models for a specific provider
export const getProviderModels = (providerId: string): ModelConfig[] => {
  const all = AI_MODELS[providerId] || [];
  const curated = CURATED_MODEL_IDS[providerId];
  const visibleModels = curated && curated.length
    ? all.filter((m) => curated.includes(m.id))
    : all;
  return visibleModels.filter(
    (model) => !model.isDeprecated && !model.supportsImageGeneration
  );
};

// Helper function to get the default model for a provider
export const getProviderDefaultModel = (
  providerId: string
): ModelConfig | undefined => {
  const models = getProviderModels(providerId);
  return models.find((model) => model.isDefault) || models[0];
};

export const resolveProviderModelId = (
  providerId: string,
  modelId?: string
): string | undefined => {
  if (modelId) {
    const requestedModel = getModelById(providerId, modelId);
    if (
      requestedModel &&
      !requestedModel.isDeprecated &&
      !requestedModel.supportsImageGeneration
    ) {
      return requestedModel.id;
    }
  }

  return getProviderDefaultModel(providerId)?.id;
};

// Web search is capability-driven, not user-toggled: models that support it
// search by default; others simply don't.
export const supportsWebSearch = (providerId: string, modelId: string): boolean =>
  Boolean(getModelById(providerId, modelId)?.supportsWebSearch);

// Helper function to get a specific model by ID
export const getModelById = (
  providerId: string,
  modelId: string
): ModelConfig | undefined => {
  const models = AI_MODELS[providerId] || [];
  const resolvedModelId = resolveModelAlias(modelId);
  return models.find((model) => model.id === resolvedModelId)
    || models.find((model) => model.id === modelId);
};
