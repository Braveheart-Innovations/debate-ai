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
 *  3. Capture (the browser's stream_completed handling) runs here, after a
 *     round's tools: context.capture writes the artifacts and stamps the
 *     message's toolExecutionResults. A round whose tools finished but whose
 *     message has no toolExecutionResults was cut off before capture, and the
 *     next delivery captures it from the calls' saved outputs.
 *  4. Team calls don't block inside the round (the browser awaited the plan
 *     and the subagents in the tool call). The round stores the plan and
 *     returns 'waiting'; the step ends. When the team is done, the composed
 *     results are the calls' idempotency records, and the next delivery
 *     resumes the round like any other: every result message is written in
 *     call order once all of the round's calls have results.
 *
 * Subagent runs use the same round with their own transcript, no team tools
 * and no capture (the browser never captured subagent rounds either).
 */
import type { DocumentReference } from 'firebase-admin/firestore';
import type { Message, MessageAttachment } from '../contract/types';
import type { ToolCall, ToolChoice, ToolDefinition, ToolResult } from '../contract/lib/ai/tools/types';
import { streamModel, CANCELLED_CODE } from '../../modelStream';
import type { CanonicalToolDefinition } from '../../types/canonical';
import { buildModelRequest } from '../model/requestShaping';
import { getCatalogModel, DEFAULT_MAX_OUTPUT_TOKENS } from '../modelCatalog';
import { buildAnalyzeHistory } from './history';
import { AnalyzeStatus, type AnalyzeSession } from './contracts';
import { buildToolResultContentForFollowUp } from './toolResultHistory';
import type { MessageStore } from './sessionStore';
import {
  ASK_USER_TOOL_NAME,
  ORG_EVIDENCE_TOOL_NAME,
  PROPOSE_TEAM_TOOL_NAME,
  SALESFORCE_PLANNING_TOOL_NAMES,
  TEAM_TOOL_NAMES,
  buildAskUserTool,
  buildDelegateTool,
  buildProposeTeamTool,
  parseAskUserArgs,
} from '../team/teamTools';
import {
  ORG_EVIDENCE_REQUESTED_REPLY,
  argsFailure,
  setupTeamCalls,
  type TeamCallSetup,
  type TeamTurnState,
} from '../team/teamState';
import type { TeamMember } from '../team/types';
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
  deleteToolOutputs,
  getToolCallRecord,
  loadToolResult,
  markToolCallDone,
  markToolCallStarted,
  saveToolOutputs,
  setLatestCompletedOperatorMessage,
  toStoredToolResult,
  toolCallRef,
} from './runStore';
import type { CaptureInput } from '../capture/captureRound';

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
  /** Full results of the calls this step ran (the stored records keep no payloads). */
  toolResults: Map<string, ToolResult>;
  /** The run's conversation: the session's messages (operator) or its own transcript (subagent). */
  messages: MessageStore;
  /** Stage 7: capture a finished tool round (captureRound.CaptureSession.capture). Operator only. */
  capture?: (input: CaptureInput) => Promise<void>;
  /** The operator's team (null for subagents, which never get team tools). */
  team?: TeamHooks | null;
  /** Operator: the turn's attachments (composer + PDF pages), sent with the turn's first model call. */
  turnAttachments?: () => Promise<MessageAttachment[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/** What a round needs from the team store (teamStore.createTeamHooks). */
export interface TeamHooks {
  members: TeamMember[];
  /** Persist turn-scoped team flags on the run doc (and on context.run.team). */
  saveTurnState: (patch: Partial<TeamTurnState>) => Promise<void>;
  /**
   * Hold the round for the team: answer the immediate calls, store the plans
   * and the waiting calls, and set the run waiting, atomically.
   */
  suspend: (setup: TeamCallSetup) => Promise<void>;
}

/** Turn-scoped state carried across rounds (persisted on the run doc between steps). */
export interface TurnState {
  round: number;
  retryCount: number;
}

/** 'waiting': the round is held for a team plan or the team's runs; the step ends. */
export type RoundOutcome = 'continue' | 'completed' | 'stopped' | 'error' | 'waiting';

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

interface RoundTools {
  tools: ToolDefinition[];
  toolChoice?: ToolChoice;
}

function teamState(context: RoundContext): TeamTurnState {
  return context.run.team ?? {};
}

/**
 * The operator's tools this round (AnalyzeOrchestrator.getToolsForProvider +
 * roundTools): the team tools while the roster has teammates and the run isn't
 * solo; while a Team mode plan is pending, only planning, asking the user, or
 * on a Salesforce workspace the audit and org evidence first, with a call
 * required (streamModel resends unforced for models that can't be forced).
 */
export function roundTools(context: RoundContext): RoundTools {
  const team = context.team?.members ?? [];
  const state = teamState(context);
  const tools = team.length > 0 && context.tools.length > 0 && !state.solo
    ? [...context.tools, buildProposeTeamTool(team), buildDelegateTool(team)]
    : context.tools;
  const proposeTeam = tools.find((tool) => tool.name === PROPOSE_TEAM_TOOL_NAME);
  if (!context.run.config.teamPlanTurn || state.planProposed || !proposeTeam) return { tools };
  const salesforce = context.run.config.salesforceWorkspace
    ? tools.filter((tool) => SALESFORCE_PLANNING_TOOL_NAMES.has(tool.name))
    : [];
  return { tools: [...salesforce, proposeTeam, buildAskUserTool()], toolChoice: 'required' };
}

async function callModel(
  context: RoundContext,
  history: Message[],
  prompt: string,
  messageId: string,
  roundToolSet: RoundTools,
  attachments?: MessageAttachment[],
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
    tools: roundToolSet.tools,
    toolChoice: roundToolSet.toolChoice ?? (roundToolSet.tools.length > 0 ? 'auto' : undefined),
    temperature: run.config.temperature ?? requested,
    maxTokens: run.config.maxTokens ?? (maxOutput || DEFAULT_MAX_OUTPUT_TOKENS),
    identityId: run.config.aiId,
    attachments,
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
async function runToolOnce(context: RoundContext, call: ToolCall): Promise<RoundToolResult> {
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
  context.toolResults.set(call.id, result);
  const stored = toStoredToolResult(result);
  await markToolCallDone(ref, stored, await saveToolOutputs(ref, result));
  context.events.push({ type: 'tool_completed', toolCallId: call.id, toolName: call.function.name, success: result.success });
  return { ...stored, provenance: result.provenance };
}

type RoundToolResult = StoredToolResult & { provenance?: ToolResult['provenance'] };

function toolResultMessage(call: ToolCall, result: RoundToolResult, timestamp: number): Message {
  const contentForAI = buildToolResultContentForFollowUp({ toolCallId: call.id, ...result } as ToolResult);
  return {
    id: `toolresult_${call.id}`,
    sender: 'tool',
    senderType: 'tool',
    content: contentForAI,
    timestamp,
    metadata: {
      toolCallId: call.id,
      toolName: call.function.name,
      isToolResult: true,
      success: result.success,
      toolProvenance: result.provenance,
      ...(result.teamRuns ? { teamRuns: result.teamRuns } : {}),
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

/** The current turn's last assistant message, when it made tool calls that were never captured. */
function uncapturedToolMessage(context: RoundContext, messages: Message[]): Message | null {
  if (!context.capture) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.senderType === 'user') return null;
    if (message.senderType === 'ai') {
      const calls = message.metadata?.toolCalls as ToolCall[] | undefined;
      return calls?.length && !message.metadata?.toolExecutionResults ? message : null;
    }
  }
  return null;
}

/**
 * Stage 7: capture a round once its tools are done. Results come from this
 * step, else from the calls' saved outputs; a stopped round captures the calls
 * that ran, as the browser did.
 */
async function captureToolRound(context: RoundContext, message: Message): Promise<void> {
  const calls = (message.metadata?.toolCalls ?? []) as ToolCall[];
  const results: ToolResult[] = [];
  for (const call of calls) {
    const result = context.toolResults.get(call.id) ?? await loadToolResult(toolCallRef(context.runRef, call.id));
    if (!result) break;
    results.push(result);
  }
  if (context.capture) await context.capture({ message, toolCalls: calls, results });
  await deleteToolOutputs(calls.map((call) => toolCallRef(context.runRef, call.id)));
}

/** Write a reply that ends the turn; the browser's stream_completed recorded it as the latest operator reply. */
async function writeFinalMessage(context: RoundContext, message: Message): Promise<void> {
  await context.messages.write(message);
  if (context.run.kind === 'operator') await setLatestCompletedOperatorMessage(context.runRef, message.id);
}

async function doneResult(context: RoundContext, call: ToolCall): Promise<RoundToolResult | null> {
  const record = await getToolCallRecord(toolCallRef(context.runRef, call.id));
  return record?.state === 'done' ? record.result : null;
}

/** AnalyzeOrchestrator.answerWhileAsking: the question ends the turn; nothing else in the round runs. */
function answerWhileAsking(call: ToolCall, askCall: ToolCall): { result: RoundToolResult; questions?: string } {
  if (call !== askCall) {
    return { result: { success: true, content: 'Not run: you asked the user first. Plan after their answer.' } };
  }
  try {
    const { questions } = parseAskUserArgs(call.function.arguments);
    return { result: { success: true, content: 'Your question was shown to the user. Their answer is the next message.' }, questions };
  } catch (error) {
    const failure = argsFailure(call.id, error);
    return { result: { success: false, error: failure.error } };
  }
}

/**
 * The round's team calls (AnalyzeOrchestrator.runTeamCalls): their results
 * once the team is done, or 'waiting' after holding the round for the plan.
 */
async function resolveTeamCalls(context: RoundContext, calls: ToolCall[]): Promise<Map<string, RoundToolResult> | 'waiting'> {
  const hooks = context.team as TeamHooks;
  const results = new Map<string, RoundToolResult>();
  const open: ToolCall[] = [];
  for (const call of calls) {
    const result = await doneResult(context, call);
    if (result) results.set(call.id, result);
    else open.push(call);
  }
  if (open.length === 0) return results;

  const state = teamState(context);
  // A redelivery after the round was held but before the wait settled: it's already held.
  if (open.some((call) => (state.calls ?? []).some((held) => held.toolCallId === call.id))) return 'waiting';
  const setup = setupTeamCalls({
    toolCalls: open,
    team: hooks.members,
    solo: state.solo === true,
    planCounter: state.planCounter ?? 0,
    now: context.now(),
  });
  if (setup.planProposed && !state.planProposed) await hooks.saveTurnState({ planProposed: true });
  if (setup.plans.length > 0) {
    await hooks.suspend(setup);
    return 'waiting';
  }
  for (const result of setup.immediate) {
    const stored = toStoredToolResult(result);
    await markToolCallDone(toolCallRef(context.runRef, result.toolCallId), stored);
    results.set(result.toolCallId, stored);
  }
  return results;
}

/**
 * Run a round's calls (AnalyzeOrchestrator.executeOperatorTools for the
 * operator), then write every result message in call order. Returns
 * 'waiting' when the round is held for the team, 'stopped' on Stop.
 */
async function executeTools(context: RoundContext, calls: ToolCall[]): Promise<RoundOutcome | null> {
  context.events.push({ type: 'status', status: 'tool_executing' });
  const results = new Map<string, RoundToolResult>();
  let stopped = false;

  // Asking the user comes first: a team proposed in the same breath waits for the answer.
  const askCall = context.team ? calls.find((call) => call.function.name === ASK_USER_TOOL_NAME) : undefined;
  if (askCall) {
    let questions: string | undefined;
    for (const call of calls) {
      const answer = answerWhileAsking(call, askCall);
      results.set(call.id, answer.result);
      questions ??= answer.questions;
    }
    if (questions !== undefined) await context.team!.saveTurnState({ askedUser: { questions } });
  } else {
    const teamCalls = context.team ? calls.filter((call) => TEAM_TOOL_NAMES.has(call.function.name)) : [];
    const otherCalls = calls.filter((call) => !teamCalls.includes(call));
    for (const call of otherCalls) {
      if (context.signal.aborted) {
        // Stopped: keep what already finished, run nothing new.
        const finished = await doneResult(context, call);
        if (finished) results.set(call.id, finished);
        else stopped = true;
        continue;
      }
      results.set(call.id, await runToolOnce(context, call));
    }
    if (teamCalls.length > 0) {
      if (stopped || context.signal.aborted) {
        for (const call of teamCalls) {
          const finished = await doneResult(context, call);
          if (finished) results.set(call.id, finished);
          else stopped = true;
        }
      } else {
        const team = await resolveTeamCalls(context, teamCalls);
        if (team === 'waiting') return 'waiting';
        for (const [id, result] of team) results.set(id, result);
      }
    }
    const evidenceCall = context.team ? otherCalls.find((call) => call.function.name === ORG_EVIDENCE_TOOL_NAME) : undefined;
    if (evidenceCall && results.get(evidenceCall.id)?.success && !teamState(context).orgEvidenceRequested) {
      await context.team!.saveTurnState({ orgEvidenceRequested: true });
    }
  }

  // One timestamp per message, in call order (they sort by timestamp).
  const base = context.now();
  for (const [index, call] of calls.entries()) {
    const result = results.get(call.id);
    if (result) await context.messages.write(toolResultMessage(call, result, base + index));
  }
  return stopped || context.signal.aborted ? 'stopped' : null;
}

/** The reply that ends the turn after this round's tools (loop.ts endTurnAfterTools), if any. */
function endTurnReply(context: RoundContext): string | null {
  if (!context.team) return null;
  const state = teamState(context);
  if (state.askedUser) return state.askedUser.questions;
  return state.orgEvidenceRequested ? ORG_EVIDENCE_REQUESTED_REPLY : null;
}

/** Tools done (or resumed): fill an empty end-of-turn reply, capture, and decide what's next. */
async function finishToolRound(context: RoundContext, toolMessage: Message, outcome: RoundOutcome | null): Promise<RoundOutcome> {
  let message = toolMessage;
  const reply = endTurnReply(context);
  if (reply && !message.content.trim()) {
    message = { ...message, content: reply };
    await context.messages.write(message);
  }
  await captureToolRound(context, message);
  if (outcome) return outcome;
  return reply ? 'completed' : 'continue';
}

export async function runRound(context: RoundContext, state: TurnState): Promise<RoundOutcome> {
  const messages = await context.messages.load();

  // Resume tool calls a previous step recorded but didn't finish (or a round
  // the team just finished), then capture the round. A stopped run still
  // writes the results that exist, as the browser did.
  const pending = pendingToolCalls(messages);
  if (pending.length > 0) {
    const outcome = await executeTools(context, pending);
    if (outcome === 'waiting') return 'waiting';
    const toolMessage = lastAssistantMessage(messages);
    if (!toolMessage) return outcome ?? 'continue';
    return finishToolRound(context, toolMessage, outcome);
  }
  if (context.signal.aborted) return 'stopped';
  const uncaptured = uncapturedToolMessage(context, messages);
  if (uncaptured) return finishToolRound(context, uncaptured, null);
  // The round that ended the turn was captured, then the step died.
  if (endTurnReply(context)) return 'completed';

  const session = sessionFor(context.run, messages);
  const history = buildAnalyzeHistory(session);
  const messageId = `${context.run.runId}_r${state.round}`;
  const toolSet = roundTools(context);

  // The browser sent the turn's attachments with its first model call only (loop.ts round 0).
  const attachments = state.round === 0 && context.turnAttachments ? await context.turnAttachments() : undefined;
  let prompt = '';
  let attempt = await callModel(context, history, prompt, messageId, toolSet, attachments);

  // loopHandlers.handleLoopStreamError: one retry for network/transient failures.
  while (attempt.error && attempt.error.code !== CANCELLED_CODE) {
    const isNetworkError = attempt.error.code === 'internal';
    const isTransientProcessingError = attempt.error.message.includes("couldn't process");
    if (state.retryCount >= MAX_RETRIES || !(isNetworkError || isTransientProcessingError)) break;
    state.retryCount += 1;
    if (hasRecentToolFollowUpContext(history)) prompt = TOOL_FOLLOW_UP_STREAM_RETRY_PROMPT;
    await context.sleep(isNetworkError ? 2000 : 1000);
    attempt = await callModel(context, history, prompt, messageId, toolSet, attachments);
  }

  if (attempt.error?.code === CANCELLED_CODE || context.signal.aborted) {
    if (attempt.text.trim()) await context.messages.write(aiMessage(context, messageId, attempt.text));
    return 'stopped';
  }
  if (attempt.error) {
    await writeFinalMessage(context, aiMessage(context, messageId, failureText(context, history, attempt.error)));
    return 'error';
  }

  // loop.ts: a tool call cut off by the output limit.
  if (attempt.finishReason === 'length' && attempt.toolCallStarted && attempt.toolCalls.length === 0) {
    await writeFinalMessage(context, aiMessage(context, messageId, 'I started to generate code but ran into a response size limit. This can happen with complex requests.\n\nPlease try:\n1. **Break into smaller steps**: Ask for one specific analysis at a time\n2. **Simplify the request**: Start with a basic analysis, then build on it\n3. **Clear conversation**: Start a new session if the context has grown large'));
    return 'completed';
  }

  if (attempt.toolCalls.length === 0) {
    return finishWithoutTools(context, state, history, prompt, attempt, messageId, toolSet, attachments);
  }

  return runToolRound(context, aiMessage(context, messageId, attempt.text, { toolCalls: attempt.toolCalls }), attempt.toolCalls);
}

/** Record the assistant's tool calls before running them (see the header), then run and finish the round. */
async function runToolRound(context: RoundContext, toolMessage: Message, calls: ToolCall[]): Promise<RoundOutcome> {
  await context.messages.write(toolMessage);
  const outcome = await executeTools(context, calls);
  if (outcome === 'waiting') return 'waiting';
  return finishToolRound(context, toolMessage, outcome);
}

/** The current turn's last assistant message. */
function lastAssistantMessage(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].senderType === 'user') return null;
    if (messages[i].senderType === 'ai') return messages[i];
  }
  return null;
}

