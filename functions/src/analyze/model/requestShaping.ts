/**
 * Request shaping for the server-side Analyze loop: stored app Messages +
 * tool definitions → one canonical model request for streamModel().
 *
 * Ported from the web app (Phase 3), logic unchanged:
 *  - formatHistory      ← src/lib/ai/base-adapter.ts BaseAdapter.formatHistory
 *  - message assembly,
 *    alternation, tools ← src/lib/ai/adapters/streaming-proxy.ts buildProxyRequest,
 *                         ensureMessageAlternation, sanitizeToolsForProvider,
 *                         getEffectiveToolRequest
 * Temperature is normalized per model again inside streamModel; parameter
 * support comes from the generated model catalog.
 */
import type { Message, MessageAttachment } from '../contract/types';
import type { JSONSchemaProperty, ToolCall, ToolChoice, ToolDefinition } from '../contract/lib/ai/tools/types';
import type { CanonicalAttachment, CanonicalMessage } from '../../types/canonical';
import { getCatalogModel } from '../modelCatalog';

// ============================================================================
// History formatting (base-adapter.ts)
// ============================================================================

export const USER_LABEL = 'User';

export const formatSpeakerLabel = (speaker: string, content: string): string =>
  `[${speaker}] ${content}`;

export interface FormattedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  attachments?: MessageAttachment[];
}

export interface ResumptionContext {
  isResuming: boolean;
  originalPrompt?: Message;
}

export interface FormatHistoryOptions {
  /** The provider the request goes to (identifies "own" messages). */
  providerId: string;
  /** The participant's aiId, when the history carries per-AI ids. */
  identityId?: string;
  /** Chat-mode speaker labels on user turns (never set by Analyze). */
  groupChat?: boolean;
  /** Debate mode (never set by Analyze). */
  isDebateMode?: boolean;
  resumptionContext?: ResumptionContext;
}

