/** Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeSalesforceDocsLookupTool.ts (Phase 3 Step 5), logic unchanged. */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import {
  renderSalesforceDocEvidenceMarkdown,
  type SalesforceDocEvidenceBundle,
  type SalesforceDocEvidenceSource,
} from '../../salesforce/SalesforceDocsLookupService';

interface SandboxFileBridge {
  mountFile: (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;
}

const SALESFORCE_DOC_DATA_ROOT = '/data/salesforce';
const SALESFORCE_DOC_JSON_PATH = `${SALESFORCE_DOC_DATA_ROOT}/salesforce-doc-evidence.json`;
const SALESFORCE_DOC_MD_PATH = `${SALESFORCE_DOC_DATA_ROOT}/salesforce-doc-evidence.md`;
const SALESFORCE_DOC_JSON_ALIAS = '/data/salesforce_doc_evidence.json';
const SALESFORCE_DOC_MD_ALIAS = '/data/salesforce_doc_evidence.md';
const MAX_CITATION_SOURCES = 20;
const MAX_CITATION_EXCERPT_CHARS = 140;

export async function packageSalesforceDocsLookupEvidence(
  toolCallId: string,
  rawJson: string,
  sandbox: SandboxFileBridge,
): Promise<ToolResult> {
  const evidence = normalizeSalesforceDocEvidenceBundle(JSON.parse(rawJson) as SalesforceDocEvidenceBundle);
  const json = JSON.stringify(evidence, null, 2);
  const markdown = renderSalesforceDocEvidenceMarkdown(evidence);

  await persistDocsEvidence(sandbox, 'salesforce-doc-evidence.json', json);
  await persistDocsEvidence(sandbox, 'salesforce-doc-evidence.md', markdown);

  const previewLines = [
    'Salesforce documentation evidence collected from official Salesforce domains.',
    `Topics checked: ${evidence.topics?.length || 0}`,
    `Official sources fetched: ${evidence.sources?.length || 0}`,
    `Matched source chunks: ${countMatchedSourceChunks(evidence)}`,
    `Rejected non-official URLs: ${evidence.officialDomainPolicy?.rejectedUrls?.length || 0}`,
    evidence.documentationIndex
      ? `Documentation index: ${evidence.documentationIndex.status || 'unknown'}${evidence.documentationIndex.generatedAt ? ` (${evidence.documentationIndex.generatedAt})` : ''}`
      : 'Documentation index: unavailable',
    evidence.documentationIndex?.missedTopics && evidence.documentationIndex.missedTopics.length > 0
      ? `Missed documentation topics: ${evidence.documentationIndex.missedTopics.map((topic) => `${topic.topicId}:${topic.reason}`).slice(0, 6).join(', ')}`
      : '',
    evidence.releaseContext?.detected
      ? `Detected release context: ${evidence.releaseContext.detected}`
      : 'Detected release context: unavailable',
    Array.isArray(evidence.sources) && evidence.sources.some((source: { status?: string }) => source.status === 'preview')
      ? 'Preview/beta/pilot documentation was found; final findings must downgrade confidence where those sources are material.'
      : '',
    Array.isArray(evidence.warnings) && evidence.warnings.length > 0
      ? `Warnings: ${evidence.warnings.slice(0, 3).join(' | ')}`
      : '',
    '',
    'Generated docs evidence artifacts:',
    `- salesforce-doc-evidence.json (${SALESFORCE_DOC_JSON_PATH}; alias ${SALESFORCE_DOC_JSON_ALIAS})`,
    `- salesforce-doc-evidence.md (${SALESFORCE_DOC_MD_PATH}; alias ${SALESFORCE_DOC_MD_ALIAS})`,
    '',
    ...buildCitationMapLines(evidence),
    '',
    'Final synthesis requirement: separate local metadata evidence, org runtime evidence, imported agent assertions, current Salesforce documentation evidence, and unverifiable/org-runtime-dependent claims.',
    'If the documentation index reports missed topics, blocked official docs, stale sources, or no official source for a material claim, state the verification limit and downgrade confidence.',
    'Do not render internal unknown source status values as "status unclear"; they mean the official source did not contain explicit GA/preview language. Use availability and confidence labels instead.',
    'Do not say the Salesforce docs evidence artifact is unavailable for citation. Use the citation map above for inline citations, or read the full Markdown/JSON evidence from the listed /data paths before writing the final deliverable.',
  ].filter(Boolean);

  return {
    toolCallId,
    success: true,
    content: previewLines.join('\n'),
    dataOutputs: [
      encodeTextOutput('salesforce-doc-evidence.json', json),
      encodeTextOutput('salesforce-doc-evidence.md', markdown),
    ],
    metadata: {
      fullStdout: json,
    },
  };
}

function normalizeSalesforceDocEvidenceBundle(evidence: SalesforceDocEvidenceBundle): SalesforceDocEvidenceBundle {
  if (!Array.isArray(evidence.sources)) return evidence;
  return {
    ...evidence,
    sources: evidence.sources.map(normalizeSalesforceDocEvidenceSource),
  };
}

function normalizeSalesforceDocEvidenceSource(source: SalesforceDocEvidenceSource): SalesforceDocEvidenceSource {
  const normalizedSource = {
    ...source,
    availability: source.availability || sourceAvailability(source),
  };
  if (normalizedSource.confidenceImpact !== 'unclear') return normalizedSource;
  const warnings = Array.isArray(normalizedSource.warnings) ? normalizedSource.warnings : [];
  const hasMaterialWarning = warnings.some((warning) =>
    /older than|stale|due|overdue|preview|beta|pilot|not-yet-GA|not yet GA|previous-release|previous release|previous/i.test(warning)
  );
  if (hasMaterialWarning) return normalizedSource;
  return {
    ...normalizedSource,
    confidenceImpact: 'supports',
  };
}

async function persistDocsEvidence(
  sandbox: SandboxFileBridge,
  filename: string,
  content: string,
): Promise<void> {
  const encoded = new TextEncoder().encode(content);
  await sandbox.mountFile(filename, encoded.buffer, `${SALESFORCE_DOC_DATA_ROOT}/${filename}`);
  await sandbox.mountFile(filename.replace(/-/g, '_'), encoded.buffer, `/data/${filename.replace(/-/g, '_')}`);
}

function buildCitationMapLines(evidence: SalesforceDocEvidenceBundle): string[] {
  if (!Array.isArray(evidence.sources) || evidence.sources.length === 0) {
    return ['Citation map: no official Salesforce documentation sources were fetched.'];
  }

  const sourceLines = evidence.sources.slice(0, MAX_CITATION_SOURCES).map((source, index) =>
    formatCitationSource(source, index + 1)
  );
  const omittedCount = evidence.sources.length - sourceLines.length;

  return [
    'Citation map for final synthesis:',
    ...sourceLines,
    omittedCount > 0
      ? `- ${omittedCount} additional source(s) omitted from this compact map; read ${SALESFORCE_DOC_MD_PATH} for the full evidence file.`
      : '',
  ].filter(Boolean);
}

function formatCitationSource(source: SalesforceDocEvidenceSource, index: number): string {
  const label = `SF-D${index}`;
  const matchedChunkCount = Array.isArray(source.matchedChunks) ? source.matchedChunks.length : 0;
  const metadata = [
    source.topicId ? `topic=${source.topicId}` : '',
    `availability=${formatCitationAvailability(source)}`,
    source.releaseLabel ? `release=${source.releaseLabel}` : '',
    source.apiVersion ? `api=${source.apiVersion}` : '',
    source.contentQuality ? `content=${source.contentQuality}` : '',
    source.contentLength ? `chars=${source.contentLength}` : '',
    `chunks=${matchedChunkCount}`,
    source.confidenceImpact ? `confidence=${source.confidenceImpact}` : '',
  ].filter(Boolean).join('; ');
  const excerpt = trimForCitation(source.matchedChunks?.[0]?.text || source.excerpt || source.searchSnippet || '');

  return [
    `- [${label}] ${source.title} - ${source.url}`,
    metadata ? ` (${metadata})` : '',
    excerpt ? ` :: ${excerpt}` : '',
  ].join('');
}

function formatCitationAvailability(source: SalesforceDocEvidenceSource): string {
  return formatAvailabilityValue(source.availability || sourceAvailability(source));
}

function sourceAvailability(source: SalesforceDocEvidenceSource): 'official' | 'ga' | 'preview' {
  if (source.status === 'preview') return 'preview';
  if (source.status === 'ga') return 'ga';
  return 'official';
}

function formatAvailabilityValue(availability: 'official' | 'ga' | 'preview'): string {
  if (availability === 'preview') return 'preview/beta/pilot';
  return availability;
}

function countMatchedSourceChunks(evidence: SalesforceDocEvidenceBundle): number {
  if (!Array.isArray(evidence.sources)) return 0;
  return evidence.sources.reduce((total, source) =>
    total + (Array.isArray(source.matchedChunks) ? source.matchedChunks.length : 0),
  0);
}

function trimForCitation(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_CITATION_EXCERPT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_CITATION_EXCERPT_CHARS - 3).trimEnd()}...`;
}

function encodeTextOutput(filename: string, content: string): { filename: string; base64: string; size: number } {
  const encoded = new TextEncoder().encode(content);
  let binary = '';
  encoded.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return {
    filename,
    base64: btoa(binary),
    size: encoded.byteLength,
  };
}
