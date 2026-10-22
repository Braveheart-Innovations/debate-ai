/**
 * Report Assembler
 *
 * Combines rendered blocks with the Handlebars report template
 * to produce the final HTML document for PDF generation.
 */
import Handlebars from 'handlebars';
import { marked } from 'marked';
import type {
  ReportSpecV1,
  ReportBlock,
  ReportTheme,
  RenderedBlock,
  ArtifactBlock,
  ArtifactDoc,
  HeadingBlock,
  ParagraphBlock,
  TableBlock,
  SpacerBlock,
  ArtifactExplanationBlock,
  ReportSource,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import { sha256Hex } from './utils';

// DOMPurify requires a DOM — use server-side approach
// On Node.js, we sanitize via marked's built-in sanitizer and manual tag stripping
const INLINE_CITATION_TOKEN_REGEX = /\[cite:([^[\]\s]+)\]/g;

function sanitizeHtml(html: string): string {
  // Strip script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '');
}

/**
 * Render a markdown string to sanitized HTML.
 */
function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Escape HTML entities in text content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a heading block to HTML.
 */
function renderHeading(
  block: HeadingBlock,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  const tag = `h${block.level}`;
  const text = applyInlineCitationTokens(
    escapeHtml(block.text),
    citationStyle,
    citationNumbersByArtifactId,
  );
  return `<${tag}>${text}</${tag}>${renderBlockCitationRefsHtml(block, citationStyle, citationNumbersByArtifactId)}`;
}

/**
 * Render a paragraph block to HTML.
 */
function renderParagraph(
  block: ParagraphBlock,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  const markdown = applyInlineCitationTokens(
    block.markdown,
    citationStyle === 'numeric_endnotes' ? 'numeric_endnotes' : 'none',
    citationNumbersByArtifactId,
  );
  return `<div class="paragraph">${renderMarkdown(markdown)}</div>${renderBlockCitationRefsHtml(block, citationStyle, citationNumbersByArtifactId)}`;
}

/**
 * Render an artifact block with pre-rendered visual content.
 */
function renderArtifact(
  block: ArtifactBlock,
  renderedContent: string,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  let html = `<div class="artifact-block">${renderedContent}`;
  if (block.caption) {
    const caption = applyInlineCitationTokens(
      escapeHtml(block.caption),
      citationStyle,
      citationNumbersByArtifactId,
    );
    html += `<div class="artifact-caption">${caption}</div>`;
  }
  html += renderBlockCitationRefsHtml(block, citationStyle, citationNumbersByArtifactId);
  html += '</div>';
  return html;
}

/**
 * Render an artifact explanation block to HTML.
 */
function renderArtifactExplanation(
  block: ArtifactExplanationBlock,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  const sizeClass = `explanation-${block.size}`;
  const text = applyInlineCitationTokens(
    escapeHtml(block.text),
    citationStyle,
    citationNumbersByArtifactId,
  );
  return `<div class="artifact-explanation ${sizeClass}"><p>${text}</p></div>${renderBlockCitationRefsHtml(block, citationStyle, citationNumbersByArtifactId)}`;
}

/**
 * Render a table block to HTML.
 */
function renderTable(
  block: TableBlock,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  let html = '<table>';
  if (block.caption) {
    html += `<caption>${applyInlineCitationTokens(escapeHtml(block.caption), citationStyle, citationNumbersByArtifactId)}</caption>`;
  }
  html += '<thead><tr>';
  for (const header of block.headers) {
    html += `<th>${applyInlineCitationTokens(escapeHtml(header), citationStyle, citationNumbersByArtifactId)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of block.rows) {
    html += '<tr>';
    for (const cell of row) {
      html += `<td>${applyInlineCitationTokens(escapeHtml(cell), citationStyle, citationNumbersByArtifactId)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html + renderBlockCitationRefsHtml(block, citationStyle, citationNumbersByArtifactId);
}

/**
 * Decode artifact data, which may be base64-encoded.
 */
function decodeArtifactData(data: string): string {
  // If it looks like raw JSON or CSV, use as-is
  const trimmed = data.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.includes(',')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Might be CSV or base64 — continue
    }
  }

  // Try base64 decode
  try {
    const decoded = Buffer.from(data, 'base64').toString('utf-8');
    // Verify it produced valid UTF-8 text (not binary garbage)
    if (/[\x00-\x08\x0E-\x1F]/.test(decoded.slice(0, 200))) {
      return data; // Binary content, use raw
    }
    return decoded;
  } catch {
    return data;
  }
}

function collectInlineCitationIds(markdown: string): string[] {
  if (!markdown) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null = INLINE_CITATION_TOKEN_REGEX.exec(markdown);
  while (match) {
    const artifactId = match[1];
    if (!seen.has(artifactId)) {
      seen.add(artifactId);
      ids.push(artifactId);
    }
    match = INLINE_CITATION_TOKEN_REGEX.exec(markdown);
  }
  INLINE_CITATION_TOKEN_REGEX.lastIndex = 0;
  return ids;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(trimmed);
  }
  return deduped;
}

