import { createHash } from 'node:crypto';
import type { Artifact } from '../../contract/types/notebook';
import type { FetchRecord } from '../../engine/fetchRecords';

const mockEvents: string[] = [];
const mockSandbox = {
  writeFile: jest.fn(async () => ({ written: true, environmentReset: false })),
  isAwake: jest.fn(async () => true),
  pause: jest.fn(async () => { mockEvents.push('pause'); }),
};
const mockExecute = jest.fn();
const mockSync = jest.fn(async () => undefined);
const mockRunRef = { update: jest.fn(async () => { mockEvents.push('finish'); }) };
const mockClaim = jest.fn(async () => mockRunRef);
const mockFindSources = jest.fn();
const mockLoadNamed = jest.fn();
const mockSave = jest.fn(async () => undefined);
const mockWriteFetch = jest.fn(async () => 'fetch-new');

jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn(), FieldValue: { delete: jest.fn() } }));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));
jest.mock('../../../cloudPayloadStorage', () => ({
  PAYLOAD_SENTINEL: '__PAYLOAD_OFFLOADED__',
  PAYLOAD_OFFLOAD_THRESHOLD: 900_000,
  estimateDocBytes: () => 0,
  uploadPayloadForUser: jest.fn(),
  downloadPayload: jest.fn(),
  deletePayloadForUser: jest.fn(),
}));
jest.mock('../../../tools', () => ({ refetchServerTool: jest.fn() }));
jest.mock('../../../sandbox/callables', () => ({ getSandboxService: () => mockSandbox }));
jest.mock('../../engine/sandboxBridge', () => ({ createSandboxBridge: () => ({ execute: mockExecute }) }));
jest.mock('../../engine/uploads', () => ({ SessionFilesSync: jest.fn(() => ({ sync: mockSync })) }));
jest.mock('../modelSources', () => ({
  ...jest.requireActual('../modelSources'),
  findModelSources: (...args: unknown[]) => mockFindSources(...args),
}));
jest.mock('../../engine/sessionStore', () => ({
  ...jest.requireActual('../../engine/sessionStore'),
  loadArtifactsNamed: (...args: unknown[]) => mockLoadNamed(...args),
}));
jest.mock('../../engine/fetchRecords', () => ({
  ...jest.requireActual('../../engine/fetchRecords'),
  writeFetchRecord: (...args: unknown[]) => mockWriteFetch(...args),
}));
jest.mock('../runRecipe', () => ({
  ...jest.requireActual('../runRecipe'),
  loadRecipeForRun: async () => ({ recipe, values: { rate: 6 }, sessionKey: 'key' }),
  claimRecipeRun: (...args: unknown[]) => mockClaim(...args),
  saveArtifacts: (...args: unknown[]) => mockSave(...args),
}));

import { buildSourceCopyArtifacts, refreshModelData, type RefreshDataDeps } from '../refreshData';
import { SessionBusyError } from '../../engine/turns';

const b64 = (text: string) => Buffer.from(text).toString('base64');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const recipe = {
  id: 'recipe-1',
  cellId: 'm1',
  sessionId: 's1',
  name: 'mortgage.recipe.py',
  type: 'recipe',
  mimeType: 'text/x-python',
  data: 'PARAMS = {"rate": 6}',
  createdAt: 1,
  metadata: { recipe: { params: [], outputDir: 'mortgage' } },
  provenance: { generator: 'python' },
} as unknown as Artifact;

const OLD = '{"observations":[{"date":"2026-10-08","value":"6.3"}]}';
const NEW = '{"observations":[{"date":"2026-10-15","value":"6.1"}]}';

const fredFile = {
  id: 'artifact-fred-1',
  cellId: 'm1',
  sessionId: 's1',
  name: 'mortgage/fred_mortgage30.json',
  type: 'data',
  mimeType: 'application/json',
  data: b64(OLD),
  createdAt: 1,
  metadata: { artifactDisposition: 'output' },
  provenance: { generator: 'python', sources: [] },
} as unknown as Artifact;

