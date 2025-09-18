import type { DemoChat, DemoDebate, DemoCompare, DemoMessageEvent } from '@/types/demo';

type ProviderId = 'claude' | 'openai' | 'google';

const NAME_TO_PROVIDER: Record<string, ProviderId | undefined> = {
  'claude': 'claude', 'anthropic': 'claude', 'opus': 'claude', 'claude opus': 'claude',
  'openai': 'openai', 'chatgpt': 'openai', 'gpt': 'openai', 'gpt-5': 'openai',
  'gemini': 'google', 'google': 'google',
};

let providerQueues: Record<ProviderId, string[]> = { claude: [], openai: [], google: [] };

// Chat script turns for multi-turn playback
let chatTurns: Array<{ user?: string; responses: Record<ProviderId, string> }> = [];
let currentTurnIndex = 0;

// Compare script runs for multi-turn playback (each run = one turn)
let compareTurns: Array<{ user?: string; responses: Record<ProviderId, string> }> = [];
let currentCompareIndex = 0;

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

/**
 * Build full multi-turn script from a DemoChat sample.
 * Each turn consists of a user message and aggregated assistant responses by provider
 */
export function loadChatScript(sample: DemoChat): void {
  chatTurns = [];
  currentTurnIndex = 0;
  const events: DemoMessageEvent[] = sample.events || [];
  let current: { user?: string; responses: Record<ProviderId, string> } | null = null;
  const pushTurn = () => {
    if (current && (current.user || Object.keys(current.responses).length > 0)) {
      chatTurns.push(current);
    }
  };
  for (const ev of events) {
    if (ev.role === 'user' && ev.type === 'message') {
      // Start a new turn
      if (current) pushTurn();
      current = { user: ev.content || '', responses: { claude: '', openai: '', google: '' } };
    } else if (ev.role === 'assistant' && (ev.type === 'message' || ev.type === 'stream')) {
      const p = (ev.speakerProvider as ProviderId | undefined) || 'openai';
      if (!current) {
        current = { user: '', responses: { claude: '', openai: '', google: '' } };
      }
      current.responses[p] = (current.responses[p] || '') + (ev.content || '');
    }
  }
  if (current) pushTurn();
}

export function hasNextChatTurn(): boolean {
  return currentTurnIndex < chatTurns.length;
}

/**
 * Prime provider queues for the next chat turn and return the user prompt for that turn
 */
export function primeNextChatTurn(): { user?: string } {
  clearQueues();
  const turn = chatTurns[currentTurnIndex];
  currentTurnIndex++;
  if (!turn) return {};
  const { responses, user } = turn;
  (['claude', 'openai', 'google'] as ProviderId[]).forEach((p) => {
    const text = (responses[p] || '').trim();
    if (text) {
      providerQueues[p] = [text];
    }
  });
  return { user };
}

/**
 * Build multi-run script for Compare. Each run becomes a turn; columns map to providers.
 */
export function loadCompareScript(sample: DemoCompare): void {
  compareTurns = [];
  currentCompareIndex = 0;
  const runs = sample.runs || [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const responses: Record<ProviderId, string> = { claude: '', openai: '', google: '' };
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
      responses[p] = text;
    }
    const user = `Demo prompt: ${sample.title}${runs.length > 1 ? ` — turn ${i + 1}` : ''}`;
    compareTurns.push({ user, responses });
  }
}

export function hasNextCompareTurn(): boolean {
  return currentCompareIndex < compareTurns.length;
}

export function primeNextCompareTurn(): { user?: string } {
  clearQueues();
  const turn = compareTurns[currentCompareIndex];
  currentCompareIndex++;
  if (!turn) return {};
  const { user, responses } = turn;
  (['claude', 'openai', 'google'] as ProviderId[]).forEach((p) => {
    const text = (responses[p] || '').trim();
    if (text) {
      providerQueues[p] = [text];
    }
  });
  return { user };
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
