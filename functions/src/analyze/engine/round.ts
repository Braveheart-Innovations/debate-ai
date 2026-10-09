/**
 * One round of the server-side Analyze loop: history → model → (tools) →
 * messages. Behavior follows the browser loop (symposium-ai-web
 * orchestrator/loop.ts + loopHandlers.ts) with two server adaptations:
 *
 *  1. The assistant message carrying tool calls is written BEFORE the tools
 *     run (the browser wrote it after). A redelivered step resumes those
 *     calls through their idempotency records instead of re-asking the model,
 *     which would mint new call ids and orphan finished work.
 *  2. Errors arrive as canonical `error` events, not thrown fetch errors: a
 *     provider network failure / 5xx is streamModel code `internal`, which
 *     takes the browser's "network error" branch.
 */
import type { DocumentReference } from 'firebase-admin/firestore';
import type { Message } from '../contract/types';
import type { ToolCall, ToolDefinition, ToolResult } from '../contract/lib/ai/tools/types';
import { streamModel, CANCELLED_CODE } from '../../modelStream';
import type { CanonicalToolDefinition } from '../../types/canonical';
import { buildModelRequest } from '../model/requestShaping';
import { getCatalogModel, DEFAULT_MAX_OUTPUT_TOKENS } from '../modelCatalog';
import { buildAnalyzeHistory } from './history';
import { AnalyzeStatus, type AnalyzeSession } from './contracts';
import { buildToolResultContentForFollowUp } from './toolResultHistory';
import {
  TOOL_FOLLOW_UP_RECOVERY_PROMPT,
  TOOL_FOLLOW_UP_STREAM_RETRY_PROMPT,
  formatProviderError,
  hasRecentToolFollowUpContext,
  summarizeRecentToolFailure,
} from './loopRules';
import {
  type AnalyzeRunDoc,
  type RunEventWriter,
  type StoredToolResult,
  getToolCallRecord,
  loadSessionMessages,
  markToolCallDone,
  markToolCallStarted,
  toStoredToolResult,
  toolCallRef,
  writeMessage,
} from './runStore';

// loop.ts DEFAULT_ANALYZE_TEMPERATURE / GOOGLE_ANALYZE_TEMPERATURE
const DEFAULT_ANALYZE_TEMPERATURE = 0.7;
const GOOGLE_ANALYZE_TEMPERATURE = 1.0;
/** loopHandlers maxRetries: one retry per turn, shared across rounds. */
export const MAX_RETRIES = 1;
/** Ceiling for one model call; a stalled stream ends as an error, not a hung step. */
const MODEL_CALL_TIMEOUT_MS = 15 * 60_000;

