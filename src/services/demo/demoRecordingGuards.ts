import type { DemoChat, DemoCompare, DemoCompareRun, DemoDebate, DemoMessageEvent } from '@/types/demo';

/**
 * Runtime validation for the bundled demo recordings (JSON files under
 * src/assets/demo/recordings). JSON imports are typed by their literal shape,
 * not by our domain types, so the generated manifest validates each recording
 * here instead of casting it. The manifest is imported by the test suite, so a
 * malformed recording fails CI rather than reaching users.
 */

const EVENT_TYPES: ReadonlySet<string> = new Set<DemoMessageEvent['type']>([
  'message',
  'stream',
  'tool-start',
  'tool-end',
  'image-grid',
  'pause',
  'divider',
]);
const ROLES: ReadonlySet<string> = new Set<NonNullable<DemoMessageEvent['role']>>(['user', 'assistant', 'system']);
const SPEAKER_PROVIDERS: ReadonlySet<string> = new Set<NonNullable<DemoMessageEvent['speakerProvider']>>([
  'claude',
  'openai',
  'google',
]);
const ATTACHMENT_TYPES: ReadonlySet<string> = new Set(['image', 'document']);
const COMPARE_CATEGORIES: ReadonlySet<string> = new Set<DemoCompare['category']>(['provider', 'model', 'persona']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptional = <T>(value: unknown, check: (v: unknown) => v is T): boolean =>
  value === undefined || check(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number';
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isOneOf =
  (allowed: ReadonlySet<string>) =>
  (value: unknown): value is string =>
    typeof value === 'string' && allowed.has(value);

const isAttachment = (value: unknown): boolean =>
  isRecord(value) && isOneOf(ATTACHMENT_TYPES)(value.type) && isString(value.uri) && isOptional(value.alt, isString);

export function isDemoMessageEvent(value: unknown): value is DemoMessageEvent {
  return (
    isRecord(value) &&
    isOneOf(EVENT_TYPES)(value.type) &&
    isOptional(value.role, isOneOf(ROLES)) &&
    isOptional(value.content, isString) &&
    isOptional(value.delayMs, isNumber) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) && value.attachments.every(isAttachment))) &&
    (value.tool === undefined || (isRecord(value.tool) && isString(value.tool.name))) &&
    (value.meta === undefined || isRecord(value.meta)) &&
    isOptional(value.speakerProvider, isOneOf(SPEAKER_PROVIDERS)) &&
    isOptional(value.speakerPersona, isString)
  );
}

const isEventList = (value: unknown): value is DemoMessageEvent[] =>
  Array.isArray(value) && value.every(isDemoMessageEvent);

export function isDemoChat(value: unknown): value is DemoChat {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isEventList(value.events) &&
    isOptional(value.tags, isStringArray)
  );
}

export function isDemoDebate(value: unknown): value is DemoDebate {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.topic) &&
    isStringArray(value.participants) &&
    isEventList(value.events)
  );
}

const isCompareRun = (value: unknown): value is DemoCompareRun =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.label) &&
  isOptional(value.prompt, isString) &&
  Array.isArray(value.columns) &&
  value.columns.every((column) => isRecord(column) && isString(column.name) && isEventList(column.events));

export function isDemoCompare(value: unknown): value is DemoCompare {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isOneOf(COMPARE_CATEGORIES)(value.category) &&
    Array.isArray(value.runs) &&
    value.runs.every(isCompareRun)
  );
}

const validated =
  <T>(guard: (value: unknown) => value is T, kind: string) =>
  (value: unknown, id: string): T => {
    if (!guard(value)) {
      throw new Error(`Demo recording "${id}" is not a valid ${kind}`);
    }
    return value;
  };

/** Validates a bundled recording; throws naming the recording if it is malformed. */
export const expectDemoChat = validated(isDemoChat, 'DemoChat');
export const expectDemoCompare = validated(isDemoCompare, 'DemoCompare');
export const expectDemoDebate = validated(isDemoDebate, 'DemoDebate');
