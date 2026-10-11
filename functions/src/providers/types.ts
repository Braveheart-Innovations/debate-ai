/**
 * Provider Runtime Types
 *
 * Defines the interface that all provider runtimes must implement.
 * Each provider runtime is responsible for:
 * 1. Building provider-specific API requests from canonical format
 * 2. Parsing provider-specific responses into canonical SSE events
 */

import type {
  CanonicalMessage,
  CanonicalToolDefinition,
  CanonicalToolChoice,
  CanonicalSSEEvent,
  CanonicalAttachment,
} from '../types/canonical';

// ============================================================================
// Provider Request Types
// ============================================================================

/**
 * Canonical request that providers must transform
 */
export interface ProviderRequest {
  /** Model ID to use */
  model: string;
  /** Messages in canonical format */
  messages: CanonicalMessage[];
  /** System prompt (may be in messages or separate) */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
  /** Tools available for the AI */
  tools?: CanonicalToolDefinition[];
  /** How to handle tool calling */
  toolChoice?: CanonicalToolChoice;
  /** Attachments (images, documents) */
  attachments?: CanonicalAttachment[];
  /**
   * Think harder than the model's default, where the model has a setting for
   * it (Analyze's Team plan round). Each runtime maps it; others ignore it.
   */
  deepThinking?: boolean;
}

/**
 * Built request ready to send to provider API
 */
export interface BuiltRequest {
  /** Full URL to send request to */
  url: string;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Request body (will be JSON.stringify'd) */
  body: Record<string, unknown>;
}

// ============================================================================
// Provider Runtime Interface
// ============================================================================

/**
 * Interface that all provider runtimes must implement.
 *
 * A provider runtime handles the translation between canonical format
 * and provider-specific API formats.
 */
export interface ProviderRuntime {
  /**
   * Provider identifier (e.g., 'claude', 'openai')
   */
  readonly providerId: string;

  /**
   * Whether this provider supports tool calling
   */
  readonly supportsTools: boolean;

  /**
   * Build a provider-specific API request from canonical format.
   *
   * @param request - Canonical request format
   * @param apiKey - Decrypted API key
   * @returns Built request ready to send
   */
  buildRequest(request: ProviderRequest, apiKey: string): BuiltRequest;

  /**
   * Parse a streaming response from the provider API.
   *
   * This generator yields canonical SSE events as they arrive.
   * The implementation handles all provider-specific parsing.
   *
   * @param responseStream - Raw response stream from provider
   * @param traceId - Trace ID for logging
   * @yields Canonical SSE events
   */
  streamParse(
    responseStream: ReadableStream<Uint8Array>,
    traceId: string
  ): AsyncGenerator<CanonicalSSEEvent, void, unknown>;
}

// ============================================================================
// Logging Types
// ============================================================================

/**
 * Log entry for tracing requests
 */
export interface TraceLogEntry {
  traceId: string;
  timestamp: number;
  event: string;
  data?: Record<string, unknown>;
}

/**
 * Logger interface for provider runtimes
 */
export interface ProviderLogger {
  log(entry: TraceLogEntry): void;
  error(entry: TraceLogEntry & { error: Error | string }): void;
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Provider API configuration
 */
export interface ProviderConfig {
  /** Base URL for the API */
  baseUrl: string;
  /** Header name for authentication */
  authHeader: string;
  /** Auth header value prefix (e.g., 'Bearer ') */
  authPrefix?: string;
  /** Additional static headers */
  staticHeaders?: Record<string, string>;
}

/**
 * Provider configurations
 */
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  claude: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    staticHeaders: {
      'anthropic-version': '2023-06-01',
    },
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  perplexity: {
    baseUrl: 'https://api.perplexity.ai/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  cohere: {
    baseUrl: 'https://api.cohere.ai/v2/chat',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
};
