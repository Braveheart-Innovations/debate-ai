/**
 * The operator's team work as run state. The browser held a team plan in an
 * in-memory Promise (TeamApprovalGate) and ran subagents inside the
 * operator's tool call (AnalyzeOrchestrator.runTeamCalls). On the server the
 * operator's step ends instead: the plan waits on the run doc
 * (awaiting_approval), approved tasks run as child analyzeRuns
 * (waiting_children), and when the last one finishes the composed results
 * become the team calls' tool results and the operator's next round runs.
 *
 * Everything here is pure; teamStore.ts applies it in Firestore transactions.
 * The tool-result texts and their composition are ported verbatim from
 * symposium-ai-web src/services/analyze/AnalyzeOrchestrator.ts.
 */
import type { AnalyzeTeamRunSummary } from '../contract/types';
import type { ToolCall, ToolResult } from '../contract/lib/ai/tools/types';
import { formatDelegateResult } from './agentResults';
import {
  DELEGATE_TOOL_NAME,
  PROPOSE_TEAM_TOOL_NAME,
  TeamArgsError,
  MAX_PANEL_SIZE,
  parseDelegateArgs,
  parseProposeTeamArgs,
  toPoolMember,
} from './teamTools';
import type {
  AgentRunResult,
  DelegateArgs,
  ProposeTeamArgs,
  TeamAssignment,
  TeamMember,
  TeamPlan,
  TeamPlanDecision,
  TeamPlanOutcome,
} from './types';

/** The turn's reply when the operator requested org evidence without writing one. */
export const ORG_EVIDENCE_REQUESTED_REPLY = 'I need org-runtime evidence before going further. Run the org-connected agent with the brief below, then import its findings — or continue without org evidence.';

/** Tool result text when the user has the operator work alone. */
export const SOLO_RESULT_TEXT = 'The user chose to have you do this yourself; sub-agents aren\'t available for the rest of this run.';

/** One teammate's place on an approved task. "Replace with…" reruns the slot on another model. */
export interface TeamSlot {
  handle: string;
  /** The slot's current (or last) run. */
  childRunId?: string;
  /** Rerun the task on this handle once the current run stops. */
  replacement?: string;
  /** Earlier runs of this slot that the user replaced. */
  replaced: AgentRunResult[];
  /** The slot's final run, once it finished. */
  result?: AgentRunResult;
}

export interface ApprovedAssignment {
  assignment: TeamAssignment;
  /** One per known teammate on the task; empty when the user left none. */
  slots: TeamSlot[];
}

export interface TeamCallState {
  toolCallId: string;
  toolName: typeof DELEGATE_TOOL_NAME | typeof PROPOSE_TEAM_TOOL_NAME;
  planId: string;
  delegateArgs?: DelegateArgs;
  proposeArgs?: ProposeTeamArgs;
  /** propose_team: the plan's assignments as proposed (ids `${toolCallId}:${n}`). */
  proposed?: TeamAssignment[];
  /** Set once the plan is decided. */
  resolution?: 'approved' | 'solo';
  approved?: ApprovedAssignment[];
}

export interface StoredTeamPlan {
  plan: TeamPlan;
  status: 'pending' | TeamPlanOutcome;
  decidedAt?: number;
}

/** Turn-scoped team state on the operator's run doc (the orchestrator's per-run fields). */
export interface TeamTurnState {
  /** A Team mode plan was proposed this turn (the planning gate opens). */
  planProposed?: boolean;
  /** "Have [operator] do it": no sub-agents for the rest of this run. */
  solo?: boolean;
  /** The operator asked the user; the turn ends after this round. */
  askedUser?: { questions: string };
  /** The operator requested org evidence; the turn ends after this round. */
  orgEvidenceRequested?: boolean;
  planCounter?: number;
  /** Plans of the round the operator is waiting on. */
  plans?: StoredTeamPlan[];
  /** Team calls of the round the operator is waiting on (cleared when it wakes). */
  calls?: TeamCallState[];
}

export function soloResult(toolCallId: string): ToolResult {
  // Not a failure: the user's choice, reported as a plain result.
  return { toolCallId, success: true, content: SOLO_RESULT_TEXT };
}

export function argsFailure(toolCallId: string, error: unknown): ToolResult {
  return { toolCallId, success: false, error: error instanceof Error ? error.message : 'Delegation failed' };
}

