/**
 * Ported from symposium-ai-web src/context/analyze/helpers.ts (Phase 3), logic
 * unchanged: the capture pipeline's provenance, classification and Sources
 * helpers. The rest of that file (normalizeArtifactType, participant and
 * review helpers) is read-side or UI state and stays in the web app.
 */
import type { ToolResultProvenance } from '../contract/types';
import type { AnalyzeOutputSelection } from '../contract/types/analyze';
import type { Artifact, BundleManifest, PolicyViolation } from '../contract/types/notebook';
import { validateArtifact } from '../contract/services/artifacts/PolicyGateService';
import {
  hasInteractiveHtmlLikeRuntime,
  hasSemanticHtmlLikeDocument,
} from '../contract/services/artifacts/htmlProfiles';

// ============================================================================
// Data Classification Helpers
// ============================================================================

/**
 * True when JSON is an array of flat objects suitable for dataset preview.
 */
export function isTabularJsonArray(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      !Array.isArray(row) &&
      Object.values(row as Record<string, unknown>).every(
        (cell) => cell === null || typeof cell !== 'object',
      ),
  );
}

// ============================================================================
// Provenance Helpers
// ============================================================================

export function buildArtifactProvenance(
  toolName: string | undefined,
  sources: ToolResultProvenance[] = [],
): Artifact['provenance'] {
  const generator = toolName || 'execute_python';

  if (sources.length === 0) {
    return { generator };
  }

  const retrievalTimestamps = sources.reduce<Record<string, number>>((acc, source) => {
    const parsedTimestamp = Date.parse(source.fetchedAt);
    if (!Number.isNaN(parsedTimestamp)) {
      acc[`${source.tool}:${source.endpoint}`] = parsedTimestamp;
    }
    return acc;
  }, {});

  return {
    generator,
    inputs: [...new Set(sources.map((source) => source.endpoint))],
    retrievalTimestamps: Object.keys(retrievalTimestamps).length > 0 ? retrievalTimestamps : undefined,
    dataHash: sources[0]?.responseHash,
    sources,
  };
}

