/**
 * Team state in Firestore: holding the operator's round for a plan, the
 * user's decisions, child runs, and waking the operator when its team is
 * done. Every transition is one transaction on the operator's run doc (plus
 * the docs it creates), so concurrent children finishing, a late approval and
 * Stop can't lose each other's updates; enqueues happen after commit.
 */
import { randomUUID } from 'node:crypto';
import { getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import type { AI, Message } from '../contract/types';
import { enqueueStep } from '../engine/queue';
import {
  type AnalyzeRunDoc,
  type RunConfig,
  type RosterAI,
  type StoredToolResult,
  finishRun,
  isTerminal,
  runRef,
  toStoredToolResult,
  toolCallRef,
} from '../engine/runStore';
import { buildMessageRecord, removeUndefined, runMessagesPath } from '../engine/sessionStore';
import type { TeamHooks } from '../engine/round';
import { buildDelegatedBrief, buildReviewCheckBrief } from './agentResults';
import { OPERATOR_ONLY_TOOL_NAMES, TEAM_TOOL_NAMES } from './teamTools';
import {
  type SlotRef,
  type TeamCallSetup,
  type TeamTurnState,
  activeChildRunIds,
  assignSlotRun,
  composeTeamResults,
  decidePlan,
  hasPendingPlans,
  isTeamRoundReady,
  recordChildResult,
  requestReplacement,
  resolvePendingPlans,
  slotsToSpawn,
  stopUnstartedSlots,
  validateDecision,
} from './teamState';
import type { AgentPurpose, AgentRunResult, TeamMember, TeamPlan, TeamPlanDecision } from './types';

export function teamMembers(config: RunConfig): TeamMember[] {
  return (config.team ?? []).map(({ handle, ai }) => ({ handle, ai: ai as unknown as AI }));
}

function pendingPlans(team: TeamTurnState): TeamPlan[] {
  return (team.plans ?? []).filter((stored) => stored.status === 'pending').map((stored) => stored.plan);
}

// ============================================================================
// Child runs
// ============================================================================

export interface ChildRunSpec {
  uid: string;
  sessionId: string;
  /** The operator config the child inherits (sandbox, tools, subagent prompt). */
  baseConfig: RunConfig;
  ai: RosterAI;
  handle: string;
  purpose: AgentPurpose;
  task: string;
  parentToolCallId: string;
  assignmentKey?: string;
  parentRunId?: string;
  rerunOf?: string;
  reviewItemId?: string;
  now: number;
}

export function newRunId(now: number): string {
  return `run_${now}_${randomUUID().slice(0, 8)}`;
}

/**
 * A subagent run (AgentRunner.run's setup): its own kernel and folder, the
 * teammate prompt, the operator's tools minus the team and operator-only
 * ones, and the brief as its first message.
 */
export function buildChildRun(spec: ChildRunSpec): { run: AnalyzeRunDoc; brief: Message } {
  const runId = newRunId(spec.now);
  const kernel = `agent-${runId}`;
  const base = spec.baseConfig;
  const brief: Message = {
    id: `${runId}_brief`,
    sender: 'Operator',
    senderType: 'user',
    content: spec.purpose === 'review_check' ? buildReviewCheckBrief(spec.task, kernel) : buildDelegatedBrief(spec.task, kernel),
    timestamp: spec.now,
  };
  const config: RunConfig = removeUndefined({
    provider: spec.ai.provider,
    model: spec.ai.model,
    aiId: spec.ai.id,
    aiName: spec.ai.name,
    systemPrompt: base.subagentSystemPrompt ?? '',
    toolNames: base.toolNames.filter((name) => !TEAM_TOOL_NAMES.has(name) && !OPERATOR_ONLY_TOOL_NAMES.has(name)),
    sandboxSessionKey: base.sandboxSessionKey,
    outputSelection: base.outputSelection,
    kernel,
    modelDisplayName: spec.ai.modelConfig?.displayName,
  });
  const run: AnalyzeRunDoc = removeUndefined({
    runId,
    uid: spec.uid,
    sessionId: spec.sessionId,
    kind: spec.purpose === 'review_check' ? 'verify' : 'teammate',
    status: 'queued',
    round: 0,
    retryCount: 0,
    config,
    userMessageId: brief.id,
    eventSeq: 0,
    createdAt: spec.now,
    updatedAt: spec.now,
    lease: null,
    parentRunId: spec.parentRunId,
    agent: {
      purpose: spec.purpose,
      task: spec.task,
      parentToolCallId: spec.parentToolCallId,
      assignmentKey: spec.assignmentKey,
      handle: spec.handle,
      rerunOf: spec.rerunOf,
      reviewItemId: spec.reviewItemId,
    },
  }) as AnalyzeRunDoc;
  return { run, brief };
}

function createChildInTx(tx: Transaction, spec: ChildRunSpec): AnalyzeRunDoc {
  const { run, brief } = buildChildRun(spec);
  tx.set(runRef(spec.uid, spec.sessionId, run.runId), run);
  tx.set(getFirestore().doc(`${runMessagesPath(spec.uid, spec.sessionId, run.runId)}/${brief.id}`), buildMessageRecord(spec.sessionId, brief));
  return run;
}

/** Start child runs created in a committed transaction; one that can't be scheduled fails (never strands its parent). */
async function enqueueChildren(children: AnalyzeRunDoc[]): Promise<void> {
  await Promise.all(children.map(async (child) => {
    try {
      await enqueueStep({ uid: child.uid, sessionId: child.sessionId, runId: child.runId });
    } catch (error) {
      console.error('[analyzeTeam] child enqueue failed', { runId: child.runId, error });
      await finishChild(child, unscheduledResult(child));
    }
  }));
}

function unscheduledResult(child: AnalyzeRunDoc): AgentRunResult {
  return {
    runId: child.runId,
    kernel: child.config.kernel ?? '',
    agentName: child.config.aiName,
    provider: child.config.provider,
    model: displayModel(child.config),
    purpose: child.agent?.purpose ?? 'delegated',
    status: 'failed',
    answer: 'The subagent failed: it could not be scheduled.',
    files: [],
    toolSummary: [],
    startedAt: child.createdAt,
    endedAt: Date.now(),
  };
}

/** What the browser showed as the model (AgentRunner: modelConfig.displayName || model). */
export function displayModel(config: RunConfig): string {
  return config.modelDisplayName || config.model;
}

/** Create runs for every slot that needs one, in the same transaction as the parent update. */
function spawnSlotsInTx(tx: Transaction, parent: AnalyzeRunDoc, team: TeamTurnState): { team: TeamTurnState; children: AnalyzeRunDoc[] } {
  const members = teamMembers(parent.config);
  const children: AnalyzeRunDoc[] = [];
  let next = team;
  for (const ref of slotsToSpawn(team)) {
    const member = members.find((candidate) => candidate.handle === ref.handle);
    if (!member) continue;
    const child = createChildInTx(tx, slotSpec(parent, ref, member));
    next = assignSlotRun(next, ref, child.runId);
    children.push(child);
  }
  return { team: next, children };
}

function slotSpec(parent: AnalyzeRunDoc, ref: SlotRef, member: TeamMember): ChildRunSpec {
  return {
    uid: parent.uid,
    sessionId: parent.sessionId,
    baseConfig: parent.config,
    ai: member.ai as unknown as RosterAI,
    handle: member.handle,
    purpose: 'delegated',
    task: ref.task,
    parentToolCallId: ref.toolCallId,
    assignmentKey: ref.assignmentKey,
    parentRunId: parent.runId,
    now: Date.now(),
  };
}

// ============================================================================
// Settling the operator's wait
// ============================================================================

interface Settled {
  update: Record<string, unknown>;
  children: AnalyzeRunDoc[];
  wake: boolean;
}

/**
 * Where a waiting operator stands after a change to its team state: still
 * awaiting a plan decision, running children (start any that need starting),
 * or done, when the composed results become the team calls' records and the
 * operator is queued to resume its round.
 */
function settleInTx(tx: Transaction, parentRef: DocumentReference, parent: AnalyzeRunDoc, team: TeamTurnState): Settled {
  const now = Date.now();
  // Stop or "do it yourself" while the run is waiting: answer what's still pending, start nothing new.
  if (parent.cancelRequested) {
    team = stopUnstartedSlots(resolvePendingPlans(team, 'stopped', teamMembers(parent.config), now), teamMembers(parent.config), now);
  } else if (team.solo) {
    team = stopUnstartedSlots(resolvePendingPlans(team, 'solo', teamMembers(parent.config), now), teamMembers(parent.config), now);
  }
  // An approved plan's runs start at once, even while another plan waits (the browser gated per plan).
  const spawned = spawnSlotsInTx(tx, parent, team);
  if (hasPendingPlans(spawned.team)) {
    return {
      update: { team: removeUndefined(spawned.team), pendingTeamPlans: pendingPlans(spawned.team), status: 'awaiting_approval', lease: null, updatedAt: now },
      children: spawned.children,
      wake: false,
    };
  }
  if (isTeamRoundReady(spawned.team)) {
    for (const result of composeTeamResults(spawned.team, teamMembers(parent.config))) {
      tx.set(toolCallRef(parentRef, result.toolCallId), removeUndefined({
        state: 'done',
        result: toStoredToolResult(result) as StoredToolResult,
        finishedAt: now,
      }));
    }
    const { calls: _calls, plans: _plans, ...rest } = spawned.team;
    return {
      update: { team: removeUndefined(rest), pendingTeamPlans: [], status: 'queued', lease: null, updatedAt: now },
      children: spawned.children,
      wake: true,
    };
  }
  return {
    update: { team: removeUndefined(spawned.team), pendingTeamPlans: [], status: 'waiting_children', lease: null, updatedAt: now },
    children: spawned.children,
    wake: false,
  };
}

async function afterSettle(parent: AnalyzeRunDoc, settled: Settled): Promise<void> {
  await enqueueChildren(settled.children);
  if (settled.wake) await enqueueStep({ uid: parent.uid, sessionId: parent.sessionId, runId: parent.runId });
}

/**
 * Change a waiting operator's team state and settle it, in one transaction.
 * `change` returns the new state (or null to leave the run alone).
 */
async function updateWaitingParent(
  parentRef: DocumentReference,
  change: (parent: AnalyzeRunDoc, team: TeamTurnState) => TeamTurnState | null,
): Promise<{ parent: AnalyzeRunDoc; settled: Settled } | null> {
  const outcome = await getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(parentRef);
    if (!snapshot.exists) return null;
    const parent = snapshot.data() as AnalyzeRunDoc;
    if (parent.status !== 'awaiting_approval' && parent.status !== 'waiting_children') return null;
    const team = change(parent, parent.team ?? {});
    if (!team) return null;
    const settled = settleInTx(tx, parentRef, parent, team);
    tx.update(parentRef, settled.update);
    return { parent, settled };
  });
  if (outcome) await afterSettle(outcome.parent, outcome.settled);
  return outcome;
}

