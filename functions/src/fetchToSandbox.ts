import * as crypto from 'crypto';
import type { ToolResult } from './tools';
import { SANDBOX_LIMIT_MODEL_NOTE, SandboxLimitError } from './sandbox/service';

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

/** The sandbox calls a fetch-to-sandbox makes (the session service, or a test's fake). */
export interface FetchSandbox {
  claimSlot(uid: string, sessionKey: string): Promise<void>;
  writeFile(uid: string, sessionKey: string, input: { path: string; base64: string }): Promise<unknown>;
}

/**
 * Fetch a response straight into the session's sandbox. The slot is claimed
 * first: a refused sandbox is refused before anything is downloaded (Step 8 F5).
 */
export async function runSandboxFetch(
  uid: string,
  target: SandboxFetchTarget,
  sandbox: FetchSandbox,
  fetch: (maxBytes: number) => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    await sandbox.claimSlot(uid, target.sessionKey);
  } catch (error) {
    if (!(error instanceof SandboxLimitError)) throw error;
    return { toolCallId: '', success: false, error: `${error.message} ${SANDBOX_LIMIT_MODEL_NOTE}` };
  }
  const result = await fetch(MAX_SANDBOX_FETCH_BYTES);
  if (!result.success || typeof result.content !== 'string') return result;
  try {
    const summary = await saveFetchToSandbox(target, result.content, result.metadata?.contentType, async (sessionKey, path, base64) => {
      await sandbox.writeFile(uid, sessionKey, { path, base64 });
    });
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
    console.error('[executeTool] Failed to save fetch_api response to the sandbox', { uid, sessionKey: target.sessionKey, error });
    return {
      toolCallId: result.toolCallId,
      success: false,
      error: `Fetched ${Buffer.byteLength(result.content, 'utf8')} bytes but could not save them to the sandbox: ${error instanceof Error ? error.message : String(error)}${error instanceof SandboxLimitError ? ` ${SANDBOX_LIMIT_MODEL_NOTE}` : ''}`,
      metadata: result.metadata,
    };
  }
}