function renderCitationRefsHtml(indices: number[]): string {
  if (indices.length === 0) return '[?]';
  const refs = indices
    .map((index) => `<a href="#endnote-${index}">${index}</a>`)
    .join(', ');
  return `<sup class="artifact-citation-ref">[${refs}]</sup>`;
}

function applyInlineCitationTokens(
  markdown: string,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  return markdown.replace(INLINE_CITATION_TOKEN_REGEX, (_full, artifactId: string) => {
    if (citationStyle !== 'numeric_endnotes') return '';
    const citationNumbers = citationNumbersByArtifactId.get(artifactId) ?? [];
    return renderCitationRefsHtml(citationNumbers);
  });
}

function collectBlockInlineCitationIds(block: ReportBlock): string[] {
  switch (block.kind) {
    case 'heading':
      return collectInlineCitationIds(block.text);

    case 'paragraph':
      return collectInlineCitationIds(block.markdown);

    case 'artifact':
      return collectInlineCitationIds(block.caption ?? '');

    case 'table':
      return dedupeStrings([
        ...collectInlineCitationIds(block.caption ?? ''),
        ...block.headers.flatMap((header) => collectInlineCitationIds(header)),
        ...block.rows.flatMap((row) =>
          row.flatMap((cell) => collectInlineCitationIds(cell)),
        ),
      ]);

    case 'artifact_explanation':
      return collectInlineCitationIds(block.text);

    case 'page_break':
    case 'spacer':
      return [];
  }
}

function collectBlockCitationIds(block: ReportBlock): string[] {
  return dedupeStrings([
    ...(block.citations ?? []),
    ...collectBlockInlineCitationIds(block),
  ]);
}

function renderBlockCitationRefsHtml(
  block: ReportBlock,
  citationStyle: 'none' | 'numeric_endnotes',
  citationNumbersByArtifactId: Map<string, number[]>,
): string {
  if (citationStyle !== 'numeric_endnotes') return '';

  const inlineIds = new Set(collectBlockInlineCitationIds(block));
  const citationIds = dedupeStrings(block.citations ?? []).filter((id) => !inlineIds.has(id));
  const citationNumbers = dedupeStrings(
    citationIds.flatMap((id) =>
      (citationNumbersByArtifactId.get(id) ?? []).map((index) => String(index)),
    ),
  ).map((index) => Number(index));

  if (citationNumbers.length === 0) return '';
  return `<div class="block-citations">Sources: ${renderCitationRefsHtml(citationNumbers)}</div>`;
}

/**
 * Parse CSV/TSV text into rows of records.
 */
function parseCsv(text: string): Array<Record<string, unknown>> | null {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  if (headers.length < 2) return null;

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Detect base64-encoded image data and infer mime type.
 */
function detectBase64Image(
  data: string,
  mimeHint?: string,
): { mimeType: string; base64: string } | null {
  const trimmed = data.trim();

  if (trimmed.startsWith('data:image/')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (match) {
      return { mimeType: match[1], base64: match[2].replace(/\s+/g, '') };
    }
  }

  const base64 = trimmed.replace(/\s+/g, '');
  if (!base64 || /[^A-Za-z0-9+/=]/.test(base64)) return null;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (bytes.length < 8) return null;

  const startsWith = (seq: number[]): boolean => seq.every((b, i) => bytes[i] === b);
  const ascii = (start: number, end: number): string =>
    bytes.slice(start, end).toString('ascii');

  let detected: string | null = null;
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) {
    detected = 'image/png';
  } else if (startsWith([0xff, 0xd8, 0xff])) {
    detected = 'image/jpeg';
  } else if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') {
    detected = 'image/gif';
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    detected = 'image/webp';
  } else {
    const utf8 = bytes.toString('utf8', 0, Math.min(bytes.length, 512)).trimStart();
    if (utf8.startsWith('<svg')) {
      detected = 'image/svg+xml';
    }
  }

  if (!detected) {
    if (mimeHint && mimeHint.startsWith('image/')) {
      detected = mimeHint;
    } else {
      return null;
    }
  }

  return { mimeType: detected, base64 };
}

/**
 * Render a JSON document as a formatted code block.
 * For structured (non-tabular) JSON data in reports.
 */
