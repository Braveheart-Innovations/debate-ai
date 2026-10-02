import { demoRecordings } from '@/assets/demo/recordingsManifest';
import {
  expectDemoChat,
  expectDemoCompare,
  expectDemoDebate,
  isDemoChat,
  isDemoCompare,
  isDemoDebate,
  isDemoMessageEvent,
} from '@/services/demo/demoRecordingGuards';

describe('bundled demo recordings', () => {
  // Importing the real manifest runs every recording through its validator,
  // so a malformed recording fails here (in CI) instead of at app runtime.
  it('loads every recording as a valid domain object of its declared type', () => {
    expect(demoRecordings.length).toBeGreaterThan(0);
    for (const entry of demoRecordings) {
      const valid =
        entry.type === 'chat'
          ? isDemoChat(entry.data)
          : entry.type === 'compare'
            ? isDemoCompare(entry.data)
            : isDemoDebate(entry.data);
      expect({ id: entry.id, valid }).toEqual({ id: entry.id, valid: true });
    }
  });

  it('covers all three recording types', () => {
    const types = new Set(demoRecordings.map((entry) => entry.type));
    expect(types).toEqual(new Set(['chat', 'compare', 'debate']));
  });
});

describe('demo recording guards', () => {
  const event = { type: 'message', role: 'assistant', content: 'Hi', speakerProvider: 'claude' };

  it('accepts well-formed events and rejects bad discriminants', () => {
    expect(isDemoMessageEvent(event)).toBe(true);
    expect(isDemoMessageEvent({ ...event, type: 'shout' })).toBe(false);
    expect(isDemoMessageEvent({ ...event, role: 'narrator' })).toBe(false);
    expect(isDemoMessageEvent({ ...event, speakerProvider: 'grok' })).toBe(false);
    expect(isDemoMessageEvent({ ...event, content: 42 })).toBe(false);
    expect(isDemoMessageEvent({ ...event, attachments: [{ type: 'image' }] })).toBe(false);
    expect(isDemoMessageEvent(null)).toBe(false);
  });

  it('validates each recording kind structurally', () => {
    expect(isDemoChat({ id: 'c', title: 'T', events: [event] })).toBe(true);
    expect(isDemoChat({ id: 'c', events: [event] })).toBe(false);
    expect(isDemoDebate({ id: 'd', topic: 'T', participants: ['A', 'B'], events: [] })).toBe(true);
    expect(isDemoDebate({ id: 'd', topic: 'T', events: [] })).toBe(false);
    const run = { id: 'r', label: 'L', columns: [{ name: 'Left', events: [event] }] };
    expect(isDemoCompare({ id: 'x', title: 'T', category: 'model', runs: [run] })).toBe(true);
    expect(isDemoCompare({ id: 'x', title: 'T', category: 'vibes', runs: [run] })).toBe(false);
  });

  it('throws naming the recording when validation fails', () => {
    expect(() => expectDemoChat({ id: 'c' }, 'chat_broken_v1')).toThrow(
      'Demo recording "chat_broken_v1" is not a valid DemoChat'
    );
    expect(() => expectDemoCompare({}, 'compare_broken_v1')).toThrow('compare_broken_v1');
    expect(() => expectDemoDebate([], 'debate_broken_1')).toThrow('debate_broken_1');
  });

  it('returns the validated value unchanged', () => {
    const chat = { id: 'c', title: 'T', events: [event] };
    expect(expectDemoChat(chat, 'chat_ok')).toBe(chat);
  });
});
