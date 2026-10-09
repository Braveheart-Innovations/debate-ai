/** Ported from symposium-ai-web src/services/analyze/orchestrator/tools/provenance.ts (Phase 3), logic unchanged. */
import { sha256, stableSerialize } from '../../contract/lib/content-hash';
import type { ToolResult } from '../../contract/lib/ai/tools/types';

const SENSITIVE_PROVENANCE_KEY_PATTERN = /(authorization|api[_-]?key|x-api-key|token|secret|password|passwd|bearer|cookie|session|appid|\$\$app_token)/i;
const PROVENANCE_VALUE_MAX_LENGTH = 280;

export interface BuildFetchProvenanceInput {
  toolName: 'fetch_api' | 'fetch_url';
  args: Record<string, unknown>;
  rawContent: string;
  /** SHA-256 of the full response when the server saved it (rawContent is then only a preview). */
  responseHash?: string;
  cacheStatus?: 'fresh' | 'cached';
}

function redactSensitiveFieldsForProvenance(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveFieldsForProvenance(item));
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_PROVENANCE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = redactSensitiveFieldsForProvenance(nestedValue);
      }
    }
    return sanitized;
  }

  return value;
}

function toCompactParameterMap(value: Record<string, unknown>): Record<string, string> {
  const compact: Record<string, string> = {};

  for (const key of Object.keys(value).sort()) {
    const rawValue = value[key];
    if (rawValue === undefined) continue;

    const serialized = typeof rawValue === 'string'
      ? rawValue
      : stableSerialize(rawValue);

    compact[key] = serialized.length > PROVENANCE_VALUE_MAX_LENGTH
      ? `${serialized.slice(0, PROVENANCE_VALUE_MAX_LENGTH)}... (truncated)`
      : serialized;
  }

  return compact;
}

function normalizeEndpoint(urlValue: string): string {
  try {
    const parsed = new URL(urlValue);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return urlValue;
  }
}

export async function buildFetchProvenance(
  input: BuildFetchProvenanceInput,
): Promise<NonNullable<ToolResult['provenance']>> {
  const {
    toolName,
    args,
    rawContent,
    responseHash: serverResponseHash,
    cacheStatus = 'fresh',
  } = input;

  const requestUrl = typeof args.url === 'string' ? args.url : '';
  const endpoint = normalizeEndpoint(requestUrl);
  const method = toolName === 'fetch_api'
    ? (typeof args.method === 'string' ? args.method.toUpperCase() : 'GET')
    : 'GET';
  const connectorId = toolName === 'fetch_api' && typeof args.api_key_ref === 'string'
    ? args.api_key_ref
    : undefined;

  const sanitized = redactSensitiveFieldsForProvenance(args) as Record<string, unknown>;
  delete sanitized.url;
  delete sanitized.api_key_ref;

  const parameterHash = await sha256(stableSerialize(sanitized));
  // A response saved into the sandbox server-side arrives as a preview, with its hash.
  const responseHash = serverResponseHash ?? await sha256(rawContent);

  return {
    tool: toolName,
    connectorId,
    endpoint,
    method,
    parameters: toCompactParameterMap(sanitized),
    parameterHash,
    fetchedAt: new Date().toISOString(),
    responseHash,
    cacheStatus,
  };
}
