/**
 * Client entry points for server-side Analyze runs. Clients never write run
 * state directly (rules deny it); every action is a callable.
 *
 *   analyzeStartTurn     the user's message → an operator run
 *   analyzeRunControl    one run: stop, team plan answers, lanes, auto-approve
 *   analyzeReviewControl the session's review queue: review, verify, send, select…
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isV2Supported } from '../../providers/registry';
import { getCatalogModel } from '../modelCatalog';
import { isTerminal, runRef, type AnalyzeRunDoc, type RosterAI, type RunConfig } from './runStore';
import { SessionBusyError, TurnAlreadyStartedError, startOperatorTurn } from './turns';
import { normalizeAnalyzeOutputSelection } from '../contract/types/analyze';
import { MAX_PANEL_SIZE, TeamArgsError } from '../team/teamTools';
import {
  TeamControlError,
  approvePlan,
  cancelChildren,
  cancelLane,
  forceStopStranded,
  replaceLane,
  stopWaitingOperator,
  workSolo,
} from '../team/teamStore';
import { startRerun } from '../team/reruns';
import type { TeamAssignment } from '../team/types';
import {
  dismissReviewItems,
  reopenReviewItems,
  sendReviewItemsToOperator,
  setReviewItemsSelected,
  startReviewPass,
  startVerification,
} from '../review/reviewRuns';

/**
 * Phase 3 build-out: the engine is deployed dark. Only these accounts may use
 * it until the v2.6 cutover; DELETE this list (and its checks) at release.
 *  - mspencer@braveheartinnovations.com (Michael's web account)
 *  - the live-proxy test account (automated harness)
 */
export const SERVER_LOOP_ALLOWED_UIDS = new Set([
  'NIxWoHSaoZbleBOUfnJVpocHTY22',
  'm8zEMeTFGUaZ0xXyuZ6Fu57rWa72',
]);

function requireAllowedUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Analyze.');
  if (!SERVER_LOOP_ALLOWED_UIDS.has(uid)) {
    throw new HttpsError('permission-denied', 'Server-side Analyze is not available for this account yet.');
  }
  return uid;
}

function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return value;
}

function optionalString(value: unknown, max = 200_000): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

function stringList(value: unknown, max = 100): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, max) : [];
}

interface RosterAIInput { id?: unknown; name?: unknown; provider?: unknown; model?: unknown; displayName?: unknown }

/** A roster AI the run can call: a V2 provider and a known model. */
function rosterAI(value: RosterAIInput | undefined, field: string, needsTools: boolean): RosterAI {
  const provider = requireString(value?.provider, `${field}.provider`);
  const model = requireString(value?.model, `${field}.model`);
  if (!isV2Supported(provider)) throw new HttpsError('invalid-argument', `Provider ${provider} can't run Analyze.`);
  const catalogModel = getCatalogModel(provider, model);
  if (!catalogModel) throw new HttpsError('invalid-argument', `Unknown model ${provider}/${model}.`);
  if (needsTools && !catalogModel.supportsFunctions) throw new HttpsError('invalid-argument', `${model} can't call tools.`);
  const displayName = optionalString(value?.displayName, 200);
  return {
    id: requireString(value?.id, `${field}.id`),
    name: requireString(value?.name, `${field}.name`),
    provider,
    model,
    ...(displayName ? { modelConfig: { displayName } } : {}),
  };
}

interface StartTurnRequest {
  sessionId: string;
  message: { id?: string; content: string };
  ai: RosterAIInput;
  systemPrompt: string;
  toolNames: string[];
  sandboxSessionKey: string;
  /** The composer's output selection (AnalyzeOutputSelection); defaults like a new session. */
  outputSelection?: unknown;
  /** Save capture traces for the web parity harness (scripts/analyze-capture-parity). */
  captureTrace?: boolean;
  /** Roster teammates, in roster order (handles teammate1..). Never the reviewer. */
  teammates?: RosterAIInput[];
  /** Roster reviewers. */
  reviewers?: RosterAIInput[];
  /** Team mode for this message (needs teammates). */
  teamPlan?: boolean;
  teamAutoApprove?: boolean;
  autoReview?: boolean;
  salesforceWorkspace?: boolean;
  /** System prompts the caller builds like systemPrompt: teammates', and the operator's with Team mode off. */
  subagentSystemPrompt?: string;
  followUpSystemPrompt?: string;
}

