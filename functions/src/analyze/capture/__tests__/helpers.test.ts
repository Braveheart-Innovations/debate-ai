/** Ported from symposium-ai-web src/context/analyze/__tests__/helpers.test.ts (Phase 3): the capture helpers' cases, unchanged. */
import { classifyHtmlLikeArtifact, injectProvenanceSourcesSection } from '../helpers';
import type { ToolResultProvenance } from '../../contract/types';
import type { AnalyzeOutputSelection } from '../../contract/types/analyze';

const STATIC_REPORT_HTML = '<!doctype html><html><body><main><h1>Report</h1><p>Findings are summarized here.</p></main></body></html>';
const SCRIPT_HTML = '<!doctype html><html><body><h1>Report</h1><script>console.log("ok")</script></body></html>';
const UNSAFE_HTML = '<!doctype html><html><body><script src="https://cdn.example.com/lib.js"></script></body></html>';
const PROVENANCE_SOURCES: ToolResultProvenance[] = [
  {
    tool: 'fetch_api',
    connectorId: 'fred',
    endpoint: 'https://api.stlouisfed.org/fred/series/observations',
    method: 'GET',
    parameters: { series_id: 'CPIAUCSL' },
    parameterHash: 'abc123',
    fetchedAt: '2026-02-19T00:00:00.000Z',
    responseHash: 'resp123',
    cacheStatus: 'fresh',
  },
];
const HTML_WITH_REFERENCES = '<!doctype html><html><body><p>Inflation softened [1].</p><h2>References</h2><ol><li>FRED CPI</li></ol></body></html>';

const RICH_LINKED_SELECTION: AnalyzeOutputSelection = {
  mode: 'rich',
  rich: {
    type: 'linked_mini_website',
    documentPreset: 'general_report',
    packages: [],
  },
  portable: {
    formats: [],
  },
};

const RICH_SINGLE_PAGE_SELECTION: AnalyzeOutputSelection = {
  mode: 'rich',
  rich: {
    type: 'single_page_html',
    documentPreset: 'general_report',
    packages: ['plotly'],
  },
  portable: {
    formats: [],
  },
};

const PORTABLE_SELECTION: AnalyzeOutputSelection = {
  mode: 'portable',
  rich: {
    type: 'linked_mini_website',
    documentPreset: 'general_report',
    packages: [],
  },
  portable: {
    formats: ['pdf'],
  },
};