// ============================================================================
// The round's hooks (round.ts TeamHooks)
// ============================================================================

export function createTeamHooks(ref: DocumentReference, run: AnalyzeRunDoc): TeamHooks {
  return {
    members: teamMembers(run.config),
    saveTurnState: async (patch) => {
      run.team = { ...run.team, ...patch };
      const update: Record<string, unknown> = { updatedAt: Date.now() };
      for (const [key, value] of Object.entries(patch)) update[`team.${key}`] = value;
      await ref.update(update);
    },
    suspend: async (setup: TeamCallSetup) => {
      const now = Date.now();
      let team: TeamTurnState = {
        ...run.team,
        planCounter: setup.planCounter,
        ...(setup.planProposed ? { planProposed: true } : {}),
        plans: setup.plans.map((plan) => ({ plan, status: 'pending' as const })),
        calls: setup.calls,
      };
      if (run.config.teamAutoApprove) {
        // TeamApprovalGate.request with auto-approve: the card still shows, marked approved.
        team = { ...team, plans: (team.plans ?? []).map((stored) => ({ ...stored, plan: { ...stored.plan, autoApproved: true } })) };
        for (const plan of setup.plans) {
          team = decidePlan(team, plan.id, { type: 'approve', assignments: plan.assignments }, 'approved', teamMembers(run.config), now);
        }
      }
      run.team = team;
      const batch = getFirestore().batch();
      for (const result of setup.immediate) {
        batch.set(toolCallRef(ref, result.toolCallId), removeUndefined({ state: 'done', result: toStoredToolResult(result), finishedAt: now }));
      }
      // Status stays running while this step holds the lease; enterWait settles it.
      // Dotted paths: a "do it yourself" (team.solo) written meanwhile must survive.
      batch.update(ref, removeUndefined({
        'team.plans': team.plans,
        'team.calls': team.calls,
        'team.planCounter': team.planCounter,
        ...(team.planProposed ? { 'team.planProposed': true } : {}),
        pendingTeamPlans: pendingPlans(team),
        updatedAt: now,
      }));
      await batch.commit();
    },
  };
}