export const analyzeStartTurn = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Partial<StartTurnRequest>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const content = requireString(data.message?.content, 'message.content', 200_000);
  const sandboxSessionKey = requireString(data.sandboxSessionKey, 'sandboxSessionKey');
  const systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : '';
  const toolNames = stringList(data.toolNames);
  const operator = rosterAI(data.ai, 'ai', toolNames.length > 0);
  const teammates = (Array.isArray(data.teammates) ? data.teammates : []).slice(0, 20)
    .map((ai, index) => rosterAI(ai, `teammates[${index}]`, toolNames.length > 0));
  const reviewers = (Array.isArray(data.reviewers) ? data.reviewers : []).slice(0, 10)
    .map((ai, index) => rosterAI(ai, `reviewers[${index}]`, false));

  const config: RunConfig = {
    provider: operator.provider,
    model: operator.model,
    aiId: operator.id,
    aiName: operator.name,
    systemPrompt,
    toolNames,
    sandboxSessionKey,
    outputSelection: normalizeAnalyzeOutputSelection(data.outputSelection),
    ...(data.captureTrace === true ? { captureTrace: true } : {}),
    ...(operator.modelConfig ? { modelDisplayName: operator.modelConfig.displayName } : {}),
    // buildTeam: handles are short and stable so models reliably emit them.
    ...(teammates.length > 0 ? { team: teammates.map((ai, index) => ({ handle: `teammate${index + 1}`, ai })) } : {}),
    ...(reviewers.length > 0 ? { reviewers } : {}),
    // Team mode needs someone to plan with (AnalyzeOrchestrator.processMessage).
    ...(data.teamPlan === true && teammates.length > 0 ? { teamPlanTurn: true } : {}),
    ...(data.teamAutoApprove === true ? { teamAutoApprove: true } : {}),
    ...(data.autoReview === true ? { autoReview: true } : {}),
    ...(data.salesforceWorkspace === true ? { salesforceWorkspace: true } : {}),
    ...(optionalString(data.subagentSystemPrompt) !== undefined ? { subagentSystemPrompt: data.subagentSystemPrompt } : {}),
    ...(optionalString(data.followUpSystemPrompt) !== undefined ? { followUpSystemPrompt: data.followUpSystemPrompt } : {}),
  };

  try {
    return await startOperatorTurn({
      uid,
      sessionId,
      content,
      messageId: typeof data.message?.id === 'string' && data.message.id ? data.message.id : undefined,
      config,
    });
  } catch (error) {
    if (error instanceof SessionBusyError) throw new HttpsError('failed-precondition', error.message);
    if (error instanceof TurnAlreadyStartedError) throw new HttpsError('already-exists', 'This message was already sent.');
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Analyze could not start this run. Please try again.');
  }
});

function parseAssignments(value: unknown): TeamAssignment[] {
  if (!Array.isArray(value)) throw new HttpsError('invalid-argument', 'assignments are required');
  return value.slice(0, 50).map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      id: requireString(item.id, `assignments[${index}].id`, 500),
      task: requireString(item.task, `assignments[${index}].task`, 200_000),
      agents: stringList(item.agents, MAX_PANEL_SIZE + 1),
    };
  });
}

function controlFailure(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof TeamControlError || error instanceof TeamArgsError) throw new HttpsError('failed-precondition', error.message);
  if (error instanceof SessionBusyError) throw new HttpsError('failed-precondition', error.message);
  console.error('[analyzeRun] control failed', error);
  throw new HttpsError('internal', 'That action failed. Please try again.');
}

export const analyzeRunControl = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const runId = requireString(data.runId, 'runId');
  const action = data.action;

  const ref = runRef(uid, sessionId, runId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Run not found.');
  const run = snapshot.data() as AnalyzeRunDoc;

  try {
    switch (action) {
      case 'stop': {
        if (isTerminal(run.status)) return { status: run.status };
        await ref.update({ cancelRequested: true, cancelRequestedAt: Date.now() });
        if (run.kind === 'operator') {
          // Stop cascades: pending plans answer as stopped, running teammates stop; the last one wakes the operator to stop.
          await stopWaitingOperator(ref);
          await cancelChildren(uid, sessionId, runId);
        }
        await forceStopStranded(uid, sessionId, runId);
        return { status: 'stopping' };
      }
      case 'approve_plan': {
        const planId = requireString(data.planId, 'planId', 500);
        const accepted = await approvePlan(ref, planId, { type: 'approve', assignments: parseAssignments(data.assignments) });
        return { accepted };
      }
      case 'work_solo':
        await workSolo(ref);
        return { ok: true };
      case 'cancel_lane':
        await cancelLane(uid, sessionId, requireString(data.childRunId, 'childRunId'));
        return { ok: true };
      case 'replace_lane': {
        const replaced = await replaceLane(uid, sessionId, requireString(data.childRunId, 'childRunId'), requireString(data.handle, 'handle'));
        return { accepted: replaced };
      }
      case 'rerun_task': {
        const rerunId = await startRerun(uid, sessionId, requireString(data.previousRunId, 'previousRunId'), requireString(data.handle, 'handle'));
        return { runId: rerunId };
      }
      case 'set_auto_approve':
        // Applies to the plans this run proposes from now on (TeamApprovalGate.setAutoApprove).
        await ref.update({ 'config.teamAutoApprove': data.enabled === true, updatedAt: Date.now() });
        return { ok: true };
      default:
        throw new HttpsError('invalid-argument', `Unknown action ${String(action)}`);
    }
  } catch (error) {
    controlFailure(error);
  }
});

export const analyzeReviewControl = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAllowedUid(request.auth?.uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = requireString(data.sessionId, 'sessionId');
  const itemIds = stringList(data.itemIds);

  try {
    switch (data.action) {
      case 'review': {
        const runId = await startReviewPass(uid, sessionId, {
          reviewerIds: stringList(data.reviewerIds, 10),
          targetMessageId: optionalString(data.targetMessageId, 500) ?? null,
          requestText: optionalString(data.requestText, 20_000)?.trim() || undefined,
          trigger: 'manual',
        });
        return { runId };
      }
      case 'verify':
        return { runIds: await startVerification(uid, sessionId, itemIds) };
      case 'send_to_operator':
        return await sendReviewItemsToOperator(uid, sessionId, itemIds);
      case 'select':
        await setReviewItemsSelected(uid, sessionId, itemIds, true);
        return { ok: true };
      case 'deselect':
        await setReviewItemsSelected(uid, sessionId, itemIds, false);
        return { ok: true };
      case 'reopen':
        await reopenReviewItems(uid, sessionId, itemIds);
        return { ok: true };
      case 'dismiss':
        await dismissReviewItems(uid, sessionId, itemIds);
        return { ok: true };
      default:
        throw new HttpsError('invalid-argument', `Unknown action ${String(data.action)}`);
    }
  } catch (error) {
    controlFailure(error);
  }
});
