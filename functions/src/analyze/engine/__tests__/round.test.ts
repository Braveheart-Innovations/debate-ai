import type { Message } from '../../contract/types';
import type { ToolCall } from '../../contract/lib/ai/tools/types';

// --- mocks -------------------------------------------------------------------
const streamQueue: Array<Array<Record<string, unknown>>> = [];
const streamCalls: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
jest.mock('../../../modelStream', () => ({
  CANCELLED_CODE: 'cancelled',
  streamModel: jest.fn((request: { messages: Array<{ role: string; content: string | null }> }) => {
    streamCalls.push(request);
    const events = streamQueue.shift() ?? [];
    return (async function* gen() { for (const e of events) yield e; })();
  }),
}));

let stored: Message[] = [];
const toolRecords = new Map<string, unknown>();
/** Full outputs saved for a finished call (runStore.saveToolOutputs), by call id. */
const savedOutputs = new Map<string, unknown>();
let latestCompleted: string | null = null;
jest.mock('../sessionStore', () => ({
  loadSessionMessages: jest.fn(async () => [...stored]),
  writeMessage: jest.fn(async (_uid: string, _sid: string, message: Message) => {
    stored = stored.filter((m) => m.id !== message.id).concat(message);
  }),
}));
jest.mock('../runStore', () => ({
  toolCallRef: (_run: unknown, id: string) => id,
  getToolCallRecord: jest.fn(async (id: string) => toolRecords.get(id) ?? null),
  markToolCallStarted: jest.fn(async (id: string) => { toolRecords.set(id, { state: 'started' }); }),
  markToolCallDone: jest.fn(async (id: string, result: unknown) => { toolRecords.set(id, { state: 'done', result }); }),
  toStoredToolResult: (r: { success: boolean; content?: string; error?: string }) => ({ success: r.success, content: r.content, error: r.error }),
  saveToolOutputs: jest.fn(async (id: string, result: unknown) => { savedOutputs.set(id, result); return `scratch/${id}`; }),
  loadToolResult: jest.fn(async (id: string) => savedOutputs.get(id) ?? null),
  deleteToolOutputs: jest.fn(async () => undefined),
  setLatestCompletedOperatorMessage: jest.fn(async (_ref: unknown, id: string) => { latestCompleted = id; }),
}));

import { runRound, type RoundContext, type TurnState } from '../round';
import type { CaptureInput } from '../../capture/captureRound';

// --- helpers -----------------------------------------------------------------
const user: Message = { id: 'u1', sender: 'You', senderType: 'user', content: 'Analyze sales', timestamp: 1 };
const call = (id: string, name = 'execute_python'): ToolCall => ({ id, type: 'function', function: { name, arguments: '{"code":"print(1)"}' } });
const done = (extra: Record<string, unknown> = {}) => ({ type: 'message_complete', finish_reason: 'stop', ...extra });

function makeContext(overrides: Partial<RoundContext> = {}) {
  const executeTool = jest.fn(async (c: ToolCall) => ({ toolCallId: c.id, success: true, content: 'ok' }));
  const events = { push: jest.fn() };
  const controller = new AbortController();
  // Stands in for captureRound: stamps the commit marker on the message.
  const capture = jest.fn(async (input: CaptureInput) => {
    stored = stored.map((m) => (m.id === input.message.id
      ? { ...m, metadata: { ...m.metadata, toolExecutionResults: input.results.map((r) => ({ toolName: 'x', success: r.success })) } }
      : m));
  });
  const context: RoundContext = {
    uid: 'u', sessionId: 's',
    run: {
      runId: 'run1', uid: 'u', sessionId: 's', kind: 'operator', status: 'running', round: 0,
      config: { provider: 'claude', model: 'claude-sonnet-5-5', aiId: 'ai-claude', aiName: 'Claude', systemPrompt: 'SYS', toolNames: ['execute_python'], sandboxSessionKey: 'k' },
      userMessageId: 'u1', eventSeq: 0, createdAt: 0, updatedAt: 0,
    },
    runRef: {} as RoundContext['runRef'],
    events: events as unknown as RoundContext['events'],
    signal: controller.signal,
    keyValue: 'k',
    tools: [],
    executeTool,
    toolResults: new Map(),
    messages: {
      load: async () => [...stored],
      write: async (message: Message) => { stored = stored.filter((m) => m.id !== message.id).concat(message); },
    },
    capture,
    sleep: async () => undefined,
    now: () => 5,
    ...overrides,
  };
  return { context, executeTool, events, controller, capture };
}

const state = (round = 0): TurnState => ({ round, retryCount: 0 });

beforeEach(() => {
  stored = [user];
  toolRecords.clear();
  savedOutputs.clear();
  latestCompleted = null;
  streamQueue.length = 0;
  streamCalls.length = 0;
});

