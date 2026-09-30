import { AIProvider, ModelParameters, PersonalityConfig, Message } from '../../../types';

export interface AIAdapterConfig {
  provider: AIProvider;
  identityId?: string;
  apiKey: string;
  model?: string;
  personality?: PersonalityConfig;
  parameters?: Partial<ModelParameters>;
  isDebateMode?: boolean;
  webSearchEnabled?: boolean;
  /** Set when this adapter speaks in a multi-AI Chat; drives the group-chat system contract. */
  groupChat?: GroupChatContext;
}

export interface GroupChatContext {
  /** This AI's display name, as it appears in transcript labels. */
  selfName: string;
  /** Display names of every AI in the chat, in session order (includes selfName). */
  participants: string[];
}

export type AdapterConfig = AIAdapterConfig;

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

/**
 * Canonical, provider-agnostic reason a generation ended.
 * Adapters map their native finish signals onto this enum so the rest of the app never has to
 * special-case provider wording (e.g. Cohere `MAX_TOKENS` and OpenAI `length` both map to 'length').
 * - 'stop'           the model finished its turn normally
 * - 'length'         the model was cut off by the output-token ceiling (it did NOT finish)
 * - 'content_filter' the provider blocked the content (safety) — not a transient error
 * - 'error'          the stream errored
 * - 'aborted'        the caller aborted the stream
 */
export type StreamFinishReason = 'stop' | 'length' | 'content_filter' | 'error' | 'aborted';

/** Emitted via the adapter `onEvent` callback when a stream's finish reason is known. */
export interface StreamFinishEvent {
  type: 'finish';
  reason: StreamFinishReason;
}

export interface AdapterResponse {
  response: string;
  modelUsed?: string;
  finishReason?: StreamFinishReason;
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