function fetchRecord(id: string, url = 'https://api.stlouisfed.org/fred/series/observations'): FetchRecord {
  return {
    id,
    tool: 'fetch_api',
    request: JSON.stringify({ url, query_params: { series_id: 'MORTGAGE30US' }, api_key_ref: 'fred' }),
    path: '/data/fetch_call_1.json',
    responseHash: sha(OLD),
    fetchedAt: Date.UTC(2026, 9, 12),
    origin: 'run',
  };
}

function source(file = fredFile, record = fetchRecord('fetch-1')) {
  return { file, bytes: Buffer.from(file.data, 'base64'), fetch: record };
}

function results(payment: number) {
  return b64(JSON.stringify(resultsJson(payment)));
}

function resultsJson(payment: number) {
  return { version: 1, kind: 'model_results', values: { rate: 6 }, items: [{ kind: 'metric', label: 'Monthly payment', value: payment }] };
}

const baselineResults = {
  id: 'artifact-results-1',
  cellId: 'm1',
  sessionId: 's1',
  name: 'mortgage/model.json',
  type: 'data',
  mimeType: 'application/json',
  data: results(1500),
  createdAt: 1,
  metadata: {},
  provenance: { generator: 'python' },
} as unknown as Artifact;

let clock = 0;
function deps(response: string | { error: string }): RefreshDataDeps & { refetch: jest.Mock } {
  return {
    now: () => Date.UTC(2026, 9, 19) + (clock += 1),
    newRunId: () => 'recipe_refresh_1',
    refetch: jest.fn(async () => (typeof response === 'string'
      ? { success: true as const, bytes: Buffer.from(response) }
      : { success: false as const, error: response.error })),
  };
}

function finished() {
  return (mockRunRef.update.mock.calls.at(-1) as unknown[] | undefined)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  clock = 0;
  mockFindSources.mockResolvedValue([source()]);
  mockLoadNamed.mockResolvedValue([baselineResults]);
});

