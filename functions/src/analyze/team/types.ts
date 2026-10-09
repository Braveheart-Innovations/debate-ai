/**
 * Team shapes. Ported from symposium-ai-web
 * src/services/analyze/orchestrator/agents/types.ts (Phase 3 Step 4). The
 * browser's in-memory AgentRun (abort controller, live message array) has no
 * server counterpart: a subagent run is an analyzeRuns doc (runStore).
 */
import type { AI } from '../contract/types';
import type { ToolResult } from '../contract/lib/ai/tools/types';

/** web orchestrator/contracts.ts ToolExecution, as carried on AgentRunView. */
export interface ToolExecution {
  id: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  code?: string;
  url?: string;
  searchQuery?: string;
  sqlQuery?: string;
  apiUrl?: string;
  filePath?: string;
  result?: {
    success: boolean;
    stdout?: string;
    error?: string;
    images?: Array<{ mimeType: string; base64: string }>;
    htmlOutputs?: Array<{ content: string; filename?: string }>;
    bundleOutputs?: ToolResult['bundleOutputs'];
    fetchedContent?: string;
    fetchedBytes?: number;
    searchResults?: Array<{ title: string; url: string; snippet: string }>;
    provenance?: ToolResult['provenance'];
  };
}

/**
 * 'delegated': the operator handed a teammate a task (operator writes the brief).
 * 'review_check': the reviewer independently checks one of its findings (Check independently).
 */
export type AgentPurpose = 'delegated' | 'review_check';

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'stopped';

/** A roster member the operator can delegate to, with the handle the model uses. */
export interface TeamMember {
  /** Handle used in the delegate tool's `agent` enum: 'teammate1', 'teammate2', ... */
  handle: string;
  ai: AI;
}

/** The operator's delegate call: its own brief, for the teammate it chose. */
export interface DelegateArgs {
  task: string;
  agent: string;
}

/** The operator's propose_team call: a whole plan, before the work starts. */
export interface ProposeTeamArgs {
  kind: 'panel' | 'split';
  rationale: string;
  assignments: Array<{ task: string; agents: string[] }>;
}

export interface AgentRunResult {
  runId: string;
  kernel: string;
  agentName: string;
  provider: string;
  model: string;
  purpose: AgentPurpose;
  status: Exclude<AgentRunStatus, 'running'>;
  answer: string;
  /** Files the sub-agent itself saved under its folder. */
  files: string[];
  /** Where the app saved the sub-agent's final reply, so every run leaves a file to open and cite. */
  answerFile?: string;
  toolSummary: Array<{ name: string; ok: boolean }>;
  startedAt: number;
  endedAt: number;
}

/** One task in a team plan, and the team handles (from the pool) that will each run it. */
export interface TeamAssignment {
  /** Stable within the plan; for a delegate batch, the delegate call's tool call id. */
  id: string;
  task: string;
  /** Several handles on one task = an independent panel on that task. */
  agents: string[];
}

/** A pool member as the plan card shows it (and offers it when swapping models). */
export interface TeamPoolMember {
  handle: string;
  name: string;
  provider: string;
  model: string;
}

/**
 * What the operator asked for, shown to the user before anything runs. One
 * turn's delegate calls form a single plan (propose_team is one plan per call).
 */
export interface TeamPlan {
  id: string;
  source: 'propose_team' | 'delegate';
  kind?: 'panel' | 'split';
  rationale?: string;
  assignments: TeamAssignment[];
  /** Everyone the user may put on an assignment (the roster's teammates). */
  pool: TeamPoolMember[];
  /** True when the session's auto-approve setting approved it without waiting. */
  autoApproved?: boolean;
}

/** The user's answer: run these assignments (possibly edited), or "do it yourself". */
export type TeamPlanDecision =
  | { type: 'approve'; assignments: TeamAssignment[] }
  | { type: 'solo' };

/** How a plan ended (web TeamApprovalGate TeamPlanOutcome). */
export type TeamPlanOutcome = 'approved' | 'solo' | 'stopped';

/** UI-facing snapshot of a subagent run (the web's lanes and the report's panel note read it). */
export interface AgentRunView {
  runId: string;
  parentToolCallId: string;
  agentName: string;
  provider: string;
  model: string;
  purpose: AgentPurpose;
  title: string;
  task: string;
  assignmentKey?: string;
  status: AgentRunStatus;
  currentTool?: string;
  streamingText?: string;
  toolExecutions: ToolExecution[];
  /** Tool calls made, when the executions themselves aren't held (a run restored from its summary). */
  toolCount?: number;
  /** A "Run again" run whose result has gone back to the operator. */
  deliveredToOperator?: boolean;
  result?: AgentRunResult;
  startedAt: number;
}
