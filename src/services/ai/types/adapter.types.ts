import { AIProvider, ModelParameters, PersonalityConfig, Message } from '../../../types';

export interface AIAdapterConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  personality?: PersonalityConfig;
  parameters?: ModelParameters;
  isDebateMode?: boolean;
  webSearchEnabled?: boolean;
}

export interface ResumptionContext {
  originalPrompt: Message;
  isResuming: boolean;
}

export interface AdapterCapabilities {
  streaming: boolean;
  attachments: boolean;  // Backward compatibility - true if either images or documents supported
  supportsImages?: boolean;  // Specifically for image support
  supportsDocuments?: boolean;  // Specifically for document/PDF support
  functionCalling: boolean;
  systemPrompt: boolean;
  maxTokens: number;
  contextWindow: number;
}

export interface AdapterResponse {
  response: string;
  modelUsed?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: {
    citations?: Array<{
      index: number;
      url: string;
      title?: string;
      snippet?: string;
    }>;
    providerMetadata?: Record<string, unknown>;
  };
}

export type SendMessageResponse = string | AdapterResponse;

export interface FormattedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string }; source?: { type: string; media_type?: string; data: string } }>;
}

export interface ProviderConfig {
  baseUrl: string;
  apiVersion?: string;
  defaultModel: string;
  headers: (apiKey: string) => Record<string, string>;
  capabilities: AdapterCapabilities;
}