export function renderJsonDocument(data: string): string {
  function renderRawJson(text: string): string {
    const truncated = text.length > 3000 ? text.slice(0, 3000) + '\n...' : text;
    return [
      '<div style="text-align:left;max-width:100%;">',
      '<pre style="margin:0;font-size:8pt;line-height:1.45;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:4px;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;text-align:left">',
      `<code>${escapeHtml(truncated)}</code>`,
      '</pre>',
      '</div>',
    ].join('');
  }

  function renderStructuredJsonDocument(parsed: Record<string, unknown>): string | null {
    const rawBlocks = parsed.blocks;
    if (!Array.isArray(rawBlocks)) return null;

    const parts: string[] = ['<div style="text-align:left;max-width:100%;">'];
    const docTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    if (docTitle) {
      parts.push(`<h3 style="margin-top:0;">${escapeHtml(docTitle)}</h3>`);
    }

    const displayBlocks = rawBlocks.slice(0, 50);
    for (const rawBlock of displayBlocks) {
      if (!isRecord(rawBlock)) continue;

      const kind = typeof rawBlock.kind === 'string' ? rawBlock.kind : '';
      switch (kind) {
        case 'heading': {
          const text = typeof rawBlock.text === 'string' ? rawBlock.text : '';
          const level = rawBlock.level === 1 || rawBlock.level === 2 || rawBlock.level === 3
            ? rawBlock.level
            : 3;
          const tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
          if (text) {
            parts.push(`<${tag}>${escapeHtml(text)}</${tag}>`);
          }
          break;
        }

        case 'paragraph': {
          const markdown = typeof rawBlock.markdown === 'string'
            ? rawBlock.markdown
            : typeof rawBlock.text === 'string'
              ? rawBlock.text
              : '';
          if (markdown) {
            parts.push(`<div class="paragraph">${renderMarkdown(markdown)}</div>`);
          }
          break;
        }

        case 'table': {
          const headers = Array.isArray(rawBlock.headers)
            ? rawBlock.headers.map((h) => String(h))
            : [];
          const rows = Array.isArray(rawBlock.rows)
            ? rawBlock.rows.map((row) =>
              Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
            )
            : [];
          if (headers.length > 0 && rows.length > 0) {
            parts.push(renderTable({
              kind: 'table',
              headers,
              rows,
              caption: typeof rawBlock.caption === 'string' ? rawBlock.caption : undefined,
            }, 'none', new Map()));
          }
          break;
        }

        case 'page_break':
          parts.push('<div class="page-break"></div>');
          break;

        case 'spacer': {
          const height = typeof rawBlock.height === 'number' && Number.isFinite(rawBlock.height)
            ? Math.max(1, rawBlock.height)
            : 12;
          parts.push(`<div style="height:${height}pt"></div>`);
          break;
        }

        case 'artifact_explanation': {
          const explText = typeof rawBlock.text === 'string' ? rawBlock.text : '';
          if (explText) {
            const sizeVal = rawBlock.size === 's' || rawBlock.size === 'm' || rawBlock.size === 'l'
              ? rawBlock.size : 'm';
            parts.push(`<div class="artifact-explanation explanation-${sizeVal}"><p>${escapeHtml(explText)}</p></div>`);
          }
          break;
        }

        case 'vega_lite_spec':
        case 'map_spec':
        case 'image':
        case 'artifact':
        case 'html': {
          parts.push(
            `<p style="margin:6pt 0;color:#6b7280;font-size:9pt;"><em>Embedded ${escapeHtml(kind)} block omitted in JSON document view.</em></p>`,
          );
          break;
        }

        default:
          // Unknown block kinds are skipped to keep output readable.
          break;
      }
    }

    if (rawBlocks.length > displayBlocks.length) {
      parts.push(
        `<p style="font-size:9pt;color:#6b7280;font-style:italic;">Showing ${displayBlocks.length} of ${rawBlocks.length} blocks.</p>`,
      );
    }

    parts.push('</div>');
    return parts.join('');
  }

  try {
    const decoded = decodeArtifactData(data);
    const parsed = JSON.parse(decoded);

    // Schema-aware rendering for report-like JSON documents.
    if (isRecord(parsed)) {
      const structured = renderStructuredJsonDocument(parsed);
      if (structured) {
        return structured;
      }
    }

    const pretty = JSON.stringify(parsed, null, 2);
    return renderRawJson(pretty);
  } catch {
    // If JSON parsing fails, show raw text
    const decoded = decodeArtifactData(data);
    return renderRawJson(decoded);
  }
}

/**
 * Render plain text or markdown-like report material as static text.
 */
