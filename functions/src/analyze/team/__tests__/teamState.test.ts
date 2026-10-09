/**
 * The team state machine, against the outcomes the browser orchestrator's
 * tests pinned (symposium-ai-web orchestrator/agents/__tests__/agents.test.ts):
 * the same plans, the same tool-result texts, the same solo and stop answers.
 */
import type { AI } from '../../contract/types';
import type { ToolCall } from '../../contract/lib/ai/tools/types';
import { buildTeam } from '../teamTools';
import {
  SOLO_RESULT_TEXT,
  activeChildRunIds,
  assignSlotRun,
  composeTeamResults,
  decidePlan,
  hasPendingPlans,
  isTeamRoundReady,
  recordChildResult,
  requestReplacement,
  resolvePendingPlans,
  setupTeamCalls,
  slotsToSpawn,
  validateDecision,
  type TeamTurnState,
} from '../teamState';
import type { AgentRunResult } from '../types';

function ai(id: string, provider: AI['provider'], model: string, name: string): AI {
  return { id, provider, model, name } as AI;
}
const gemini = ai('m1', 'google', 'gemini-pro', 'Gemini');
const claudeTeammate = ai('m2', 'claude', 'claude-opus', 'Claude');
// setup() in the browser tests: setTeam([claudeTeammate, gemini]).
const team = buildTeam([claudeTeammate, gemini]);

function delegateCall(id: string, agent: string, task: string): ToolCall {
  return { id, type: 'function', function: { name: 'delegate', arguments: JSON.stringify({ task, agent }) } };
}
function proposeCall(id: string, kind: 'panel' | 'split', assignments: Array<{ task: string; agents: string[] }>): ToolCall {
  return { id, type: 'function', function: { name: 'propose_team', arguments: JSON.stringify({ kind, rationale: 'Because.', assignments }) } };
}

const modelOf: Record<string, { name: string; model: string; provider: string }> = {
  teammate1: { name: 'Claude', model: 'claude-opus', provider: 'claude' },
  teammate2: { name: 'Gemini', model: 'gemini-pro', provider: 'google' },
};
function result(runId: string, handle: string, answer: string, status: AgentRunResult['status'] = 'completed', extra: Partial<AgentRunResult> = {}): AgentRunResult {
  const who = modelOf[handle];
  return {
    runId, kernel: `agent-${runId}`, agentName: who.name, provider: who.provider, model: who.model,
    purpose: 'delegated', status, answer, files: [], toolSummary: [], startedAt: 1, endedAt: 2, ...extra,
  };
}

function held(calls: ToolCall[], solo = false): TeamTurnState {
  const setup = setupTeamCalls({ toolCalls: calls, team, solo, planCounter: 0, now: 1000 });
  return { plans: setup.plans.map((plan) => ({ plan, status: 'pending' as const })), calls: setup.calls, planCounter: setup.planCounter };
}

/** Start every slot as `run_<n>` and finish each with an answer from its model. */
function runAll(state: TeamTurnState, answer = (handle: string) => `answer from ${modelOf[handle].model}`): TeamTurnState {
  let next = state;
  let n = 0;
  for (const ref of slotsToSpawn(next)) {
    n += 1;
    next = assignSlotRun(next, ref, `run_${n}`);
    next = recordChildResult(next, `run_${n}`, result(`run_${n}`, ref.handle, answer(ref.handle)));
  }
  return next;
}

describe('team calls: setup', () => {
  it('shows one turn\'s delegate calls as one plan', () => {
    const setup = setupTeamCalls({
      toolCalls: [delegateCall('d1', 'teammate1', 'Sum A'), delegateCall('d2', 'teammate2', 'Sum B')],
      team, solo: false, planCounter: 0, now: 1000,
    });
    expect(setup.plans).toHaveLength(1);
    expect(setup.plans[0].source).toBe('delegate');
    expect(setup.plans[0].assignments).toEqual([
      { id: 'd1', task: 'Sum A', agents: ['teammate1'] },
      { id: 'd2', task: 'Sum B', agents: ['teammate2'] },
    ]);
    expect(setup.plans[0].pool.map((member) => member.handle)).toEqual(['teammate1', 'teammate2']);
    expect(setup.planProposed).toBe(false);
  });

  it('reports an unknown teammate as a failed call without a plan', () => {
    const setup = setupTeamCalls({ toolCalls: [delegateCall('d1', 'teammate9', 'x')], team, solo: false, planCounter: 0, now: 1000 });
    expect(setup.plans).toHaveLength(0);
    expect(setup.immediate[0]).toMatchObject({ toolCallId: 'd1', success: false });
    expect(setup.immediate[0].error).toContain('Unknown agent "teammate9"');
  });

  it('answers team calls at once with the solo text when the run is solo', () => {
    const setup = setupTeamCalls({ toolCalls: [delegateCall('d1', 'teammate1', 'x'), proposeCall('p1', 'panel', [{ task: 't', agents: ['teammate1'] }])], team, solo: true, planCounter: 0, now: 1000 });
    expect(setup.plans).toHaveLength(0);
    expect(setup.immediate.map((r) => r.content)).toEqual([SOLO_RESULT_TEXT, SOLO_RESULT_TEXT]);
  });

  it('a proposal is its own plan, ids per assignment, and opens the planning gate even when malformed', () => {
    const setup = setupTeamCalls({ toolCalls: [proposeCall('p1', 'split', [{ task: 'A', agents: ['teammate1'] }, { task: 'B', agents: ['teammate2'] }])], team, solo: false, planCounter: 2, now: 1000 });
    expect(setup.plans[0]).toMatchObject({ id: `plan_${(1000).toString(36)}_3`, source: 'propose_team', kind: 'split', rationale: 'Because.' });
    expect(setup.plans[0].assignments.map((a) => a.id)).toEqual(['p1:1', 'p1:2']);
    expect(setup.planProposed).toBe(true);
    const bad = setupTeamCalls({ toolCalls: [{ id: 'p2', type: 'function', function: { name: 'propose_team', arguments: '{' } }], team, solo: false, planCounter: 0, now: 1 });
    expect(bad.planProposed).toBe(true);
    expect(bad.immediate[0].success).toBe(false);
  });
});

