/** Ported from symposium-ai-web src/services/analyze/orchestrator/agents/teamTools.ts (Phase 3 Step 4), logic unchanged. */
import type { ToolDefinition } from '../contract/lib/ai/tools/types';
import type { AI } from '../contract/types';
import type { DelegateArgs, ProposeTeamArgs, TeamAssignment, TeamMember, TeamPoolMember } from './types';

export const DELEGATE_TOOL_NAME = 'delegate';
export const PROPOSE_TEAM_TOOL_NAME = 'propose_team';
export const TEAM_TOOL_NAMES: ReadonlySet<string> = new Set([DELEGATE_TOOL_NAME, PROPOSE_TEAM_TOOL_NAME]);
/** Team mode's other first-step choice: ask the user before planning (ends the turn). */
export const ASK_USER_TOOL_NAME = 'ask_user';
/** Ends the turn: the user runs the org-connected agent and imports its findings. */
export const ORG_EVIDENCE_TOOL_NAME = 'request_salesforce_org_evidence';
/**
 * Salesforce tools the operator keeps: one audit per analysis, and one org
 * evidence request authored from it. Teammates work from the audit's files.
 */
export const OPERATOR_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set(['salesforce_metadata_audit', ORG_EVIDENCE_TOOL_NAME]);
/**
 * Team mode's first steps on a Salesforce workspace, before the plan: the audit
 * and the org evidence decision. Docs and source research belong to the plan.
 */
export const SALESFORCE_PLANNING_TOOL_NAMES: ReadonlySet<string> = new Set([
  'salesforce_metadata_audit',
  ORG_EVIDENCE_TOOL_NAME,
]);

/** Most sub-agents on one task (a panel); cost scales with each one. */
export const MAX_PANEL_SIZE = 5;

/**
 * The operator's delegation targets are the roster's teammates — never the
 * reviewer, who validates the finished report. Handles ('teammate1'..) are
 * short and stable so models reliably emit them; a teammate may use the same
 * provider or model as the operator (the user's choice).
 */
export function buildTeam(teammates: AI[]): TeamMember[] {
  return teammates.map((ai, index) => ({ handle: `teammate${index + 1}`, ai }));
}

export function toPoolMember(member: TeamMember): TeamPoolMember {
  return {
    handle: member.handle,
    name: member.ai.name,
    provider: member.ai.provider,
    model: member.ai.modelConfig?.displayName || member.ai.model,
  };
}

export function describeMember(member: TeamMember): string {
  const model = member.ai.modelConfig?.displayName || member.ai.model;
  return `"${member.handle}" = ${member.ai.name} (${model})`;
}

/**
 * Both team tools describe the mechanics only. Whether and how to use
 * teammates is the operator's plan, not ours (Michael, 2026-10-04: no
 * prescribed playbook); the user approves every plan before it runs.
 */
export function buildDelegateTool(team: TeamMember[]): ToolDefinition {
  return {
    name: DELEGATE_TOOL_NAME,
    description: `Give a task to one of your teammates: ${team.map(describeMember).join('; ')}. The user approves each handoff before it runs (and may change the teammate). The teammate works on it with its own tools and Python session and returns its final reply to you. Several delegate calls in one turn run in parallel. The teammate sees only the task text you write, nothing else from this conversation. Its files are saved under /output/agents/.`,
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Everything the teammate needs to know, in your own words.',
        },
        agent: {
          type: 'string',
          enum: team.map((member) => member.handle),
          description: `Which teammate. ${team.map(describeMember).join('; ')}.`,
        },
      },
      required: ['task', 'agent'],
      additionalProperties: false,
    },
    category: 'compute',
    execution: 'orchestrator',
    requiresConfirmation: false,
  };
}

