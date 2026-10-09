/**
 * The operator's round with a team: the Team mode planning gate, ask_user,
 * holding the round for a plan, resuming once the team's results are the
 * calls' records, and the end-of-turn rules (the browser's
 * AnalyzeOrchestrator Team mode cases in agents.test.ts).
 */
import type { Message } from '../../contract/types';
import type { ToolCall } from '../../contract/lib/ai/tools/types';

const streamQueue: Array<Array<Record<string, unknown>>> = [];
const streamCalls: Array<{ tools?: Array<{ name: string }>; toolChoice?: unknown }> = [];
jest.mock('../../../modelStream', () => ({
  CANCELLED_CODE: 'cancelled',
  streamModel: jest.fn((request: { tools?: Array<{ name: string }>; toolChoice?: unknown }) => {
    streamCalls.push(request);
    const events = streamQueue.shift() ?? [];
    return (async function* gen() { for (const e of events) yield e; })();
  }),
}));

let stored: Message[] = [];
const toolRecords = new Map<string, { state: string; result?: unknown }>();
jest.mock('../runStore', () => ({
  toolCallRef: (_run: unknown, id: string) => id,
  getToolCallRecord: jest.fn(async (id: string) => toolRecords.get(id) ?? null),
  markToolCallStarted: jest.fn(async (id: string) => { toolRecords.set(id, { state: 'started' }); }),
  markToolCallDone: jest.fn(async (id: string, result: unknown) => { toolRecords.set(id, { state: 'done', result }); }),
  toStoredToolResult: (r: { success: boolean; content?: string; error?: string; metadata?: { teamRuns?: unknown } }) => ({
    success: r.success, content: r.content, error: r.error, ...(r.metadata?.teamRuns ? { teamRuns: r.metadata.teamRuns } : {}),
  }),
  saveToolOutputs: jest.fn(async () => undefined),
  loadToolResult: jest.fn(async (id: string) => {
    const record = toolRecords.get(id);
    return record?.state === 'done' ? { toolCallId: id, ...(record.result as object) } : null;
  }),
  deleteToolOutputs: jest.fn(async () => undefined),
  setLatestCompletedOperatorMessage: jest.fn(async () => undefined),
}));

import { runRound, roundTools, type RoundContext, type TeamHooks, type TurnState } from '../round';
import { buildTeam } from '../../team/teamTools';
import { ORG_EVIDENCE_REQUESTED_REPLY, SOLO_RESULT_TEXT, type TeamCallSetup } from '../../team/teamState';
import type { AI } from '../../contract/types';
import { executeCodeTool } from '../../contract/lib/ai/tools/built-in/execute-code';
import type { CaptureInput } from '../../capture/captureRound';

const user: Message = { id: 'u1', sender: 'You', senderType: 'user', content: 'Compare the two datasets.', timestamp: 1 };
const done = (extra: Record<string, unknown> = {}) => ({ type: 'message_complete', finish_reason: 'stop', ...extra });
const call = (id: string, name: string, args: unknown): ToolCall => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const team = buildTeam([
  { id: 'm2', provider: 'claude', model: 'claude-opus', name: 'Claude' } as AI,
  { id: 'm1', provider: 'google', model: 'gemini-pro', name: 'Gemini' } as AI,
]);
const orgEvidenceTool = { ...executeCodeTool, name: 'request_salesforce_org_evidence' };
const auditTool = { ...executeCodeTool, name: 'salesforce_metadata_audit' };

function makeContext(config: Record<string, unknown> = {}, teamState: Record<string, unknown> = {}) {
  const suspended: TeamCallSetup[] = [];
  const executeTool = jest.fn(async (c: ToolCall) => ({ toolCallId: c.id, success: true, content: `ran ${c.function.name}` }));
  const capture = jest.fn(async (input: CaptureInput) => {
    stored = stored.map((m) => (m.id === input.message.id
      ? { ...m, metadata: { ...m.metadata, toolExecutionResults: input.results.map((r) => ({ toolName: 'x', success: r.success })) } }
      : m));
  });
  const run = {
    runId: 'run1', uid: 'u', sessionId: 's', kind: 'operator', status: 'running', round: 0,
    config: { provider: 'claude', model: 'claude-sonnet-5-5', aiId: 'op', aiName: 'Claude', systemPrompt: 'SYS', toolNames: ['execute_python'], sandboxSessionKey: 'k', ...config },
    userMessageId: 'u1', eventSeq: 0, createdAt: 0, updatedAt: 0,
    team: teamState,
  } as unknown as RoundContext['run'];
  const hooks: TeamHooks = {
    members: team,
    saveTurnState: jest.fn(async (patch) => { run.team = { ...run.team, ...patch }; }),
    suspend: jest.fn(async (setup: TeamCallSetup) => {
      suspended.push(setup);
      run.team = { ...run.team, calls: setup.calls, plans: setup.plans.map((plan) => ({ plan, status: 'pending' as const })) };
      for (const r of setup.immediate) toolRecords.set(r.toolCallId, { state: 'done', result: { success: r.success, content: r.content, error: r.error } });
    }),
  };
  const context: RoundContext = {
    uid: 'u', sessionId: 's', run,
    runRef: {} as RoundContext['runRef'],
    events: { push: jest.fn() } as unknown as RoundContext['events'],
    signal: new AbortController().signal,
    keyValue: 'k',
    tools: [executeCodeTool],
    executeTool,
    toolResults: new Map(),
    messages: {
      load: async () => [...stored],
      write: async (message: Message) => { stored = stored.filter((m) => m.id !== message.id).concat(message); },
    },
    capture,
    team: hooks,
    sleep: async () => undefined,
    now: () => 5,
  };
  return { context, hooks, suspended, executeTool, capture };
}
const state = (round = 0): TurnState => ({ round, retryCount: 0 });
const toolNames = (i: number) => (streamCalls[i].tools ?? []).map((t) => t.name);
const toolMessages = () => stored.filter((m) => m.senderType === 'tool');