export interface RoundContext {
  uid: string;
  sessionId: string;
  run: AnalyzeRunDoc;
  runRef: DocumentReference;
  events: RunEventWriter;
  signal: AbortSignal;
  keyValue: string;
  tools: ToolDefinition[];
  executeTool: (call: ToolCall) => Promise<ToolResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/** Turn-scoped state carried across rounds (persisted on the run doc between steps). */
export interface TurnState {
  round: number;
  retryCount: number;
}

export type RoundOutcome = 'continue' | 'completed' | 'stopped' | 'error';

interface ModelAttempt {
  text: string;
  toolCalls: ToolCall[];
  finishReason?: string;
  toolCallStarted: boolean;
  error?: { message: string; code: string };
}

function aiIdentity(run: AnalyzeRunDoc) {
  const { provider, model, aiId, aiName } = run.config;
  return { id: aiId, provider, model, name: aiName };
}

function sessionFor(run: AnalyzeRunDoc, messages: Message[]): AnalyzeSession {
  return {
    id: run.sessionId,
    // The contract's AI type is wider than the loop needs; provider/model/name drive it.
    ai: aiIdentity(run) as AnalyzeSession['ai'],
    messages,
    startTime: run.createdAt,
    status: AnalyzeStatus.STREAMING,
  };
}

async function callModel(
  context: RoundContext,
  history: Message[],
  prompt: string,
  messageId: string,
): Promise<ModelAttempt> {
  const { run } = context;
  const { provider, model, systemPrompt } = run.config;
  const requested = provider === 'google' ? GOOGLE_ANALYZE_TEMPERATURE : DEFAULT_ANALYZE_TEMPERATURE;
  const maxOutput = getCatalogModel(provider, model)?.maxOutputTokens;

  const shaped = buildModelRequest({
    providerId: provider,
    modelId: model,
    prompt,
    history,
    systemPrompt,
    tools: context.tools,
    toolChoice: context.tools.length > 0 ? 'auto' : undefined,
    temperature: run.config.temperature ?? requested,
    maxTokens: run.config.maxTokens ?? (maxOutput || DEFAULT_MAX_OUTPUT_TOKENS),
    identityId: run.config.aiId,
  });

  const attempt: ModelAttempt = { text: '', toolCalls: [], toolCallStarted: false };
  context.events.push({ type: 'status', status: 'streaming' });
  for await (const event of streamModel({
    uid: context.uid,
    providerId: provider,
    model,
    messages: shaped.messages,
    systemPrompt: shaped.systemPrompt,
    maxTokens: shaped.maxTokens,
    temperature: shaped.temperature,
    // Same JSON the V2 proxy forwards today. The server canonical type models
    // property `type` as a single string; real schemas may use unions, which
    // providers accept and sanitizeToolsForProvider collapses for Gemini/Cohere.
    tools: shaped.tools as CanonicalToolDefinition[] | undefined,
    toolChoice: shaped.toolChoice,
    attachments: shaped.attachments,
    keyValue: context.keyValue,
    sessionId: run.sessionId,
    sessionType: 'analyze',
    signal: context.signal,
    timeoutMs: MODEL_CALL_TIMEOUT_MS,
  })) {
    switch (event.type) {
      case 'text_delta':
        attempt.text += event.delta;
        context.events.push({ type: 'text', messageId, text: event.delta });
        break;
      case 'tool_call_start':
        attempt.toolCallStarted = true;
        context.events.push({ type: 'tool_call_start', messageId, toolCallId: event.id, toolName: event.name });
        break;
      case 'message_complete':
        attempt.finishReason = event.finish_reason;
        attempt.toolCalls = (event.tool_calls ?? []) as ToolCall[];
        break;
      case 'error':
        attempt.error = { message: event.message, code: event.code ?? 'internal' };
        break;
      default:
        break;
    }
  }
  return attempt;
}

function aiMessage(context: RoundContext, id: string, content: string, metadata: Message['metadata'] = {}): Message {
  const { provider, model, aiName, aiId } = context.run.config;
  return {
    id,
    sender: aiName,
    senderType: 'ai',
    content,
    timestamp: context.now(),
    metadata: { providerId: provider, modelUsed: model, aiId, ...metadata },
  };
}

/** loopHandlers.handleLoopStreamError's final message for a non-retried failure. */
function failureText(context: RoundContext, history: Message[], error: { message: string; code: string }): string {
  const name = context.run.config.aiName || 'The AI provider';
  const isContextLimitError = /prompt is too long|too many tokens|maximum context length|token limit|request too large|context window|context length exceeded|input is too long/i.test(error.message);
  if (isContextLimitError) {
    return `This conversation has exceeded ${context.run.config.model || 'the current model'}'s context window limit. The conversation history (including fetched data and tool results) is too large to process.\n\n**To continue your analysis:**\n1. **Start a new session** — your data files are still uploaded and ready to use\n2. **Switch to a larger-context model** — Gemini models support up to 1M tokens\n\nThis typically happens after fetching large datasets or many rounds of tool calls.`;
  }
  const recentToolContext = hasRecentToolFollowUpContext(history);
  const isNetworkError = error.code === 'internal';
  const isTransientProcessingError = error.message.includes("couldn't process");
  const recentToolFailure = recentToolContext ? summarizeRecentToolFailure(history) : undefined;
  const isRateLimitError = error.code === 'resource-exhausted'
    || /(^|[^0-9])429([^0-9]|$)|too many requests|rate[- ]limit/i.test(`${error.message} ${recentToolFailure || ''}`);

  if (isRateLimitError) {
    return `I hit a rate limit while processing this request (HTTP 429 / too many requests).\n\n${recentToolFailure ? `Latest tool failure: ${recentToolFailure}\n\n` : ''}Please try:\n1. Wait 30-60 seconds and retry\n2. Reduce scope or paginate requests to lower API load\n3. Ensure fetch_api calls include the connector api_key_ref when available`;
  }
  if (recentToolFailure) {
    return `A tool call failed before I could complete the final response.\n\nLatest tool failure: ${recentToolFailure}\n\nPlease try:\n1. Retry with narrower parameters\n2. Use fewer external sources in one run\n3. If this repeats, switch data source or model`;
  }
  if (isNetworkError && recentToolContext) {
    return `${name} was interrupted after tool execution, before the final response or required artifact was completed.\n\nThe fetched and computed data from this run is still retained in the tool results and saved files. Continue from those retained outputs instead of refetching or treating the data as unavailable.`;
  }
  if (isNetworkError) {
    return 'The connection to the AI server failed. This is usually a brief server interruption.\n\nPlease try:\n1. **Try again** — this typically resolves on the next attempt\n2. **Check your connection** — make sure you\'re online\n3. **Try a different model** — the current provider may be experiencing issues';
  }
  if (isTransientProcessingError) {
    return `${name} could not process this request after retrying. This was reported as a provider processing error, not a confirmed context-window limit.\n\nPlease try:\n1. **Retry once** — transient provider processing errors often clear on a second attempt\n2. **Ask for a narrower follow-up** if the request just produced large tool outputs\n3. **Switch models** if the same provider fails again`;
  }
  const providerError = formatProviderError(error.message);
  return `The AI provider stopped before completing this request.${providerError ? `\n\nProvider error: ${providerError}` : ''}\n\nPlease try:\n1. **Retry once** — transient provider errors often resolve on retry\n2. **Ask for a narrower follow-up** if the request used large files or tool outputs\n3. **Switch models** if this repeats`;
}

/** Execute one tool call at most once, across step redeliveries. */
async function runToolOnce(context: RoundContext, call: ToolCall): Promise<StoredToolResult & { provenance?: ToolResult['provenance'] }> {
  const ref = toolCallRef(context.runRef, call.id);
  const record = await getToolCallRecord(ref);
  if (record?.state === 'done') return record.result;
  if (record?.state === 'started') {
    // The step died mid-execution. Python isn't idempotent, so never rerun it blind.
    const result: StoredToolResult = {
      success: false,
      error: 'Execution was interrupted before it finished (the server restarted). Re-run it if the result is still needed.',
    };
    await markToolCallDone(ref, result);
    return result;
  }

  await markToolCallStarted(ref);
  context.events.push({ type: 'tool_executing', toolCallId: call.id, toolName: call.function.name });
  const result = await context.executeTool(call);
  const stored = toStoredToolResult(result);
  await markToolCallDone(ref, stored);
  context.events.push({ type: 'tool_completed', toolCallId: call.id, toolName: call.function.name, success: result.success });
  return { ...stored, provenance: result.provenance };
}

function toolResultMessage(context: RoundContext, call: ToolCall, result: StoredToolResult & { provenance?: ToolResult['provenance'] }): Message {
  const contentForAI = buildToolResultContentForFollowUp({ toolCallId: call.id, ...result } as ToolResult);
  return {
    id: `toolresult_${call.id}`,
    sender: 'tool',
    senderType: 'tool',
    content: contentForAI,
    timestamp: context.now(),
    metadata: {
      toolCallId: call.id,
      toolName: call.function.name,
      isToolResult: true,
      success: result.success,
      toolProvenance: result.provenance,
    },
  };
}

/** Tool calls on the last assistant message that have no result message yet. */
function pendingToolCalls(messages: Message[]): ToolCall[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.senderType === 'user') return [];
    if (message.senderType === 'ai') {
      const calls = (message.metadata?.toolCalls ?? []) as ToolCall[];
      const answered = new Set(
        messages.slice(i + 1)
          .filter((m) => m.senderType === 'tool' && m.metadata?.isToolResult)
          .map((m) => m.metadata?.toolCallId),
      );
      return calls.filter((call) => !answered.has(call.id));
    }
  }
  return [];
}