function taskTitle(task: string): string {
  const firstLine = task.split('\n').find((line) => line.trim())?.trim() || 'Task';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function sameAgents(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((handle) => b.includes(handle));
}

function describeHandles(handles: string[], team: TeamMember[]): string {
  return handles.map((handle) => {
    const member = team.find((candidate) => candidate.handle === handle);
    return member ? `${member.ai.name} (${member.ai.modelConfig?.displayName || member.ai.model})` : handle;
  }).join(' and ');
}

export function toTeamRunSummary(
  run: AgentRunResult,
  parentToolCallId: string,
  assignmentKey: string,
  task: string,
): AnalyzeTeamRunSummary {
  return {
    runId: run.runId,
    parentToolCallId,
    assignmentKey,
    agentName: run.agentName,
    provider: run.provider,
    model: run.model,
    task,
    status: run.status,
    files: run.files,
    ...(run.answerFile ? { answerFile: run.answerFile } : {}),
    toolCount: run.toolSummary.length,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
  };
}

// ============================================================================
// Setup: a round's team calls → immediate results and plans
// ============================================================================

export interface TeamCallSetup {
  /** Calls answered at once (bad arguments, or the run is solo). */
  immediate: ToolResult[];
  calls: TeamCallState[];
  plans: TeamPlan[];
  planCounter: number;
  planProposed: boolean;
}

/**
 * AnalyzeOrchestrator.runTeamCalls up to the approval wait: one plan for the
 * round's delegate calls, one per propose_team call.
 */
export function setupTeamCalls(input: {
  toolCalls: ToolCall[];
  team: TeamMember[];
  solo: boolean;
  planCounter: number;
  now: number;
}): TeamCallSetup {
  const { team, solo, now } = input;
  let planCounter = input.planCounter;
  const nextPlanId = () => {
    planCounter += 1;
    return `plan_${now.toString(36)}_${planCounter}`;
  };
  const pool = team.map(toPoolMember);
  const immediate: ToolResult[] = [];
  const calls: TeamCallState[] = [];
  const plans: TeamPlan[] = [];

  const delegateCalls = input.toolCalls.filter((call) => call.function.name === DELEGATE_TOOL_NAME);
  const proposeCalls = input.toolCalls.filter((call) => call.function.name === PROPOSE_TEAM_TOOL_NAME);

  // resolveDelegateBatch
  const valid: Array<{ call: ToolCall; args: DelegateArgs }> = [];
  for (const call of delegateCalls) {
    try {
      valid.push({ call, args: parseDelegateArgs(call.function.arguments, team) });
    } catch (error) {
      immediate.push(argsFailure(call.id, error));
    }
  }
  if (valid.length > 0) {
    if (solo) {
      immediate.push(...valid.map(({ call }) => soloResult(call.id)));
    } else {
      const planId = nextPlanId();
      plans.push({
        id: planId,
        source: 'delegate',
        assignments: valid.map(({ call, args }) => ({ id: call.id, task: args.task, agents: [args.agent] })),
        pool,
      });
      calls.push(...valid.map(({ call, args }) => ({
        toolCallId: call.id,
        toolName: DELEGATE_TOOL_NAME,
        planId,
        delegateArgs: args,
      } as TeamCallState)));
    }
  }

  // resolveProposeTeam, per call
  for (const call of proposeCalls) {
    let args: ProposeTeamArgs;
    try {
      args = parseProposeTeamArgs(call.function.arguments, team);
    } catch (error) {
      immediate.push(argsFailure(call.id, error));
      continue;
    }
    if (solo) {
      immediate.push(soloResult(call.id));
      continue;
    }
    const proposed = args.assignments.map((assignment, index) => ({ id: `${call.id}:${index + 1}`, ...assignment }));
    const planId = nextPlanId();
    plans.push({ id: planId, source: 'propose_team', kind: args.kind, rationale: args.rationale, assignments: proposed, pool });
    calls.push({ toolCallId: call.id, toolName: PROPOSE_TEAM_TOOL_NAME, planId, proposeArgs: args, proposed });
  }

  return { immediate, calls, plans, planCounter, planProposed: proposeCalls.length > 0 };
}

// ============================================================================
// Decisions
// ============================================================================

function slotsFor(assignment: TeamAssignment, team: TeamMember[]): TeamSlot[] {
  return assignment.agents
    .filter((handle) => team.some((member) => member.handle === handle))
    .map((handle) => ({ handle, replaced: [] }));
}

/**
 * The user's (edited) assignments, checked against the plan: known ids only,
 * a task, pool handles, at most MAX_PANEL_SIZE each.
 */
export function validateDecision(plan: TeamPlan, decision: TeamPlanDecision): TeamPlanDecision {
  if (decision.type === 'solo') return decision;
  const ids = new Set(plan.assignments.map((assignment) => assignment.id));
  const pool = new Set(plan.pool.map((member) => member.handle));
  const assignments = decision.assignments.map((assignment, index) => {
    if (!ids.has(assignment.id)) throw new TeamArgsError(`Assignment ${index + 1} is not in this plan`);
    const task = typeof assignment.task === 'string' ? assignment.task.trim() : '';
    if (!task) throw new TeamArgsError(`Assignment ${index + 1} needs a task`);
    const agents = Array.from(new Set((assignment.agents ?? []).filter((handle) => pool.has(handle))));
    if (agents.length > MAX_PANEL_SIZE) throw new TeamArgsError(`Assignment ${index + 1} has more than ${MAX_PANEL_SIZE} agents`);
    return { id: assignment.id, task, agents };
  });
  return { type: 'approve', assignments };
}

/** Apply one plan's answer (TeamApprovalGate.settle + what each team call does with it). */
export function decidePlan(
  state: TeamTurnState,
  planId: string,
  decision: TeamPlanDecision,
  outcome: TeamPlanOutcome,
  team: TeamMember[],
  now: number,
): TeamTurnState {
  const plans = (state.plans ?? []).map((stored) => (
    stored.plan.id === planId && stored.status === 'pending' ? { ...stored, status: outcome, decidedAt: now } : stored
  ));
  const calls = (state.calls ?? []).map((call) => {
    if (call.planId !== planId || call.resolution) return call;
    if (decision.type === 'solo') return { ...call, resolution: 'solo' as const, approved: [] };
    const approved = call.toolName === DELEGATE_TOOL_NAME
      ? decision.assignments.filter((assignment) => assignment.id === call.toolCallId)
      : decision.assignments;
    return {
      ...call,
      resolution: 'approved' as const,
      approved: approved.map((assignment) => ({ assignment, slots: slotsFor(assignment, team) })),
    };
  });
  // requestTeamPlan: a solo answer makes the rest of the run solo.
  return { ...state, plans, calls, ...(decision.type === 'solo' ? { solo: true } : {}) };
}

/** Answer every pending plan the same way ("do it yourself", or Stop). */
export function resolvePendingPlans(
  state: TeamTurnState,
  outcome: Exclude<TeamPlanOutcome, 'approved'>,
  team: TeamMember[],
  now: number,
): TeamTurnState {
  let next = state;
  for (const stored of state.plans ?? []) {
    if (stored.status === 'pending') next = decidePlan(next, stored.plan.id, { type: 'solo' }, outcome, team, now);
  }
  return next;
}

export function hasPendingPlans(state: TeamTurnState): boolean {
  return (state.plans ?? []).some((stored) => stored.status === 'pending');
}

/** Every waiting team call is decided and every slot has its final run. */
export function isTeamRoundReady(state: TeamTurnState): boolean {
  const calls = state.calls ?? [];
  return calls.length > 0
    && !hasPendingPlans(state)
    && calls.every((call) => call.resolution
      && (call.approved ?? []).every(({ slots }) => slots.every((slot) => slot.result)));
}

export interface SlotRef {
  toolCallId: string;
  assignmentIndex: number;
  slotIndex: number;
  handle: string;
  task: string;
  assignmentKey: string;
}

/** Slots that need a run started (just approved, or replaced). */
export function slotsToSpawn(state: TeamTurnState): SlotRef[] {
  const refs: SlotRef[] = [];
  for (const call of state.calls ?? []) {
    (call.approved ?? []).forEach(({ assignment, slots }, assignmentIndex) => {
      slots.forEach((slot, slotIndex) => {
        if (!slot.childRunId && !slot.result) {
          refs.push({ toolCallId: call.toolCallId, assignmentIndex, slotIndex, handle: slot.handle, task: assignment.task, assignmentKey: assignment.id });
        }
      });
    });
  }
  return refs;
}

function mapSlots(state: TeamTurnState, update: (slot: TeamSlot, ref: Omit<SlotRef, 'handle' | 'task' | 'assignmentKey'>) => TeamSlot): TeamTurnState {
  return {
    ...state,
    // A call whose plan still waits has no `approved` (never write it as undefined: Firestore rejects it).
    calls: (state.calls ?? []).map((call) => (call.approved ? {
      ...call,
      approved: call.approved.map((entry, assignmentIndex) => ({
        ...entry,
        slots: entry.slots.map((slot, slotIndex) => update(slot, { toolCallId: call.toolCallId, assignmentIndex, slotIndex })),
      })),
    } : call)),
  };
}

export function assignSlotRun(state: TeamTurnState, ref: SlotRef, childRunId: string): TeamTurnState {
  return mapSlots(state, (slot, at) => (
    at.toolCallId === ref.toolCallId && at.assignmentIndex === ref.assignmentIndex && at.slotIndex === ref.slotIndex
      ? { ...slot, childRunId }
      : slot
  ));
}

/** The slot running this child, if any. */
export function findSlot(state: TeamTurnState, childRunId: string): TeamSlot | null {
  for (const call of state.calls ?? []) {
    for (const { slots } of call.approved ?? []) {
      const slot = slots.find((candidate) => candidate.childRunId === childRunId);
      if (slot) return slot;
    }
  }
  return null;
}

/** "Replace with…": rerun this child's slot on `handle` once the child stops. */
export function requestReplacement(state: TeamTurnState, childRunId: string, handle: string): TeamTurnState {
  return mapSlots(state, (slot) => (slot.childRunId === childRunId && !slot.result ? { ...slot, replacement: handle } : slot));
}

/**
 * A child finished. A slot the user replaced moves the run to `replaced` and
 * waits for a new run (slotsToSpawn picks it up); otherwise this is its result.
 */
export function recordChildResult(state: TeamTurnState, childRunId: string, result: AgentRunResult): TeamTurnState {
  return mapSlots(state, (slot) => {
    if (slot.childRunId !== childRunId || slot.result) return slot;
    if (slot.replacement && !state.solo) {
      return { handle: slot.replacement, replaced: [...slot.replaced, result] };
    }
    const { replacement: _dropped, ...rest } = slot;
    return { ...rest, result };
  });
}

/**
 * Stop: slots that never got a run (just approved, or waiting to be replaced)
 * finish as stopped without starting one, so the round can wake and stop.
 */
export function stopUnstartedSlots(state: TeamTurnState, team: TeamMember[], now: number): TeamTurnState {
  return mapSlots(state, (slot, at) => {
    if (slot.childRunId || slot.result) return slot;
    const member = team.find((candidate) => candidate.handle === slot.handle);
    const { replacement: _dropped, ...rest } = slot;
    return {
      ...rest,
      result: {
        runId: `stopped:${at.toolCallId}:${at.assignmentIndex}:${at.slotIndex}`,
        kernel: '',
        agentName: member?.ai.name ?? slot.handle,
        provider: member?.ai.provider ?? '',
        model: member?.ai.modelConfig?.displayName || member?.ai.model || '',
        purpose: 'delegated',
        status: 'stopped',
        answer: 'Stopped before it started.',
        files: [],
        toolSummary: [],
        startedAt: now,
        endedAt: now,
      },
    };
  });
}

/** Child runs still in progress on this round (for Stop and "do it yourself"). */
export function activeChildRunIds(state: TeamTurnState): string[] {
  const ids: string[] = [];
  for (const call of state.calls ?? []) {
    for (const { slots } of call.approved ?? []) {
      for (const slot of slots) if (slot.childRunId && !slot.result) ids.push(slot.childRunId);
    }
  }
  return ids;
}

// ============================================================================
// Results
// ============================================================================

interface AssignmentOutcome {
  content: string;
  success: boolean;
  runs: AnalyzeTeamRunSummary[];
}

/** runAssignment's outcome once its slots finished; null when no known teammate was on it. */
function assignmentOutcome(toolCallId: string, entry: ApprovedAssignment): AssignmentOutcome | null {
  if (entry.slots.length === 0) return null;
  const sections = entry.slots.map(({ result, replaced }) => {
    const run = result as AgentRunResult;
    const note = replaced.length > 0
      ? `The user replaced ${replaced.map((old) => `${old.agentName} (${old.model})`).join(', then ')} with ${run.agentName} (${run.model}) on this task.\n`
      : '';
    return `${note}${formatDelegateResult(run)}`;
  });
  const allRuns = entry.slots.flatMap(({ result, replaced }) => [...replaced, result as AgentRunResult]);
  return {
    content: sections.join('\n\n'),
    success: entry.slots.some(({ result }) => result?.status === 'completed'),
    runs: allRuns.map((run) => toTeamRunSummary(run, toolCallId, entry.assignment.id, entry.assignment.task)),
  };
}

/** Failed results reach the operator via `error` only, so a failure carries the whole text there. */
function toTeamToolResult(toolCallId: string, text: string, success: boolean, runs: AnalyzeTeamRunSummary[], solo: boolean): ToolResult {
  const content = solo ? `${text}\n\n${SOLO_RESULT_TEXT}` : text;
  const metadata = runs.length > 0 ? { teamRuns: runs } : undefined;
  return success
    ? { toolCallId, success: true, content, metadata }
    : { toolCallId, success: false, content, error: content, metadata };
}

function delegateResult(call: TeamCallState, team: TeamMember[], solo: boolean): ToolResult {
  const entry = call.approved?.[0];
  const outcome = entry ? assignmentOutcome(call.toolCallId, entry) : null;
  if (!entry || !outcome) {
    return { toolCallId: call.toolCallId, success: false, error: 'The user removed this task from the plan; it did not run.' };
  }
  const args = call.delegateArgs as DelegateArgs;
  const changed = sameAgents([args.agent], entry.assignment.agents)
    ? ''
    : ` The user ran it on ${describeHandles(entry.assignment.agents, team)} instead of ${describeHandles([args.agent], team)}.`;
  const header = `The user approved this handoff and it has run.${changed} Result:`;
  return toTeamToolResult(call.toolCallId, `${header}\n\n${outcome.content}`, outcome.success, outcome.runs, solo);
}

function proposeResult(call: TeamCallState, team: TeamMember[], solo: boolean): ToolResult {
  const approved = call.approved ?? [];
  const proposed = call.proposed ?? [];
  const outcomes = approved.map((entry) => ({ assignment: entry.assignment, outcome: assignmentOutcome(call.toolCallId, entry) }));
  const approvedIds = new Set(approved.map(({ assignment }) => assignment.id));
  const removed = proposed.filter((assignment) => !approvedIds.has(assignment.id));
  const changes = approved.flatMap(({ assignment }) => {
    const original = proposed.find((candidate) => candidate.id === assignment.id);
    return original && !sameAgents(original.agents, assignment.agents)
      ? [`"${taskTitle(assignment.task)}" ran on ${describeHandles(assignment.agents, team)}`]
      : [];
  });
  // The operator can't otherwise tell that approval happened: state it, and what the user changed.
  const header = [
    'The user approved your team plan and the team has finished.',
    changes.length > 0 ? `The user changed: ${changes.join('; ')}.` : '',
    'Results by task:',
  ].filter(Boolean).join(' ');
  const sections = outcomes.map(({ assignment, outcome }) => (
    `## Task: ${taskTitle(assignment.task)}\n${outcome?.content ?? 'The user removed every teammate from this task; it did not run.'}`
  ));
  if (removed.length > 0) {
    sections.push(`Removed from the plan by the user: ${removed.map((assignment) => `"${taskTitle(assignment.task)}"`).join(', ')}.`);
  }
  return toTeamToolResult(
    call.toolCallId,
    [header, ...sections].join('\n\n'),
    outcomes.some(({ outcome }) => outcome?.success),
    outcomes.flatMap(({ outcome }) => outcome?.runs ?? []),
    solo,
  );
}

/** The waiting team calls' tool results, once isTeamRoundReady. */
export function composeTeamResults(state: TeamTurnState, team: TeamMember[]): ToolResult[] {
  const solo = state.solo === true;
  return (state.calls ?? []).map((call) => {
    if (call.resolution === 'solo') return soloResult(call.toolCallId);
    return call.toolName === DELEGATE_TOOL_NAME ? delegateResult(call, team, solo) : proposeResult(call, team, solo);
  });
}