/**
 * The step held the round for its team and is ending: release the lease and
 * settle (await the plan, start the children, or wake at once). A Stop that
 * arrived meanwhile answers the plans as stopped and cancels the children.
 */
export async function enterWait(ref: DocumentReference, owner: string): Promise<void> {
  const outcome = await getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const parent = snapshot.data() as AnalyzeRunDoc;
    if (parent.lease && parent.lease.owner !== owner) throw new Error(`Run ${parent.runId} lease lost before its wait`);
    const settled = settleInTx(tx, ref, parent, parent.team ?? {});
    tx.update(ref, settled.update);
    return { parent, settled };
  });
  await afterSettle(outcome.parent, outcome.settled);
  // Children started after the Stop landed still have to stop.
  if (outcome.parent.cancelRequested) await cancelChildren(outcome.parent.uid, outcome.parent.sessionId, outcome.parent.runId);
}

// ============================================================================
// User decisions (analyzeRunControl)
// ============================================================================

export class TeamControlError extends Error {}

export async function approvePlan(ref: DocumentReference, planId: string, decision: TeamPlanDecision): Promise<boolean> {
  const outcome = await updateWaitingParent(ref, (parent, team) => {
    const stored = (team.plans ?? []).find((candidate) => candidate.plan.id === planId);
    if (!stored || stored.status !== 'pending') return null;
    const valid = validateDecision(stored.plan, decision);
    return decidePlan(team, planId, valid, valid.type === 'approve' ? 'approved' : 'solo', teamMembers(parent.config), Date.now());
  });
  return outcome !== null;
}