async function executeTools(context: RoundContext, calls: ToolCall[]): Promise<RoundOutcome | null> {
  context.events.push({ type: 'status', status: 'tool_executing' });
  for (const call of calls) {
    if (context.signal.aborted) return 'stopped';
    const result = await runToolOnce(context, call);
    await writeMessage(context.uid, context.sessionId, toolResultMessage(context, call, result));
  }
  return context.signal.aborted ? 'stopped' : null;
}

export async function runRound(context: RoundContext, state: TurnState): Promise<RoundOutcome> {
  if (context.signal.aborted) return 'stopped';
  const messages = await loadSessionMessages(context.uid, context.sessionId);

  // Resume tool calls a previous step recorded but didn't finish.
  const pending = pendingToolCalls(messages);
  if (pending.length > 0) {
    const stopped = await executeTools(context, pending);
    if (stopped) return stopped;
    return 'continue';
  }

  const session = sessionFor(context.run, messages);
  const history = buildAnalyzeHistory(session);
  const messageId = `${context.run.runId}_r${state.round}`;

  let prompt = '';
  let attempt = await callModel(context, history, prompt, messageId);

  // loopHandlers.handleLoopStreamError: one retry for network/transient failures.
  while (attempt.error && attempt.error.code !== CANCELLED_CODE) {
    const isNetworkError = attempt.error.code === 'internal';
    const isTransientProcessingError = attempt.error.message.includes("couldn't process");
    if (state.retryCount >= MAX_RETRIES || !(isNetworkError || isTransientProcessingError)) break;
    state.retryCount += 1;
    if (hasRecentToolFollowUpContext(history)) prompt = TOOL_FOLLOW_UP_STREAM_RETRY_PROMPT;
    await context.sleep(isNetworkError ? 2000 : 1000);
    attempt = await callModel(context, history, prompt, messageId);
  }

  if (attempt.error?.code === CANCELLED_CODE || context.signal.aborted) {
    if (attempt.text.trim()) await writeMessage(context.uid, context.sessionId, aiMessage(context, messageId, attempt.text));
    return 'stopped';
  }
  if (attempt.error) {
    await writeMessage(context.uid, context.sessionId, aiMessage(context, messageId, failureText(context, history, attempt.error)));
    return 'error';
  }

  // loop.ts: a tool call cut off by the output limit.
  if (attempt.finishReason === 'length' && attempt.toolCallStarted && attempt.toolCalls.length === 0) {
    await writeMessage(context.uid, context.sessionId, aiMessage(context, messageId, 'I started to generate code but ran into a response size limit. This can happen with complex requests.\n\nPlease try:\n1. **Break into smaller steps**: Ask for one specific analysis at a time\n2. **Simplify the request**: Start with a basic analysis, then build on it\n3. **Clear conversation**: Start a new session if the context has grown large'));
    return 'completed';
  }

  if (attempt.toolCalls.length === 0) {
    return finishWithoutTools(context, state, history, prompt, attempt, messageId);
  }

  await writeMessage(context.uid, context.sessionId, aiMessage(context, messageId, attempt.text, { toolCalls: attempt.toolCalls }));
  const stopped = await executeTools(context, attempt.toolCalls);
  return stopped ?? 'continue';
}

