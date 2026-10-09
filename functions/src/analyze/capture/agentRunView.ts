/**
 * The AgentRunView shape (symposium-ai-web services/analyze/orchestrator/agents/types.ts)
 * that teamPanelNote reads. Teams move to the server in Phase 3 Step 4, which
 * ports agents/types.ts and replaces this file; until then the tool-execution
 * and result payloads stay opaque here.
 */
export type AgentPurpose = 'delegated' | 'review_check';

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'stopped';

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
  toolExecutions: unknown[];
  toolCount?: number;
  deliveredToOperator?: boolean;
  result?: unknown;
  startedAt: number;
}
