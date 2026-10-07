import * as crypto from 'crypto';

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

export function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
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

/** Save the body into the sandbox and summarise it. Throws if the write fails. */
export async function saveFetchToSandbox(
  target: SandboxFetchTarget,
  content: string,
  contentType: string | undefined,
  write: SandboxFileWriter,
): Promise<SandboxFetchSummary> {
  const path = `${target.pathBase}${extensionForResponse(contentType, content)}`;
  const buffer = Buffer.from(content, 'utf8');
  await write(target.sessionKey, path, buffer.toString('base64'));
  return {
    path,
    bytes: buffer.byteLength,
    responseHash: sha256Hex(content),
    contentType,
    preview: content.slice(0, SANDBOX_FETCH_PREVIEW_CHARS),
    previewTruncated: content.length > SANDBOX_FETCH_PREVIEW_CHARS,
  };
}
