/** Ported from symposium-ai-web src/services/analyze/dataset/DatasetRegistry.ts (Phase 3), logic unchanged. */
import { stableSerialize } from '../../contract/lib/content-hash';
import type { ToolResultProvenance } from '../../contract/types';

export interface SessionFetchCacheEntry {
  fingerprint: string;
  tool: 'fetch_api' | 'fetch_url';
  endpoint: string;
  method: string;
  path: string;
  /** Start of the data, for the model; the full body lives only in the sandbox file. */
  preview: string;
  previewTruncated: boolean;
  fetchedBytes: number;
  provenance?: ToolResultProvenance;
  createdAt: number;
}

function normalizeEndpoint(urlValue: string): string {
  try {
    const parsed = new URL(urlValue);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return urlValue;
  }
}

function hashStringFnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildFetchReuseFingerprint(
  toolName: 'fetch_api' | 'fetch_url',
  args: Record<string, unknown>,
): string {
  const url = typeof args.url === 'string' ? args.url : '';
  const method = toolName === 'fetch_api'
    ? (typeof args.method === 'string' ? args.method.toUpperCase() : 'GET')
    : 'GET';
  const normalizedEndpoint = normalizeEndpoint(url);

  const normalizedArgs = { ...args };
  delete normalizedArgs.url;

  const fingerprintInput = stableSerialize({
    toolName,
    endpoint: normalizedEndpoint,
    method,
    args: normalizedArgs,
  });

  return `fetch_${hashStringFnv1a(fingerprintInput)}`;
}

export class DatasetRegistry {
  private readonly fetchCache = new Map<string, SessionFetchCacheEntry>();
  private readonly workbookByGroupId = new Map<string, string>();

  getFetchCache(fingerprint: string): SessionFetchCacheEntry | undefined {
    return this.fetchCache.get(fingerprint);
  }

  registerFetchCache(entry: SessionFetchCacheEntry): void {
    this.fetchCache.set(entry.fingerprint, entry);
  }

  registerCanonicalWorkbook(groupId: string, artifactId: string): void {
    if (!groupId || !artifactId) return;
    this.workbookByGroupId.set(groupId, artifactId);
  }

  getCanonicalWorkbook(groupId: string): string | undefined {
    return this.workbookByGroupId.get(groupId);
  }

  clear(): void {
    this.fetchCache.clear();
    this.workbookByGroupId.clear();
  }
}
