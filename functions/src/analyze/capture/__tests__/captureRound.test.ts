import type { Message } from '../../contract/types';
import type { ToolCall, ToolResult } from '../../contract/lib/ai/tools/types';
import type { Artifact } from '../../contract/types/notebook';
import { encodeUtf8ToBase64 } from '../../contract/lib/encoding/utf8Base64';

// --- mocks -------------------------------------------------------------------
let storedArtifacts: Array<Artifact & { payloadRefs?: unknown }> = [];
let storedMessages: Message[] = [];
const artifactWrites = new Map<string, Record<string, unknown>>();
const batchOps: Array<{ op: string; path: string; data?: Record<string, unknown> }> = [];
const deletedPayloads: unknown[] = [];
let sandboxFiles = new Map<string, Buffer>();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    batch: () => ({
      delete: (ref: { path: string }) => batchOps.push({ op: 'delete', path: ref.path }),
      set: (ref: { path: string }, data: Record<string, unknown>) => batchOps.push({ op: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) => batchOps.push({ op: 'update', path: ref.path, data }),
      commit: async () => undefined,
    }),
  }),
}));

const savedTraces = new Map<string, string>();
jest.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({ save: async (text: string) => { savedTraces.set(path, text); } }),
    }),
  }),
}));

jest.mock('../../engine/sessionStore', () => ({
  artifactRef: (_uid: string, _sid: string, id: string) => ({
    path: `artifacts/${id}`,
    set: async (data: Record<string, unknown>) => { artifactWrites.set(id, data); },
  }),
  messageRef: (_uid: string, _sid: string, id: string) => ({ path: `messages/${id}` }),
  loadSessionArtifacts: jest.fn(async () => storedArtifacts.map((a) => ({ ...a }))),
  loadSessionMessages: jest.fn(async () => storedMessages.map((m) => ({ ...m }))),
  prepareArtifactRecord: async (_uid: string, _sid: string, artifact: Artifact) => ({ ...artifact }),
  prepareMessageRecord: async (_uid: string, _sid: string, message: Message) => ({ ...message }),
  deleteArtifactPayloads: async (_uid: string, refs: unknown) => { if (refs) deletedPayloads.push(refs); },
  removeUndefined: <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T,
}));

jest.mock('../../engine/sandboxBridge', () => ({
  readWholeFile: jest.fn(async (_uid: string, _key: string, path: string) => {
    const file = sandboxFiles.get(path);
    if (!file) throw new Error('File not found');
    return file;
  }),
}));

jest.mock('../../../sandbox/callables', () => ({
  getSandboxService: () => ({
    writeFile: async (_uid: string, _key: string, input: { path: string; base64: string }) => {
      sandboxFiles.set(input.path, Buffer.from(input.base64, 'base64'));
      return { written: true, environmentReset: false };
    },
  }),
}));

import { CaptureSession, WORKBOOK_STATE_PATH } from '../captureRound';
import type { AnalyzeRunDoc } from '../../engine/runStore';

// --- helpers -----------------------------------------------------------------
const csv = 'year,gdp\n2020,21000\n2021,23000';
const pythonCall = (id: string): ToolCall => ({ id, type: 'function', function: { name: 'execute_python', arguments: '{"code":"print(1)"}' } });

function makeRun(overrides: Partial<AnalyzeRunDoc> = {}): AnalyzeRunDoc {
  return {
    runId: 'run1', uid: 'u', sessionId: 's', kind: 'operator', status: 'running', round: 0,
    config: {
      provider: 'claude', model: 'claude-sonnet-5-5', aiId: 'ai', aiName: 'Claude', systemPrompt: '', toolNames: [],
      sandboxSessionKey: 'k',
      outputSelection: { mode: 'portable', rich: { type: null, documentPreset: 'auto', packages: [] }, portable: { formats: ['csv'] } },
    },
    userMessageId: 'u1', eventSeq: 0, createdAt: 0, updatedAt: 0,
    ...overrides,
  } as AnalyzeRunDoc;
}

function makeSession(run = makeRun()) {
  return new CaptureSession({ uid: 'u', sessionId: 's', run, runRef: { path: 'runs/run1' } as never, now: () => 1000 });
}

function aiMessage(id: string, calls: ToolCall[]): Message {
  return { id, sender: 'Claude', senderType: 'ai', content: 'Working.', timestamp: 2, metadata: { toolCalls: calls } };
}

function csvResult(id: string, filename = 'gdp.csv', body = csv): ToolResult {
  return {
    toolCallId: id, success: true, content: 'Executed.',
    dataOutputs: [{ filename, base64: encodeUtf8ToBase64(body), size: body.length }],
    metadata: { fullStdout: 'full stdout' },
  } as ToolResult;
}