/** loopHandlers.handleNoToolResponse. */
async function finishWithoutTools(
  context: RoundContext,
  state: TurnState,
  history: Message[],
  prompt: string,
  first: ModelAttempt,
  messageId: string,
  toolSet: RoundTools,
  attachments?: MessageAttachment[],
): Promise<RoundOutcome> {
  let attempt = first;
  const toolFollowUpRound = state.round > 0 && hasRecentToolFollowUpContext(history);

  if (!attempt.text.trim() && toolFollowUpRound) {
    await context.sleep(750);
    attempt = await callModel(context, history, TOOL_FOLLOW_UP_RECOVERY_PROMPT, messageId, toolSet);
  }
  if (!attempt.error && !attempt.text.trim() && attempt.toolCalls.length === 0 && state.retryCount < MAX_RETRIES) {
    state.retryCount += 1;
    await context.sleep(1000);
    attempt = await callModel(context, history, prompt, messageId, toolSet, attachments);
  }
  if (context.signal.aborted) return 'stopped';
  // A recovery attempt may have produced tool calls after all: record and run them.
  if (!attempt.error && attempt.toolCalls.length > 0) {
    return runToolRound(context, aiMessage(context, messageId, attempt.text, { toolCalls: attempt.toolCalls }), attempt.toolCalls);
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
  // beforeFinalReply: Team mode was on but no plan came (models that can't be forced).
  if (context.run.config.teamPlanTurn && !teamState(context).planProposed) metadata.teamModeSkipped = true;
  await writeFinalMessage(context, aiMessage(context, messageId, content, metadata));
  return 'completed';
}
