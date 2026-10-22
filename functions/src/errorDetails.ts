/**
 * What a thrown value says about itself. A catch clause's error is `unknown`:
 * an Error, an HttpsError, a provider's error object, or a string. These read
 * one field each, as the value carries it, without assuming its shape.
 */

/** A JSON object (a provider's error body, say), as opposed to any other value. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A field of a thrown value, whatever was thrown. */
function fieldOf(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null ? Reflect.get(error, key) : undefined;
}

/** The error's message (a thrown string is its own), else the fallback. */
export function messageOf(error: unknown, fallback = ''): string {
  if (typeof error === 'string') return error || fallback;
  const message = fieldOf(error, 'message');
  return typeof message === 'string' && message ? message : fallback;
}

export function nameOf(error: unknown): string | undefined {
  const name = fieldOf(error, 'name');
  return typeof name === 'string' ? name : undefined;
}

/** The HTTP status a provider call's error carries. */
export function statusOf(error: unknown): number | undefined {
  const status = fieldOf(error, 'status');
  return typeof status === 'number' ? status : undefined;
}

export function codeOf(error: unknown): unknown {
  return fieldOf(error, 'code');
}

export function causeOf(error: unknown): unknown {
  return fieldOf(error, 'cause');
}

export function stackOf(error: unknown): string | undefined {
  const stack = fieldOf(error, 'stack');
  return typeof stack === 'string' ? stack : undefined;
}