beforeEach(() => {
  stored = [user];
  toolRecords.clear();
  streamQueue.length = 0;
  streamCalls.length = 0;
});

describe('operator tools', () => {
  it('offers the team tools with teammates, never without, and withholds them once solo', () => {
    expect(roundTools(makeContext().context).tools.map((t) => t.name)).toEqual(['execute_python', 'propose_team', 'delegate']);
    const noTeam = makeContext();
    noTeam.context.team = { ...noTeam.hooks, members: [] };
    expect(roundTools(noTeam.context).tools.map((t) => t.name)).toEqual(['execute_python']);
    expect(roundTools(makeContext({}, { solo: true }).context).tools.map((t) => t.name)).toEqual(['execute_python']);
  });
});

describe('Team mode', () => {
  it('starts the turn with a forced team plan, then gives the operator its full tools', async () => {
    const { context, suspended } = makeContext({ teamPlanTurn: true });
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('p1', 'propose_team', { kind: 'panel', rationale: 'r', assignments: [{ task: 'T', agents: ['teammate1', 'teammate2'] }] })] })]);
    expect(await runRound(context, state(0))).toBe('waiting');
    expect(toolNames(0)).toEqual(['propose_team', 'ask_user']);
    expect(streamCalls[0].toolChoice).toBe('required');
    expect(suspended).toHaveLength(1);
    expect(context.run.team?.planProposed).toBe(true);
    // Held: the assistant's calls are recorded; no result messages until the team is done.
    expect(stored.find((m) => m.id === 'run1_r0')?.metadata?.toolCalls).toHaveLength(1);
    expect(toolMessages()).toHaveLength(0);

    // The team finished: its composed result is the call's record. The next round resumes.
    toolRecords.set('p1', { state: 'done', result: { success: true, content: 'The user approved your team plan and the team has finished.', teamRuns: [{ runId: 'c1' }] } });
    context.run.team = { ...context.run.team, calls: [], plans: [] };
    expect(await runRound(context, state(0))).toBe('continue');
    expect(toolMessages()[0].metadata).toMatchObject({ toolCallId: 'p1', teamRuns: [{ runId: 'c1' }] });
    expect(stored.find((m) => m.id === 'run1_r0')?.metadata?.toolExecutionResults).toBeDefined();

    streamQueue.push([{ type: 'text_delta', delta: 'Reconciled.' }, done()]);
    expect(await runRound(context, state(1))).toBe('completed');
    expect(toolNames(1)).toEqual(['execute_python', 'propose_team', 'delegate']);
    expect(streamCalls[1].toolChoice).not.toBe('required');
    expect(stored.at(-1)?.metadata?.teamModeSkipped).toBeUndefined();
  });

  it('notes it when the operator answers without a plan (models that can\'t be forced)', async () => {
    const { context } = makeContext({ teamPlanTurn: true });
    streamQueue.push([{ type: 'text_delta', delta: 'Here is my answer.' }, done()]);
    expect(await runRound(context, state(0))).toBe('completed');
    expect(stored.at(-1)?.metadata?.teamModeSkipped).toBe(true);
  });

  it('leaves a normal turn alone when Team mode is off', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'text_delta', delta: 'Answer.' }, done()]);
    await runRound(context, state(0));
    expect(streamCalls[0].toolChoice).not.toBe('required');
    expect(stored.at(-1)?.metadata?.teamModeSkipped).toBeUndefined();
  });

  it('lets the operator ask first: the turn ends with its question; a plan in the same breath waits', async () => {
    const { context, suspended, capture } = makeContext({ teamPlanTurn: true });
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [
      call('a1', 'ask_user', { questions: 'Which year?' }),
      call('p1', 'propose_team', { kind: 'panel', rationale: 'r', assignments: [{ task: 'T', agents: ['teammate1'] }] }),
    ] })]);
    expect(await runRound(context, state(0))).toBe('completed');
    expect(suspended).toHaveLength(0);
    expect(stored.find((m) => m.id === 'run1_r0')?.content).toBe('Which year?');
    expect(toolMessages().map((m) => m.content)).toEqual([
      expect.stringContaining('Your question was shown to the user'),
      expect.stringContaining('Not run: you asked the user first'),
    ]);
    expect(capture).toHaveBeenCalledTimes(1);
    // A redelivery after capture doesn't call the model again.
    expect(await runRound(context, state(1))).toBe('completed');
    expect(streamCalls).toHaveLength(1);
  });

  describe('on a Salesforce workspace (2.5.3)', () => {
    it('lets the operator audit and request org evidence before planning; the request ends the turn', async () => {
      const { context, executeTool } = makeContext({ teamPlanTurn: true, salesforceWorkspace: true });
      context.tools = [executeCodeTool, auditTool, orgEvidenceTool];
      streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('e1', 'request_salesforce_org_evidence', { brief: 'b' })] })]);
      expect(await runRound(context, state(0))).toBe('completed');
      expect(toolNames(0)).toEqual(['salesforce_metadata_audit', 'request_salesforce_org_evidence', 'propose_team', 'ask_user']);
      expect(executeTool).toHaveBeenCalledTimes(1);
      expect(stored.find((m) => m.id === 'run1_r0')?.content).toBe(ORG_EVIDENCE_REQUESTED_REPLY);
    });
  });

  it('ends a solo turn when the operator requests org evidence', async () => {
    const { context } = makeContext();
    context.tools = [executeCodeTool, orgEvidenceTool];
    streamQueue.push([{ type: 'text_delta', delta: 'I need evidence.' }, done({ finish_reason: 'tool_calls', tool_calls: [call('e1', 'request_salesforce_org_evidence', {})] })]);
    expect(await runRound(context, state(0))).toBe('completed');
    expect(stored.find((m) => m.id === 'run1_r0')?.content).toBe('I need evidence.');
  });
});