/** loopHandlers.handleNoToolResponse. */
async function finishWithoutTools(
  context: RoundContext,
  state: TurnState,
  history: Message[],
  prompt: string,
  first: ModelAttempt,
  messageId: string,
): Promise<RoundOutcome> {
  let attempt = first;
  const toolFollowUpRound = state.round > 0 && hasRecentToolFollowUpContext(history);

  if (!attempt.text.trim() && toolFollowUpRound) {
    await context.sleep(750);
    attempt = await callModel(context, history, TOOL_FOLLOW_UP_RECOVERY_PROMPT, messageId);
  }
  if (!attempt.error && !attempt.text.trim() && attempt.toolCalls.length === 0 && state.retryCount < MAX_RETRIES) {
    state.retryCount += 1;
    await context.sleep(1000);
    attempt = await callModel(context, history, prompt, messageId);
  }
  if (context.signal.aborted) return 'stopped';
  // A recovery attempt may have produced tool calls after all: record and run them.
  if (!attempt.error && attempt.toolCalls.length > 0) {
    await writeMessage(context.uid, context.sessionId, aiMessage(context, messageId, attempt.text, { toolCalls: attempt.toolCalls }));
    return (await executeTools(context, attempt.toolCalls)) ?? 'continue';
  }

  const metadata: Message['metadata'] = {};
  let content = attempt.text;
  if (!content.trim()) {
    const name = context.run.config.aiName || 'The AI';
    if (toolFollowUpRound) {
      content = `${name} returned an empty reply after its tool calls. The tool results are kept.`;
      metadata.appNotice = { kind: 'empty_after_tools' };
    } else {
      content = `${name} returned an empty reply. This usually means the provider had a problem processing the request.`;
      metadata.appNotice = { kind: 'empty_reply' };
    }
  } else if (attempt.finishReason === 'length') {
    // A reply that stopped at the output limit reads as finished; flag it.
    metadata.outputLimitReached = true;
  }
  await writeMessage(context.uid, context.sessionId, aiMessage(context, messageId, content, metadata));
  return 'completed';
}
