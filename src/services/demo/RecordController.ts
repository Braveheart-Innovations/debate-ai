import { Platform } from 'react-native';
import { startRecording, recordEvent, stopRecording } from '@/services/demo/Recorder';
import { DemoContentService } from '@/services/demo/DemoContentService';
import type { DemoCompare, DemoCompareRun, DemoMessageEvent } from '@/types/demo';

const DEMO_SPEAKERS = ['claude', 'openai', 'google'] as const;
type DemoSpeaker = (typeof DEMO_SPEAKERS)[number];
const isDemoSpeaker = (provider: string): provider is DemoSpeaker =>
  (DEMO_SPEAKERS as readonly string[]).includes(provider);

type RecorderSession = NonNullable<ReturnType<typeof stopRecording>>['session'];
/** The session `stop()` returns for export; compare/debate sessions carry their extra fields. */
export type RecordedSession =
  | RecorderSession
  | (RecorderSession & { type: 'compare'; runs: DemoCompareRun[]; category: DemoCompare['category'] })
  | (RecorderSession & { type: 'debate'; topic: string; participants: string[] });

type ChatStartOpts = { id: string; title: string; comboKey?: string };
type DebateStartOpts = { id: string; topic: string; comboKey?: string; participants?: string[] };
type CompareStartOpts = { id: string; title: string; comboKey?: string };

let active = false;
let current:
  | { type: 'chat'; id: string; title: string; comboKey?: string }
  | { type: 'debate'; id: string; topic: string; comboKey?: string; participants?: string[] }
  | { type: 'compare'; id: string; title: string; comboKey?: string }
  | null = null;

// Compare turn aggregation
let compareTurns: Array<{
  user?: string;
  responses: Record<DemoSpeaker, string>;
}> = [];

export const RecordController = {
  isActive(): boolean {
    return active;
  },

  startChat(opts: ChatStartOpts): void {
    if (active) return;
    const meta: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      screen: 'chat',
      comboKey: opts.comboKey,
      platform: Platform.OS,
    };
    // Start underlying recorder first, then write metadata divider
    startRecording({ type: 'chat', id: opts.id, title: opts.title, comboKey: opts.comboKey });
    recordEvent({ type: 'divider', meta });
    current = { type: 'chat', id: opts.id, title: opts.title, comboKey: opts.comboKey };
    active = true;
  },

  startDebate(opts: DebateStartOpts): void {
    if (active) return;
    const meta: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      screen: 'debate',
      comboKey: opts.comboKey,
      platform: Platform.OS,
      participants: opts.participants,
      topic: opts.topic,
    };
    startRecording({ type: 'debate', id: opts.id, title: opts.topic, comboKey: opts.comboKey });
    recordEvent({ type: 'divider', meta });
    // Record a motion marker as a user message for context (optional)
    const topic = opts.topic || '';
    const motionContent = topic.trim().toLowerCase().startsWith('motion:') ? topic : `Motion: ${topic}`;
    recordEvent({ type: 'message', role: 'user', content: motionContent });
    current = { type: 'debate', id: opts.id, topic: opts.topic, comboKey: opts.comboKey, participants: opts.participants };
    active = true;
  },

  startCompare(opts: CompareStartOpts): void {
    if (active) return;
    const meta: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      screen: 'compare',
      comboKey: opts.comboKey,
      platform: Platform.OS,
    };
    startRecording({ type: 'compare', id: opts.id, title: opts.title, comboKey: opts.comboKey });
    recordEvent({ type: 'divider', meta });
    current = { type: 'compare', id: opts.id, title: opts.title, comboKey: opts.comboKey };
    compareTurns = [];
    active = true;
  },

  recordUserMessage(content: string): void {
    if (!active) return;
    const ev: DemoMessageEvent = { type: 'message', role: 'user', content };
    recordEvent(ev);
    if (current && current.type === 'compare') {
      compareTurns.push({ user: content, responses: { claude: '', openai: '', google: '' } });
    }
  },

  recordAssistantChunk(provider: string, chunk: string): void {
    if (!active) return;
    const speaker = isDemoSpeaker(provider) ? provider : undefined;
    const ev: DemoMessageEvent = { type: 'stream', role: 'assistant', content: chunk, speakerProvider: speaker };
    recordEvent(ev);
    if (current && current.type === 'compare' && compareTurns.length > 0) {
      const turn = compareTurns[compareTurns.length - 1];
      const column = speaker ?? (provider ? undefined : 'openai');
      if (column) turn.responses[column] = (turn.responses[column] || '') + chunk;
    }
  },

  recordAssistantMessage(provider: string, content: string): void {
    if (!active) return;
    const speaker = isDemoSpeaker(provider) ? provider : undefined;
    const ev: DemoMessageEvent = { type: 'message', role: 'assistant', content, speakerProvider: speaker };
    recordEvent(ev);
    if (current && current.type === 'compare' && compareTurns.length > 0) {
      const turn = compareTurns[compareTurns.length - 1];
      const column = speaker ?? (provider ? undefined : 'openai');
      if (column) turn.responses[column] = (turn.responses[column] || '') + content;
    }
  },

  recordImageMarkdown(uri: string, alt = 'image'): void {
    if (!active) return;
    // Represent inline image as markdown in a stream event; authors can assetize later
    const content = `\n\n![${alt}](${uri})\n\n`;
    const ev: DemoMessageEvent = { type: 'stream', role: 'assistant', content };
    recordEvent(ev);
  },

  stop(): { session: RecordedSession } | null {
    if (!active) return null;
    const res = stopRecording();
    const recording = current;
    active = false;
    current = null;
    if (!res) return null;

    let session: RecordedSession = res.session;
    // For compare, enrich session with runs built from turns
    if (recording?.type === 'compare') {
      const assistantEvent = (content: string, speakerProvider: DemoSpeaker): DemoMessageEvent => ({
        type: 'message',
        role: 'assistant',
        content,
        speakerProvider,
      });
      const runs: DemoCompareRun[] = compareTurns.map((t, idx) => ({
        id: `r${idx + 1}`,
        label: 'providers',
        ...(t.user ? { prompt: t.user } : {}),
        columns: [
          ...(t.responses.claude?.trim() ? [{ name: 'Claude', events: [assistantEvent(t.responses.claude, 'claude')] }] : []),
          ...(t.responses.openai?.trim() ? [{ name: 'OpenAI', events: [assistantEvent(t.responses.openai, 'openai')] }] : []),
          ...(t.responses.google?.trim() ? [{ name: 'Gemini', events: [assistantEvent(t.responses.google, 'google')] }] : []),
        ],
      }));
      session = { ...res.session, type: 'compare', runs, category: 'provider' };
    }
    // For debate, ensure topic/participants bubble through
    if (recording?.type === 'debate') {
      session = { ...res.session, type: 'debate', topic: recording.topic, participants: recording.participants || [] };
    }
    void DemoContentService.ingestRecording(session);
    return { session };
  },
};

export default RecordController;
