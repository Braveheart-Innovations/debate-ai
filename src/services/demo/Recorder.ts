import type { DemoMessageEvent } from '@/types/demo';

/**
 * Lightweight in-memory recorder for capturing demo sessions during development.
 * You can call these functions from strategic points (e.g., before/after send, on each stream chunk)
 * and then export the events to JSON for the packer.
 */

let active: { type: 'chat' | 'debate' | 'compare'; id: string; title: string; comboKey?: string } | null = null;
let buffer: DemoMessageEvent[] = [];

export function startRecording(opts: { type: 'chat' | 'debate' | 'compare'; id: string; title: string; comboKey?: string }): void {
  active = opts;
  buffer = [];
}

export function recordEvent(event: DemoMessageEvent): void {
  if (!active) return;
  buffer.push({ ...event });
}

export function stopRecording(): { session: { type: 'chat' | 'debate' | 'compare'; id: string; title: string; comboKey?: string; events: DemoMessageEvent[] } } | null {
  if (!active) return null;
  const session = { type: active.type, id: active.id, title: active.title, comboKey: active.comboKey, events: buffer } as const;
  active = null;
  // In RN dev, you can JSON.stringify({ session }) and copy from logs, or send to a file writer.
  return { session };
}