export function formatHistory(history: Message[], options: FormatHistoryOptions): FormattedMessage[] {
  const formattedMessages: FormattedMessage[] = [];
  const { resumptionContext } = options;

  if (resumptionContext?.isResuming && resumptionContext.originalPrompt) {
    const originalContent = resumptionContext.originalPrompt.content || '';
    formattedMessages.push({
      role: 'user',
      content: `[Continuation note] Previously started with: "${originalContent.substring(0, 100)}${originalContent.length > 100 ? '...' : ''}"`,
    });
  }

  // For tool calling flows, we need the full history to preserve tool exchanges.
  // Claude requires tool results to immediately follow their tool_use blocks.
  // Truncating can break this pairing and cause 400 errors.
  //
  // For simple chat/debate without tools, limit to recent messages to reduce token costs.
  // Failed turns are not real answers; don't let "Sorry, I encountered an error" feed other AIs.
  const usable = history.filter(
    (m) => !m.metadata?.isError && !m.metadata?.providerMetadata?.streamError
  );
  const hasToolMessages = usable.some((m) => m.senderType === 'tool' || m.metadata?.toolCalls);
  const recent = hasToolMessages ? usable : usable.slice(-20);

  // Speaker attribution: the target model sees a single assistant (itself); every other AI's
  // output becomes labeled user content. Without this, a model reads another AI's reply as its
  // own words (and critiques of that reply as aimed at itself). Same-role runs are merged below.
  const { providerId, identityId } = options;
  const labelUser = !!options.groupChat && !options.isDebateMode;
  const debateMode = !!options.isDebateMode;
  const isOwnMessage = (msg: Message): boolean => {
    if (identityId && msg.metadata?.aiId !== undefined) return msg.metadata.aiId === identityId;
    if (msg.metadata?.providerId) return msg.metadata.providerId === providerId;
    // Unattributed AI messages (e.g. Analyze's single-AI tool flow) keep the legacy mapping:
    // treated as our own outside debate, as another speaker inside it.
    return !debateMode;
  };

  // Tool exchanges are only replayable by the AI that made them: keep results for our own calls,
  // drop other AIs' call/result plumbing (their synthesized answer still comes through as text).
  const ownToolCallIds = new Set(
    recent
      .filter((m) => m.senderType === 'ai' && isOwnMessage(m))
      .flatMap((m) => m.metadata?.toolCalls?.map((call) => call.id) ?? [])
  );

  const mapped = recent
    .map((msg): FormattedMessage | null => {
      // Tool result messages (V2 format) carry isToolResult metadata and become role: 'tool'.
      if (msg.metadata?.isToolResult && msg.metadata?.toolCallId) {
        if (!ownToolCallIds.has(msg.metadata.toolCallId as string)) return null;
        return {
          role: 'tool',
          content: msg.content || '',
          toolCallId: msg.metadata.toolCallId as string,
        };
      }

      if (msg.senderType === 'user') {
        const content = msg.content || '';
        // The orchestrator's turn prompt is already labeled; don't double-label it.
        const label = labelUser && content && !content.startsWith(`[${USER_LABEL}] `);
        return {
          role: 'user',
          content: label ? formatSpeakerLabel(USER_LABEL, content) : content,
          attachments: msg.attachments,
        };
      }

      if (isOwnMessage(msg)) {
        // Preserve toolCalls metadata for this model's own assistant messages
        return {
          role: 'assistant',
          content: msg.content || '',
          toolCalls: msg.metadata?.toolCalls as ToolCall[] | undefined,
        };
      }

      const speaker = msg.sender || 'Other AI';
      return { role: 'user', content: msg.content ? formatSpeakerLabel(speaker, msg.content) : '' };
    })
    .filter((m): m is FormattedMessage => m !== null)
    // Keep messages with content OR toolCalls (for tool calling flow) OR tool results
    .filter((m) => !!m.content || (m.toolCalls && m.toolCalls.length > 0) || m.role === 'tool');

  // Don't merge tool messages - they need to stay separate for API compliance
  const merged: FormattedMessage[] = [];
  for (const m of [...formattedMessages, ...mapped]) {
    const last = merged[merged.length - 1];
    const isToolRelated = m.role === 'tool' || !!m.toolCalls?.length || !!m.toolCallId;
    const lastIsToolRelated = !!last && (last.role === 'tool' || !!last.toolCalls?.length || !!last.toolCallId);

    // Don't merge tool-related messages; preserve exact call/result ordering.
    if (isToolRelated || lastIsToolRelated) {
      merged.push({ role: m.role, content: m.content, toolCalls: m.toolCalls, toolCallId: m.toolCallId, attachments: m.attachments });
    } else if (last && last.role === m.role) {
      last.content = [last.content, m.content].filter(Boolean).join('\n\n');
      // Preserve toolCalls when merging (use the one that has it)
      if (m.toolCalls && m.toolCalls.length > 0) {
        last.toolCalls = m.toolCalls;
      }
      // Combine attachments when merging same-role messages
      if (m.attachments && m.attachments.length > 0) {
        last.attachments = [...(last.attachments || []), ...m.attachments];
      }
    } else {
      merged.push({ role: m.role, content: m.content, toolCalls: m.toolCalls, toolCallId: m.toolCallId, attachments: m.attachments });
    }
  }

  return merged;
}

// ============================================================================
// Message assembly (streaming-proxy.ts)
// ============================================================================

export function formatMessageContent(message: string, attachments?: MessageAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const attachmentNotes = attachments.map((attachment, index) => {
    const name = attachment.fileName ? ` ${attachment.fileName}` : '';
    return `[Attachment ${index + 1}] ${attachment.type}${name}`;
  });

  return `${message}\n\n${attachmentNotes.join('\n')}`;
}

/**
 * Ensure messages alternate between user and assistant roles.
 * Some providers (like Perplexity) require strict alternation.
 * Merges consecutive same-role messages.
 */
