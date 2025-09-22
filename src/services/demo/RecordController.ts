import { Platform } from 'react-native';
import { startRecording, recordEvent, stopRecording } from '@/services/demo/Recorder';
import { DemoContentService } from '@/services/demo/DemoContentService';
import type { DemoMessageEvent, DemoRecordingSession } from '@/types/demo';

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
  responses: Record<'claude' | 'openai' | 'google', string>;
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
    recordEvent({ type: 'divider', meta } as DemoMessageEvent);
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
    startRecording({ type: 'debate', id: opts.id, title: opts.topic, comboKey: opts.comboKey } as unknown as { type: 'debate'; id: string; title: string; comboKey?: string });
    recordEvent({ type: 'divider', meta } as DemoMessageEvent);
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
    startRecording({ type: 'compare', id: opts.id, title: opts.title, comboKey: opts.comboKey } as unknown as { type: 'compare'; id: string; title: string; comboKey?: string });
    recordEvent({ type: 'divider', meta } as DemoMessageEvent);
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
    const sp = (provider as 'claude' | 'openai' | 'google');
    const ev: DemoMessageEvent = { type: 'stream', role: 'assistant', content: chunk, speakerProvider: sp };
    recordEvent(ev);
    if (current && current.type === 'compare' && compareTurns.length > 0) {
      const turn = compareTurns[compareTurns.length - 1];
      const p = (provider as 'claude' | 'openai' | 'google') || 'openai';
      turn.responses[p] = (turn.responses[p] || '') + chunk;
    }
  },

  recordAssistantMessage(provider: string, content: string): void {
    if (!active) return;
    const sp = (provider as 'claude' | 'openai' | 'google');
    const ev: DemoMessageEvent = { type: 'message', role: 'assistant', content, speakerProvider: sp };
    recordEvent(ev);
    if (current && current.type === 'compare' && compareTurns.length > 0) {
      const turn = compareTurns[compareTurns.length - 1];
      const p = (provider as 'claude' | 'openai' | 'google') || 'openai';
      turn.responses[p] = (turn.responses[p] || '') + content;
    }
  },

  recordImageMarkdown(uri: string, alt = 'image'): void {
    if (!active) return;
    // Represent inline image as markdown in a stream event; authors can assetize later
    const content = `\n\n![${alt}](${uri})\n\n`;
    const ev: DemoMessageEvent = { type: 'stream', role: 'assistant', content };
    recordEvent(ev);
  },

  stop(): { session: unknown } | null {
    if (!active) return null;
    const res = stopRecording();
    // For compare, enrich session with runs built from turns
    if (res && current && current.type === 'compare') {
      const runs = compareTurns.map((t, idx) => ({
        id: `r${idx + 1}`,
        label: 'providers',
        ...(t.user ? { prompt: t.user } : {}),
        columns: [
          ...(t.responses.claude?.trim() ? [{ name: 'Claude', events: [{ type: 'message', role: 'assistant', content: t.responses.claude, speakerProvider: 'claude' }] }] : []),
          ...(t.responses.openai?.trim() ? [{ name: 'OpenAI', events: [{ type: 'message', role: 'assistant', content: t.responses.openai, speakerProvider: 'openai' }] }] : []),
          ...(t.responses.google?.trim() ? [{ name: 'Gemini', events: [{ type: 'message', role: 'assistant', content: t.responses.google, speakerProvider: 'google' }] }] : []),
        ],
      }));
      (res as unknown as { session: { runs?: unknown[]; category?: string } }).session.runs = runs as unknown[];
      (res as unknown as { session: { runs?: unknown[]; category?: string } }).session.category = 'provider';
    }
    // For debate, ensure topic/participants bubble through
    if (res && current && current.type === 'debate') {
      (res as unknown as { session: { topic?: string; participants?: string[] } }).session.topic = current.topic;
      (res as unknown as { session: { topic?: string; participants?: string[] } }).session.participants = current.participants || [];
    }
    active = false;
    current = null;
    const result = res as { session: unknown } | null;
    if (result?.session) {
      void DemoContentService.ingestRecording(result.session as DemoRecordingSession);
    }
    return result;
  },
};

export default RecordController;