/**
 * "Have [operator] do it": answer pending plans as solo, stop running
 * delegated subagents (their partial results still go back), and withhold
 * the team tools for the rest of the run. Review checks keep running.
 */
export async function workSolo(ref: DocumentReference): Promise<void> {
  const snapshot = await ref.get();
  const run = snapshot.data() as AnalyzeRunDoc | undefined;
  if (!run || isTerminal(run.status)) return;
  const waiting = await updateWaitingParent(ref, (parent, team) => ({
    ...resolvePendingPlans(team, 'solo', teamMembers(parent.config), Date.now()),
    solo: true,
  }));
  if (!waiting) {
    // Running (or queued): no plan is waiting; the next round withholds the team tools.
    await ref.update({ 'team.solo': true, updatedAt: Date.now() });
  }
  await cancelChildren(run.uid, run.sessionId, run.runId);
}

/** Per-lane Stop. */
export async function cancelLane(uid: string, sessionId: string, childRunId: string): Promise<void> {
  const ref = runRef(uid, sessionId, childRunId);
  const snapshot = await ref.get();
  const child = snapshot.data() as AnalyzeRunDoc | undefined;
  if (!child || child.kind === 'operator' || isTerminal(child.status)) return;
  await ref.update({ cancelRequested: true, cancelRequestedAt: Date.now() });
}

