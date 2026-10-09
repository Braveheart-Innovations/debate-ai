/**
 * The team and review engine end to end against the Firestore emulator: the
 * real step function, run docs, transactions and wake-ups, with scripted
 * models, a fake sandbox and the task queue drained by the test.
 *
 *   npm run test:emulator   (firebase emulators:exec --only firestore)
 *
 * Skipped without FIRESTORE_EMULATOR_HOST (CI has no emulator).
 */
import type { Message } from '../../contract/types';

// uuid 14 is ESM-only, which jest's CommonJS runtime can't load (Node's own require can).
jest.mock('uuid', () => ({ v4: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }));

// --- scripted models -----------------------------------------------------------
type ModelRequest = { systemPrompt?: string; messages: Array<{ role: string; content: string | null }>; tools?: Array<{ name: string }>; signal?: AbortSignal };
type Script = (request: ModelRequest) => Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;
let script: Script = () => [];
const modelCalls: ModelRequest[] = [];
jest.mock('../../../modelStream', () => ({
  CANCELLED_CODE: 'cancelled',
  streamModel: jest.fn((request: ModelRequest) => {
    modelCalls.push(request);
    return (async function* gen() { for (const e of await script(request)) yield e; })();
  }),
}));
jest.mock('../../../apiKeys', () => ({ encryptionKey: { value: () => 'test-key' } }));
jest.mock('../../../tools', () => ({
  SERVER_TOOL_SECRETS: [],
  dispatchServerTool: jest.fn(async () => ({ success: true, content: '{}' })),
}));

// --- fake sandbox and storage --------------------------------------------------
const sandboxFiles = new Map<string, Buffer>();
const pythonRuns: Array<{ code: string; kernel?: string }> = [];
const released: string[] = [];
jest.mock('../../../sandbox/callables', () => ({
  getSandboxService: () => ({
    execute: async (_uid: string, _key: string, code: string, _timeout: number, kernel?: string) => {
      pythonRuns.push({ code, kernel });
      return { success: true, stdout: '42', images: [], htmlOutputs: [], dataOutputs: [] };
    },
    interrupt: async () => undefined,
    readFile: async (_uid: string, _key: string, { path }: { path: string }) => {
      const bytes = sandboxFiles.get(path);
      if (!bytes) throw new Error(`not found: ${path}`);
      return { base64: bytes.toString('base64'), eof: true };
    },
    writeFile: async (_uid: string, _key: string, { path, base64 }: { path: string; base64: string }) => {
      sandboxFiles.set(path, Buffer.from(base64, 'base64'));
    },
    listFiles: async (_uid: string, _key: string, dir: string) => [...sandboxFiles.keys()]
      .filter((path) => path.startsWith(`${dir}/`))
      .map((path) => ({ name: path.split('/').pop(), path, size: 1, isDirectory: false })),
    releaseKernel: async (_uid: string, _key: string, kernel: string) => { released.push(kernel); },
  }),
}));
jest.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: () => ({ save: async () => undefined, download: async () => [Buffer.from('{}')], delete: async () => undefined }) }) }),
}));

// --- the task queue, drained by the test ----------------------------------------
const queue: Array<{ uid: string; sessionId: string; runId: string }> = [];
jest.mock('../../engine/queue', () => ({
  STEP_FUNCTION: 'analyzeRunStep',
  enqueueStep: jest.fn(async (payload: { uid: string; sessionId: string; runId: string }) => { queue.push(payload); }),
}));

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runStep } from '../../engine/step';
import { startOperatorTurn } from '../../engine/turns';
import { runRef, type AnalyzeRunDoc, type RunConfig } from '../../engine/runStore';
import { loadSessionMessages, runMessageStore } from '../../engine/sessionStore';
import { approvePlan, replaceLane, stopWaitingOperator, cancelChildren, workSolo, forceStopStranded } from '../teamStore';
import { startRerun } from '../reruns';
import { SOLO_RESULT_TEXT } from '../teamState';
import { loadReviewItems, startReviewPass, startVerification } from '../../review/reviewRuns';

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = emulator ? describe : describe.skip;

