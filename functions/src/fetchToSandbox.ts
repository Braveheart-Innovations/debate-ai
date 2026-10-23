import * as crypto from 'crypto';
import type { ToolResult } from './tools';
import { SandboxUnavailableError } from './sandbox/service';

/**
 * fetch_api responses written straight into the caller's Analyze sandbox
 * (docs/analyze-fetch-to-sandbox-plan.md in the web repo). The body never goes
 * back to the browser; the caller gets the path, size, hash and a preview.
 */

/** Largest response saved to the sandbox (Michael, 2026-10-05). */
export const MAX_SANDBOX_FETCH_BYTES = 25 * 1024 * 1024;
export const SANDBOX_FETCH_PREVIEW_CHARS = 2000;

export interface SandboxFetchTarget {
  sessionKey: string;
  /** Path without extension, e.g. /data/fetch_call_abc; the extension follows the content type. */
  pathBase: string;
}

const SESSION_KEY_PATTERN = /^[A-Za-z0-9_:-][A-Za-z0-9_:.-]{0,127}$/;
const PATH_BASE_PATTERN = /^\/data\/[A-Za-z0-9_-]{1,160}$/;

/** The request's sandbox target, or null for the inline path (or a malformed target). */
export function parseSandboxFetchTarget(raw: unknown): SandboxFetchTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const { sessionKey, pathBase } = raw as Record<string, unknown>;
  if (typeof sessionKey !== 'string' || !SESSION_KEY_PATTERN.test(sessionKey)) return null;
  if (typeof pathBase !== 'string' || !PATH_BASE_PATTERN.test(pathBase)) return null;
  return { sessionKey, pathBase };
}

/** File extension for a response: the content type first, then what the body looks like. */
export function extensionForResponse(contentType: string | undefined, content: string): string {
  const type = (contentType || '').toLowerCase();
  if (type.includes('json')) return '.json';
  if (type.includes('csv')) return '.csv';
  if (type.includes('xml')) return '.xml';
  if (type.includes('html')) return '.html';
  const start = content.trimStart().slice(0, 1);
  if (start === '{' || start === '[') return '.json';
  if (start === '<') return '.xml';
  return '.txt';
}

export function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Content types whose bodies are text. Matched by subtype, not substring: the .xlsx
 * type is application/vnd.openxmlformats-…, which contains "xml".
 */
export function isTextContentType(contentType: string | undefined): boolean {
  const [type = '', subtype = ''] = (contentType || '').toLowerCase().split(';')[0].trim().split('/');
  if (type === 'text') return true;
  if (type !== 'application') return false;
  return /^(json|xml|csv|javascript|x-javascript|ecmascript|yaml|x-yaml|ndjson|x-ndjson|x-www-form-urlencoded)$/.test(subtype)
    || /\+(json|xml)$/.test(subtype);
}

/** Types that say nothing about the body: whether it's text is read from the bytes. */
const UNTYPED_CONTENT_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/download', 'application/force-download']);

/**
 * Whether a response is a file to keep byte for byte (a spreadsheet, archive, PDF,
 * image) rather than text: its content type says so, or it has none and isn't UTF-8.
 * Decoding a file as text replaces every invalid byte, so an .xlsx saved that way is
 * a corrupt ZIP.
 */
export function isBinaryResponse(contentType: string | undefined, body: Uint8Array): boolean {
  if (isTextContentType(contentType)) return false;
  const type = (contentType || '').toLowerCase().split(';')[0].trim();
  if (!UNTYPED_CONTENT_TYPES.has(type)) return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(body);
    return false;
  } catch {
    return true;
  }
}

const BINARY_EXTENSIONS: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-excel.sheet.macroenabled.12': '.xlsm',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12': '.xlsb',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/gzip': '.gz',
  'application/x-gzip': '.gz',
  'application/vnd.apache.parquet': '.parquet',
  'application/x-parquet': '.parquet',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** URL endings that name a page or a script, not the file it serves. */
const PAGE_EXTENSIONS = new Set(['.aspx', '.asp', '.php', '.jsp', '.cgi', '.htm', '.html', '.do']);

const fileExtensionOf = (name: string | undefined): string | null => {
  const match = /(\.[a-z0-9]{1,8})$/i.exec((name || '').trim());
  return match && !PAGE_EXTENSIONS.has(match[1].toLowerCase()) ? match[1].toLowerCase() : null;
};