/**
 * "Replace with…": stop a running team run and rerun its task on another
 * pool model, inside the same plan. False when the run already ended or the
 * handle isn't in the pool.
 */
export async function replaceLane(uid: string, sessionId: string, childRunId: string, handle: string): Promise<boolean> {
  const child = (await runRef(uid, sessionId, childRunId).get()).data() as AnalyzeRunDoc | undefined;
  if (!child?.parentRunId || isTerminal(child.status)) return false;
  let accepted = false;
  await getFirestore().runTransaction(async (tx) => {
    const parentRef = runRef(uid, sessionId, child.parentRunId as string);
    const parent = (await tx.get(parentRef)).data() as AnalyzeRunDoc | undefined;
    const current = (await tx.get(runRef(uid, sessionId, childRunId))).data() as AnalyzeRunDoc | undefined;
    if (!parent || !current || isTerminal(current.status)) return;
    if (parent.status !== 'waiting_children' && parent.status !== 'awaiting_approval') return;
    if (!teamMembers(parent.config).some((member) => member.handle === handle)) return;
    tx.update(parentRef, { team: removeUndefined(requestReplacement(parent.team ?? {}, childRunId, handle)), updatedAt: Date.now() });
    tx.update(runRef(uid, sessionId, childRunId), { cancelRequested: true, cancelRequestedAt: Date.now() });
    accepted = true;
  });
  return accepted;
}

/** Stop requested on a waiting operator: answer its plans as stopped; its children stop and wake it. */
export async function stopWaitingOperator(ref: DocumentReference): Promise<void> {
  await updateWaitingParent(ref, (parent, team) => resolvePendingPlans(team, 'stopped', teamMembers(parent.config), Date.now()));
}

