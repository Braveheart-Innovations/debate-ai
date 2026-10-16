/**
 * App-side Salesforce docs passages on report sources (2.9.5), NOT
 * model-authored: a source whose url is a page the session's docs lookups read
 * gets that page's passages, baked in at capture like fetch provenance, so the
 * Sources view can show what the AI read. A docsRead the model wrote itself is
 * dropped.
 */
import type { AnalysisArtifactSource, AnalysisArtifactSpecV1 } from '../contract/types/analysis-artifact-spec';
import type { SalesforceDocQuotedPage } from '../engine/tools/executeSalesforceDocsLookupTool';
import { salesforcePageKey } from '../engine/tools/salesforceGroundingCheck';

export function injectDocsRead(
  spec: AnalysisArtifactSpecV1,
  pagesRead: Map<string, SalesforceDocQuotedPage>,
): AnalysisArtifactSpecV1 {
  if (!spec.sources?.length) return spec;
  let changed = false;
  const sources = spec.sources.map((source): AnalysisArtifactSource => {
    const key = source.url ? salesforcePageKey(source.url) : null;
    const page = key ? pagesRead.get(key) : undefined;
    if (!page) {
      if (!source.docsRead) return source;
      changed = true;
      const { docsRead: _unbacked, ...rest } = source;
      return rest;
    }
    changed = true;
    return {
      ...source,
      docsRead: {
        citationId: page.citationId,
        title: page.title,
        ...(page.releaseLabel ? { releaseLabel: page.releaseLabel } : {}),
        passages: page.passages,
      },
    };
  });
  return changed ? { ...spec, sources } : spec;
}