export function ensureMessageAlternation(messages: FormattedMessage[]): FormattedMessage[] {
  if (messages.length === 0) return messages;

  const result: FormattedMessage[] = [];
  for (const msg of messages) {
    const last = result[result.length - 1];

    // NEVER merge tool messages - each has a unique tool_call_id that must be preserved
    // NEVER merge messages with toolCalls - the tool_calls array must stay intact
    // NEVER merge messages with toolCallId - these are tool results
    const isToolRelated = msg.role === 'tool' || msg.toolCalls || msg.toolCallId;
    const lastIsToolRelated = last?.role === 'tool' || last?.toolCalls || last?.toolCallId;

    if (isToolRelated || lastIsToolRelated) {
      result.push({ ...msg });
    } else if (last && last.role === msg.role) {
      // Merge consecutive same-role messages (only for simple user/assistant chat)
      last.content = [last.content, msg.content].filter(Boolean).join('\n\n');
      if (msg.attachments && msg.attachments.length > 0) {
        last.attachments = [...(last.attachments || []), ...msg.attachments];
      }
    } else {
      result.push({ ...msg });
    }
  }

  // Some providers (e.g. Perplexity) require conversations to start with a user message.
  // In debate mode the AI's own prior turn can appear first as 'assistant'.
  // Prepend a minimal user context message so the alternation is valid.
  if (result.length > 0 && result[0].role === 'assistant') {
    result.unshift({ role: 'user', content: '[Conversation continues]' });
  }

  return result;
}

// ============================================================================
// Tool schemas (streaming-proxy.ts)
// ============================================================================

/**
 * Sanitize tool parameter schemas for provider compatibility.
 *
 * Different providers support different subsets of JSON Schema:
 * - Gemini: Uses a restricted subset — no `default`, `minimum`, `maximum`,
 *   `pattern`, `additionalProperties`; `integer` must be `number`.
 * - Cohere: No `additionalProperties`, `default`; union `type` arrays
 *   must be collapsed to a single type.
 */
export function sanitizeToolsForProvider(tools: ToolDefinition[], providerId: string): ToolDefinition[] {
  if (providerId !== 'google' && providerId !== 'cohere') {
    return tools;
  }

  return tools.map((tool) => ({
    ...tool,
    parameters: sanitizeSchemaObject(tool.parameters, providerId),
  }));
}

function sanitizeSchemaObject(
  schema: ToolDefinition['parameters'],
  providerId: string
): ToolDefinition['parameters'] {
  const cleaned = { ...schema };

  // Remove additionalProperties (unsupported by Gemini & Cohere function calling)
  delete cleaned.additionalProperties;

  if (cleaned.properties) {
    const sanitizedProps: Record<string, JSONSchemaProperty> = {};
    for (const [key, prop] of Object.entries(cleaned.properties)) {
      sanitizedProps[key] = sanitizeProperty(prop, providerId);
    }
    cleaned.properties = sanitizedProps;
  }

  return cleaned;
}

function sanitizeProperty(prop: JSONSchemaProperty, providerId: string): JSONSchemaProperty {
  const cleaned: JSONSchemaProperty = { ...prop };

  // Remove default values (unsupported by Gemini, problematic for Cohere)
  delete cleaned.default;

  // Gemini-specific: remove validation constraints not in their OpenAPI subset
  if (providerId === 'google') {
    delete cleaned.minimum;
    delete cleaned.maximum;
    delete cleaned.pattern;
    delete cleaned.minLength;
    delete cleaned.maxLength;

    // Gemini doesn't support "integer" — use "number" instead
    if (cleaned.type === 'integer') {
      cleaned.type = 'number';
    }
  }

  // Collapse union type arrays to first type (unsupported by Gemini & Cohere)
  if (Array.isArray(cleaned.type)) {
    cleaned.type = cleaned.type[0] || 'string';
  }

  if (cleaned.properties) {
    const nestedProps: Record<string, JSONSchemaProperty> = {};
    for (const [key, nestedProp] of Object.entries(cleaned.properties)) {
      nestedProps[key] = sanitizeProperty(nestedProp, providerId);
    }
    cleaned.properties = nestedProps;
  }

  if (cleaned.items) {
    cleaned.items = sanitizeProperty(cleaned.items, providerId);
  }

  return cleaned;
}

