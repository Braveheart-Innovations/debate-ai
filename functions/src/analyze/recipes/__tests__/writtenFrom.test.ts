import type { ToolCall, ToolResult } from '../../contract/lib/ai/tools/types';
import type { Artifact } from '../../contract/types/notebook';
import { modelDataFetchedAt, modelsNamedInRound, stampWrittenFrom } from '../writtenFrom';

const NOW = 5_000;

function artifact(id: string, name: string, type: Artifact['type'], metadata: Record<string, unknown> = {}, createdAt = 1): Artifact {
  return { id, cellId: 'c1', sessionId: 's1', name, type, mimeType: 'application/json', data: '{}', createdAt, metadata } as unknown as Artifact;
}

const recipe = (name = 'retail.recipe.py', metadata: Record<string, unknown> = {}) => artifact(`r-${name}`, name, 'recipe' as Artifact['type'], metadata);
const report = (id: string, metadata: Record<string, unknown> = {}) => artifact(id, 'report.json', 'analysis_artifact_spec' as Artifact['type'], metadata);

function call(code: string, name = 'execute_python'): ToolCall {
  return { id: `call-${code.length}`, type: 'function', function: { name, arguments: JSON.stringify({ code }) } } as ToolCall;
}

const ok = { success: true } as ToolResult;
const failed = { success: false } as ToolResult;

describe('modelsNamedInRound', () => {
  const session = [recipe(), recipe('data.recipe.py')];

  it('names a model whose recipe or folder the code names', () => {
    expect(modelsNamedInRound([call('run_recipe("/output/retail.recipe.py", horizon=12)')], [ok], session)).toEqual(['retail.recipe.py']);
    expect(modelsNamedInRound([call("pd.read_json('/output/retail/model.json')")], [ok], session)).toEqual(['retail.recipe.py']);
    expect(modelsNamedInRound([call("run_recipe('retail.recipe.py')")], [ok], session)).toEqual(['retail.recipe.py']);
  });

  it('needs the folder with its /output prefix: the sandbox has its own /data', () => {
    expect(modelsNamedInRound([call("pd.read_json('/data/fred.json')")], [ok], session)).toEqual([]);
    expect(modelsNamedInRound([call("open('/output/data/rates.csv')")], [ok], session)).toEqual(['data.recipe.py']);
  });

  it('skips calls that failed and tools that run no code', () => {
    expect(modelsNamedInRound([call('run_recipe("/output/retail.recipe.py")')], [failed], session)).toEqual([]);
    expect(modelsNamedInRound([call('/output/retail/model.json', 'fetch_api')], [ok], session)).toEqual([]);
  });
});

describe('modelDataFetchedAt', () => {
  it('is the newest mark on the latest version of each of the folder\'s files', () => {
    const files = [
      artifact('a1', 'retail/obs.json', 'data', { fetchedFrom: { endpoint: 'https://x/obs', fetchedAt: 100 }, versionNumber: 1 }),
      artifact('a2', 'retail/obs.json', 'data', { fetchedFrom: { endpoint: 'https://x/obs', fetchedAt: 300 }, versionNumber: 2 }),
      artifact('b1', 'retail/assumptions.csv', 'data', { fetchedFrom: null }),
      artifact('m1', 'retail/model.json', 'data', { fetchedFrom: { endpoint: 'https://x/other', fetchedAt: 900 } }),
    ];
    expect(modelDataFetchedAt('retail', files)).toBe(300);
  });

  it('is undefined when no file is marked', () => {
    expect(modelDataFetchedAt('retail', [artifact('a1', 'retail/obs.json', 'data')])).toBeUndefined();
  });
});

describe('stampWrittenFrom', () => {
  const obs = artifact('a1', 'retail/obs.json', 'data', { fetchedFrom: { endpoint: 'https://x/obs', fetchedAt: 100 } });

  it('gives a report the models its turn named, with their data\'s fetch time', () => {
    const r1 = report('rep1');
    const [stamped] = stampWrittenFrom([r1], [recipe(), obs, r1], 'turn1', ['retail.recipe.py'], NOW);
    expect(stamped.metadata?.writtenFrom).toEqual([{ recipeName: 'retail.recipe.py', fetchedAt: 100, writtenAt: NOW }]);
  });

  it('counts a model whose results the turn saved, and leaves out fetchedAt when nothing is marked', () => {
    const r1 = report('rep1');
    const results = artifact('m1', 'retail/model.json', 'data', { turnId: 'turn1' });
    const [stamped] = stampWrittenFrom([r1], [recipe(), results, r1], 'turn1', [], NOW);
    expect(stamped.metadata?.writtenFrom).toEqual([{ recipeName: 'retail.recipe.py', writtenAt: NOW }]);
  });

  it('keeps the previous version\'s list in a turn that used no model (a wording fix)', () => {
    const v1 = report('rep1', { writtenFrom: [{ recipeName: 'retail.recipe.py', fetchedAt: 100, writtenAt: 10 }] });
    const v2 = report('rep2', { previousArtifactId: 'rep1', lineageRootId: 'rep1', versionNumber: 2 });
    const [stamped] = stampWrittenFrom([v2], [recipe(), obs, v1, v2], 'turn2', [], NOW);
    expect(stamped.metadata?.writtenFrom).toEqual([{ recipeName: 'retail.recipe.py', fetchedAt: 100, writtenAt: 10 }]);
  });

  it('replaces the entry of a model the turn used and keeps the others', () => {
    const other = { recipeName: 'rates.recipe.py', fetchedAt: 50, writtenAt: 10 };
    const v1 = report('rep1', { writtenFrom: [{ recipeName: 'retail.recipe.py', fetchedAt: 100, writtenAt: 10 }, other] });
    const v2 = report('rep2', { previousArtifactId: 'rep1' });
    const refreshed = artifact('a2', 'retail/obs.json', 'data', { fetchedFrom: { endpoint: 'https://x/obs', fetchedAt: 400 }, versionNumber: 2 });
    const [stamped] = stampWrittenFrom([v2], [recipe(), obs, refreshed, v1, v2], 'turn2', ['retail.recipe.py'], NOW);
    expect(stamped.metadata?.writtenFrom).toEqual([other, { recipeName: 'retail.recipe.py', fetchedAt: 400, writtenAt: NOW }]);
  });

  it('marks a first version on no model as resting on none, and leaves an older report\'s next version unknown', () => {
    const first = report('rep1');
    expect(stampWrittenFrom([first], [first], 'turn1', [], NOW)[0].metadata?.writtenFrom).toEqual([]);
    const old = report('old1');
    const next = report('old2', { previousArtifactId: 'old1' });
    expect(stampWrittenFrom([next], [old, next], 'turn2', [], NOW)[0].metadata?.writtenFrom).toBeUndefined();
  });

  it('leaves what isn\'t a report alone', () => {
    const saved = [obs];
    expect(stampWrittenFrom(saved, [recipe(), obs], 'turn1', ['retail.recipe.py'], NOW)).toBe(saved);
  });
});