if (emulator && getApps().length === 0) initializeApp({ projectId: 'demo-analyze-team' });

const uid = 'user1';
let sessionId = '';
let attempt = 0;

const text = (delta: string) => [{ type: 'text_delta', delta }, { type: 'message_complete', finish_reason: 'stop' }];
const calls = (...toolCalls: Array<{ id: string; name: string; args: unknown }>) => [{
  type: 'message_complete',
  finish_reason: 'tool_calls',
  tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
}];
const isTeammate = (request: ModelRequest) => request.systemPrompt === 'SUB';
const lastUser = (request: ModelRequest) => [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
const hasToolResults = (request: ModelRequest) => request.messages.some((m) => m.role === 'tool');

function config(extra: Partial<RunConfig> = {}): RunConfig {
  return {
    provider: 'claude',
    model: 'claude-sonnet-5-5',
    aiId: 'op',
    aiName: 'Claude',
    systemPrompt: 'SYS',
    subagentSystemPrompt: 'SUB',
    toolNames: ['execute_python'],
    sandboxSessionKey: 'sbx',
    outputSelection: { mode: 'auto' } as unknown as RunConfig['outputSelection'],
    team: [
      { handle: 'teammate1', ai: { id: 't1', name: 'Gemini', provider: 'google', model: 'gemini-3-pro-preview' } },
      { handle: 'teammate2', ai: { id: 't2', name: 'GPT', provider: 'openai', model: 'gpt-6-sol' } },
    ],
    reviewers: [{ id: 'rv', name: 'Reviewer', provider: 'claude', model: 'claude-opus-5-5' }],
    ...extra,
  };
}

async function run(runId: string): Promise<AnalyzeRunDoc> {
  return (await runRef(uid, sessionId, runId).get()).data() as AnalyzeRunDoc;
}

/** Deliver queued steps until the queue is empty (or `until` holds). */
async function drain(until?: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 100 && queue.length > 0; i += 1) {
    const payload = queue.shift()!;
    attempt += 1;
    await runStep(payload, `task-${attempt}:0`);
    if (until && await until()) return;
  }
}