export function dedupeProvenanceSources(sources: ToolResultProvenance[]): ToolResultProvenance[] {
  const seen = new Set<string>();
  const deduped: ToolResultProvenance[] = [];

  for (const source of sources) {
    const key = [
      source.tool,
      source.connectorId || '',
      source.endpoint,
      source.method,
      source.parameterHash,
      source.responseHash,
      source.fetchedAt,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}

export const FETCH_OUTPUT_PATH_REGEX = /\/data\/fetch_([A-Za-z0-9_]+)\.json\b/g;

export function sanitizeToolCallIdForFetchPath(toolCallId: string): string {
  return toolCallId.replace(/[^a-zA-Z0-9]/g, '_');
}

export function extractFetchSourceKeysFromCode(code: string): string[] {
  if (!code) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null = FETCH_OUTPUT_PATH_REGEX.exec(code);
  while (match) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    match = FETCH_OUTPUT_PATH_REGEX.exec(code);
  }
  FETCH_OUTPUT_PATH_REGEX.lastIndex = 0;
  return keys;
}

export function parseExecutePythonCodeFromToolCall(
  toolCall: { function: { name: string; arguments: string } } | undefined,
): string | null {
  if (!toolCall || toolCall.function.name !== 'execute_python') return null;
  try {
    const parsed = JSON.parse(toolCall.function.arguments) as { code?: unknown };
    return typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

// ============================================================================
// ============================================================================
// Artifact Helpers
// ============================================================================

/**
 * Classify HTML-like artifacts by runtime needs and portability policy.
 * - portable mode: existing ARCHIVE_PORTABLE behavior stays policy-gated.
 * - rich mode: semantic, script-free documents are SESSION_STATIC_REPORT.
 * - rich mode: scripts/forms/canvas/charts/maps/runtime signatures are SESSION_INTERACTIVE.
 */
export function classifyHtmlLikeArtifact(
  type: 'html' | 'artifact_bundle',
  data: string,
  outputSelection: AnalyzeOutputSelection,
  options: {
    provenanceSources?: ToolResultProvenance[];
  } = {},
): {
  profile: NonNullable<Artifact['profile']>;
  policyReport: ReturnType<typeof validateArtifact>;
} {
  const isPortableMode = outputSelection.mode === 'portable';
  const hasInteractiveRuntime = hasInteractiveHtmlLikeRuntime(type, data);
  const hasSemanticDocument = hasSemanticHtmlLikeDocument(type, data);
  const richProfile: NonNullable<Artifact['profile']> = !hasInteractiveRuntime && hasSemanticDocument
    ? 'SESSION_STATIC_REPORT'
    : 'SESSION_INTERACTIVE';
  const validationProfile: NonNullable<Artifact['profile']> = isPortableMode
    ? 'ARCHIVE_PORTABLE'
    : richProfile;
  const securityPolicyReport = validateArtifact({ type, data, profile: validationProfile }, 'audit');
  const citationViolations = buildCitationPolicyViolations(
    type,
    data,
    outputSelection,
    options.provenanceSources || [],
  );
  const violations = [...securityPolicyReport.violations, ...citationViolations];
  const hasErrors = violations.some(v => v.severity === 'error');
  const policyReport = {
    ...securityPolicyReport,
    violations,
    passed: securityPolicyReport.auditOnly || !hasErrors,
  };

  const profile: NonNullable<Artifact['profile']> = !isPortableMode
    ? richProfile
    : (hasErrors ? 'SESSION_INTERACTIVE' : 'ARCHIVE_PORTABLE');

  return {
    profile,
    policyReport,
  };
}

const REFERENCES_HEADING_REGEX = /<h[1-6][^>]*>\s*(?:data\s+sources|sources|references)\s*<\/h[1-6]>/i;
const REFERENCES_ANCHOR_REGEX = /\b(?:id|class)\s*=\s*["'][^"']*(?:source|reference)[^"']*["']/i;
const INLINE_CITATION_REGEX = /\[(?:S)?\d+\]/i;

function hasReferencesSection(html: string): boolean {
  return REFERENCES_HEADING_REGEX.test(html) || REFERENCES_ANCHOR_REGEX.test(html);
}

function hasInlineCitationMarkers(html: string): boolean {
  return INLINE_CITATION_REGEX.test(html);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatProvenanceTimestamp(value: string | undefined): string {
  if (!value) return '';
  // Keep the date portion of an ISO timestamp; leave other formats untouched.
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return isoMatch ? isoMatch[1] : value;
}

function buildProvenanceSourcesSectionHtml(sources: ToolResultProvenance[]): string {
  const items = sources.map((source, index) => {
    const marker = `[S${index + 1}]`;
    const label = escapeHtmlText(source.connectorId || source.tool || 'Source');
    const endpoint = source.endpoint ? escapeHtmlText(source.endpoint) : '';
    const fetched = formatProvenanceTimestamp(source.fetchedAt);
    const meta = [endpoint, fetched ? `fetched ${escapeHtmlText(fetched)}` : '']
      .filter(Boolean)
      .join(' · ');
    return `      <li id="source-s${index + 1}"><strong>${marker}</strong> ${label}${meta ? ` — ${meta}` : ''}</li>`;
  }).join('\n');

  return [
    '<section id="sources" class="symposium-doc-source-list" style="margin-top:2rem;padding:1rem 0 0;border-top:1px solid #e5e7eb;font-size:0.85rem;color:#374151;">',
    '  <h2 style="font-size:1rem;margin:0 0 0.5rem;">Sources</h2>',
    '  <ol style="margin:0;padding-left:1.25rem;line-height:1.6;">',
    items,
    '  </ol>',
    '</section>',
  ].join('\n');
}

/**
 * Guarantee a provenance-derived Sources/References section in an HTML deliverable.
 *
 * The structured report-spec path renders this app-side (renderSourcesHtml), but
 * raw write_output_file HTML left citations dependent on the operator following
 * the prompt — so weaker operators shipped artifacts with no sources. When fetched
 * external data was used (provenance was captured) and the model omitted a sources
 * section, inject one built from the provenance records so citations are always
 * surfaced ("we control what we surface"). Idempotent: skips when a references
 * section already exists, and returns the input unchanged when there is no
 * provenance to cite.
 */
export function injectProvenanceSourcesSection(
  html: string,
  provenanceSources: ToolResultProvenance[] | undefined,
): string {
  if (!html || !provenanceSources || provenanceSources.length === 0) return html;
  if (hasReferencesSection(html)) return html;
  const section = buildProvenanceSourcesSectionHtml(provenanceSources);
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${section}\n</body>`);
  }
  return `${html}\n${section}`;
}

function buildCitationPolicyViolations(
  type: 'html' | 'artifact_bundle',
  data: string,
  outputSelection: AnalyzeOutputSelection,
  provenanceSources: ToolResultProvenance[],
): PolicyViolation[] {
  if (provenanceSources.length === 0) return [];

  const isPortableMode = outputSelection.mode === 'portable';
  const missingReferencesSeverity: PolicyViolation['severity'] = 'error';
  const missingReferencesMessage = isPortableMode
    ? 'Portable artifacts that use fetched external data must include a references/sources section derived from provenance records'
    : 'Artifacts that use fetched external data must include a references/sources section derived from provenance records';
  const violations: PolicyViolation[] = [];

  if (type === 'html') {
    if (!hasReferencesSection(data)) {
      violations.push({
        rule: 'missing-provenance-references',
        severity: missingReferencesSeverity,
        message: missingReferencesMessage,
      });
    }
    if (!hasInlineCitationMarkers(data)) {
      violations.push({
        rule: 'missing-inline-citations',
        severity: 'error',
        message: 'No inline citation markers detected in HTML output',
      });
    }
    return violations;
  }

  let manifest: BundleManifest | null = null;
  try {
    manifest = JSON.parse(data) as BundleManifest;
  } catch {
    return violations;
  }
  if (!manifest?.files) return violations;

  const sourcesFilename = Object.keys(manifest.files).find(
    (filename) => filename.toLowerCase() === 'sources.html',
  );
  if (!sourcesFilename) {
    violations.push({
      rule: 'missing-provenance-sources-page',
      severity: missingReferencesSeverity,
      message: isPortableMode
        ? 'Portable bundles that use fetched external data must include sources.html built from provenance records'
        : 'Bundles that use fetched external data should include a sources.html page built from provenance records',
    });
  } else {
    const sourcesFile = manifest.files[sourcesFilename];
    if (sourcesFile.mimeType !== 'text/html' || !hasReferencesSection(sourcesFile.content)) {
      violations.push({
        rule: 'invalid-provenance-sources-page',
        severity: missingReferencesSeverity,
        message: 'sources.html exists but does not include a clear Sources/References section',
      });
    }
  }

  const hasAnyInlineCitations = Object.values(manifest.files)
    .some((file) => file.mimeType === 'text/html' && hasInlineCitationMarkers(file.content));
  if (!hasAnyInlineCitations) {
    violations.push({
      rule: 'missing-inline-citations',
      severity: 'error',
      message: 'No inline citation markers detected across HTML bundle pages',
    });
  }

  return violations;
}