export function renderTextDocument(data: string): string {
  const decoded = decodeArtifactData(data);
  const truncated = decoded.length > 8000 ? `${decoded.slice(0, 8000)}\n...` : decoded;

  return [
    '<div style="text-align:left;max-width:100%;">',
    '<pre style="margin:0;font-size:9.5pt;line-height:1.5;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:4px;padding:12px;white-space:pre-wrap;word-break:break-word;text-align:left">',
    escapeHtml(truncated),
    '</pre>',
    '</div>',
  ].join('');
}

/**
 * Render a dataset artifact as a preview table (max rows).
 */
export function renderDatasetPreview(
  data: string,
  maxRows = 20,
  mimeType?: string,
): string {
  try {
    const imagePayload = detectBase64Image(data, mimeType);
    if (imagePayload) {
      return `<img src="data:${imagePayload.mimeType};base64,${imagePayload.base64}" alt="Artifact image" style="max-width:100%;height:auto">`;
    }

    const decoded = decodeArtifactData(data);
    let rows: Array<Record<string, unknown>> | null = null;

    // Try JSON first
    try {
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        // Array of records
        rows = parsed.filter(
          (item: unknown): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        );
      } else if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;

        // Check common nested array patterns for tabular data
        const arrayKey = ['values', 'data', 'rows', 'results', 'records', 'items'].find(
          k => Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0
            && typeof (obj[k] as unknown[])[0] === 'object',
        );
        if (arrayKey) {
          rows = (obj[arrayKey] as unknown[]).filter(
            (item: unknown): item is Record<string, unknown> =>
              typeof item === 'object' && item !== null,
          );
        } else {
          // Non-tabular JSON — fall back to json_document renderer
          return renderJsonDocument(data);
        }
      }
    } catch {
      // Not JSON — try CSV/TSV
    }

    // Try CSV/TSV
    if (!rows) {
      rows = parseCsv(decoded);
    }

    if (!rows || rows.length === 0) {
      // Not tabular — try rendering as JSON document
      return renderJsonDocument(data);
    }

    const headers = Object.keys(rows[0]);
    const displayRows = rows.slice(0, maxRows);

    let html = '<table><thead><tr>';
    for (const h of headers) {
      html += `<th>${escapeHtml(String(h))}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of displayRows) {
      html += '<tr>';
      for (const h of headers) {
        const val = row[h];
        const display = val == null ? ''
          : typeof val === 'object' ? JSON.stringify(val)
          : String(val);
        html += `<td>${escapeHtml(display)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';

    if (rows.length > maxRows) {
      html += `<p style="font-size:9pt;color:#6b7280;font-style:italic">Showing ${maxRows} of ${rows.length} rows</p>`;
    }

    return html;
  } catch {
    return '<p><em>Unable to parse dataset for preview</em></p>';
  }
}

interface ArtifactReferenceEntry {
  index: number;
  citationId: string;
  artifactId: string;
  name: string;
  displayName: string;
  type: string;
  mimeType: string;
  hash: string;
  reportSource?: ReportSource;
  origins: ArtifactOriginEntry[];
  dependencies: ArtifactDependencyEntry[];
}

interface ArtifactOriginEntry {
  tool: string;
  connectorId?: string;
  endpoint: string;
  method?: string;
  fetchedAt?: string;
  responseHash?: string;
  parameterHash?: string;
  cacheStatus?: string;
}

interface ArtifactDependencyEntry {
  artifactId: string;
  relationship: string;
  artifactName: string;
}

interface SourceCitationEntry {
  index: number;
  key: string;
  label: string;
  endpoint?: string;
  tool?: string;
  connectorId?: string;
  fetchedAt?: string;
  responseHash?: string;
  parameterHash?: string;
  cacheStatus?: string;
  artifactIds: string[];
  artifactDisplayNames: string[];
}

const SENSITIVE_QUERY_PARAM_RE = /(api[_-]?key|access[_-]?token|token|secret|auth|password|signature|sig|key)$/i;

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function redactEndpoint(rawEndpoint: string): string {
  try {
    const parsed = new URL(rawEndpoint);
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_PARAM_RE.test(key)) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    return parsed.toString();
  } catch {
    return rawEndpoint.replace(
      /([?&](?:api[_-]?key|access[_-]?token|token|secret|auth|password|signature|sig)=)[^&\s]*/gi,
      '$1[redacted]',
    );
  }
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toISOString();
}