async function children(parentRunId: string): Promise<AnalyzeRunDoc[]> {
  const snapshot = await getFirestore().collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`).where('parentRunId', '==', parentRunId).get();
  return snapshot.docs.map((doc) => doc.data() as AnalyzeRunDoc).sort((a, b) => a.createdAt - b.createdAt);
}

const toolMessages = (messages: Message[]) => messages.filter((m) => m.senderType === 'tool');

beforeEach(() => {
  sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  queue.length = 0;
  modelCalls.length = 0;
  pythonRuns.length = 0;
  released.length = 0;
  sandboxFiles.clear();
});

describeEmulator('team engine', () => {
  jest.setTimeout(60_000);

  it('holds the operator for approval, runs the edited plan as child runs, and resumes with the results', async () => {
    script = (request) => {
      if (isTeammate(request)) {
        if (!hasToolResults(request) && lastUser(request).startsWith('Sum B')) return calls({ id: 'py_sub', name: 'execute_python', args: { code: 'print(42)' } });
        return text(`answer from ${request.messages.length}`);
      }
      return hasToolResults(request)
        ? text('Combined answer.')
        : calls({ id: 'd1', name: 'delegate', args: { task: 'Sum A', agent: 'teammate1' } }, { id: 'd2', name: 'delegate', args: { task: 'Sum B', agent: 'teammate2' } });
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Compare the datasets.', config: config() });
    await drain();

    let operator = await run(runId);
    expect(operator.status).toBe('awaiting_approval');
    expect(operator.pendingTeamPlans).toHaveLength(1);
    const plan = operator.pendingTeamPlans![0];
    expect(plan.assignments.map((a) => a.agents)).toEqual([['teammate1'], ['teammate2']]);
    expect(toolMessages(await loadSessionMessages(uid, sessionId))).toHaveLength(0);

    // A stray delivery while waiting does nothing.
    queue.push({ uid, sessionId, runId });
    await drain();
    expect((await run(runId)).status).toBe('awaiting_approval');

    expect(await approvePlan(runRef(uid, sessionId, runId), plan.id, {
      type: 'approve',
      assignments: [
        { id: 'd1', task: 'Sum A', agents: ['teammate2'] },
        { id: 'd2', task: 'Sum B', agents: ['teammate1', 'teammate2'] },
      ],
    })).toBe(true);
    operator = await run(runId);
    expect(operator.status).toBe('waiting_children');
    expect(operator.pendingTeamPlans).toEqual([]);
    const kids = await children(runId);
    expect(kids).toHaveLength(3);
    expect(kids.every((kid) => kid.config.systemPrompt === 'SUB' && kid.config.kernel === `agent-${kid.runId}`)).toBe(true);
    expect(queue).toHaveLength(3);

    await drain();
    operator = await run(runId);
    expect(operator.status).toBe('completed');
    const messages = await loadSessionMessages(uid, sessionId);
    const results = toolMessages(messages);
    expect(results.map((m) => m.metadata?.toolCallId)).toEqual(['d1', 'd2']);
    expect(results[0].content).toMatch(/^The user approved this handoff and it has run\. The user ran it on GPT \(gpt-6-sol\) instead of Gemini \(gemini-3-pro-preview\)\./);
    expect(results[1].metadata?.teamRuns).toHaveLength(2);
    expect(results[1].content).toContain('Tools run: execute_python ×1');
    expect(messages.at(-1)?.content).toBe('Combined answer.');

    // Subagents: own kernels, own transcripts (not in the session), answer files, kernels released.
    expect(pythonRuns.every((r) => r.kernel?.startsWith('agent-run_'))).toBe(true);
    const finished = await children(runId);
    expect(finished.every((kid) => kid.status === 'completed' && kid.result?.answerFile)).toBe(true);
    expect(released.sort()).toEqual(finished.map((kid) => `agent-${kid.runId}`).sort());
    const transcript = await runMessageStore(uid, sessionId, finished[0].runId).load();
    expect(transcript[0]).toMatchObject({ sender: 'Operator', senderType: 'user' });
    expect(messages.some((m) => m.sender === 'Operator')).toBe(false);
  });

  it('Stop on a pending plan answers it and stops the operator after writing the result', async () => {
    script = (request) => (hasToolResults(request) ? text('unreachable') : calls({ id: 'd1', name: 'delegate', args: { task: 'A', agent: 'teammate1' } }));
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config() });
    await drain();
    expect((await run(runId)).status).toBe('awaiting_approval');

    await runRef(uid, sessionId, runId).update({ cancelRequested: true });
    await stopWaitingOperator(runRef(uid, sessionId, runId));
    await cancelChildren(uid, sessionId, runId);
    await drain();

    const operator = await run(runId);
    expect(operator.status).toBe('stopped');
    expect(operator.team?.plans).toBeUndefined();
    expect(toolMessages(await loadSessionMessages(uid, sessionId))[0].content).toBe(SOLO_RESULT_TEXT);
    expect(await children(runId)).toHaveLength(0);
    expect(modelCalls).toHaveLength(1);
  });

  it('auto-approve runs at once; "do it yourself" mid-run stops the team and withholds its tools', async () => {
    let release: () => void = () => undefined;
    const teammateBlocked = new Promise<void>((resolve) => { release = resolve; });
    const operatorTools: string[][] = [];
    script = async (request) => {
      if (isTeammate(request)) {
        // Blocks until "do it yourself" cancels it (the abort ends the stream).
        await Promise.race([teammateBlocked, new Promise((resolve) => request.signal?.addEventListener('abort', resolve))]);
        return request.signal?.aborted ? [{ type: 'error', code: 'cancelled', message: 'aborted' }] : text('late');
      }
      operatorTools.push((request.tools ?? []).map((t) => t.name));
      return hasToolResults(request) ? text('Finished solo.') : calls({ id: 'd1', name: 'delegate', args: { task: 'long task', agent: 'teammate2' } });
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config({ teamAutoApprove: true }) });
    await drain(async () => (await run(runId)).status === 'waiting_children');
    expect((await run(runId)).team?.plans?.[0].plan.autoApproved).toBe(true);

    const childStep = queue.shift()!;
    const childRun = runStep(childStep, 'child-task:0');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await workSolo(runRef(uid, sessionId, runId));
    await childRun;
    release();
    await drain();

    const operator = await run(runId);
    expect(operator.status).toBe('completed');
    const [kid] = await children(runId);
    expect(kid.result?.status).toBe('stopped');
    const result = toolMessages(await loadSessionMessages(uid, sessionId))[0];
    expect(result.content).toContain(SOLO_RESULT_TEXT);
    expect(operatorTools[0]).toContain('delegate');
    expect(operatorTools[1]).not.toContain('delegate');
  });

  it('"Replace with…" reruns a running teammate\'s task on another model inside the same plan', async () => {
    script = async (request) => {
      if (isTeammate(request)) {
        if (request.signal?.aborted) return [{ type: 'error', code: 'cancelled', message: 'aborted' }];
        return text('replacement answer');
      }
      return hasToolResults(request) ? text('Done.') : calls({ id: 'p1', name: 'propose_team', args: { kind: 'panel', rationale: 'r', assignments: [{ task: 'T', agents: ['teammate1'] }] } });
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config({ teamAutoApprove: true }) });
    await drain(async () => (await run(runId)).status === 'waiting_children');
    const [first] = await children(runId);
    expect(await replaceLane(uid, sessionId, first.runId, 'teammate2')).toBe(true);
    await drain();

    const operator = await run(runId);
    expect(operator.status).toBe('completed');
    const kids = await children(runId);
    expect(kids.map((kid) => kid.config.aiName)).toEqual(['Gemini', 'GPT']);
    const result = toolMessages(await loadSessionMessages(uid, sessionId))[0];
    expect(result.content).toContain('The user replaced Gemini (gemini-3-pro-preview) with GPT (gpt-6-sol) on this task.');
  });

  it('two plans in one round: one approved runs while the other waits; then both report', async () => {
    script = (request) => {
      if (isTeammate(request)) return text(`answer: ${lastUser(request).split('\n')[0]}`);
      return hasToolResults(request) ? text('Both done.') : calls(
        { id: 'd1', name: 'delegate', args: { task: 'Delegated task', agent: 'teammate1' } },
        { id: 'p1', name: 'propose_team', args: { kind: 'panel', rationale: 'r', assignments: [{ task: 'Panel task', agents: ['teammate1', 'teammate2'] }] } },
      );
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config() });
    await drain();
    let operator = await run(runId);
    expect(operator.status).toBe('awaiting_approval');
    expect(operator.pendingTeamPlans).toHaveLength(2);
    const [delegatePlan, panelPlan] = operator.pendingTeamPlans!;

    expect(await approvePlan(runRef(uid, sessionId, runId), delegatePlan.id, { type: 'approve', assignments: delegatePlan.assignments })).toBe(true);
    operator = await run(runId);
    expect(operator.status).toBe('awaiting_approval');
    expect(operator.pendingTeamPlans!.map((plan) => plan.id)).toEqual([panelPlan.id]);
    await drain(); // the delegated child finishes while the panel plan still waits
    expect((await children(runId)).map((kid) => kid.status)).toEqual(['completed']);
    expect((await run(runId)).status).toBe('awaiting_approval');

    expect(await approvePlan(runRef(uid, sessionId, runId), panelPlan.id, { type: 'approve', assignments: panelPlan.assignments })).toBe(true);
    await drain();
    expect((await run(runId)).status).toBe('completed');
    const results = toolMessages(await loadSessionMessages(uid, sessionId));
    expect(results.map((m) => m.metadata?.toolCallId)).toEqual(['d1', 'p1']);
    expect(results[1].content).toContain('answer: Panel task');
    expect(results[1].metadata?.teamRuns).toHaveLength(2);
  });

  it('Stop after "Replace with…" starts no replacement and stops the operator', async () => {
    script = async (request) => {
      if (isTeammate(request)) return request.signal?.aborted ? [{ type: 'error', code: 'cancelled', message: 'aborted' }] : text('x');
      return hasToolResults(request) ? text('unreachable') : calls({ id: 'p1', name: 'propose_team', args: { kind: 'panel', rationale: 'r', assignments: [{ task: 'T', agents: ['teammate1'] }] } });
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config({ teamAutoApprove: true }) });
    await drain(async () => (await run(runId)).status === 'waiting_children');
    const [first] = await children(runId);
    expect(await replaceLane(uid, sessionId, first.runId, 'teammate2')).toBe(true);
    await runRef(uid, sessionId, runId).update({ cancelRequested: true });
    await stopWaitingOperator(runRef(uid, sessionId, runId));
    await cancelChildren(uid, sessionId, runId);
    await drain();
    expect((await run(runId)).status).toBe('stopped');
    expect(await children(runId)).toHaveLength(1);
    expect(toolMessages(await loadSessionMessages(uid, sessionId))).toHaveLength(1);
  });

  it('Stop finishes a child whose task was lost, and the operator stops', async () => {
    script = (request) => (hasToolResults(request) ? text('unreachable') : calls({ id: 'd1', name: 'delegate', args: { task: 'A', agent: 'teammate1' } }));
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config({ teamAutoApprove: true }) });
    await drain(async () => (await run(runId)).status === 'waiting_children');
    queue.length = 0; // the child's task is lost
    const [kid] = await children(runId);
    await runRef(uid, sessionId, kid.runId).update({ updatedAt: Date.now() - 5 * 60_000 });
    await runRef(uid, sessionId, runId).update({ cancelRequested: true });
    await cancelChildren(uid, sessionId, runId);
    await forceStopStranded(uid, sessionId, runId);
    await drain();
    expect((await run(kid.runId)).status).toBe('stopped');
    expect((await run(runId)).status).toBe('stopped');
  });

  it('"Run again" reruns a task outside the turn and delivers it to the operator as a new turn', async () => {
    script = (request) => {
      if (isTeammate(request)) return text('rerun answer');
      if (lastUser(request).startsWith('Team task rerun')) return text('Thanks for the rerun.');
      return hasToolResults(request) ? text('Done.') : calls({ id: 'd1', name: 'delegate', args: { task: 'A', agent: 'teammate1' } });
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Go', config: config({ teamAutoApprove: true }) });
    await drain();
    const [original] = await children(runId);
    const rerunId = await startRerun(uid, sessionId, original.runId, 'teammate2');
    await drain();

    const rerun = await run(rerunId);
    expect(rerun.deliveredToOperator).toBe(true);
    const messages = await loadSessionMessages(uid, sessionId);
    const delivery = messages.find((m) => m.id === `msg_rerun_${rerunId}`);
    expect(delivery?.content).toMatch(/^Team task rerun: "A"\./);
    expect(delivery?.metadata?.teamRuns?.[0]).toMatchObject({ runId: rerunId, parentToolCallId: `rerun:${original.runId}` });
    expect(messages.at(-1)?.content).toBe('Thanks for the rerun.');
  });
});

describeEmulator('review engine', () => {
  jest.setTimeout(60_000);

  const reviewJson = JSON.stringify({ items: [{ priority: 'P0', confidence: 0.9, actionType: 'verify', title: 'Check the total', details: 'The total looks off.', expectedOutcome: 'A recomputed total.', estimatedCost: 'low' }] });

  it('a reviewer pass adds items to the queue; Check independently records the verdict', async () => {
    script = (request) => {
      if (request.systemPrompt?.startsWith('You are a reviewer')) return text(reviewJson);
      if (isTeammate(request)) return text('VERDICT: DISPUTED\nThe total is 41, not 42.');
      return hasToolResults(request) ? text('The total is 42.') : calls({ id: 'py1', name: 'execute_python', args: { code: 'print(42)' } });
    };
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Total?', config: config() });
    await drain();
    expect((await run(runId)).status).toBe('completed');

    const reviewRunId = await startReviewPass(uid, sessionId, { reviewerIds: ['rv'], targetMessageId: null, trigger: 'manual' });
    await drain();
    expect((await run(reviewRunId!)).status).toBe('completed');
    const [item] = await loadReviewItems(uid, sessionId);
    expect(item).toMatchObject({ id: `review-${reviewRunId}-0-0`, priority: 'P0', status: 'pending', reviewerId: 'rv' });

    const [verifyRunId] = await startVerification(uid, sessionId, [item.id]);
    const verifyRun = await run(verifyRunId);
    expect(verifyRun.kind).toBe('verify');
    const brief = (await runMessageStore(uid, sessionId, verifyRunId).load())[0].content;
    expect(brief).toContain('print(42)');
    expect(brief).toContain('VERDICT: CONFIRMED');
    await drain();

    const [checked] = await loadReviewItems(uid, sessionId);
    expect(checked.verification).toMatchObject({ status: 'done', verdict: 'disputed', verifierName: 'Reviewer' });
    expect(checked.selected).toBe(true);
    const messages = await loadSessionMessages(uid, sessionId);
    expect(messages.find((m) => m.id === `verify-${item.id}-${verifyRunId}`)?.content).toMatch(/^Verified "Check the total": DISPUTED/);
  });

  it('a provider error ends the reviewer pass once, without retrying', async () => {
    script = (request) => (request.systemPrompt?.startsWith('You are a reviewer')
      ? [{ type: 'error', code: 'permission-denied', message: 'Invalid API key' }]
      : text('The total is 42.'));
    await startOperatorTurn({ uid, sessionId, content: 'Total?', config: config() });
    await drain();
    const reviewRunId = await startReviewPass(uid, sessionId, { reviewerIds: ['rv'], targetMessageId: null, trigger: 'manual' });
    await drain();
    expect((await run(reviewRunId!)).status).toBe('error');
    expect(modelCalls.filter((r) => r.systemPrompt?.startsWith('You are a reviewer'))).toHaveLength(1);
    await expect(startReviewPass(uid, sessionId, { reviewerIds: ['rv'], targetMessageId: null, trigger: 'manual' })).resolves.toBeTruthy();
  });

  it('auto-review runs only after a turn that produced a report', async () => {
    script = (request) => (request.systemPrompt?.startsWith('You are a reviewer') ? text(reviewJson) : text('Just chatting.'));
    const { runId } = await startOperatorTurn({ uid, sessionId, content: 'Hi', config: config({ autoReview: true }) });
    await drain();
    expect((await run(runId)).status).toBe('completed');
    const reviews = await getFirestore().collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`).where('kind', '==', 'reviewer').get();
    expect(reviews.empty).toBe(true);

    await runRef(uid, sessionId, runId).update({ reportProduced: true });
    const { afterOperatorCompleted } = await import('../../review/reviewRuns');
    await afterOperatorCompleted(await run(runId));
    await drain();
    const after = await getFirestore().collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`).where('kind', '==', 'reviewer').get();
    expect(after.size).toBe(1);
    // Already reviewed: a second completion doesn't review the same reply again.
    await afterOperatorCompleted(await run(runId));
    const again = await getFirestore().collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`).where('kind', '==', 'reviewer').get();
    expect(again.size).toBe(1);
  });
});
