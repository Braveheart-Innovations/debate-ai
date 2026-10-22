/**
 * Canonical Message Types for Provider-Agnostic Tool Calling
 *
 * These types define a unified protocol for AI conversations with tool calling
 * that works across all providers. The server normalizes all provider-specific
 * formats to these canonical types.
 *
 * Key Design Principles:
 * 1. Tool results are messages with `role: 'tool'` (not a separate field)
 * 2. SSE events use a single canonical format (no provider-specific events on client)
 * 3. All provider transformations happen server-side
 */

// ============================================================================
// Canonical Message Types
// ============================================================================

/**
 * A tool call in canonical format.
 * This is the standardized representation used across all providers.
 */
export interface CanonicalToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Always 'function' for our tools */
  type: 'function';
  /** The function being called */
  function: {
    /** Name of the tool */
    name: string;
    /** JSON string of arguments */
    arguments: string;
  };
  /**
   * Provider-specific payload required for lossless tool-call replay.
   * Gemini thinking models may include thought signatures that must be echoed back.
   */
  extra_content?: {
    google?: {
      thought_signature?: string;
    };
  };
}

/**
 * A message in canonical format.
 * This is the unified message format sent to the server.
 */
export interface CanonicalMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Message content (null for assistant messages with only tool calls) */
  content: string | null;
  /** Tool calls made by the assistant (only for assistant messages) */
  tool_calls?: CanonicalToolCall[];
  /** ID of the tool call this message is responding to (only for tool messages) */
  tool_call_id?: string;
  /** Per-message attachments for persisting file context across conversation history */
  attachments?: CanonicalAttachment[];
}

/**
 * Token usage information
 */
export interface CanonicalUsage {
  /** All the input the model read, cached or not. */
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  /** The part of inputTokens read from the provider's prompt cache. */
  cacheReadTokens?: number;
  /** The part of inputTokens written to the provider's prompt cache. */
  cacheWriteTokens?: number;
}

// ============================================================================
// Canonical SSE Event Types (Server → Client)
// ============================================================================

/**
 * Text content delta event
 */
export interface TextDeltaEvent {
  type: 'text_delta';
  /** The text chunk */
  delta: string;
}

/**
 * Tool call start event - emitted when AI begins a tool call
 */
export interface ToolCallStartEvent {
  type: 'tool_call_start';
  /** Index of this tool call (for parallel calls) */
  index: number;
  /** Unique ID for this tool call */
  id: string;
  /** Name of the tool being called */
  name: string;
}

/**
 * Tool call delta event - streaming tool call arguments
 */
export interface ToolCallDeltaEvent {
  type: 'tool_call_delta';
  /** Index of this tool call */
  index: number;
  /** Tool call ID */
  id: string;
  /** Partial JSON arguments */
  arguments_delta: string;
}

/**
 * Tool call complete event - tool call fully received
 */
export interface ToolCallCompleteEvent {
  type: 'tool_call_complete';
  /** Index of this tool call */
  index: number;
  /** The complete tool call */
  tool_call: CanonicalToolCall;
}

/**
 * Message complete event - stream finished
 */
export interface MessageCompleteEvent {
  type: 'message_complete';
  /** Why the message ended */
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';
  /** Token usage (if available) */
  usage?: CanonicalUsage;
  /** All tool calls in the message (if any) */
  tool_calls?: CanonicalToolCall[];
  /** Model that was used */
  model?: string;
}

/**
 * Error event
 */
export interface ErrorEvent {
  type: 'error';
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** Typed detail, as on a callable's HttpsError (the free-limit refusal) */
  details?: unknown;
}

/**
 * Union of all canonical SSE events
 */
export type CanonicalSSEEvent =
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallCompleteEvent
  | MessageCompleteEvent
  | ErrorEvent;

// ============================================================================
// Canonical Request Types
// ============================================================================

/**
 * Tool definition in canonical format
 */
export interface CanonicalToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: (string | number | boolean)[];
      items?: Record<string, unknown>;
      required?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Tool choice in canonical format
 */
export type CanonicalToolChoice = 'auto' | 'none' | 'required' | { name: string };

/**
 * Attachment in canonical format
 */
export interface CanonicalAttachment {
  type: 'image' | 'document';
  uri: string;
  mimeType: string;
  base64?: string;
  fileName?: string;
  fileSize?: number;
}

/**
 * Canonical request sent to the V2 streaming endpoint
 */
export interface CanonicalStreamRequest {
  /** Provider ID (claude, openai, etc.) */
  providerId: string;
  /** Model ID */
  model: string;
  /** Conversation messages in canonical format */
  messages: CanonicalMessage[];
  /** System prompt (if not in messages) */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Tools available for the AI to call */
  tools?: CanonicalToolDefinition[];
  /** How the AI should handle tool calling */
  toolChoice?: CanonicalToolChoice;
  /** API version - v2 uses canonical format */
  apiVersion: 'v2';
  /** Session metadata */
  sessionId?: string;
  sessionType?: 'chat' | 'debate' | 'comparison' | 'analyze';
  /** Attachments (images, documents) */
  attachments?: CanonicalAttachment[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a message is a tool result message
 */
export function isToolMessage(message: CanonicalMessage): message is CanonicalMessage & { role: 'tool'; tool_call_id: string } {
  return message.role === 'tool' && typeof message.tool_call_id === 'string';
}

/**
 * Check if a message has tool calls
 */
export function hasToolCalls(message: CanonicalMessage): message is CanonicalMessage & { tool_calls: CanonicalToolCall[] } {
  return message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}

/**
 * Check if an event is a text delta
 */
export function isTextDelta(event: CanonicalSSEEvent): event is TextDeltaEvent {
  return event.type === 'text_delta';
}

/**
 * Check if an event is a tool call start
 */
export function isToolCallStart(event: CanonicalSSEEvent): event is ToolCallStartEvent {
  return event.type === 'tool_call_start';
}

/**
 * Check if an event is a tool call delta
 */
export function isToolCallDelta(event: CanonicalSSEEvent): event is ToolCallDeltaEvent {
  return event.type === 'tool_call_delta';
}

/**
 * Check if an event is a tool call complete
 */
export function isToolCallComplete(event: CanonicalSSEEvent): event is ToolCallCompleteEvent {
  return event.type === 'tool_call_complete';
}

/**
 * Check if an event is a message complete
 */
export function isMessageComplete(event: CanonicalSSEEvent): event is MessageCompleteEvent {
  return event.type === 'message_complete';
}

/**
 * Check if an event is an error
 */
export function isErrorEvent(event: CanonicalSSEEvent): event is ErrorEvent {
  return event.type === 'error';
}

/**
 * Check if finish reason indicates tool execution is needed
 */
export function requiresToolExecution(event: MessageCompleteEvent): boolean {
  return event.finish_reason === 'tool_calls' && Array.isArray(event.tool_calls) && event.tool_calls.length > 0;
}
