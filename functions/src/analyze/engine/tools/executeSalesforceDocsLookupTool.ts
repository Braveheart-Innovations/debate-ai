/**
 * Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeSalesforceDocsLookupTool.ts
 * (Phase 3 Step 5). 2.9.5 (docs grounding): the model gets the passages it may
 * quote, each page under a citation id derived from its URL, so the id stays the
 * same across lookups and teammates; pages found but not read are listed apart;
 * and every lookup writes its own evidence and provenance files, so a teammate's
 * lookup no longer overwrites the operator's.
 */
import { createHash } from 'crypto';
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import {
  describeUnreadReason,
  renderSalesforceDocEvidenceMarkdown,
  type SalesforceDocEvidenceBundle,
  type SalesforceDocEvidenceSource,
  type SalesforceDocUnreadSource,
} from '../../salesforce/SalesforceDocsLookupService';

interface SandboxFileBridge {
  mountFile: (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;
}

export const SALESFORCE_DOCS_DIR = '/data/salesforce/docs';
const RELEASE_CONTEXT_TOPIC_ID = 'salesforce-release-context';
/**
 * How much passage text one tool result quotes inline. This bounds the model's
 * context, not what was read: every passage is in the lookup's evidence file,
 * and a page past the budget is still listed as read.
 */
const INLINE_PASSAGE_BUDGET_CHARS = 28_000;
const PASSAGES_PER_PAGE_INLINE = 2;
const CITATION_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A page's citation id, from its URL: the same page has the same id in every lookup of a session. */
export function salesforceDocCitationId(url: string): string {
  const digest = createHash('sha256').update(url).digest();
  let suffix = '';
  for (let index = 0; index < 5; index += 1) {
    suffix += CITATION_ALPHABET[digest[index] % CITATION_ALPHABET.length];
  }
  return `SF-D${suffix}`;
}

/** One official page whose text the lookup read, with the passages about the lookup's topics. */
export interface SalesforceDocReadPage {
  citationId: string;
  title: string;
  url: string;
  sourceType: SalesforceDocEvidenceSource['sourceType'];
  status: SalesforceDocEvidenceSource['status'];
  releaseLabel?: string;
  apiVersion?: string;
  retrievedAt: string;
  responseHash: string;
  confidenceImpact: SalesforceDocEvidenceSource['confidenceImpact'];
  warnings: string[];
  topicIds: string[];
  passages: Array<{ id: string; text: string; score: number }>;
}

/** The provenance file a lookup writes: what was read, exactly, and what wasn't. */
export interface SalesforceDocsLookupProvenance {
  version: 1;
  tool: 'salesforce_docs_lookup';
  lookup: string;
  lookedUpAt: string;
  documentationIndex?: { status?: string; generatedAt?: string };
  /** The release page the lookup read to detect the current release (not a topic source). */
  releaseContext?: { url: string; detected?: string };
  pages: Array<Omit<SalesforceDocReadPage, 'passages' | 'warnings' | 'status' | 'confidenceImpact'> & { passages: string[] }>;
  notRead: SalesforceDocUnreadSource[];
}

export function lookupFileBase(toolCallId: string): string {
  return `lookup_${toolCallId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function readPagesFromEvidence(evidence: SalesforceDocEvidenceBundle): SalesforceDocReadPage[] {
  const pages = new Map<string, SalesforceDocReadPage>();
  for (const source of evidence.sources || []) {
    if (source.topicId === RELEASE_CONTEXT_TOPIC_ID) continue;
    if (source.contentQuality === 'metadata_only') continue;
    const chunks = Array.isArray(source.matchedChunks) ? source.matchedChunks : [];
    if (chunks.length === 0) continue;
    let page = pages.get(source.url);
    if (!page) {
      page = {
        citationId: salesforceDocCitationId(source.url),
        title: source.title,
        url: source.url,
        sourceType: source.sourceType,
        status: source.status,
        releaseLabel: source.releaseLabel,
        apiVersion: source.apiVersion,
        retrievedAt: source.retrievedAt,
        responseHash: source.responseHash,
        confidenceImpact: source.confidenceImpact,
        warnings: [...(source.warnings || [])],
        topicIds: [],
        passages: [],
      };
      pages.set(source.url, page);
    }
    if (!page.topicIds.includes(source.topicId)) page.topicIds.push(source.topicId);
    for (const chunk of chunks) {
      if (!page.passages.some((passage) => passage.text === chunk.text)) {
        page.passages.push({ id: chunk.id, text: chunk.text, score: chunk.score });
      }
    }
  }
  for (const page of pages.values()) {
    page.passages.sort((a, b) => b.score - a.score);
  }
  return Array.from(pages.values());
}

export async function packageSalesforceDocsLookupEvidence(
  toolCallId: string,
  rawJson: string,
  sandbox: SandboxFileBridge,
): Promise<ToolResult> {
  const parsed = JSON.parse(rawJson) as SalesforceDocEvidenceBundle;
  const pages = readPagesFromEvidence(parsed);
  const citationIdByUrl = new Map(pages.map((page) => [page.url, page.citationId]));
  const evidence: SalesforceDocEvidenceBundle = {
    ...parsed,
    sources: (parsed.sources || []).map((source) => ({
      ...source,
      availability: source.availability || sourceAvailability(source),
      ...(citationIdByUrl.has(source.url) ? { id: citationIdByUrl.get(source.url)! } : {}),
    })),
  };
  const unread = evidence.unreadSources || [];
  const base = lookupFileBase(toolCallId);
  const provenance: SalesforceDocsLookupProvenance = {
    version: 1,
    tool: 'salesforce_docs_lookup',
    lookup: base,
    lookedUpAt: evidence.generatedAt,
    documentationIndex: evidence.documentationIndex
      ? { status: evidence.documentationIndex.status, generatedAt: evidence.documentationIndex.generatedAt }
      : undefined,
    releaseContext: evidence.releaseContext?.sourceUrl
      ? { url: evidence.releaseContext.sourceUrl, detected: evidence.releaseContext.detected }
      : undefined,
    pages: pages.map(({ passages, warnings: _warnings, status: _status, confidenceImpact: _impact, ...page }) => ({
      ...page,
      passages: passages.map((passage) => passage.text),
    })),
    notRead: unread,
  };

  const json = JSON.stringify(evidence, null, 2);
  const markdown = renderSalesforceDocEvidenceMarkdown(evidence);
  const provenanceJson = JSON.stringify(provenance, null, 2);
  const outputName = `salesforce-doc-evidence-${base.slice('lookup_'.length)}`;
  await persist(sandbox, `${base}.json`, json, `${SALESFORCE_DOCS_DIR}/${base}.json`);
  await persist(sandbox, `${base}.md`, markdown, `${SALESFORCE_DOCS_DIR}/${base}.md`);
  await persist(sandbox, `${base}.provenance.json`, provenanceJson, `${SALESFORCE_DOCS_DIR}/${base}.provenance.json`);
  // Where the tool history says data outputs are (toolResultHistory: /output/<filename>).
  await persist(sandbox, `${outputName}.json`, json, `/output/${outputName}.json`);
  await persist(sandbox, `${outputName}.md`, markdown, `/output/${outputName}.md`);

  return {
    toolCallId,
    success: true,
    content: buildModelContent(evidence, pages, unread, base),
    dataOutputs: [
      encodeTextOutput(`${outputName}.json`, json),
      encodeTextOutput(`${outputName}.md`, markdown),
    ],
    provenance: {
      tool: 'salesforce_docs_lookup',
      endpoint: 'salesforce_docs_lookup',
      method: 'GET',
      parameters: {
        topics: (evidence.topics || []).map((topic) => topic.label).join(' | ').slice(0, 280),
        pagesRead: String(pages.length),
        provenanceFile: `${SALESFORCE_DOCS_DIR}/${base}.provenance.json`,
      },
      parameterHash: sha256Hex(JSON.stringify((evidence.topics || []).map((topic) => [topic.id, topic.query]))),
      fetchedAt: evidence.generatedAt,
      responseHash: sha256Hex(JSON.stringify(provenance.pages)),
      cacheStatus: pages.length > 0 && pages.every((page) => page.retrievedAt !== evidence.generatedAt) ? 'cached' : 'fresh',
    },
    metadata: {
      fullStdout: json,
    },
  };
}

function buildModelContent(
  evidence: SalesforceDocEvidenceBundle,
  pages: SalesforceDocReadPage[],
  unread: SalesforceDocUnreadSource[],
  base: string,
): string {
  const topics = evidence.topics || [];
  const topicLabel = (topicId: string) => topics.find((topic) => topic.id === topicId)?.label || topicId;
  const readUrls = new Set(pages.map((page) => page.url));
  const unreadPages = unread.filter((page) => !readUrls.has(page.url));
  const index = evidence.documentationIndex;

  const lines: string[] = [
    `Salesforce documentation lookup: read ${pages.length} official page(s) for ${topics.length} topic(s)${unreadPages.length > 0 ? `; ${unreadPages.length} more found but not read` : ''}.`,
    index ? `Documentation index: ${index.status || 'unknown'}${index.generatedAt ? ` (built ${index.generatedAt})` : ''}.` : 'Documentation index: unavailable.',
    evidence.releaseContext?.detected
      ? `Current Salesforce release (from salesforce.com/releases): ${evidence.releaseContext.detected}.`
      : 'Current Salesforce release: not detected.',
    '',
  ];

  if (pages.length === 0) {
    lines.push('No official Salesforce documentation was read for these topics, so there is nothing to quote or cite.');
  } else {
    lines.push('Passages read. Quote them, and cite a page by its id. A statement about how Salesforce behaves needs a passage here that says it.');
    let budget = INLINE_PASSAGE_BUDGET_CHARS;
    const overflow: SalesforceDocReadPage[] = [];
    for (const page of pages) {
      const inline: string[] = [];
      for (const passage of page.passages.slice(0, PASSAGES_PER_PAGE_INLINE)) {
        if (passage.text.length > budget) break;
        inline.push(passage.text);
        budget -= passage.text.length;
      }
      if (inline.length === 0) {
        overflow.push(page);
        continue;
      }
      lines.push('', `[${page.citationId}] ${page.title} - ${page.url}`);
      lines.push(`  ${describePage(page, topicLabel)}`);
      inline.forEach((text, passageIndex) => {
        lines.push(`  Passage ${passageIndex + 1}:`);
        for (const textLine of text.replace(/\r\n/g, '\n').trim().split('\n')) lines.push(`    ${textLine}`);
      });
      if (page.passages.length > inline.length) {
        lines.push(`  (${page.passages.length - inline.length} more passage(s) from this page in ${SALESFORCE_DOCS_DIR}/${base}.md)`);
      }
    }
    if (overflow.length > 0) {
      lines.push('', `Also read; their passages are in ${SALESFORCE_DOCS_DIR}/${base}.md (read it before quoting them):`);
      for (const page of overflow) {
        lines.push(`- [${page.citationId}] ${page.title} - ${page.url} (${describePage(page, topicLabel)})`);
      }
    }
  }

  if (unreadPages.length > 0) {
    lines.push('', 'Found but not read. These are not evidence: never cite them, and never write "per Salesforce Help" from a title or a link.');
    for (const page of unreadPages) {
      lines.push(`- ${page.title} - ${page.url} (${topicLabel(page.topicId)}: ${describeUnreadReason(page.reason)})`);
    }
  }

  const missed = index?.missedTopics || [];
  if (missed.length > 0) {
    lines.push(
      '',
      `No documentation read for: ${missed.map((topic) => `${topic.label || topicLabel(topic.topicId)} (${topic.reason.replace(/_/g, ' ')})`).join('; ')}.`,
      'For these, say the Salesforce documentation was not found or read, and mark any claim about them unverified.',
    );
  }

  if (pages.some((page) => page.status === 'preview' || page.confidenceImpact === 'preview-risk')) {
    lines.push('', 'Some pages describe preview, beta or pilot features: downgrade confidence wherever they are material.');
  }

  lines.push(
    '',
    `Files: ${SALESFORCE_DOCS_DIR}/${base}.md (every passage in full), ${base}.json, and ${base}.provenance.json.`,
    `In a report, cite a page as a source with its title and url, and set its sourceArtifactId to "${SALESFORCE_DOCS_DIR}/${base}.provenance.json".`,
    'Keep apart: your org\'s metadata, org runtime evidence, imported agent assertions, and Salesforce documentation (only the passages above).',
  );
  return lines.join('\n');
}

/** A page as a stored lookup result shows it: its id, title, url and the passages quoted inline. */
export interface SalesforceDocQuotedPage {
  citationId: string;
  title: string;
  url: string;
  passages: string[];
}

/**
 * Reads back the pages a lookup result quoted (the format buildModelContent
 * writes), for the Reviewer and the "check independently" verifier, which see
 * stored tool results rather than the sandbox. Pages read past the inline
 * budget come back with no passages.
 */
export function parseDocsLookupResult(content: string): SalesforceDocQuotedPage[] {
  const pages: SalesforceDocQuotedPage[] = [];
  let current: SalesforceDocQuotedPage | null = null;
  let passage: string[] | null = null;
  const closePassage = () => {
    if (current && passage && passage.length > 0) current.passages.push(passage.join('\n'));
    passage = null;
  };
  for (const line of content.split('\n')) {
    const header = line.match(/^(?:- )?\[(SF-D[2-9A-HJKMNP-Z]{5})\] (.+) - (https:\/\/\S+)/);
    if (header) {
      closePassage();
      current = { citationId: header[1], title: header[2], url: header[3], passages: [] };
      pages.push(current);
      continue;
    }
    if (!current) continue;
    if (/^  Passage \d+:$/.test(line)) {
      closePassage();
      passage = [];
      continue;
    }
    if (passage && line.startsWith('    ')) {
      passage.push(line.slice(4));
      continue;
    }
    closePassage();
    if (!line.startsWith('  ')) current = null;
  }
  closePassage();
  return pages;
}

const SOURCE_TYPE_LABELS: Record<SalesforceDocEvidenceSource['sourceType'], string> = {
  help_doc: 'Salesforce Help',
  release_notes: 'Release notes',
  developer_doc: 'Developer docs',
  architect_doc: 'Salesforce Architects',
  pdf_guide: 'Official PDF guide',
  release_notes_pdf: 'Release notes PDF',
  release_page: 'salesforce.com',
  official_doc: 'salesforce.com',
};

function describePage(page: SalesforceDocReadPage, topicLabel: (topicId: string) => string): string {
  return [
    SOURCE_TYPE_LABELS[page.sourceType] || 'Salesforce',
    page.releaseLabel ? `release ${page.releaseLabel}` : '',
    page.apiVersion ? `API ${page.apiVersion}` : '',
    `topics: ${page.topicIds.map(topicLabel).join(', ')}`,
    page.confidenceImpact === 'preview-risk' ? 'preview/beta/pilot: downgrade confidence' : '',
    page.confidenceImpact === 'stale-risk' ? 'cached copy is old: verify before release-sensitive claims' : '',
    page.confidenceImpact === 'release-link-risk' ? 'may link to previous-release material' : '',
  ].filter(Boolean).join(' · ');
}

function sourceAvailability(source: SalesforceDocEvidenceSource): 'official' | 'ga' | 'preview' {
  if (source.status === 'preview') return 'preview';
  if (source.status === 'ga') return 'ga';
  return 'official';
}

async function persist(sandbox: SandboxFileBridge, filename: string, content: string, path: string): Promise<void> {
  const encoded = new TextEncoder().encode(content);
  await sandbox.mountFile(filename, encoded.buffer, path);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function encodeTextOutput(filename: string, content: string): { filename: string; base64: string; size: number } {
  const encoded = new TextEncoder().encode(content);
  return {
    filename,
    base64: Buffer.from(encoded).toString('base64'),
    size: encoded.byteLength,
  };
}
