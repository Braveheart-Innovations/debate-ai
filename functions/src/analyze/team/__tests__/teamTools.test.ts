/**
 * The pure cases of symposium-ai-web orchestrator/agents/__tests__/agents.test.ts,
 * ported verbatim (imports changed). The orchestrator-level cases are
 * covered against the server engine in teamState.test.ts and
 * engine/__tests__/teamRound.test.ts.
 */
import type { AI } from '../../contract/types';
import { buildDelegatedBrief, buildReviewCheckBrief } from '../agentResults';
import {
  MAX_PANEL_SIZE,
  TeamArgsError,
  buildDelegateTool,
  buildProposeTeamTool,
  buildTeam,
  parseDelegateArgs,
  parseProposeTeamArgs,
} from '../teamTools';

function ai(id: string, provider: AI['provider'], model: string, name: string): AI {
  return { id, provider, model, name } as AI;
}

const gemini = ai('m1', 'google', 'gemini-pro', 'Gemini');
// Same provider and model as the operator: allowed, it's the user's choice.
const claudeTeammate = ai('m2', 'claude', 'claude-opus', 'Claude');

describe('delegate tool + prompts', () => {
  const team = buildTeam([gemini, claudeTeammate]);

  it('offers only teammates as delegation targets', () => {
    expect(team.map((m) => m.handle)).toEqual(['teammate1', 'teammate2']);
    const tool = buildDelegateTool(team);
    expect(tool.execution).toBe('orchestrator');
    expect(tool.parameters.properties.agent.enum).toEqual(['teammate1', 'teammate2']);
    expect(tool.description).toContain('"teammate1" = Gemini (gemini-pro)');
    expect(tool.description).not.toMatch(/"self"|instance of you/);
  });

  it('takes only a task and a teammate', () => {
    const tool = buildDelegateTool(team);
    expect(tool.parameters.required).toEqual(['task', 'agent']);
    expect(Object.keys(tool.parameters.properties)).toEqual(['task', 'agent']);
    expect(parseDelegateArgs('{"task":" t ","agent":"teammate1"}', team)).toEqual({ task: 't', agent: 'teammate1' });
    expect(() => parseDelegateArgs('{', team)).toThrow(TeamArgsError);
    expect(() => parseDelegateArgs('{"agent":"teammate1"}', team)).toThrow(/task/);
    expect(() => parseDelegateArgs('{"task":"t","agent":"self"}', team)).toThrow(/Unknown agent "self"/);
  });

  it('passes the operator\'s brief through; only reviewer checks get a required format', () => {
    const delegated = buildDelegatedBrief('Count hazardous NEOs this week', 'agent-r1');
    expect(delegated.startsWith('Count hazardous NEOs this week')).toBe(true);
    expect(delegated).toContain('/output/agents/agent-r1/');
    expect(delegated).not.toContain('VERDICT');

    const check = buildReviewCheckBrief('Check 2024 revenue', 'agent-r2');
    expect(check).toContain('VERDICT: CONFIRMED');
    expect(check).toContain('re-fetch sources');
  });
});

describe('propose_team', () => {
  const team = buildTeam([gemini, claudeTeammate]);

  it('takes a kind, a rationale, and assignments of tasks to teammates', () => {
    const tool = buildProposeTeamTool(team);
    expect(tool.execution).toBe('orchestrator');
    expect(tool.parameters.required).toEqual(['kind', 'rationale', 'assignments']);
    expect(tool.description).toContain('"teammate1" = Gemini (gemini-pro)');
    expect(parseProposeTeamArgs(JSON.stringify({
      kind: 'panel',
      rationale: ' r ',
      assignments: [{ task: ' t ', agents: ['teammate1', 'teammate2', 'teammate1'] }],
    }), team)).toEqual({ kind: 'panel', rationale: 'r', assignments: [{ task: 't', agents: ['teammate1', 'teammate2'] }] });
    expect(() => parseProposeTeamArgs('{"kind":"mob","rationale":"","assignments":[]}', team)).toThrow(/kind/);
    expect(() => parseProposeTeamArgs('{"kind":"split","rationale":"","assignments":[]}', team)).toThrow(/at least one assignment/);
    expect(() => parseProposeTeamArgs('{"kind":"split","rationale":"","assignments":[{"task":"t","agents":[]}]}', team)).toThrow(/at least one agent/);
    expect(() => parseProposeTeamArgs('{"kind":"split","rationale":"","assignments":[{"task":"t","agents":["self"]}]}', team)).toThrow(/Unknown agent "self"/);
    const big = buildTeam(Array.from({ length: MAX_PANEL_SIZE + 1 }, (_, i) => ai(`p${i}`, 'google', 'gemini-pro', 'Gemini')));
    expect(() => parseProposeTeamArgs(JSON.stringify({
      kind: 'panel', rationale: '', assignments: [{ task: 't', agents: big.map((m) => m.handle) }],
    }), big)).toThrow(/the most is 5/);
  });
});