beforeEach(() => {
  storedArtifacts = [];
  storedMessages = [{ id: 'u1', sender: 'You', senderType: 'user', content: 'Analyze GDP', timestamp: 1 }];
  artifactWrites.clear();
  batchOps.length = 0;
  deletedPayloads.length = 0;
  sandboxFiles = new Map();
  savedTraces.clear();
});

// --- tests -------------------------------------------------------------------
describe('CaptureSession.capture', () => {
  it('writes the captured artifacts with round-derived ids, then the message and run state in one batch', async () => {
    const message = aiMessage('run1_r0', [pythonCall('c1')]);
    storedMessages.push(message);

    await makeSession().capture({ message, toolCalls: [pythonCall('c1')], results: [csvResult('c1')] });

    expect([...artifactWrites.keys()]).toEqual(['artifact-data-run1_r0-0-0', 'artifact-session-workbook-s']);
    expect(artifactWrites.get('artifact-data-run1_r0-0-0')).toMatchObject({ type: 'dataset', name: 'gdp.csv', cellId: 'run1_r0', createdAt: 1000 });

    const messageWrite = batchOps.find((op) => op.op === 'set');
    expect(messageWrite?.path).toBe('messages/run1_r0');
    // The commit marker: toolExecutionResults, with payloads stripped and the full stdout as content.
    expect(messageWrite?.data?.metadata).toMatchObject({
      toolCalls: [expect.objectContaining({ id: 'c1' })],
      toolExecutionResults: [expect.objectContaining({
        toolName: 'execute_python', content: 'full stdout', dataOutputs: [{ filename: 'gdp.csv', base64: '', size: csv.length }],
      })],
    });
    expect(batchOps.find((op) => op.op === 'update')?.data).toMatchObject({ fetchProvenanceJson: '{}' });
  });

  it('saves the session workbook state to the sandbox and continues it in a later step', async () => {
    const first = aiMessage('run1_r0', [pythonCall('c1')]);
    storedMessages.push(first);
    await makeSession().capture({ message: first, toolCalls: [pythonCall('c1')], results: [csvResult('c1')] });
    const saved = JSON.parse(sandboxFiles.get(WORKBOOK_STATE_PATH)!.toString('utf8'));
    expect(saved.dataTabs.map((tab: { name: string }) => tab.name)).toEqual(['gdp']);

    // A new step (fresh session) picks the workbook up from the sandbox.
    storedArtifacts = [...artifactWrites.values()] as unknown as Artifact[];
    const second = aiMessage('run1_r1', [pythonCall('c2')]);
    storedMessages.push(second);
    await makeSession().capture({ message: second, toolCalls: [pythonCall('c2')], results: [csvResult('c2', 'population.csv', 'year,people\n2020,38\n2021,38.2')] });
    const resaved = JSON.parse(sandboxFiles.get(WORKBOOK_STATE_PATH)!.toString('utf8'));
    expect(resaved.dataTabs.map((tab: { name: string }) => tab.name)).toEqual(['gdp', 'population']);
  });

  it('deletes stored artifacts the pipeline removed, in the batch, and their offloaded payloads after', async () => {
    // A prior turn's same-name CSV is superseded when this round produces a report spec.
    storedArtifacts = [{
      id: 'old-csv', cellId: 'earlier', sessionId: 's', name: 'gdp.csv', type: 'dataset', mimeType: 'text/csv',
      data: encodeUtf8ToBase64('year,gdp\n2019,20000'), createdAt: 1, payloadRefs: { data: { path: 'p' } },
    } as never];
    const spec = {
      version: 1,
      kind: 'analysis_artifact_spec',
      title: 'GDP Brief',
      summary: 'GDP grew [S1].',
      pages: [{ slug: 'overview', title: 'Overview', blocks: [{ kind: 'markdown', markdown: 'GDP grew [S1].' }] }],
      sources: [{ id: 'S1', label: 'World Bank' }],
    };
    const message = aiMessage('run1_r0', [pythonCall('c1')]);
    storedMessages.push(message);
    const result = csvResult('c1');
    result.dataOutputs!.push({ filename: 'report.json', base64: encodeUtf8ToBase64(JSON.stringify(spec)), size: 10 });

    await makeSession(makeRun({ config: { ...makeRun().config, outputSelection: { mode: 'rich', rich: { type: 'single_page_html', documentPreset: 'auto', packages: [] }, portable: { formats: [] } } } })).capture({
      message, toolCalls: [pythonCall('c1')], results: [result],
    });

    expect(batchOps.filter((op) => op.op === 'delete').map((op) => op.path)).toEqual(['artifacts/old-csv']);
    expect(deletedPayloads).toEqual([{ data: { path: 'p' } }]);
    expect([...artifactWrites.values()].some((a) => a.type === 'analysis_artifact_spec')).toBe(true);
    expect(batchOps.find((op) => op.op === 'update')?.data).toMatchObject({ reportProduced: true });
  });

  it('re-captures a crashed round as if its partial writes never happened, and removes what the re-run does not produce', async () => {
    const message = aiMessage('run1_r0', [pythonCall('c1')]);
    storedMessages.push(message);
    // A crashed attempt left one of this round's artifacts plus a stray one.
    storedArtifacts = [
      { id: 'artifact-data-run1_r0-0-0', cellId: 'run1_r0', sessionId: 's', name: 'gdp.csv', type: 'dataset', mimeType: 'text/csv', data: encodeUtf8ToBase64(csv), createdAt: 1 },
      { id: 'artifact-stray', cellId: 'run1_r0', sessionId: 's', name: 'stray.txt', type: 'data', mimeType: 'text/plain', data: 'eA==', createdAt: 1 },
    ] as Artifact[];

    await makeSession().capture({ message, toolCalls: [pythonCall('c1')], results: [csvResult('c1')] });

    // Not treated as a duplicate of itself: rewritten under the same id, with no lineage to its own partial copy.
    expect(artifactWrites.get('artifact-data-run1_r0-0-0')).toBeDefined();
    expect((artifactWrites.get('artifact-data-run1_r0-0-0')!.metadata as Record<string, unknown>).previousArtifactId).toBeUndefined();
    expect(batchOps.filter((op) => op.op === 'delete').map((op) => op.path)).toEqual(['artifacts/artifact-stray']);
  });

  it('records an org-evidence request on the run', async () => {
    const call: ToolCall = {
      id: 'c-ev', type: 'function',
      function: { name: 'request_salesforce_org_evidence', arguments: JSON.stringify({ reason: 'Need org data', unverified_claims: ['A'], investigation_prompt: 'Check X' }) },
    };
    const message = aiMessage('run1_r0', [call]);
    storedMessages.push(message);

    await makeSession().capture({ message, toolCalls: [call], results: [{ toolCallId: 'c-ev', success: true, content: 'ok' }] });

    expect(batchOps.find((op) => op.op === 'update')?.data).toMatchObject({
      pendingOrgEvidenceRequest: { id: 'c-ev', requestedAt: 1000, reason: 'Need org data', unverifiedClaims: ['A'], investigationPrompt: 'Check X' },
    });
  });

  it('carries fetch provenance across rounds through the run doc', async () => {
    const fetchCall: ToolCall = { id: 'call-f1', type: 'function', function: { name: 'fetch_api', arguments: '{}' } };
    const provenance = {
      tool: 'fetch_api', endpoint: 'https://api.example.com/x', method: 'GET', parameters: {}, parameterHash: 'h', fetchedAt: '2026-10-09T00:00:00Z', responseHash: 'r',
    };
    const message = aiMessage('run1_r0', [fetchCall]);
    storedMessages.push(message);

    await makeSession().capture({ message, toolCalls: [fetchCall], results: [{ toolCallId: 'call-f1', success: true, content: 'ok', provenance } as ToolResult] });

    const saved = JSON.parse(batchOps.find((op) => op.op === 'update')!.data!.fetchProvenanceJson as string);
    expect(saved).toEqual({ call_f1: provenance });
  });

  it('saves a trace of the inputs and what was committed when the run asks for one', async () => {
    const message = aiMessage('run1_r0', [pythonCall('c1')]);
    storedMessages.push(message);
    const run = makeRun({ config: { ...makeRun().config, captureTrace: true } });

    await makeSession(run).capture({ message, toolCalls: [pythonCall('c1')], results: [csvResult('c1')] });

    const trace = JSON.parse(savedTraces.get('analyzeScratch/captureTraces/u/s/run1/run1_r0.json')!);
    expect(trace).toMatchObject({ version: 1, messageId: 'run1_r0', now: 1000 });
    expect(trace.event.toolExecutionResults[0].dataOutputs[0].base64).toBe(encodeUtf8ToBase64(csv));
    expect(trace.state.workbook.dataTabs).toEqual([]);
    expect(trace.output.upserts.map((a: Artifact) => a.id)).toEqual([...artifactWrites.keys()]);
    expect(trace.output.persistedMessage.metadata.toolExecutionResults).toHaveLength(1);
  });

  it('saves no trace by default', async () => {
    const message = aiMessage('run1_r0', [pythonCall('c1')]);
    storedMessages.push(message);
    await makeSession().capture({ message, toolCalls: [pythonCall('c1')], results: [csvResult('c1')] });
    expect(savedTraces.size).toBe(0);
  });
});