/**
 * A binary file's extension: the filename the server gives (Content-Disposition), then
 * the content type, then the URL's own, else .bin.
 */
export function binaryFileExtension(contentType: string | undefined, contentDisposition: string | null | undefined, url: string): string {
  const filename = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition || '')?.[1];
  let decoded = filename;
  try {
    decoded = filename ? decodeURIComponent(filename) : undefined;
  } catch {
    // A malformed %-escape: use the name as sent.
  }
  const fromName = fileExtensionOf(decoded);
  if (fromName) return fromName;
  const fromType = BINARY_EXTENSIONS[(contentType || '').toLowerCase().split(';')[0].trim()];
  if (fromType) return fromType;
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    // Not a URL: no extension from it.
  }
  return fileExtensionOf(path) ?? '.bin';
}

export interface SandboxFetchSummary {
  path: string;
  bytes: number;
  responseHash: string;
  contentType?: string;
  preview: string;
  previewTruncated: boolean;
}

export type SandboxFileWriter = (sessionKey: string, path: string, base64: string) => Promise<void>;

/**
 * Save the body into the sandbox and summarise it. Throws if the write fails. A binary
 * file (`binaryExtension` set) arrives as base64 and is written byte for byte; the
 * model gets a note instead of a text preview.
 */
export async function saveFetchToSandbox(
  target: SandboxFetchTarget,
  content: string,
  contentType: string | undefined,
  write: SandboxFileWriter,
  binaryExtension?: string,
): Promise<SandboxFetchSummary> {
  const path = `${target.pathBase}${binaryExtension ?? extensionForResponse(contentType, content)}`;
  const buffer = Buffer.from(content, binaryExtension ? 'base64' : 'utf8');
  await write(target.sessionKey, path, buffer.toString('base64'));
  return {
    path,
    bytes: buffer.byteLength,
    responseHash: sha256Hex(buffer),
    contentType,
    preview: binaryExtension
      ? `(a binary ${binaryExtension} file${contentType ? `, ${contentType}` : ''}: open it in Python, not as text)`
      : content.slice(0, SANDBOX_FETCH_PREVIEW_CHARS),
    previewTruncated: !binaryExtension && content.length > SANDBOX_FETCH_PREVIEW_CHARS,
  };
}

/** The sandbox calls a fetch-to-sandbox makes (the session service, or a test's fake). */
export interface FetchSandbox {
  claimSlot(uid: string, sessionKey: string): Promise<void>;
  writeFile(uid: string, sessionKey: string, input: { path: string; base64: string }): Promise<unknown>;
}

/**
 * Fetch a response straight into the session's sandbox. The slot is claimed
 * first: a refused sandbox throws before anything is downloaded (Step 8 F5),
 * and the turn ends with its message (round.ts).
 */
export async function runSandboxFetch(
  uid: string,
  target: SandboxFetchTarget,
  sandbox: FetchSandbox,
  fetch: (maxBytes: number) => Promise<ToolResult>,
): Promise<ToolResult> {
  await sandbox.claimSlot(uid, target.sessionKey);
  const result = await fetch(MAX_SANDBOX_FETCH_BYTES);
  if (!result.success || typeof result.content !== 'string') return result;
  try {
    const summary = await saveFetchToSandbox(target, result.content, result.metadata?.contentType, async (sessionKey, path, base64) => {
      await sandbox.writeFile(uid, sessionKey, { path, base64 });
    }, result.metadata?.binaryExtension);
    return {
      ...result,
      content: summary.preview,
      metadata: {
        ...result.metadata,
        sandboxPath: summary.path,
        bytes: summary.bytes,
        responseHash: summary.responseHash,
        previewTruncated: summary.previewTruncated,
      },
    };
  } catch (error) {
    if (error instanceof SandboxUnavailableError) throw error;
    console.error('[executeTool] Failed to save fetch_api response to the sandbox', { uid, sessionKey: target.sessionKey, error });
    return {
      toolCallId: result.toolCallId,
      success: false,
      error: `Fetched ${Buffer.byteLength(result.content, result.metadata?.binaryExtension ? 'base64' : 'utf8')} bytes but could not save them to the sandbox: ${error instanceof Error ? error.message : String(error)}`,
      metadata: result.metadata,
    };
  }
}