describe('team calls: decisions and results', () => {
  it('reports what the user changed on an approved delegate plan', () => {
    let state = held([delegateCall('d1', 'teammate1', 'Sum A'), delegateCall('d2', 'teammate2', 'Sum B')]);
    const planId = state.plans![0].plan.id;
    state = decidePlan(state, planId, {
      type: 'approve',
      assignments: [
        { id: 'd1', task: 'Sum A', agents: ['teammate2'] },
        { id: 'd2', task: 'Sum B', agents: ['teammate1', 'teammate2'] },
      ],
    }, 'approved', team, 2000);
    expect(hasPendingPlans(state)).toBe(false);
    expect(slotsToSpawn(state)).toHaveLength(3);
    expect(isTeamRoundReady(state)).toBe(false);
    state = runAll(state);
    expect(isTeamRoundReady(state)).toBe(true);

    const [r1, r2] = composeTeamResults(state, team);
    expect(r1.content).toMatch(/^The user approved this handoff and it has run\. The user ran it on Gemini \(gemini-pro\) instead of Claude \(claude-opus\)\./);
    expect(r2.content).toMatch(/^The user approved this handoff and it has run\. The user ran it on Claude \(claude-opus\) and Gemini \(gemini-pro\) instead of Gemini \(gemini-pro\)\./);
    expect(r1.content).toContain('answer from gemini-pro');
    expect(r1.content).not.toContain('answer from claude-opus');
    expect(r2.content).toContain('answer from claude-opus');
    expect(r2.content).toContain('answer from gemini-pro');
    expect(r1.content).toContain('Tools run: none');
    expect(r1.metadata?.teamRuns).toHaveLength(1);
    expect(r2.metadata?.teamRuns?.map((run) => run.assignmentKey)).toEqual(['d2', 'd2']);
  });

  it('reports a task the user removed from the plan without running it', () => {
    let state = held([delegateCall('d1', 'teammate1', 'Sum A'), delegateCall('d2', 'teammate2', 'Sum B')]);
    const plan = state.plans![0].plan;
    state = decidePlan(state, plan.id, { type: 'approve', assignments: [plan.assignments[1]] }, 'approved', team, 2000);
    expect(slotsToSpawn(state)).toHaveLength(1);
    state = runAll(state);
    const [r1, r2] = composeTeamResults(state, team);
    expect(r1).toMatchObject({ success: false, error: 'The user removed this task from the plan; it did not run.' });
    expect(r2.content).toContain('answer from gemini-pro');
  });

  it('"do it yourself" on a pending plan: nothing runs, the call says so, and the run goes solo', () => {
    let state = held([delegateCall('d1', 'teammate1', 'Sum A')]);
    state = resolvePendingPlans(state, 'solo', team, 2000);
    expect(state.plans![0].status).toBe('solo');
    expect(state.solo).toBe(true);
    expect(slotsToSpawn(state)).toHaveLength(0);
    expect(isTeamRoundReady(state)).toBe(true);
    expect(composeTeamResults(state, team)[0].content).toBe(SOLO_RESULT_TEXT);
  });

  it('Stop answers a pending plan as stopped so the operator never hangs', () => {
    let state = held([delegateCall('d1', 'teammate1', 'Sum A')]);
    state = resolvePendingPlans(state, 'stopped', team, 2000);
    expect(state.plans![0].status).toBe('stopped');
    expect(isTeamRoundReady(state)).toBe(true);
    expect(slotsToSpawn(state)).toHaveLength(0);
  });

  it('"do it yourself" mid-run: stopped teammates still report, with the solo note', () => {
    let state = held([delegateCall('d1', 'teammate2', 'long task')]);
    state = decidePlan(state, state.plans![0].plan.id, { type: 'approve', assignments: state.plans![0].plan.assignments }, 'approved', team, 2000);
    const [ref] = slotsToSpawn(state);
    state = assignSlotRun(state, ref, 'run_1');
    expect(activeChildRunIds(state)).toEqual(['run_1']);
    state = { ...state, solo: true };
    state = recordChildResult(state, 'run_1', result('run_1', 'teammate2', 'Stopped before finishing. Its work so far:\nhalf', 'stopped'));
    const [r1] = composeTeamResults(state, team);
    expect(r1.content).toContain(SOLO_RESULT_TEXT);
    expect(r1.content).toContain('— stopped');
    expect(r1.success).toBe(false);
  });

  it('runs an approved panel and returns every answer in one result', () => {
    let state = held([proposeCall('p1', 'panel', [{ task: 'Estimate X', agents: ['teammate1', 'teammate2'] }])]);
    state = decidePlan(state, state.plans![0].plan.id, { type: 'approve', assignments: state.plans![0].plan.assignments }, 'approved', team, 2000);
    state = runAll(state);
    const [r1] = composeTeamResults(state, team);
    expect(r1.content).toMatch(/^The user approved your team plan and the team has finished\. Results by task:/);
    expect(r1.content).toContain('## Task: Estimate X');
    expect(r1.content).toContain('answer from claude-opus');
    expect(r1.content).toContain('answer from gemini-pro');
    expect(r1.metadata?.teamRuns?.map((run) => run.assignmentKey)).toEqual(['p1:1', 'p1:1']);
  });

  it('a split with one task removed tells the operator what did not run', () => {
    let state = held([proposeCall('p1', 'split', [{ task: 'Task A', agents: ['teammate1'] }, { task: 'Task B', agents: ['teammate2'] }])]);
    const plan = state.plans![0].plan;
    state = decidePlan(state, plan.id, { type: 'approve', assignments: [{ ...plan.assignments[0], agents: ['teammate2'] }] }, 'approved', team, 2000);
    state = runAll(state);
    const [r1] = composeTeamResults(state, team);
    expect(r1.content).toContain('The user changed: "Task A" ran on Gemini (gemini-pro).');
    expect(r1.content).toContain('Removed from the plan by the user: "Task B".');
  });

  it('"Replace with…" reruns the slot on another model and reports both', () => {
    let state = held([proposeCall('p1', 'panel', [{ task: 'T', agents: ['teammate1'] }])]);
    state = decidePlan(state, state.plans![0].plan.id, { type: 'approve', assignments: state.plans![0].plan.assignments }, 'approved', team, 2000);
    const [ref] = slotsToSpawn(state);
    state = assignSlotRun(state, ref, 'run_1');
    state = requestReplacement(state, 'run_1', 'teammate2');
    state = recordChildResult(state, 'run_1', result('run_1', 'teammate1', 'Stopped before finishing.', 'stopped'));
    expect(isTeamRoundReady(state)).toBe(false);
    const [again] = slotsToSpawn(state);
    expect(again.handle).toBe('teammate2');
    state = assignSlotRun(state, again, 'run_2');
    state = recordChildResult(state, 'run_2', result('run_2', 'teammate2', 'answer from gemini-pro'));
    const [r1] = composeTeamResults(state, team);
    expect(r1.content).toContain('The user replaced Claude (claude-opus) with Gemini (gemini-pro) on this task.');
    expect(r1.metadata?.teamRuns?.map((run) => run.runId)).toEqual(['run_1', 'run_2']);
  });

  it('starts an approved plan\'s runs while another plan still waits', () => {
    let state = held([delegateCall('d1', 'teammate1', 'A'), proposeCall('p1', 'panel', [{ task: 'B', agents: ['teammate2'] }])]);
    expect(state.plans).toHaveLength(2);
    state = decidePlan(state, state.plans![0].plan.id, { type: 'approve', assignments: state.plans![0].plan.assignments }, 'approved', team, 2000);
    expect(hasPendingPlans(state)).toBe(true);
    expect(slotsToSpawn(state)).toHaveLength(1);
  });

  it('checks the user\'s edits against the plan', () => {
    const state = held([delegateCall('d1', 'teammate1', 'A')]);
    const plan = state.plans![0].plan;
    expect(() => validateDecision(plan, { type: 'approve', assignments: [{ id: 'zz', task: 'A', agents: ['teammate1'] }] })).toThrow(/not in this plan/);
    expect(() => validateDecision(plan, { type: 'approve', assignments: [{ id: 'd1', task: ' ', agents: ['teammate1'] }] })).toThrow(/needs a task/);
    expect(validateDecision(plan, { type: 'approve', assignments: [{ id: 'd1', task: ' A2 ', agents: ['teammate1', 'nobody', 'teammate1'] }] }))
      .toEqual({ type: 'approve', assignments: [{ id: 'd1', task: 'A2', agents: ['teammate1'] }] });
  });
});