/** Cancel this operator's running children (Stop, "do it yourself"). */
export async function cancelChildren(uid: string, sessionId: string, parentRunId: string): Promise<void> {
  const parent = (await runRef(uid, sessionId, parentRunId).get()).data() as AnalyzeRunDoc | undefined;
  const ids = new Set(parent?.team ? activeChildRunIds(parent.team) : []);
  const children = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`)
    .where('parentRunId', '==', parentRunId)
    .get();
  for (const doc of children.docs) {
    const child = doc.data() as AnalyzeRunDoc;
    if (!isTerminal(child.status)) ids.add(child.runId);
  }
  const now = Date.now();
  await Promise.all([...ids].map((id) => runRef(uid, sessionId, id)
    .update({ cancelRequested: true, cancelRequestedAt: now })
    .catch((error) => console.warn('[analyzeTeam] could not cancel a child run', { id, error }))));
}

// ============================================================================
// A child finished
// ============================================================================

/**
 * Record a finished child: its doc goes terminal with its result, and its
 * slot on the parent takes the result (or reruns, when replaced). The last
 * child wakes the parent. `handoffPending` stays set until the wake (or a
 * rerun's delivery) is enqueued, so a redelivered step can finish the job.
 */
export async function finishChild(child: AnalyzeRunDoc, result: AgentRunResult): Promise<{ settled: Settled | null; parent: AnalyzeRunDoc | null }> {
  const childRef = runRef(child.uid, child.sessionId, child.runId);
  const status = result.status === 'failed' ? 'error' : result.status;
  const outcome = await getFirestore().runTransaction(async (tx) => {
    const current = (await tx.get(childRef)).data() as AnalyzeRunDoc;
    const parentRef = child.parentRunId ? runRef(child.uid, child.sessionId, child.parentRunId) : null;
    const parent = parentRef ? (await tx.get(parentRef)).data() as AnalyzeRunDoc | undefined : undefined;
    if (isTerminal(current.status)) return { settled: null, parent: parent ?? null, already: true };

    let settled: Settled | null = null;
    if (parentRef && parent && (parent.status === 'waiting_children' || parent.status === 'awaiting_approval')) {
      const team = recordChildResult(parent.team ?? {}, child.runId, result);
      settled = settleInTx(tx, parentRef, parent, team);
      tx.update(parentRef, settled.update);
    }
    const now = Date.now();
    tx.update(childRef, removeUndefined({
      status,
      result,
      lease: null,
      finishedAt: now,
      updatedAt: now,
      handoffPending: Boolean(settled?.wake || settled?.children.length || child.agent?.rerunOf),
      ...(status === 'error' ? { error: { message: result.answer.slice(0, 500), code: 'internal' } } : {}),
    }));
    return { settled, parent: parent ?? null, already: false };
  });
  if (outcome.already) return { settled: null, parent: outcome.parent };
  if (outcome.settled && outcome.parent) await afterSettle(outcome.parent, outcome.settled);
  return { settled: outcome.settled, parent: outcome.parent };
}

export async function clearHandoff(child: AnalyzeRunDoc): Promise<void> {
  await runRef(child.uid, child.sessionId, child.runId).update({ handoffPending: false, updatedAt: Date.now() });
}

/**
 * A redelivered task for a finished child whose handoff didn't complete: the
 * parent may be queued with no task. Enqueue it again (a duplicate is
 * harmless: the lease and the status gate make it a no-op).
 */
export async function resumeParentWake(child: AnalyzeRunDoc): Promise<void> {
  if (!child.parentRunId) return;
  const parent = (await runRef(child.uid, child.sessionId, child.parentRunId).get()).data() as AnalyzeRunDoc | undefined;
  if (parent?.status === 'queued') await enqueueStep({ uid: child.uid, sessionId: child.sessionId, runId: parent.runId });
  // Children the settle created but may not have enqueued.
  const children = await getFirestore()
    .collection(`users/${child.uid}/conversations/${child.sessionId}/analyzeRuns`)
    .where('parentRunId', '==', child.parentRunId)
    .get();
  for (const doc of children.docs) {
    const sibling = doc.data() as AnalyzeRunDoc;
    if (sibling.status === 'queued' && sibling.round === 0 && sibling.eventSeq === 0) {
      await enqueueStep({ uid: sibling.uid, sessionId: sibling.sessionId, runId: sibling.runId });
    }
  }
}

/** A failed run's stored error, for a step that ends without a result. */
export async function failRun(ref: DocumentReference, message: string): Promise<void> {
  await finishRun(ref, 'error', { message, code: 'internal' });
}

// ============================================================================
// Stranded runs (Stop's escape hatch)
// ============================================================================

/**
 * No step has touched a run for this long and none holds it: its task is
 * gone. (Cancel requests don't bump updatedAt, so it tracks step progress.)
 */
const STRANDED_MS = 90_000;

function isStranded(run: AnalyzeRunDoc, now: number): boolean {
  const leased = run.lease && run.lease.expiresAt > now;
  return !leased && (run.status === 'queued' || run.status === 'running') && now - run.updatedAt > STRANDED_MS;
}

/**
 * Stop on a run whose task was lost (a crash between a commit and its
 * enqueue, or a step that ran out of retries): no step will ever see the
 * Stop, so finish it here. Children finish as stopped (waking the parent);
 * an operator with no live step finishes directly. Live runs are left to
 * their own step.
 */
export async function forceStopStranded(uid: string, sessionId: string, runId: string): Promise<void> {
  const now = Date.now();
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`)
    .where('parentRunId', '==', runId)
    .get();
  for (const doc of snapshot.docs) {
    const child = doc.data() as AnalyzeRunDoc;
    if (isTerminal(child.status) || !isStranded(child, now)) continue;
    await finishChild(child, child.result ?? { ...unscheduledResult(child), status: 'stopped', answer: 'Stopped before it finished.' });
  }
  const ref = runRef(uid, sessionId, runId);
  const run = (await ref.get()).data() as AnalyzeRunDoc | undefined;
  if (run && !isTerminal(run.status) && isStranded(run, now)) {
    if (run.kind === 'operator') await finishRun(ref, 'stopped');
    else await finishChild(run, run.result ?? { ...unscheduledResult(run), status: 'stopped', answer: 'Stopped before it finished.' });
  }
}