describe('refreshModelData', () => {
  it('stops at the fetch when every response matches its copy: no new data, no sandbox, the session never held', async () => {
    const result = await refreshModelData('uid', 's1', 'recipe-1', {}, deps(OLD), { pauseIfWoken: true });
    expect(result).toEqual({ runId: 'recipe_refresh_1', outcome: 'no_change', fetchedAt: Date.UTC(2026, 9, 12), outputArtifactIds: [], stdout: '' });
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockSandbox.writeFile).not.toHaveBeenCalled();
    expect(mockSandbox.isAwake).not.toHaveBeenCalled();
    expect(mockSandbox.pause).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('holds the session only once the data changed: a busy session refuses the run before the sandbox is touched', async () => {
    mockClaim.mockRejectedValueOnce(new SessionBusyError());
    await expect(refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW))).rejects.toThrow(SessionBusyError);
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockSandbox.writeFile).not.toHaveBeenCalled();
  });

  it('runs the model on new data and saves the copy, then the scenario, both marked as a refresh', async () => {
    mockExecute.mockResolvedValue({ success: true, stdout: 'ok', dataOutputs: [{ filename: 'mortgage/model.json', base64: results(1450) }], htmlOutputs: [] });
    const result = await refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW));

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSandbox.writeFile).toHaveBeenCalledTimes(1);
    expect(mockSandbox.writeFile).toHaveBeenCalledWith('uid', 'key', { path: '/output/mortgage/fred_mortgage30.json', base64: b64(NEW) });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [, , [copy, scenario]] = mockSave.mock.calls[0] as unknown as [string, string, Artifact[]];
    const fetchedAt = result.fetchedAt;
    expect(copy).toMatchObject({
      name: 'mortgage/fred_mortgage30.json',
      type: 'data',
      data: b64(NEW),
      metadata: { versionNumber: 2, previousArtifactId: 'artifact-fred-1', dataRefresh: { runId: 'recipe_refresh_1', fetchedAt }, artifactDisposition: 'output' },
    });
    // Marked by the refresh itself: the copy's fetch record is written after the save.
    expect(copy.metadata?.fetchedFrom).toEqual({ endpoint: 'https://api.stlouisfed.org/fred/series/observations', fetchedAt });
    expect(copy.provenance?.sources).toEqual([expect.objectContaining({
      endpoint: 'https://api.stlouisfed.org/fred/series/observations',
      responseHash: sha(NEW),
      fetchedAt: new Date(fetchedAt).toISOString(),
    })]);
    expect(scenario).toMatchObject({
      name: 'mortgage/model.json',
      data: results(1450),
      metadata: { versionNumber: 2, recipeRun: { runId: 'recipe_refresh_1', values: { rate: 6 } }, dataRefresh: { runId: 'recipe_refresh_1', fetchedAt } },
    });
    expect(mockWriteFetch).toHaveBeenCalledWith('uid', 's1', expect.objectContaining({
      origin: 'refresh', responseHash: sha(NEW), path: '/output/mortgage/fred_mortgage30.json', request: fetchRecord('fetch-1').request,
    }));
    expect(result).toMatchObject({ outcome: 'new_data', outputArtifactIds: [copy.id, scenario.id], stdout: 'ok' });
    expect(result.scenario).toEqual({ artifactId: scenario.id, results: resultsJson(1450) });
    expect(finished()).toMatchObject({ status: 'completed', refresh: { outcome: 'new_data', fetchedAt } });
    expect(mockSandbox.pause).not.toHaveBeenCalled();
  });

  it('a watch\'s run marks what it saves, and pauses a sandbox it woke before letting the session go', async () => {
    mockSandbox.isAwake.mockResolvedValueOnce(false);
    mockExecute.mockResolvedValue({ success: true, stdout: '', dataOutputs: [{ filename: 'mortgage/model.json', base64: results(1450) }], htmlOutputs: [] });
    const result = await refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW), { watchId: 'w1', pauseIfWoken: true });
    const [, , [copy, scenario]] = mockSave.mock.calls[0] as unknown as [string, string, Artifact[]];
    expect(copy.metadata?.dataRefresh).toEqual({ runId: 'recipe_refresh_1', fetchedAt: result.fetchedAt, watchId: 'w1' });
    expect(scenario.metadata?.dataRefresh).toEqual({ runId: 'recipe_refresh_1', fetchedAt: result.fetchedAt, watchId: 'w1' });
    expect(mockSandbox.pause).toHaveBeenCalledWith('uid', 'key');
    expect(mockEvents).toEqual(['pause', 'finish']);
  });

  it('a watch\'s run leaves a sandbox that was already awake alone, and pauses one it woke even when the run fails', async () => {
    mockExecute.mockResolvedValue({ success: true, stdout: '', dataOutputs: [{ filename: 'mortgage/model.json', base64: results(1450) }], htmlOutputs: [] });
    await refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW), { watchId: 'w1', pauseIfWoken: true });
    expect(mockSandbox.pause).not.toHaveBeenCalled();

    mockSandbox.isAwake.mockResolvedValueOnce(false);
    mockExecute.mockRejectedValueOnce(new Error('sandbox gone'));
    await expect(refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW), { watchId: 'w1', pauseIfWoken: true })).rejects.toThrow('sandbox gone');
    expect(mockSandbox.pause).toHaveBeenCalledTimes(1);
  });

  it('treats results a scenario already has as no new data, and puts the previous copy back', async () => {
    mockExecute.mockResolvedValue({ success: true, stdout: '', dataOutputs: [{ filename: 'mortgage/model.json', base64: results(1500) }], htmlOutputs: [] });
    const result = await refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW));
    expect(result.outcome).toBe('no_change');
    expect(result.fetchedAt).toBe(Date.UTC(2026, 9, 12));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockWriteFetch).not.toHaveBeenCalled();
    expect((mockSandbox.writeFile.mock.calls as unknown[][]).map((call) => (call[2] as { base64: string }).base64)).toEqual([b64(NEW), b64(OLD)]);
  });

  it('saves nothing when the recipe fails on the new data, and puts the previous copy back', async () => {
    mockExecute.mockResolvedValue({ success: false, stdout: 'reading', error: 'KeyError: value', dataOutputs: [{ filename: 'mortgage/model.json', base64: results(1) }], htmlOutputs: [] });
    const result = await refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW));
    expect(result).toMatchObject({ outcome: 'error', error: 'KeyError: value', stdout: 'reading', outputArtifactIds: [] });
    expect(mockSave).not.toHaveBeenCalled();
    expect((mockSandbox.writeFile.mock.calls as unknown[][]).at(-1)?.[2]).toEqual({ path: '/output/mortgage/fred_mortgage30.json', base64: b64(OLD) });
    expect(finished()).toMatchObject({ status: 'error', refresh: { outcome: 'error' } });
  });

  it('stops with nothing changed when a source can\'t be fetched again, naming where from', async () => {
    const result = await refreshModelData('uid', 's1', 'recipe-1', {}, deps({ error: 'HTTP 503: Service Unavailable' }));
    expect(result).toMatchObject({
      outcome: 'error',
      error: 'https://api.stlouisfed.org/fred/series/observations couldn\'t be fetched again: HTTP 503: Service Unavailable',
    });
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('fetches once for two copies of the same response', async () => {
    const copy = { ...fredFile, id: 'artifact-fred-2', name: 'mortgage/rates.json' } as Artifact;
    mockFindSources.mockResolvedValue([source(), source(copy)]);
    const run = deps(OLD);
    await refreshModelData('uid', 's1', 'recipe-1', {}, run);
    expect(run.refetch).toHaveBeenCalledTimes(1);
  });

  it('puts the previous copy back when the run itself throws', async () => {
    mockExecute.mockRejectedValue(new Error('sandbox gone'));
    await expect(refreshModelData('uid', 's1', 'recipe-1', {}, deps(NEW))).rejects.toThrow('sandbox gone');
    expect((mockSandbox.writeFile.mock.calls as unknown[][]).at(-1)?.[2]).toEqual({ path: '/output/mortgage/fred_mortgage30.json', base64: b64(OLD) });
    expect(finished()).toMatchObject({ status: 'error', error: 'sandbox gone' });
  });
});