describe('team calls in a round', () => {
  it('runs the other calls first, holds for the plan, then writes every result in call order', async () => {
    const { context, executeTool } = makeContext();
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [
      call('d1', 'delegate', { task: 'Sum A', agent: 'teammate1' }),
      call('py1', 'execute_python', { code: 'print(1)' }),
    ] })]);
    expect(await runRound(context, state(0))).toBe('waiting');
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(toolMessages()).toHaveLength(0);

    toolRecords.set('d1', { state: 'done', result: { success: true, content: 'The user approved this handoff and it has run.' } });
    expect(await runRound(context, state(0))).toBe('continue');
    expect(executeTool).toHaveBeenCalledTimes(1); // replayed, not rerun
    expect(toolMessages().map((m) => m.metadata?.toolCallId)).toEqual(['d1', 'py1']);
    expect(toolMessages().map((m) => m.timestamp)).toEqual([5, 6]);
  });

  it('a round held but not yet settled is not planned twice on redelivery', async () => {
    const { context, suspended } = makeContext();
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('d1', 'delegate', { task: 'A', agent: 'teammate1' })] })]);
    expect(await runRound(context, state(0))).toBe('waiting');
    expect(await runRound(context, state(0))).toBe('waiting');
    expect(suspended).toHaveLength(1);
  });

  it('answers at once, without holding, when every team call is answered immediately', async () => {
    const { context, suspended } = makeContext({}, { solo: true });
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('d1', 'delegate', { task: 'A', agent: 'teammate1' })] })]);
    expect(await runRound(context, state(0))).toBe('continue');
    expect(suspended).toHaveLength(0);
    expect(toolMessages()[0].content).toContain(SOLO_RESULT_TEXT);
  });

  it('a stopped operator writes the results that exist and captures the round', async () => {
    const { context, capture } = makeContext();
    stored.push({ id: 'run1_r0', sender: 'Claude', senderType: 'ai', content: '', timestamp: 2, metadata: { toolCalls: [call('d1', 'delegate', { task: 'A', agent: 'teammate1' })] } });
    toolRecords.set('d1', { state: 'done', result: { success: true, content: 'team result' } });
    const controller = new AbortController();
    controller.abort();
    context.signal = controller.signal;
    expect(await runRound(context, state(0))).toBe('stopped');
    expect(toolMessages()).toHaveLength(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('subagent rounds', () => {
  it('use their own transcript, no team tools, and never capture', async () => {
    const { context } = makeContext();
    context.team = null;
    context.capture = undefined;
    context.run = { ...context.run, kind: 'teammate' };
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('py1', 'execute_python', { code: 'x' })] })]);
    expect(await runRound(context, state(0))).toBe('continue');
    expect(toolNames(0)).toEqual(['execute_python']);
    // No capture: the uncaptured round is not retried.
    streamQueue.push([{ type: 'text_delta', delta: 'Done.' }, done()]);
    expect(await runRound(context, state(1))).toBe('completed');
  });
});
