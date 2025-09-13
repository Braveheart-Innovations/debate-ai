import type { DemoChat, DemoDebate, DemoCompare, DemoMessageEvent } from '@/types/demo';

type ProviderId = 'claude' | 'openai' | 'google';

const NAME_TO_PROVIDER: Record<string, ProviderId | undefined> = {
  'claude': 'claude', 'anthropic': 'claude', 'opus': 'claude', 'claude opus': 'claude',
  'openai': 'openai', 'chatgpt': 'openai', 'gpt': 'openai', 'gpt-5': 'openai',
  'gemini': 'google', 'google': 'google',
};

let providerQueues: Record<ProviderId, string[]> = { claude: [], openai: [], google: [] };

export function clearQueues(): void {
  providerQueues = { claude: [], openai: [], google: [] };
}

export function primeChat(sample: DemoChat): void {
  clearQueues();
  const events: DemoMessageEvent[] = sample.events || [];
  let afterFirstUser = false;
  for (const ev of events) {
    if (ev.role === 'user' && ev.type === 'message') {
      if (!afterFirstUser) { afterFirstUser = true; continue; } else { break; }
    }
    if (afterFirstUser && ev.role === 'assistant' && (ev.type === 'message' || ev.type === 'stream')) {
      const p = (ev.speakerProvider as ProviderId | undefined) || 'openai';
      if (!providerQueues[p]) providerQueues[p] = [];
      const lastIdx = providerQueues[p].length - 1;
      if (lastIdx >= 0) {
        providerQueues[p][lastIdx] = (providerQueues[p][lastIdx] || '') + (ev.content || '');
      } else {
        providerQueues[p].push(ev.content || '');
      }
    }
  }
}

export function primeDebate(sample: DemoDebate): void {
  clearQueues();
  for (const ev of sample.events || []) {
    if (ev.role === 'assistant' && (ev.type === 'message' || ev.type === 'stream')) {
      const p = (ev.speakerProvider as ProviderId | undefined) || 'openai';
      if (!providerQueues[p]) providerQueues[p] = [];
      const lastIdx = providerQueues[p].length - 1;
      if (lastIdx >= 0 && ev.type === 'stream') {
        providerQueues[p][lastIdx] = (providerQueues[p][lastIdx] || '') + (ev.content || '');
      } else if (ev.type === 'message') {
        providerQueues[p].push(ev.content || '');
      } else {
        // first chunk for this turn
        providerQueues[p].push(ev.content || '');
      }
    }
  }
}

export function primeCompare(sample: DemoCompare): void {
  clearQueues();
  const run = sample.runs?.[0];
  if (!run) return;
  for (const col of run.columns || []) {
    const name = (col.name || '').toLowerCase();
    const p = NAME_TO_PROVIDER[name] || (name.includes('claude') ? 'claude' : name.includes('gemini') || name.includes('google') ? 'google' : name.includes('openai') || name.includes('gpt') ? 'openai' : undefined);
    if (!p) continue;
    let text = '';
    for (const ev of col.events || []) {
      if (ev.role === 'assistant' && (ev.type === 'message' || ev.type === 'stream')) {
        text += ev.content || '';
      }
    }
    if (!providerQueues[p]) providerQueues[p] = [];
    providerQueues[p].push(text);
  }
}

export function nextProviderResponse(provider: string): string | undefined {
  const p = provider as ProviderId;
  const q = providerQueues[p];
  if (!q || q.length === 0) return undefined;
  return q.shift()?.trim() || undefined;
}
