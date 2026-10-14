import fs from 'fs';
import path from 'path';

import { getProviderDefaultModel } from '@/config/modelConfigs';
import { UNIVERSAL_PERSONALITIES, type PersonalityOption } from '@/config/personalities';
import { AIService } from '@/services/aiAdapter';
import { DebateOrchestrator } from '@/services/debate/DebateOrchestrator';
import type { AI, AIProvider, DebateVoiceConfig, Message } from '@/types';
import { createMockAIConfig } from './fixtures';

/**
 * Shared plumbing for the live debate evals (__tests__/integration/liveDebate*.test.ts): keys,
 * host fetch, and a driver that runs the real DebateOrchestrator and adapters the way the app does.
 * Each test file still mocks demo mode itself (jest.mock is hoisted per file).
 */

// See liveModelRouting.test.ts: jest-expo replaces fetch; use host-realm undici.
const hostRequire = process
  .getBuiltinModule('node:module')
  .createRequire(process.cwd() + '/package.json');
export const nativeFetch: typeof fetch = hostRequire('undici').fetch;

export interface LiveDebater {
  provider: AIProvider;
  name: string;
  keyEnv: string;
}

export const LIVE_DEBATERS: Record<'claude' | 'openai' | 'google', LiveDebater> = {
  claude: { provider: 'claude', name: 'Claude', keyEnv: 'CLAUDE_API_KEY' },
  openai: { provider: 'openai', name: 'ChatGPT', keyEnv: 'OPENAI_API_KEY' },
  google: { provider: 'google', name: 'Gemini', keyEnv: 'GEMINI_API_KEY' },
};

export const loadEnvFile = (fileName: string): void => {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
};

export const requireKey = (keyEnv: string): string => {
  const key = process.env[keyEnv]?.trim();
  if (!key) throw new Error(`Missing ${keyEnv}`);
  return key;
};

export const mapWithConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Voice mode changes only the orchestrator's token safety cap; audio is made later, by the app.
const VOICE_CONFIG: DebateVoiceConfig = { enabled: true, providerId: 'elevenlabs', debaterVoices: {} };

/** Token usage of one provider response, read from its raw JSON body. */
export interface ProviderUsage {
  provider: AIProvider;
  /** Visible output tokens (reasoning excluded). */
  outputTokens?: number;
  /** Hidden reasoning tokens; undefined when the provider reports none. */
  reasoningTokens?: number;
  /** The provider's own finish field (Gemini finishReason, OpenAI status, Claude stop_reason). */
  rawFinish?: string;
}

const { AsyncLocalStorage } = process.getBuiltinModule('node:async_hooks');
const usageSink = new AsyncLocalStorage<ProviderUsage[]>();

const numberOrUndefined = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
const stringOrUndefined = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const readUsage = (url: string, body: unknown): ProviderUsage | undefined => {
  if (!isRecord(body)) return undefined;
  const host = hostnameOf(url);
  if (host === 'generativelanguage.googleapis.com') {
    const usage = isRecord(body.usageMetadata) ? body.usageMetadata : {};
    const candidate = Array.isArray(body.candidates) && isRecord(body.candidates[0]) ? body.candidates[0] : {};
    return {
      provider: 'google',
      outputTokens: numberOrUndefined(usage.candidatesTokenCount),
      reasoningTokens: numberOrUndefined(usage.thoughtsTokenCount) ?? 0,
      rawFinish: stringOrUndefined(candidate.finishReason),
    };
  }
  if (host === 'api.openai.com') {
    // Responses API: output_tokens includes reasoning_tokens.
    const usage = isRecord(body.usage) ? body.usage : {};
    const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
    const reasoning = numberOrUndefined(details.reasoning_tokens) ?? 0;
    const output = numberOrUndefined(usage.output_tokens);
    return {
      provider: 'openai',
      outputTokens: output === undefined ? undefined : output - reasoning,
      reasoningTokens: reasoning,
      rawFinish: stringOrUndefined(body.status),
    };
  }
  if (host === 'api.anthropic.com') {
    const usage = isRecord(body.usage) ? body.usage : {};
    return { provider: 'claude', outputTokens: numberOrUndefined(usage.output_tokens), rawFinish: stringOrUndefined(body.stop_reason) };
  }
  return undefined;
};

/**
 * nativeFetch that also records the token usage of each JSON provider response made inside
 * recordUsage. Outside recordUsage, and for streamed responses, it is plain nativeFetch.
 */
export const usageFetch: typeof fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  const sink = usageSink.getStore();
  if (sink && response.headers.get('content-type')?.includes('application/json')) {
    const url = typeof input === 'string' ? input : 'href' in input ? input.href : input.url;
    const usage = readUsage(url, await response.clone().json().catch(() => undefined));
    if (usage) sink.push(usage);
  }
  return response;
};

/** Runs fn with every provider response it makes through usageFetch recorded into sink. */
export const recordUsage = <T>(sink: ProviderUsage[], fn: () => Promise<T>): Promise<T> => usageSink.run(sink, fn);

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && 'senderType' in value && 'content' in value;

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

export const findPersona = (id: string): PersonalityOption => {
  const persona = UNIVERSAL_PERSONALITIES.find(entry => entry.id === id);
  if (!persona) throw new Error(`Unknown persona ${id}`);
  return persona;
};

