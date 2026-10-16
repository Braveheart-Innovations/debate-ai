/**
 * Salesforce docs grounding (2.9.5): a report can't be saved while it presents
 * Salesforce documentation the AI never read.
 *
 * After execute_python / write_output_file, each report spec in the outputs is
 * checked against what this session actually read:
 * - Rule 1: a source on a salesforce.com domain is a page a salesforce_docs_lookup
 *   read (its provenance file lists it with the passages), or a page fetch_url
 *   read with real text (fetch_url fails on Salesforce Help and on site shells,
 *   so its provenance means text came back).
 * - Rule 2: a sentence that attributes behaviour to Salesforce ("per Salesforce
 *   Help", "Salesforce recommends") cites such a source.
 * A failing spec is taken out of the outputs, so capture never makes it a
 * report, and the AI gets the exact sources and sentences to fix: cite the
 * passage, or reword the claim as unverified.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { AnalysisArtifactBlock, AnalysisArtifactSpecV1 } from '../../contract/types/analysis-artifact-spec';
import { tryParseAnalysisArtifactSpecText } from '../../contract/services/analyze/artifacts/AnalysisArtifactSpecService';
import { SALESFORCE_DOCS_DIR, type SalesforceDocsLookupProvenance } from './executeSalesforceDocsLookupTool';
import { outputPath, withNotes } from './toolResultNotes';
import type { SandboxFiles } from './sandboxFiles';

type GroundingFiles = Pick<SandboxFiles, 'readFile' | 'listFiles'>;

const ATTRIBUTION_PATTERNS: RegExp[] = [
  /\b(?:per|according to|as (?:documented|stated|described|noted|explained) (?:in|by))\s+(?:the\s+)?(?:official\s+)?Salesforce(?:['’]s)?\s+(?:Help|documentation|docs|release notes|developer (?:guide|docs|documentation)|guide|guidance|knowledge article|architects?)/i,
  /\bSalesforce(?:['’]s)?\s+(?:Help|documentation|docs|release notes|knowledge article|developer guide)\s+(?:says|states|notes|confirms|recommends|explains|describes|documents|warns|lists|specifies|requires)\b/i,
  /\bSalesforce\s+(?:officially\s+)?(?:documents|recommends|states|warns|confirms|specifies|requires that)\b/i,
  /\bofficial Salesforce (?:documentation|guidance|docs|Help)\b/i,
];

/** A comparable key for an official Salesforce page; Help ids drop their namespace, which Salesforce moves (sf. → xcloud.). */
export function salesforcePageKey(urlValue: string): string | null {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!/(^|\.)salesforce\.com$/.test(host)) return null;
  if (host === 'help.salesforce.com') {
    const articleId = url.searchParams.get('id');
    if (articleId) return `help:${articleId.toLowerCase().replace(/^[a-z]+\./, '')}`;
  }
  return `${host}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
}

/** A source this rule governs: Salesforce documentation and sites, not a link into someone's org. */
function isSalesforceDocsSource(urlValue: string | undefined): boolean {
  if (!urlValue) return false;
  try {
    const host = new URL(urlValue).hostname.toLowerCase();
    return /(^|\.)salesforce\.com$/.test(host) && !/\.my\.salesforce\.com$/.test(host);
  } catch {
    return false;
  }
}

/** A sentence that already says its Salesforce claim is unverified is what the rule asks for. */
const MARKED_UNVERIFIED = /\b(?:unverified|not verified|could(?:n['\u2019]t| not) (?:be )?verif|(?:documentation|docs) (?:was|were) not (?:found|read)|no (?:official )?(?:Salesforce )?(?:documentation|docs) (?:was |were )?(?:found|read))/i;

export function attributesToSalesforce(sentence: string): boolean {
  return ATTRIBUTION_PATTERNS.some((pattern) => pattern.test(sentence)) && !MARKED_UNVERIFIED.test(sentence);
}

/** Sentences, each keeping the [S#] markers that follow its full stop. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=[.!?](?:\s*\[S\d+\])*)\s+(?=[A-Z0-9"“(*_-])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function blockTexts(block: AnalysisArtifactBlock): string[] {
  const texts: string[] = [];
  switch (block.kind) {
    case 'markdown': texts.push(block.markdown); break;
    case 'callout': texts.push(block.body); break;
    case 'metric_grid': block.metrics.forEach((metric) => texts.push(metric.detail || '')); break;
    case 'table':
      texts.push(block.caption || '');
      block.rows.forEach((row) => row.forEach((cell) => texts.push(cell)));
      break;
    default:
      if ('caption' in block && typeof block.caption === 'string') texts.push(block.caption);
  }
  return texts.filter(Boolean);
}

interface ReadEvidence {
  pageKeys: Set<string>;
}

async function readSessionEvidence(files: GroundingFiles): Promise<ReadEvidence> {
  const pageKeys = new Set<string>();
  const readJson = async <T>(path: string): Promise<T | null> => {
    try {
      return JSON.parse(Buffer.from(await files.readFile(path)).toString('utf8')) as T;
    } catch {
      return null;
    }
  };

  for (const entry of await files.listFiles(SALESFORCE_DOCS_DIR).catch(() => [])) {
    if (!entry.name.endsWith('.provenance.json')) continue;
    const provenance = await readJson<SalesforceDocsLookupProvenance>(entry.path);
    for (const page of provenance?.pages || []) {
      const key = page.passages?.length ? salesforcePageKey(page.url) : null;
      if (key) pageKeys.add(key);
    }
    const releasePageKey = provenance?.releaseContext?.url ? salesforcePageKey(provenance.releaseContext.url) : null;
    if (releasePageKey) pageKeys.add(releasePageKey);
  }
  for (const entry of await files.listFiles('/data').catch(() => [])) {
    if (!/^fetch_.*\.provenance\.json$/.test(entry.name)) continue;
    const provenance = await readJson<{ tool?: string; endpoint?: string }>(entry.path);
    if (provenance?.tool !== 'fetch_url' || !provenance.endpoint) continue;
    const key = salesforcePageKey(provenance.endpoint);
    if (key) pageKeys.add(key);
  }
  return { pageKeys };
}

/** What a report spec presents as Salesforce documentation without having read it. */
export function salesforceGroundingProblems(spec: AnalysisArtifactSpecV1, evidence: ReadEvidence): string[] {
  const problems: string[] = [];
  const sources = spec.sources || [];
  const readSourceIds = new Set<string>();
  for (const source of sources) {
    if (!isSalesforceDocsSource(source.url)) continue;
    const key = salesforcePageKey(source.url!);
    if (key && evidence.pageKeys.has(key)) {
      readSourceIds.add(source.id);
    } else {
      problems.push(`Source ${source.id} (${source.url}) is a Salesforce page this session never read. Cite a page from a salesforce_docs_lookup result (one with passages), or remove the source and anything that relies on it.`);
    }
  }

  const checkText = (text: string, where: string, blockCitations: string[]) => {
    const blockHasInlineMarkers = /\[S\d+\]/.test(text);
    for (const sentence of splitSentences(text)) {
      if (!attributesToSalesforce(sentence)) continue;
      const cited = Array.from(sentence.matchAll(/\[(S\d+)\]/g), (match) => match[1]);
      const citations = cited.length > 0 ? cited : blockHasInlineMarkers ? [] : blockCitations;
      if (citations.some((id) => readSourceIds.has(id))) continue;
      const quote = sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence;
      problems.push(`${where}: "${quote}" attributes this to Salesforce but cites no Salesforce documentation that was read. Cite the read passage that says it, or reword it as unverified (for example "Not verified against Salesforce documentation: ...").`);
    }
  };

  checkText(spec.summary || '', 'Summary', []);
  for (const page of spec.pages || []) {
    checkText(page.summary || '', `Page "${page.title}" summary`, []);
    for (const block of page.blocks || []) {
      for (const text of blockTexts(block)) {
        checkText(text, `Page "${page.title}"${block.title ? `, "${block.title}"` : ''}`, block.citations || []);
      }
    }
  }
  return problems;
}

function mentionsSalesforce(spec: AnalysisArtifactSpecV1): boolean {
  return (spec.sources || []).some((source) => isSalesforceDocsSource(source.url))
    || /salesforce/i.test(JSON.stringify(spec.pages || []) + (spec.summary || ''));
}

export async function checkSalesforceGrounding(result: ToolResult, files: GroundingFiles): Promise<ToolResult> {
  const specs = (result.dataOutputs ?? [])
    .filter((output) => output.filename.toLowerCase().endsWith('.json'))
    .map((output) => ({ output, spec: tryParseAnalysisArtifactSpecText(Buffer.from(output.base64, 'base64').toString('utf8')) }))
    .filter((entry): entry is { output: typeof entry.output; spec: AnalysisArtifactSpecV1 } => Boolean(entry.spec && mentionsSalesforce(entry.spec)));
  if (specs.length === 0) return result;

  const evidence = await readSessionEvidence(files);
  const blocked = new Set<string>();
  const notes: string[] = [];
  for (const { output, spec } of specs) {
    const problems = salesforceGroundingProblems(spec, evidence);
    if (problems.length === 0) continue;
    blocked.add(output.filename);
    notes.push([
      `Report NOT saved: ${outputPath(output.filename)} presents Salesforce documentation that was not read:`,
      ...problems.map((problem) => `- ${problem}`),
      'Fix these and save the report again before saying it is ready. A statement about how Salesforce behaves needs a passage you received from salesforce_docs_lookup; without one, say the documentation was not found and mark the claim unverified.',
    ].join('\n'));
  }
  if (blocked.size === 0) return result;
  return withNotes(
    { ...result, dataOutputs: (result.dataOutputs ?? []).filter((output) => !blocked.has(output.filename)) },
    notes,
  );
}