describe('classifyHtmlLikeArtifact', () => {
  it('marks rich semantic HTML without runtime signatures as a static report', () => {
    const result = classifyHtmlLikeArtifact('html', STATIC_REPORT_HTML, RICH_LINKED_SELECTION);

    expect(result.profile).toBe('SESSION_STATIC_REPORT');
    expect(result.policyReport.violations.filter(v => v.severity === 'error')).toHaveLength(0);
  });

  it('marks rich script/runtime HTML as session-interactive', () => {
    const scriptResult = classifyHtmlLikeArtifact('html', SCRIPT_HTML, RICH_LINKED_SELECTION);
    const plotlyResult = classifyHtmlLikeArtifact('html', '<div class="plotly-graph-div"></div>', RICH_SINGLE_PAGE_SELECTION);
    const foliumResult = classifyHtmlLikeArtifact('html', '<div class="folium-map"></div>', RICH_SINGLE_PAGE_SELECTION);

    expect(scriptResult.profile).toBe('SESSION_INTERACTIVE');
    expect(plotlyResult.profile).toBe('SESSION_INTERACTIVE');
    expect(foliumResult.profile).toBe('SESSION_INTERACTIVE');
    expect(scriptResult.policyReport.violations.filter(v => v.severity === 'error')).toHaveLength(0);
  });

  it('marks portable mode HTML as archive-portable when policy-safe', () => {
    const result = classifyHtmlLikeArtifact('html', SCRIPT_HTML, PORTABLE_SELECTION);

    expect(result.profile).toBe('ARCHIVE_PORTABLE');
    expect(result.policyReport.violations.filter(v => v.severity === 'error')).toHaveLength(0);
  });

  it('marks portable mode HTML as session-interactive when policy has errors', () => {
    const result = classifyHtmlLikeArtifact('html', UNSAFE_HTML, PORTABLE_SELECTION);

    expect(result.profile).toBe('SESSION_INTERACTIVE');
    expect(result.policyReport.violations.some(v => v.rule === 'no-external-script')).toBe(true);
  });

  it('does not flag portable-only external script/css rules in rich mode', () => {
    const result = classifyHtmlLikeArtifact('html', UNSAFE_HTML, RICH_LINKED_SELECTION);

    expect(result.profile).toBe('SESSION_INTERACTIVE');
    expect(result.policyReport.violations.some(v => v.rule === 'no-external-script')).toBe(false);
    expect(result.policyReport.violations.some(v => v.rule === 'no-external-css')).toBe(false);
  });

  it('requires references for portable HTML when fetched provenance exists', () => {
    const result = classifyHtmlLikeArtifact('html', STATIC_REPORT_HTML, PORTABLE_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });

    expect(result.profile).toBe('SESSION_INTERACTIVE');
    expect(result.policyReport.violations.some(v => v.rule === 'missing-provenance-references' && v.severity === 'error')).toBe(true);
  });

  it('keeps portable HTML archive-portable when references are present for fetched provenance', () => {
    const result = classifyHtmlLikeArtifact('html', HTML_WITH_REFERENCES, PORTABLE_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });

    expect(result.profile).toBe('ARCHIVE_PORTABLE');
    expect(result.policyReport.violations.some(v => v.rule === 'missing-provenance-references')).toBe(false);
  });

  it('requires references in rich mode when fetched provenance exists', () => {
    const result = classifyHtmlLikeArtifact('html', STATIC_REPORT_HTML, RICH_LINKED_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });

    expect(result.profile).toBe('SESSION_STATIC_REPORT');
    expect(result.policyReport.violations.some(v => v.rule === 'missing-provenance-references' && v.severity === 'error')).toBe(true);
  });

  it('marks portable mode bundle as archive-portable when all pages are policy-safe', () => {
    const safeBundle = JSON.stringify({
      version: 1,
      entryPoint: 'index.html',
      files: {
        'index.html': {
          mimeType: 'text/html',
          content: STATIC_REPORT_HTML,
          size: STATIC_REPORT_HTML.length,
        },
      },
    });

    const result = classifyHtmlLikeArtifact('artifact_bundle', safeBundle, PORTABLE_SELECTION);

    expect(result.profile).toBe('ARCHIVE_PORTABLE');
    expect(result.policyReport.violations.filter(v => v.severity === 'error')).toHaveLength(0);
  });

  it('marks portable mode bundle as session-interactive when any page violates policy', () => {
    const unsafeBundle = JSON.stringify({
      version: 1,
      entryPoint: 'index.html',
      files: {
        'index.html': {
          mimeType: 'text/html',
          content: '<!doctype html><html><body><script>fetch("/api/data")</script></body></html>',
          size: 74,
        },
      },
    });

    const result = classifyHtmlLikeArtifact('artifact_bundle', unsafeBundle, PORTABLE_SELECTION);

    expect(result.profile).toBe('SESSION_INTERACTIVE');
    expect(result.policyReport.violations.some(v => v.rule === 'no-fetch')).toBe(true);
  });

  it('requires sources.html for portable bundles when fetched provenance exists', () => {
    const bundleWithoutSourcesPage = JSON.stringify({
      version: 1,
      entryPoint: 'index.html',
      files: {
        'index.html': {
          mimeType: 'text/html',
          content: '<!doctype html><html><body><p>Summary [1]</p></body></html>',
          size: 58,
        },
      },
    });

    const result = classifyHtmlLikeArtifact('artifact_bundle', bundleWithoutSourcesPage, PORTABLE_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });

    expect(result.profile).toBe('SESSION_INTERACTIVE');
    expect(result.policyReport.violations.some(v => v.rule === 'missing-provenance-sources-page' && v.severity === 'error')).toBe(true);
  });

  it('accepts portable bundles with sources.html when fetched provenance exists', () => {
    const bundleWithSourcesPage = JSON.stringify({
      version: 1,
      entryPoint: 'index.html',
      files: {
        'index.html': {
          mimeType: 'text/html',
          content: '<!doctype html><html><body><p>Summary [1]</p><a href="sources.html">Sources</a></body></html>',
          size: 90,
        },
        'sources.html': {
          mimeType: 'text/html',
          content: '<!doctype html><html><body><h2>Sources</h2><ol><li>FRED CPI</li></ol></body></html>',
          size: 85,
        },
      },
    });

    const result = classifyHtmlLikeArtifact('artifact_bundle', bundleWithSourcesPage, PORTABLE_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });

    expect(result.profile).toBe('ARCHIVE_PORTABLE');
    expect(result.policyReport.violations.some(v => v.rule === 'missing-provenance-sources-page')).toBe(false);
  });
});

describe('injectProvenanceSourcesSection', () => {
  it('injects a provenance-derived Sources section when none exists', () => {
    const out = injectProvenanceSourcesSection(STATIC_REPORT_HTML, PROVENANCE_SOURCES);

    expect(out).not.toBe(STATIC_REPORT_HTML);
    expect(out).toMatch(/<h2[^>]*>Sources<\/h2>/i);
    expect(out).toContain('[S1]');
    expect(out).toContain('api.stlouisfed.org');
    // Injected inside the document body, before </body>.
    expect(out.indexOf('id="sources"')).toBeLessThan(out.indexOf('</body>'));
  });

  it('clears the provenance/citation policy errors after injection', () => {
    const before = classifyHtmlLikeArtifact('html', STATIC_REPORT_HTML, RICH_LINKED_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });
    expect(before.policyReport.violations.some(v => v.rule === 'missing-provenance-references')).toBe(true);

    const injected = injectProvenanceSourcesSection(STATIC_REPORT_HTML, PROVENANCE_SOURCES);
    const after = classifyHtmlLikeArtifact('html', injected, RICH_LINKED_SELECTION, {
      provenanceSources: PROVENANCE_SOURCES,
    });
    expect(after.policyReport.violations.some(v => v.rule === 'missing-provenance-references')).toBe(false);
    expect(after.policyReport.violations.some(v => v.rule === 'missing-inline-citations')).toBe(false);
  });

  it('is idempotent when a references section already exists', () => {
    const out = injectProvenanceSourcesSection(HTML_WITH_REFERENCES, PROVENANCE_SOURCES);
    expect(out).toBe(HTML_WITH_REFERENCES);
  });

  it('returns the HTML unchanged when there is no provenance to cite', () => {
    expect(injectProvenanceSourcesSection(STATIC_REPORT_HTML, [])).toBe(STATIC_REPORT_HTML);
    expect(injectProvenanceSourcesSection(STATIC_REPORT_HTML, undefined)).toBe(STATIC_REPORT_HTML);
  });
});