// --- tests -------------------------------------------------------------------
describe('runRound', () => {
  it('writes the assistant tool-call message before running tools, then each result', async () => {
    const { context, executeTool } = makeContext();
    streamQueue.push([{ type: 'text_delta', delta: 'Let me compute.' }, done({ finish_reason: 'tool_calls', tool_calls: [call('c1')] })]);

    expect(await runRound(context, state())).toBe('continue');
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(stored.map((m) => m.id)).toEqual(['u1', 'run1_r0', 'toolresult_c1']);
    expect(stored[1]).toMatchObject({ senderType: 'ai', content: 'Let me compute.', metadata: expect.objectContaining({ toolCalls: [expect.objectContaining({ id: 'c1' })], providerId: 'claude', aiId: 'ai-claude' }) });
    expect(stored[2]).toMatchObject({ senderType: 'tool', content: 'ok', metadata: expect.objectContaining({ isToolResult: true, toolCallId: 'c1', toolName: 'execute_python', success: true }) });
  });

  it('resumes unfinished tool calls from a previous step without calling the model', async () => {
    stored.push({ id: 'run1_r0', sender: 'Claude', senderType: 'ai', content: '', timestamp: 2, metadata: { toolCalls: [call('c1'), call('c2')] } });
    stored.push({ id: 'toolresult_c1', sender: 'tool', senderType: 'tool', content: 'ok', timestamp: 3, metadata: { isToolResult: true, toolCallId: 'c1' } });
    const { context, executeTool } = makeContext();

    expect(await runRound(context, state(1))).toBe('continue');
    expect(streamCalls).toHaveLength(0);
    expect(executeTool.mock.calls.map(([c]) => c.id)).toEqual(['c2']);
  });

  it('never reruns a tool that a crashed step had started: it records an interrupted result', async () => {
    stored.push({ id: 'run1_r0', sender: 'Claude', senderType: 'ai', content: '', timestamp: 2, metadata: { toolCalls: [call('c1')] } });
    toolRecords.set('c1', { state: 'started' });
    const { context, executeTool } = makeContext();

    await runRound(context, state(1));
    expect(executeTool).not.toHaveBeenCalled();
    expect(stored.find((m) => m.id === 'toolresult_c1')).toMatchObject({ metadata: expect.objectContaining({ success: false }) });
    expect(stored.find((m) => m.id === 'toolresult_c1')!.content).toMatch(/interrupted/);
  });

  it('replays a finished tool result instead of executing again', async () => {
    stored.push({ id: 'run1_r0', sender: 'Claude', senderType: 'ai', content: '', timestamp: 2, metadata: { toolCalls: [call('c1')] } });
    toolRecords.set('c1', { state: 'done', result: { success: true, content: 'cached' } });
    const { context, executeTool } = makeContext();

    await runRound(context, state(1));
    expect(executeTool).not.toHaveBeenCalled();
    expect(stored.find((m) => m.id === 'toolresult_c1')!.content).toBe('cached');
  });

  it('completes with the final answer when the model calls no tools', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'text_delta', delta: 'Sales grew 4%.' }, done()]);
    expect(await runRound(context, state())).toBe('completed');
    expect(stored.at(-1)).toMatchObject({ id: 'run1_r0', content: 'Sales grew 4%.' });
  });

  it('flags a final answer cut off at the output limit', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'text_delta', delta: 'Partial' }, done({ finish_reason: 'length' })]);
    await runRound(context, state());
    expect(stored.at(-1)!.metadata).toMatchObject({ outputLimitReached: true });
  });

  it('retries a network failure once per turn, then explains the failure', async () => {
    const { context } = makeContext();
    const s = state();
    streamQueue.push([{ type: 'error', message: 'Claude encountered an error. Please try again.', code: 'internal' }]);
    streamQueue.push([{ type: 'error', message: 'Claude encountered an error. Please try again.', code: 'internal' }]);
    expect(await runRound(context, s)).toBe('error');
    expect(streamCalls).toHaveLength(2);
    expect(s.retryCount).toBe(1);
    expect(stored.at(-1)!.content).toMatch(/connection to the AI server failed/);
  });

  it('does not retry a bad key; it says so', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'error', message: 'Your Claude API key is invalid. Please update it in Settings.', code: 'permission-denied' }]);
    expect(await runRound(context, state())).toBe('error');
    expect(streamCalls).toHaveLength(1);
    expect(stored.at(-1)!.content).toMatch(/Provider error: Your Claude API key is invalid/);
  });

  it('recovers an empty reply after tools with the explicit continuation prompt', async () => {
    stored.push({ id: 'run1_r0', sender: 'Claude', senderType: 'ai', content: '', timestamp: 2, metadata: { toolCalls: [call('c1')], toolExecutionResults: [{ toolName: 'execute_python', success: true }] } });
    stored.push({ id: 'toolresult_c1', sender: 'tool', senderType: 'tool', content: 'ok', timestamp: 3, metadata: { isToolResult: true, toolCallId: 'c1', toolName: 'execute_python', success: true } });
    const { context } = makeContext();
    streamQueue.push([done()]);
    streamQueue.push([{ type: 'text_delta', delta: 'Final answer.' }, done()]);

    expect(await runRound(context, state(1))).toBe('completed');
    const lastUserTurn = streamCalls[1].messages.at(-1)!;
    expect(lastUserTurn.role).toBe('user');
    expect(lastUserTurn.content).toMatch(/Continue with a complete final response/);
    expect(stored.at(-1)!.content).toBe('Final answer.');
  });

  it('turns a persistently empty reply into an app notice', async () => {
    const { context } = makeContext();
    streamQueue.push([done()]);
    streamQueue.push([done()]);
    await runRound(context, state());
    expect(stored.at(-1)!.metadata).toMatchObject({ appNotice: { kind: 'empty_reply' } });
  });

  it('reports a tool call cut off by the output limit', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'tool_call_start', id: 'c1', name: 'execute_python' }, done({ finish_reason: 'length' })]);
    expect(await runRound(context, state())).toBe('completed');
    expect(stored.at(-1)!.content).toMatch(/response size limit/);
  });

  it('stops before calling the model when Stop was requested', async () => {
    const { context, controller } = makeContext();
    controller.abort();
    expect(await runRound(context, state())).toBe('stopped');
    expect(streamCalls).toHaveLength(0);
  });

  it('captures a tool round with the full results once its tools are done', async () => {
    const { context, capture, executeTool } = makeContext();
    executeTool.mockImplementation(async (c: ToolCall) => ({ toolCallId: c.id, success: true, content: 'ok', images: ['PNG'] } as never));
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('c1'), call('c2')] })]);

    expect(await runRound(context, state())).toBe('continue');
    expect(capture).toHaveBeenCalledTimes(1);
    const input = capture.mock.calls[0][0];
    expect(input.message.id).toBe('run1_r0');
    expect(input.toolCalls.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(input.results).toEqual([
      expect.objectContaining({ toolCallId: 'c1', images: ['PNG'] }),
      expect.objectContaining({ toolCallId: 'c2', images: ['PNG'] }),
    ]);
    expect(savedOutputs.has('c1')).toBe(true);
  });

  it('captures a round a crashed step finished but never captured, from the saved outputs', async () => {
    stored.push({ id: 'run1_r0', sender: 'Claude', senderType: 'ai', content: '', timestamp: 2, metadata: { toolCalls: [call('c1')] } });
    stored.push({ id: 'toolresult_c1', sender: 'tool', senderType: 'tool', content: 'ok', timestamp: 3, metadata: { isToolResult: true, toolCallId: 'c1' } });
    toolRecords.set('c1', { state: 'done', result: { success: true, content: 'ok' } });
    savedOutputs.set('c1', { toolCallId: 'c1', success: true, content: 'ok', dataOutputs: [{ filename: 'a.csv', base64: 'eA==', size: 1 }] });
    const { context, capture, executeTool } = makeContext();

    expect(await runRound(context, state(1))).toBe('continue');
    expect(streamCalls).toHaveLength(0);
    expect(executeTool).not.toHaveBeenCalled();
    expect(capture.mock.calls[0][0].results).toEqual([expect.objectContaining({ dataOutputs: [expect.objectContaining({ base64: 'eA==' })] })]);

    // Captured now: the next round asks the model.
    streamQueue.push([{ type: 'text_delta', delta: 'Done.' }, done()]);
    expect(await runRound(context, state(2))).toBe('completed');
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('captures the calls that ran when Stop lands between tools', async () => {
    const { context, capture, controller, executeTool } = makeContext();
    executeTool.mockImplementation(async (c: ToolCall) => {
      controller.abort();
      return { toolCallId: c.id, success: true, content: 'ok' };
    });
    streamQueue.push([done({ finish_reason: 'tool_calls', tool_calls: [call('c1'), call('c2')] })]);

    expect(await runRound(context, state())).toBe('stopped');
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].results.map((r) => r.toolCallId)).toEqual(['c1']);
  });

  it('records the final reply as the latest completed operator message', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'text_delta', delta: 'All done.' }, done()]);
    await runRound(context, state());
    expect(latestCompleted).toBe('run1_r0');
  });

  it('keeps partial text when the model call is cancelled mid-stream', async () => {
    const { context } = makeContext();
    streamQueue.push([{ type: 'text_delta', delta: 'Half an ans' }, { type: 'error', message: 'Request was cancelled.', code: 'cancelled' }]);
    expect(await runRound(context, state())).toBe('stopped');
    expect(stored.at(-1)).toMatchObject({ id: 'run1_r0', content: 'Half an ans' });
  });
});
