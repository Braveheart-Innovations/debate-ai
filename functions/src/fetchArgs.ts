/**
 * fetch_api's key-value arguments (`query_params`, `headers`). Models send them
 * as an object or as a JSON string of one; both work. Anything else is an error
 * the model can act on, never a silent drop (Step 8 F6: a JSON-string
 * `query_params` used to become no parameters at all).
 */

// Outbound headers a caller must never be able to set — cloud metadata probes.
export const FORBIDDEN_OUTBOUND_HEADERS = new Set([
  'metadata-flavor',
  'metadata',
  'x-goog-metadata',
  'x-google-metadata',
  'x-aws-ec2-metadata-token',
  'x-aws-ec2-metadata-token-ttl-seconds',
  'x-metadata-token',
]);

export type KeyValueArg =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string };

const EXAMPLES: Record<string, string> = {
  query_params: '{"series_id": "CPIAUCSL"}',
  headers: '{"Accept": "application/json"}',
};

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return "a string that isn't a JSON object";
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

function shapeError(name: string, got: string): string {
  return `${name} must be an object of key-value pairs, e.g. ${EXAMPLES[name] ?? '{"key": "value"}'}; got ${got}.`;
}

/** The argument as a plain object (a JSON string of one is parsed), or the error. */
function toObject(name: string, value: unknown): { object: Record<string, unknown> } | { error: string } {
  let candidate = value;
  if (typeof candidate === 'string') {
    if (!candidate.trim()) return { object: {} };
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { error: shapeError(name, describe(value)) };
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { error: shapeError(name, describe(value)) };
  }
  if (typeof candidate !== 'object' || Array.isArray(candidate)) return { error: shapeError(name, describe(candidate)) };
  return { object: candidate as Record<string, unknown> };
}

/** A value as a string: scalars as text, a list comma-joined; null for "skip"; undefined for "can't". */
function toValueString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
    return value.map(String).join(',');
  }
  return undefined;
}

function parseKeyValueArg(name: string, value: unknown, skipKey: (key: string) => boolean = () => false): KeyValueArg {
  if (value === null || value === undefined) return { ok: true, values: {} };
  const parsed = toObject(name, value);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(parsed.object)) {
    if (skipKey(key)) continue;
    const text = toValueString(raw);
    if (text === null) continue;
    if (text === undefined) {
      return { ok: false, error: `${name}.${key} must be a string, number, boolean, or a list of them; got ${describe(raw)}.` };
    }
    values[key] = text;
  }
  return { ok: true, values };
}

export function parseQueryParamsArg(value: unknown): KeyValueArg {
  return parseKeyValueArg('query_params', value);
}

/** Headers; the cloud-metadata ones are dropped silently (SSRF hardening). */
export function parseHeadersArg(value: unknown): KeyValueArg {
  return parseKeyValueArg('headers', value, (key) => FORBIDDEN_OUTBOUND_HEADERS.has(key.toLowerCase()));
}

/** The first argument error in a fetch_api call, or null. */
export function fetchApiArgsError(args: { query_params?: unknown; headers?: unknown }): string | null {
  for (const parsed of [parseQueryParamsArg(args.query_params), parseHeadersArg(args.headers)]) {
    if (!parsed.ok) return parsed.error;
  }
  return null;
}