export function getEffectiveToolRequest(
  providerId: string,
  modelId: string,
  tools: ToolDefinition[] | undefined,
  toolChoice: ToolChoice | undefined
): { tools?: ToolDefinition[]; toolChoice?: ToolChoice } {
  if (!toolChoice || toolChoice === 'auto') {
    return { tools };
  }

  if (providerId === 'cohere' && modelId === 'command-a-plus-05-2026') {
    // Command A+ supports tool calls, but currently rejects Cohere's
    // tool_choice request field. Let enabled tools run in auto mode.
    if (toolChoice === 'none') {
      return {};
    }
    return { tools };
  }

  return { tools, toolChoice };
}

// ============================================================================
// Request assembly (streaming-proxy.ts buildProxyRequest, V2 path)
// ============================================================================

export const WEB_SEARCH_SYSTEM_NOTE = 'You have access to a web_search tool. Use it to find current information when the user asks questions that would benefit from up-to-date data, recent events, or facts you are uncertain about. Do not tell the user you cannot search the web — you can.';

export interface ModelRequestInput {
  providerId: string;
  modelId: string;
  /** The turn's prompt; empty for tool-result follow-up rounds. */
  prompt: string;
  history: Message[];
  attachments?: MessageAttachment[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  /** Requested values; dropped when the model doesn't accept the parameter. */
  temperature?: number;
  maxTokens?: number;
  identityId?: string;
}

export interface ShapedModelRequest {
  messages: CanonicalMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  temperature?: number;
  maxTokens?: number;
  attachments?: CanonicalAttachment[];
}

/** Only the attachment kinds the canonical protocol carries pass through. */
function toCanonicalAttachments(attachments?: MessageAttachment[]): CanonicalAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  const kept = attachments.filter(
    (a): a is MessageAttachment & { type: 'image' | 'document' } => a.type === 'image' || a.type === 'document'
  );
  return kept.length > 0 ? kept : undefined;
}

function toCanonicalMessage(msg: FormattedMessage): CanonicalMessage {
  return {
    role: msg.role,
    content: msg.content,
    tool_calls: msg.toolCalls,
    tool_call_id: msg.toolCallId,
    attachments: toCanonicalAttachments(msg.attachments),
  };
}

export function buildModelRequest(input: ModelRequestInput): ShapedModelRequest {
  const historyMessages = formatHistory(input.history, {
    providerId: input.providerId,
    identityId: input.identityId,
  });

  const content = formatMessageContent(input.prompt, input.attachments);

  // For tool result follow-ups, don't add a new user message: tool results in
  // history mean the model should respond to them, not to a new user turn.
  const last = historyMessages[historyMessages.length - 1];
  const historyEndsWithToolMessage = last?.role === 'tool';
  const historyEndsWithUserMessage = last?.role === 'user';
  const skipUserMessage = (historyEndsWithToolMessage && !content.trim())
    || (!content.trim() && historyEndsWithUserMessage);

  const allMessages: FormattedMessage[] = skipUserMessage
    ? historyMessages
    : [...historyMessages, { role: 'user', content }];

  // Ensure messages alternate (required by Perplexity and some other providers)
  const messages = ensureMessageAlternation(allMessages);

  const supportedParams = getCatalogModel(input.providerId, input.modelId)?.supportedParams ?? [];
  const maxTokens = supportedParams.includes('maxTokens') ? input.maxTokens : undefined;
  let temperature: number | undefined;
  if (supportedParams.includes('temperature')) {
    temperature = input.temperature;
    if (temperature === undefined && input.providerId === 'google') {
      // Gemini docs recommend keeping temperature at 1.0 by default for best
      // reasoning/tool-calling stability.
      temperature = 1.0;
    }
  }

  let systemPrompt = input.systemPrompt;
  if (input.tools?.some((tool) => tool.name === 'web_search')) {
    systemPrompt = [systemPrompt, WEB_SEARCH_SYSTEM_NOTE].filter(Boolean).join('\n\n');
  }

  const sanitizedTools = input.tools ? sanitizeToolsForProvider(input.tools, input.providerId) : undefined;
  const effective = getEffectiveToolRequest(input.providerId, input.modelId, sanitizedTools, input.toolChoice);

  return {
    messages: messages.map(toCanonicalMessage),
    systemPrompt,
    tools: effective.tools,
    toolChoice: effective.toolChoice,
    temperature,
    maxTokens,
    attachments: toCanonicalAttachments(input.attachments),
  };
}