export interface GeneratedSpeech {
  index: number;
  label: string;
  phase: string;
  side: 'aff' | 'neg';
  speaker: string;
  personalityId: string;
  provider: AIProvider;
  modelUsed?: string;
  content: string;
  lifecycle?: string;
  lifecycleReason?: string;
}

export interface GeneratedDebate {
  id: string;
  personalityId: string;
  provider: AIProvider;
  model: string;
  opponentProvider: AIProvider;
  opponentModel: string;
  webSearchEnabled: boolean;
  /** Voice mode: the orchestrator lowers the token safety cap; no audio is generated here. */
  voiceMode?: boolean;
  speeches: GeneratedSpeech[];
  error?: string;
}

export const isGeneratedSpeech = (value: unknown): value is GeneratedSpeech =>
  isRecord(value) && typeof value.index === 'number' && typeof value.label === 'string'
  && typeof value.phase === 'string' && (value.side === 'aff' || value.side === 'neg')
  && typeof value.speaker === 'string' && typeof value.personalityId === 'string'
  && typeof value.provider === 'string' && typeof value.content === 'string';

export interface LiveDebateOptions {
  id: string;
  motion: string;
  /** The Affirmative's persona; the Negative is always Default. */
  personalityId: string;
  debater: LiveDebater;
  opponent: LiveDebater;
  keys: Record<string, string>;
  /** Oxford 1v1 speeches to run, from the first: 3 = both openings and the Affirmative floor speech. */
  speeches: number;
  timeoutMs?: number;
  /** Run in voice mode, as the app does with voice on. */
  voice?: boolean;
  /** Runs once this debate's adapters exist, before the first speech: the hook for prompt experiments. */
  prepareService?: (service: AIService) => void;
}

/**
 * Runs one Oxford 1v1 debate through the real orchestrator: speeches schedule themselves, the
 * audience-review pause after the openings is continued as the app's Continue button does, and the
 * debate stops after `speeches`. A failed turn is recorded, not retried, so call counts stay exact.
 */
export const runLiveDebate = async (options: LiveDebateOptions): Promise<GeneratedDebate> => {
  const { id, motion, personalityId, debater, opponent, keys, speeches } = options;
  const timeoutMs = options.timeoutMs ?? 6 * 60_000;
  // A fresh service per debate: the orchestrator sets each turn's persona on the adapter itself.
  const service = new AIService(keys);
  options.prepareService?.(service);
  const participants: AI[] = [debater, opponent].map(entry => createMockAIConfig({
    id: entry.provider,
    provider: entry.provider,
    name: entry.name,
    model: getProviderDefaultModel(entry.provider)?.id ?? '',
  }));
  const orchestrator = new DebateOrchestrator(service);
  const debate: GeneratedDebate = {
    id,
    personalityId,
    provider: debater.provider,
    model: participants[0].model,
    opponentProvider: opponent.provider,
    opponentModel: participants[1].model,
    webSearchEnabled: false,
    voiceMode: Boolean(options.voice),
    speeches: [],
  };

  const session = await orchestrator.initializeDebate(
    motion,
    participants,
    { [participants[0].id]: personalityId, [participants[1].id]: 'default' },
    { formatId: 'oxford', presetId: 'short', voiceConfig: options.voice ? VOICE_CONFIG : undefined },
  );
  debate.webSearchEnabled = Boolean(session.webSearchEnabled);

  await new Promise<void>((resolve) => {
    const finish = (error?: string): void => {
      clearTimeout(timer);
      if (error) debate.error = error;
      orchestrator.reset();
      resolve();
    };
    const timer = setTimeout(() => finish(`timed out after ${timeoutMs / 1000}s`), timeoutMs);

    orchestrator.addEventListener(event => {
      if (event.type === 'continuation_required' && event.data.continueAction === 'next_message') {
        // The audience-review pause after the openings; the app shows a Continue button here.
        orchestrator.continueDebate();
        return;
      }
      const message = event.data.message;
      if (event.type !== 'message_added' || !isMessage(message) || message.senderType !== 'ai') return;
      const index = typeof event.data.messageIndex === 'number' ? event.data.messageIndex : debate.speeches.length;
      const spec = session.preset.messages[index];
      const side = spec?.speaker ?? 'aff';
      const lifecycle = message.metadata?.lifecycle;
      debate.speeches.push({
        index,
        label: spec?.label ?? `speech ${index}`,
        phase: spec?.phase ?? 'unknown',
        side,
        speaker: message.sender,
        personalityId: side === 'aff' ? personalityId : 'default',
        provider: side === 'aff' ? debater.provider : opponent.provider,
        modelUsed: message.metadata?.modelUsed,
        content: message.content,
        lifecycle: lifecycle?.status,
        lifecycleReason: lifecycle?.reason,
      });
      if (lifecycle) finish(`${spec?.label ?? index} ${lifecycle.status}: ${lifecycle.reason ?? ''}`);
      else if (index >= speeches - 1) finish();
    });

    // The app records the opening audience vote first; the eval starts at the first speech.
    orchestrator.executeDebateMessage(0, []).catch((error: unknown) => finish(String(error)));
  });
  return debate;
};