export function buildProposeTeamTool(team: TeamMember[]): ToolDefinition {
  return {
    name: PROPOSE_TEAM_TOOL_NAME,
    description: `Propose a team to the user before the work starts. Teammates: ${team.map(describeMember).join('; ')}. kind "panel": one assignment whose agents each work the same task independently (up to ${MAX_PANEL_SIZE}); you then reconcile their answers. kind "split": several assignments, each with one agent, for work that divides. The user approves the plan, changes it (models, panelists, tasks), or has you do the work yourself. Approved runs go in parallel and their final replies come back to you together. Each teammate sees only its task text, nothing else from this conversation, and saves files under /output/agents/.`,
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['panel', 'split'],
          description: '"panel" = same task, several models independently; "split" = different tasks.',
        },
        rationale: {
          type: 'string',
          description: 'One or two sentences for the user: why this team, for this request.',
        },
        assignments: {
          type: 'array',
          description: 'The tasks. A panel has one assignment with several agents; a split has one agent per assignment.',
          items: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: 'Everything the teammate needs to know, in your own words.',
              },
              agents: {
                type: 'array',
                items: { type: 'string', enum: team.map((member) => member.handle) },
                description: 'Which teammates run this task.',
              },
            },
            required: ['task', 'agents'],
          },
        },
      },
      required: ['kind', 'rationale', 'assignments'],
      additionalProperties: false,
    },
    category: 'compute',
    execution: 'orchestrator',
    requiresConfirmation: false,
  };
}

/**
 * Offered only in a Team mode first step, alongside propose_team: the operator
 * must do one of the two. Asking ends the turn; the user's answer is the next
 * message, which starts with a team plan again (2026-10-07: a forced plan left
 * the operator no way to ask first, so its questions ran alongside the plan).
 */
export function buildAskUserTool(): ToolDefinition {
  return {
    name: ASK_USER_TOOL_NAME,
    description: 'Ask the user what you need to know before proposing a team. Your turn ends here; the user\'s answer comes as their next message.',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'string',
          description: 'Your question or questions for the user, as you want them shown.',
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
    category: 'compute',
    execution: 'orchestrator',
    requiresConfirmation: false,
  };
}

export function parseAskUserArgs(raw: string): { questions: string } {
  const parsed = parseJsonArgs(raw, ASK_USER_TOOL_NAME);
  const questions = typeof parsed.questions === 'string' ? parsed.questions.trim() : '';
  if (!questions) throw new TeamArgsError('ask_user requires non-empty "questions"');
  return { questions };
}

export class TeamArgsError extends Error {}

function parseJsonArgs(raw: string, toolName: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    throw new TeamArgsError(`Invalid ${toolName} arguments (malformed JSON)`);
  }
}

function unknownAgentError(agent: string, team: TeamMember[]): TeamArgsError {
  return new TeamArgsError(`Unknown agent "${agent}". Use one of: ${team.map((m) => m.handle).join(', ')}`);
}

export function parseDelegateArgs(raw: string, team: TeamMember[]): DelegateArgs {
  const parsed = parseJsonArgs(raw, DELEGATE_TOOL_NAME);
  const task = typeof parsed.task === 'string' ? parsed.task.trim() : '';
  const agent = typeof parsed.agent === 'string' ? parsed.agent.trim() : '';
  if (!task) throw new TeamArgsError('delegate requires a non-empty "task"');
  if (!team.some((member) => member.handle === agent)) throw unknownAgentError(agent, team);
  return { task, agent };
}

export function parseProposeTeamArgs(raw: string, team: TeamMember[]): ProposeTeamArgs {
  const parsed = parseJsonArgs(raw, PROPOSE_TEAM_TOOL_NAME);
  const kind = parsed.kind === 'panel' || parsed.kind === 'split' ? parsed.kind : null;
  if (!kind) throw new TeamArgsError('propose_team requires kind "panel" or "split"');
  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';
  const rawAssignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
  if (rawAssignments.length === 0) throw new TeamArgsError('propose_team requires at least one assignment');

  const assignments: Array<Omit<TeamAssignment, 'id'>> = rawAssignments.map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const task = typeof item.task === 'string' ? item.task.trim() : '';
    if (!task) throw new TeamArgsError(`propose_team assignment ${index + 1} needs a non-empty "task"`);
    const agents = Array.from(new Set((Array.isArray(item.agents) ? item.agents : [])
      .filter((agent): agent is string => typeof agent === 'string')
      .map((agent) => agent.trim())));
    if (agents.length === 0) throw new TeamArgsError(`propose_team assignment ${index + 1} needs at least one agent`);
    const unknown = agents.find((agent) => !team.some((member) => member.handle === agent));
    if (unknown !== undefined) throw unknownAgentError(unknown, team);
    if (agents.length > MAX_PANEL_SIZE) {
      throw new TeamArgsError(`propose_team assignment ${index + 1} has ${agents.length} agents; the most is ${MAX_PANEL_SIZE}`);
    }
    return { task, agents };
  });
  return { kind, rationale, assignments };
}
