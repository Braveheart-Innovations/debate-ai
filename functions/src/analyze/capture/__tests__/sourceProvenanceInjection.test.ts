/** Ported from symposium-ai-web src/services/analyze/artifacts/__tests__/sourceProvenanceInjection.test.ts (Phase 3), logic unchanged. */
import { injectSourceProvenance } from '../sourceProvenanceInjection';
import type { AnalysisArtifactSpecV1, AnalysisArtifactSource } from '../../contract/types/analysis-artifact-spec';
import type { ToolResultProvenance } from '../../contract/types';

function prov(overrides: Partial<ToolResultProvenance> = {}): ToolResultProvenance {
  return {
    tool: 'fetch_api',
    endpoint: 'https://api.example.com/v1/series',
    method: 'GET',
    parameters: {},
    parameterHash: 'phash',
    fetchedAt: '2026-06-24T10:00:00Z',
    responseHash: 'rhash',
    cacheStatus: 'fresh',
    ...overrides,
  };
}

function spec(sources: AnalysisArtifactSource[]): AnalysisArtifactSpecV1 {
  return { version: 1, kind: 'analysis_artifact_spec', title: 'T', summary: 'S', pages: [], sources };
}

const KEY = 'NmKJ6sZfBMqVFq5t4YqI4sMO';
const KEY2 = 'Uglajlz5hLk14x69F9gVLDeU';

describe('injectSourceProvenance', () => {
  it('bakes verifiable provenance and fills retrievedAt by matching the filename-embedded key', () => {
    const out = injectSourceProvenance(
      spec([{ id: 'S1', label: 'X', sourceArtifactId: `fetch_call_${KEY}.json` }]),
      new Map([[KEY, prov()]]),
    );
    expect(out.sources![0].provenance).toEqual([{
      endpoint: 'https://api.example.com/v1/series',
      method: 'GET',
      fetchedAt: '2026-06-24T10:00:00Z',
      cacheStatus: 'fresh',
      responseHash: 'rhash',
      parameterHash: 'phash',
    }]);
    expect(out.sources![0].retrievedAt).toBe('2026-06-24T10:00:00Z');
  });

  it('is agnostic to the filename convention — any filename embedding the key matches', () => {
    const out = injectSourceProvenance(
      spec([{ id: 'S1', label: 'X', sourceArtifactId: `data/${KEY}-raw.json` }]),
      new Map([[KEY, prov()]]),
    );
    expect(out.sources![0].provenance).toHaveLength(1);
  });

  it('resolves each source to its own fetch independently', () => {
    const out = injectSourceProvenance(
      spec([
        { id: 'S1', label: 'A', sourceArtifactId: `fetch_call_${KEY}.json` },
        { id: 'S2', label: 'B', sourceArtifactId: `fetch_call_${KEY2}.json` },
      ]),
      new Map([
        [KEY, prov({ endpoint: 'https://a.example/x' })],
        [KEY2, prov({ endpoint: 'https://b.example/y', fetchedAt: '2026-06-24T09:00:00Z' })],
      ]),
    );
    expect(out.sources![0].provenance![0].endpoint).toBe('https://a.example/x');
    expect(out.sources![1].provenance![0].endpoint).toBe('https://b.example/y');
    expect(out.sources![1].retrievedAt).toBe('2026-06-24T09:00:00Z');
  });

  it('prefers a model-authored retrievedAt over the fetch time', () => {
    const out = injectSourceProvenance(
      spec([{ id: 'S1', label: 'X', retrievedAt: '2026-01-01T00:00:00Z', sourceArtifactId: `fetch_call_${KEY}.json` }]),
      new Map([[KEY, prov()]]),
    );
    expect(out.sources![0].retrievedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('leaves an unmatched source untouched and returns the same spec reference', () => {
    const input = spec([{ id: 'S1', label: 'X', sourceArtifactId: 'fetch_call_OTHERFILEKEY999.json' }]);
    expect(injectSourceProvenance(input, new Map([[KEY, prov()]]))).toBe(input);
  });

  it('no-ops on empty map, no sources, or no sourceArtifactId', () => {
    const noKey = spec([{ id: 'S1', label: 'X' }]);
    expect(injectSourceProvenance(noKey, new Map([[KEY, prov()]]))).toBe(noKey);
    const withRef = spec([{ id: 'S1', label: 'X', sourceArtifactId: `fetch_call_${KEY}.json` }]);
    expect(injectSourceProvenance(withRef, new Map())).toBe(withRef);
  });

  it('ignores keys too short to be a real tool-call id (anti-spurious-match)', () => {
    const out = injectSourceProvenance(
      spec([{ id: 'S1', label: 'X', sourceArtifactId: 'fetch_call_GETxyz.json' }]),
      new Map([['GET', prov()]]),
    );
    expect(out.sources![0].provenance).toBeUndefined();
  });
});