describe('buildSourceCopyArtifacts', () => {
  it('keeps a text file as text and reads a CSV\'s rows', () => {
    const csv = { ...fredFile, name: 'mortgage/rates.csv', type: 'dataset', mimeType: 'text/csv', data: b64('date,rate\n2026-10-08,6.3\n') } as Artifact;
    const page = { ...fredFile, name: 'mortgage/page.html', type: 'html', mimeType: 'text/html', data: '<p>old</p>' } as Artifact;
    const provenance = { tool: 'fetch_url', endpoint: 'https://example.org/', method: 'GET', parameters: {}, parameterHash: 'p', fetchedAt: 'now', responseHash: 'h', cacheStatus: 'fresh' } as const;
    const [table, html] = buildSourceCopyArtifacts({
      sessionId: 's1',
      runId: 'r1',
      fetchedAt: 9,
      copies: [
        { file: csv, bytes: Buffer.from('date,rate\n2026-10-08,6.3\n2026-10-15,6.1\n'), endpoint: 'https://example.org/rates', provenance },
        { file: page, bytes: Buffer.from('<p>new</p>'), endpoint: 'https://example.org/', provenance },
      ],
    });
    expect(table.metadata).toMatchObject({ rowCount: 2, columnCount: 2 });
    expect(html.data).toBe('<p>new</p>');
    expect(html.metadata?.fileSize).toBe(10);
    expect(table.metadata?.fetchedFrom).toEqual({ endpoint: 'https://example.org/rates', fetchedAt: 9 });
  });
});
