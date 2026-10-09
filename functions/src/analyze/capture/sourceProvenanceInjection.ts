/** Ported from symposium-ai-web src/services/analyze/artifacts/sourceProvenanceInjection.ts (Phase 3), logic unchanged. */
import type {
  AnalysisArtifactSpecV1,
  AnalysisArtifactSource,
  AnalysisArtifactSourceFetch,
} from '../contract/types/analysis-artifact-spec';
import type { ToolResultProvenance } from '../contract/types';

/**
 * App-side provenance injection (NOT model-authored).
 *
 * The verifiable fetch provenance for a run lives only in the fetch-provenance
 * map (keyed by the sanitized tool-call id), available at spec-creation time —
 * the `/data` fetch files are never session artifacts, so there is nothing to
 * resolve against at render time. We therefore bake each source's provenance
 * INTO the spec when it's created, so it survives to render and export.
 *
 * The bridge from a model-authored `source.sourceArtifactId` (the `/data`
 * filename) to a provenance record is purely structural: the filename embeds
 * the provenance key. We match by substring on the key with NO assumption about
 * the filename convention or the API provider/endpoint — works for any fetch.
 */

// Tool-call ids are long random strings; require a non-trivial key length so a
// short key can't spuriously substring-match an unrelated filename.
const MIN_KEY_LENGTH = 8;

function toSourceFetch(provenance: ToolResultProvenance): AnalysisArtifactSourceFetch {
  return {
    endpoint: provenance.endpoint,
    method: provenance.method,
    fetchedAt: provenance.fetchedAt,
    cacheStatus: provenance.cacheStatus,
    responseHash: provenance.responseHash,
    ...(provenance.parameterHash ? { parameterHash: provenance.parameterHash } : {}),
    ...(provenance.connectorId ? { connectorId: provenance.connectorId } : {}),
  };
}

/**
 * Returns the spec with each source enriched by its verifiable fetch provenance
 * (and `retrievedAt` filled from the earliest backing fetch when the model
 * omitted it). Pure; returns the same reference when nothing matched.
 */
export function injectSourceProvenance(
  spec: AnalysisArtifactSpecV1,
  fetchProvenance: Map<string, ToolResultProvenance>,
): AnalysisArtifactSpecV1 {
  if (!spec.sources?.length || fetchProvenance.size === 0) return spec;

  const entries = [...fetchProvenance.entries()].filter(([key]) => key.length >= MIN_KEY_LENGTH);
  if (entries.length === 0) return spec;

  let changed = false;
  const sources = spec.sources.map((source): AnalysisArtifactSource => {
    const ref = source.sourceArtifactId;
    if (!ref) return source;

    const fetches = entries
      .filter(([key]) => ref.includes(key))
      .map(([, provenance]) => provenance);
    if (fetches.length === 0) return source;

    changed = true;
    const earliestFetchedAt = fetches
      .map((fetch) => fetch.fetchedAt)
      .filter(Boolean)
      .sort()[0];

    return {
      ...source,
      retrievedAt: source.retrievedAt ?? earliestFetchedAt,
      provenance: fetches.map(toSourceFetch),
    };
  });

  return changed ? { ...spec, sources } : spec;
}