function parseArtifactOrigins(artifact: ArtifactDoc | undefined): ArtifactOriginEntry[] {
  if (!artifact || !isRecord(artifact.provenance)) return [];

  const provenance = artifact.provenance as Record<string, unknown>;
  const origins: ArtifactOriginEntry[] = [];
  const seen = new Set<string>();
  const pushOrigin = (origin: ArtifactOriginEntry): void => {
    const key = [
      origin.tool,
      origin.connectorId ?? '',
      origin.endpoint,
      origin.method ?? '',
      origin.fetchedAt ?? '',
      origin.responseHash ?? '',
      origin.parameterHash ?? '',
      origin.cacheStatus ?? '',
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    origins.push(origin);
  };

  const sources = provenance.sources;
  if (Array.isArray(sources)) {
    for (const source of sources) {
      if (!isRecord(source)) continue;
      const endpoint = optionalString(source.endpoint);
      if (!endpoint) continue;
      pushOrigin({
        tool: optionalString(source.tool) ?? 'unknown',
        connectorId: optionalString(source.connectorId),
        endpoint: redactEndpoint(endpoint),
        method: optionalString(source.method),
        fetchedAt: optionalString(source.fetchedAt),
        responseHash: optionalString(source.responseHash),
        parameterHash: optionalString(source.parameterHash),
        cacheStatus: optionalString(source.cacheStatus),
      });
    }
  }

  if (origins.length === 0 && Array.isArray(provenance.inputs)) {
    for (const input of provenance.inputs) {
      if (typeof input !== 'string' || input.trim().length === 0) continue;
      pushOrigin({
        tool: 'input',
        endpoint: redactEndpoint(input.trim()),
      });
    }
  }

  return origins;
}

function parseArtifactDependencies(
  artifact: ArtifactDoc | undefined,
  allArtifacts: Map<string, ArtifactDoc>,
): ArtifactDependencyEntry[] {
  if (!artifact || !Array.isArray(artifact.dependencies)) return [];

  const dependencies: ArtifactDependencyEntry[] = [];
  const seen = new Set<string>();
  for (const dep of artifact.dependencies) {
    if (!isRecord(dep)) continue;
    const artifactId = optionalString(dep.artifactId);
    if (!artifactId) continue;
    const relationship = optionalString(dep.relationship) ?? 'dependency';
    const key = `${artifactId}|${relationship}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push({
      artifactId,
      relationship,
      artifactName: allArtifacts.get(artifactId)?.name ?? artifactId,
    });
  }

  return dependencies;
}

function getSourceCitationKey(origin: ArtifactOriginEntry): string {
  if (origin.responseHash) return `response:${origin.responseHash}`;
  return [
    'origin',
    origin.tool,
    origin.connectorId ?? '',
    origin.endpoint,
    origin.parameterHash ?? '',
    origin.method ?? '',
  ].join('|');
}

function formatSourceLabel(origin: ArtifactOriginEntry): string {
  try {
    const url = new URL(origin.endpoint);
    const path = `${url.hostname}${url.pathname}`.replace(/\/+$/, '');
    return path || url.hostname;
  } catch {
    return origin.endpoint;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildSourceCitationEntries(
  artifactEntries: ArtifactReferenceEntry[],
): {
  sourceEntries: SourceCitationEntry[];
  citationNumbersByArtifactId: Map<string, number[]>;
} {
  const sourceEntries: SourceCitationEntry[] = [];
  const sourceIndexByKey = new Map<string, number>();
  const citationNumbersByArtifactId = new Map<string, number[]>();

  const addSourceEntry = (entry: Omit<SourceCitationEntry, 'index'>): SourceCitationEntry => {
    const existingIndex = sourceIndexByKey.get(entry.key);
    if (existingIndex != null) {
      return sourceEntries[existingIndex];
    }
    const next: SourceCitationEntry = { ...entry, index: sourceEntries.length + 1 };
    sourceIndexByKey.set(entry.key, sourceEntries.length);
    sourceEntries.push(next);
    return next;
  };

  for (const artifactEntry of artifactEntries) {
    const seenForArtifact = new Set<number>();

    if (artifactEntry.reportSource) {
      const source = addSourceEntry({
        key: artifactEntry.reportSource.url
          ? `report-source-url:${artifactEntry.reportSource.url}`
          : `report-source:${artifactEntry.reportSource.id}`,
        label: artifactEntry.reportSource.title
          ?? artifactEntry.reportSource.label
          ?? artifactEntry.displayName,
        endpoint: artifactEntry.reportSource.url,
        fetchedAt: artifactEntry.reportSource.retrievedAt,
        artifactIds: [artifactEntry.artifactId],
        artifactDisplayNames: [artifactEntry.displayName],
      });
      seenForArtifact.add(source.index);
    } else if (artifactEntry.origins.length > 0) {
      for (const origin of artifactEntry.origins) {
        const source = addSourceEntry({
          key: getSourceCitationKey(origin),
          label: formatSourceLabel(origin),
          endpoint: origin.endpoint,
          tool: origin.tool,
          connectorId: origin.connectorId,
          fetchedAt: origin.fetchedAt,
          responseHash: origin.responseHash,
          parameterHash: origin.parameterHash,
          cacheStatus: origin.cacheStatus,
          artifactIds: [],
          artifactDisplayNames: [],
        });
        if (!source.artifactIds.includes(artifactEntry.artifactId)) {
          source.artifactIds.push(artifactEntry.artifactId);
        }
        if (!source.artifactDisplayNames.includes(artifactEntry.displayName)) {
          source.artifactDisplayNames.push(artifactEntry.displayName);
        }
        seenForArtifact.add(source.index);
      }
    } else {
      const source = addSourceEntry({
        key: `artifact:${artifactEntry.artifactId}`,
        label: `${artifactEntry.displayName} (no external source metadata)`,
        artifactIds: [artifactEntry.artifactId],
        artifactDisplayNames: [artifactEntry.displayName],
      });
      seenForArtifact.add(source.index);
    }

    citationNumbersByArtifactId.set(
      artifactEntry.citationId,
      Array.from(seenForArtifact).sort((a, b) => a - b),
    );
  }

  return { sourceEntries, citationNumbersByArtifactId };
}

function renderOriginListHtml(
  origins: ArtifactOriginEntry[],
  detailLevel: 'brief' | 'full',
): string {
  if (origins.length === 0) {
    return '<span class="provenance-empty">No external source lineage captured.</span>';
  }

  const maxItems = detailLevel === 'full' ? origins.length : Math.min(origins.length, 3);
  const items = origins.slice(0, maxItems).map((origin) => {
    const endpointHtml = `<code class="provenance-endpoint">${escapeHtml(origin.endpoint)}</code>`;
    if (detailLevel !== 'full') {
      return `<li>${endpointHtml}</li>`;
    }

    const detailSegments: string[] = [];
    detailSegments.push(`tool: <code>${escapeHtml(origin.tool)}</code>`);
    if (origin.connectorId) {
      detailSegments.push(`connector: <code>${escapeHtml(origin.connectorId)}</code>`);
    }
    if (origin.method) {
      detailSegments.push(`method: <code>${escapeHtml(origin.method)}</code>`);
    }
    if (origin.cacheStatus) {
      detailSegments.push(`cache: <code>${escapeHtml(origin.cacheStatus)}</code>`);
    }
    if (origin.fetchedAt) {
      detailSegments.push(`fetched: <code>${escapeHtml(formatTimestamp(origin.fetchedAt))}</code>`);
    }
    if (origin.responseHash) {
      detailSegments.push(`response-hash: <code>${escapeHtml(origin.responseHash)}</code>`);
    }
    if (origin.parameterHash) {
      detailSegments.push(`params-hash: <code>${escapeHtml(origin.parameterHash)}</code>`);
    }

    return `<li>${endpointHtml}<div class="provenance-origin-meta">${detailSegments.join(' · ')}</div></li>`;
  });

  const overflowNote = origins.length > maxItems
    ? `<li class="provenance-origin-more">…${origins.length - maxItems} more source(s)</li>`
    : '';

  return `<ul class="provenance-origin-list">${items.join('')}${overflowNote}</ul>`;
}

function renderDependencyListHtml(
  dependencies: ArtifactDependencyEntry[],
  detailLevel: 'brief' | 'full',
): string {
  if (dependencies.length === 0) {
    return '<span class="provenance-empty">No artifact dependency lineage captured.</span>';
  }

  const maxItems = detailLevel === 'full' ? dependencies.length : Math.min(dependencies.length, 3);
  const items = dependencies.slice(0, maxItems).map((dep) => {
    const label = `<code>${escapeHtml(dep.artifactName)}</code>`;
    if (detailLevel !== 'full') {
      return `<li>${label}</li>`;
    }

    return (
      `<li>` +
      `${label}` +
      `<div class="provenance-origin-meta">` +
      `artifact-id: <code>${escapeHtml(dep.artifactId)}</code> · relation: <code>${escapeHtml(dep.relationship)}</code>` +
      `</div>` +
      `</li>`
    );
  });

  const overflowNote = dependencies.length > maxItems
    ? `<li class="provenance-origin-more">…${dependencies.length - maxItems} more dependency(ies)</li>`
    : '';

  return `<ul class="provenance-origin-list">${items.join('')}${overflowNote}</ul>`;
}

function getArtifactHash(artifact: ArtifactDoc): string {
  const metadataHash = artifact.metadata && typeof artifact.metadata.sha256 === 'string'
    ? artifact.metadata.sha256
    : null;

  return metadataHash ?? sha256Hex(artifact.data);
}

function buildArtifactReferenceEntries(
  reportSpec: ReportSpecV1,
  artifacts: Map<string, ArtifactDoc>,
): ArtifactReferenceEntry[] {
  const sourceById = new Map<string, ReportSource>();
  for (const source of reportSpec.sources ?? []) {
    if (source.id) {
      sourceById.set(source.id, source);
    }
  }

  const orderedCitationIds: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (citationId: string) => {
    if (!citationId || seen.has(citationId)) return;
    seen.add(citationId);
    orderedCitationIds.push(citationId);
  };

  for (const id of collectInlineCitationIds(reportSpec.abstract ?? '')) {
    pushUnique(id);
  }

  for (const page of reportSpec.pages) {
    for (const block of page.blocks) {
      const blockCitationIds = collectBlockCitationIds(block);
      for (const id of blockCitationIds) {
        pushUnique(id);
      }

      if (block.kind === 'artifact' && blockCitationIds.length === 0) {
        pushUnique(block.artifactId);
      } else if (block.kind === 'artifact_explanation' && blockCitationIds.length === 0) {
        pushUnique(block.artifactId);
      }
    }
  }

  const duplicateNameCounts = new Map<string, number>();
  for (const citationId of orderedCitationIds) {
    const reportSource = sourceById.get(citationId);
    const sourceArtifactId = reportSource?.sourceArtifactId;
    const artifact = sourceArtifactId ? artifacts.get(sourceArtifactId) : artifacts.get(citationId);
    const rawName = reportSource?.title
      ?? reportSource?.label
      ?? artifact?.name
      ?? `Missing source (${citationId})`;
    duplicateNameCounts.set(rawName, (duplicateNameCounts.get(rawName) ?? 0) + 1);
  }

  return orderedCitationIds.map((citationId, idx) => {
    const reportSource = sourceById.get(citationId);
    const artifactId = reportSource?.sourceArtifactId ?? citationId;
    const artifact = artifacts.get(artifactId);
    const rawName = reportSource?.title
      ?? reportSource?.label
      ?? artifact?.name
      ?? `Missing source (${citationId})`;
    const hasDuplicateName = (duplicateNameCounts.get(rawName) ?? 0) > 1;
    const displayName = hasDuplicateName
      ? `${rawName} [${citationId.slice(0, 8)}]`
      : rawName;
    return {
      index: idx + 1,
      citationId,
      artifactId,
      name: rawName,
      displayName,
      type: artifact?.type ?? 'source',
      mimeType: artifact?.mimeType ?? (reportSource?.url ? 'text/uri-list' : 'unknown'),
      hash: artifact ? getArtifactHash(artifact) : reportSource?.url ? sha256Hex(reportSource.url) : 'unavailable',
      reportSource,
      origins: parseArtifactOrigins(artifact),
      dependencies: parseArtifactDependencies(artifact, artifacts),
    };
  });
}

function renderEndnotesHtml(entries: SourceCitationEntry[]): string {
  if (entries.length === 0) return '';

  const items = entries.map((entry) => {
    if (entry.endpoint && isHttpUrl(entry.endpoint)) {
      return (
        `<li id="endnote-${entry.index}" value="${entry.index}">` +
        `<a class="endnote-source-link" href="${escapeHtml(entry.endpoint)}">${escapeHtml(entry.label)}</a>` +
        `</li>`
      );
    }

    return (
      `<li id="endnote-${entry.index}" value="${entry.index}">` +
      `<span class="endnote-source-text">${escapeHtml(entry.label)}</span>` +
      `</li>`
    );
  });

  return `<ol class="endnotes-list">${items.join('')}</ol>`;
}

function renderProvenanceAppendixHtml(
  entries: ArtifactReferenceEntry[],
  detailLevel: 'brief' | 'full',
): string {
  if (entries.length === 0) return '';

  const rows = entries.map((entry) => {
    const hashCell = detailLevel === 'full'
      ? escapeHtml(entry.hash)
      : escapeHtml(entry.hash.slice(0, 12));
    const idCell = detailLevel === 'full'
      ? `<td><code>${escapeHtml(entry.artifactId)}</code></td>`
      : '';
    const mimeCell = detailLevel === 'full'
      ? `<td><code>${escapeHtml(entry.mimeType)}</code></td>`
      : '';
    const originCell = `<td>${renderOriginListHtml(entry.origins, detailLevel)}</td>`;
    const dependencyCell = `<td>${renderDependencyListHtml(entry.dependencies, detailLevel)}</td>`;

    return (
      `<tr>` +
      `<td>${entry.index}</td>` +
      `<td>${escapeHtml(entry.displayName)}</td>` +
      `<td>${escapeHtml(entry.type)}</td>` +
      `${idCell}` +
      `${mimeCell}` +
      `${originCell}` +
      `${dependencyCell}` +
      `<td><code>${hashCell}</code></td>` +
      `</tr>`
    );
  });

  const fullColumns = detailLevel === 'full'
    ? '<th>Artifact ID</th><th>MIME</th>'
    : '';
  const hashLabel = detailLevel === 'full' ? 'SHA-256' : 'SHA-256 (prefix)';

  return (
    `<table class="provenance-table">` +
    `<thead><tr><th>#</th><th>Source Artifact</th><th>Type</th>${fullColumns}<th>Origins</th><th>Derived From</th><th>${hashLabel}</th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody>` +
    `</table>`
  );
}

/**
 * Assemble the complete report HTML from a report spec and rendered blocks.
 *
 * @param reportSpec - The validated report specification
 * @param blockRenderings - Map of "pageIdx:blockIdx" → rendered HTML/SVG content.
 *   Keyed by position so the same artifact can appear in multiple blocks with
 *   different render intents or options.
 * @param theme - Report theme (from the spec)
 * @param artifacts - Resolved artifact map for citation/provenance rendering
 */
export function assembleReportHtml(
  reportSpec: ReportSpecV1,
  blockRenderings: Map<string, string>,
  theme: ReportTheme,
  artifacts: Map<string, ArtifactDoc>,
): string {
  // Load and compile the Handlebars template
  const templatePath = path.resolve(__dirname, 'templates', 'report.html');
  const templateSrc = fs.readFileSync(templatePath, 'utf-8');

  // Register helpers
  Handlebars.registerHelper('joinAuthors', (authors: string[]) => {
    return authors.join(' • ');
  });

  const template = Handlebars.compile(templateSrc);

  const citationStyle = reportSpec.options?.citationStyle ?? 'none';
  const includeProvenanceAppendix = reportSpec.options?.includeProvenanceAppendix ?? false;
  const provenanceDetailLevel = reportSpec.options?.provenanceDetailLevel ?? 'brief';
  const artifactEntries = buildArtifactReferenceEntries(reportSpec, artifacts);
  const { sourceEntries, citationNumbersByArtifactId } = buildSourceCitationEntries(artifactEntries);
  const abstractHtml = reportSpec.abstract
    ? renderMarkdown(
      applyInlineCitationTokens(reportSpec.abstract, citationStyle, citationNumbersByArtifactId),
    )
    : '';
  const endnotesHtml = citationStyle === 'numeric_endnotes'
    ? renderEndnotesHtml(sourceEntries)
    : '';
  const provenanceAppendixHtml = includeProvenanceAppendix
    ? renderProvenanceAppendixHtml(artifactEntries, provenanceDetailLevel)
    : '';

  // Render all pages with their blocks
  const pages = reportSpec.pages.map((page, pageIdx) => {
    const blocks = page.blocks.map((block: ReportBlock, blockIdx: number) => {
      switch (block.kind) {
        case 'heading':
          return renderHeading(block, citationStyle, citationNumbersByArtifactId);

        case 'paragraph':
          return renderParagraph(block, citationStyle, citationNumbersByArtifactId);

        case 'artifact': {
          const content = blockRenderings.get(`${pageIdx}:${blockIdx}`) || '<p><em>Artifact not rendered</em></p>';
          return renderArtifact(block, content, citationStyle, citationNumbersByArtifactId);
        }

        case 'table':
          return renderTable(block, citationStyle, citationNumbersByArtifactId);

        case 'artifact_explanation':
          return renderArtifactExplanation(block, citationStyle, citationNumbersByArtifactId);

        case 'page_break':
          return '<div class="page-break"></div>';

        case 'spacer':
          return `<div style="height: ${block.height}pt"></div>`;

        default:
          return '';
      }
    });

    return { blocks };
  });

  // Determine if we should show a title page
  const showTitlePage = !!(reportSpec.title || reportSpec.authors.length > 0 || reportSpec.abstract);

  return template({
    title: reportSpec.title,
    authors: reportSpec.authors,
    abstractHtml,
    showTitlePage,
    pages,
    endnotesHtml,
    provenanceAppendixHtml,
    pageSize: theme.pageSize,
    margins: theme.margins,
    fonts: theme.fonts,
    colors: theme.colors,
  });
}
