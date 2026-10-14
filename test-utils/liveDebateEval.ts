import fs from 'fs';
import path from 'path';

import { getPresetForFormat, type DebateFormatId, type DebateSideId, type OxfordAudienceQuestions } from '@/config/debate/formats';
import { getProviderDefaultModel } from '@/config/modelConfigs';
import { UNIVERSAL_PERSONALITIES, type PersonalityOption } from '@/config/personalities';
import type { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import { AIService } from '@/services/aiAdapter';
import { DebateOrchestrator } from '@/services/debate/DebateOrchestrator';
import type { AI, AIProvider, DebateSpeechLength, DebateVoiceConfig, Message } from '@/types';
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

/**
 * Applies `install` once to every adapter a debate on this service uses: those that exist now and
 * those the orchestrator creates later for a participant whose id is not a provider.
 */
export const forEveryAdapter = (service: AIService, install: (adapter: BaseAdapter) => void): void => {
  const installed = new WeakSet<BaseAdapter>();
  const apply = (adapter: BaseAdapter | undefined): void => {
    if (!adapter || installed.has(adapter)) return;
    installed.add(adapter);
    install(adapter);
  };
  service.getAllAdapters().forEach(adapter => apply(adapter));
  const ensureAdapter = service.ensureAdapter.bind(service);
  service.ensureAdapter = async (...args: Parameters<AIService['ensureAdapter']>) => {
    const adapter = await ensureAdapter(...args);
    apply(adapter);
    return adapter;
  };
};

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
  /** Cross-examination role (absent in files before 2026-10-14 and on other turns). */
  cxRole?: string;
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
  /** Absent in files before 2026-10-14: Oxford 1v1 at the app's default speech length. */
  formatId?: DebateFormatId;
  presetId?: string;
  speechLength?: DebateSpeechLength;
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
  /** Speeches to run, from the first: in Oxford 1v1, 3 = both openings and the Affirmative floor speech. */
  speeches: number;
  timeoutMs?: number;
  /** Run in voice mode, as the app does with voice on. */
  voice?: boolean;
  /** The app's Speech length setting (default: the app's default). */
  speechLength?: DebateSpeechLength;
  /** Default Oxford, preset short (1v1). Team presets field the debater and opponent twice each. */
  formatId?: DebateFormatId;
  presetId?: string;
  /** Typed in when an Oxford Q&A preset asks the audience for a question per side. */
  audienceQuestions?: OxfordAudienceQuestions;
  /** Runs once this debate's adapters exist, before the first speech: the hook for prompt experiments. */
  prepareService?: (service: AIService) => void;
}

const DEFAULT_AUDIENCE_QUESTIONS: OxfordAudienceQuestions = {
  aff: 'How would deliveries, tradespeople and disabled drivers still reach the centre?',
  neg: 'What would you do about city-centre air pollution instead?',
};

/**
 * Runs one debate through the real orchestrator: speeches schedule themselves, review pauses are
 * continued as the app's Continue button does, checkpoint votes go to the Affirmative, Oxford Q&A
 * gets one audience question per side, and the debate stops after `speeches`. A failed turn is
 * recorded, not retried, so call counts stay exact.
 */
export const runLiveDebate = async (options: LiveDebateOptions): Promise<GeneratedDebate> => {
  const { id, motion, personalityId, debater, opponent, keys, speeches } = options;
  const formatId = options.formatId ?? 'oxford';
  const presetId = options.presetId ?? 'short';
  const timeoutMs = options.timeoutMs ?? 6 * 60_000;
  // A fresh service per debate: the orchestrator sets each turn's persona on the adapter itself.
  const service = new AIService(keys);
  options.prepareService?.(service);
  // The orchestrator seats participant i on the Affirmative when i is even (1v1: [aff, neg]).
  const teamSize = getPresetForFormat(formatId, presetId).teamSize || 1;
  const sides: DebateSideId[] = Array.from({ length: teamSize * 2 }, (_, index) => (index % 2 === 0 ? 'aff' : 'neg'));
  const mirror = debater.provider === opponent.provider;
  const participants: AI[] = sides.map((side, index) => {
    const entry = side === 'aff' ? debater : opponent;
    const seat = Math.floor(index / 2) + 1;
    // 1v1 ids stay the provider, as in the stored runs. Otherwise every participant needs its own
    // id, or a mirror debate's Negative takes the Affirmative's persona and history.
    const id = teamSize === 1 && !mirror ? entry.provider : `${side}${seat}-${entry.provider}`;
    const name = teamSize > 1 ? `${entry.name} ${seat}` : mirror ? `${entry.name} ${side === 'aff' ? 1 : 2}` : entry.name;
    return createMockAIConfig({ id, provider: entry.provider, name, model: getProviderDefaultModel(entry.provider)?.id ?? '' });
  });
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
    formatId,
    presetId,
    speechLength: options.speechLength,
    speeches: [],
  };

  const session = await orchestrator.initializeDebate(
    motion,
    participants,
    Object.fromEntries(participants.map((participant, index) => [participant.id, sides[index] === 'aff' ? personalityId : 'default'])),
    { formatId, presetId, voiceConfig: options.voice ? VOICE_CONFIG : undefined, speechLength: options.speechLength },
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
      const action = event.data.continueAction;
      if (event.type === 'continuation_required' && (action === 'next_message' || action === 'vote' || action === 'audience_questions')) {
        // A review pause before the next speech, a checkpoint vote or the Q&A; the app shows a
        // Continue button here.
        orchestrator.continueDebate();
        return;
      }
      if (event.type === 'voting_started' && event.data.voteKind !== 'audience_stance' && typeof event.data.round === 'number') {
        orchestrator.recordVote(event.data.round, participants[0].id).catch((error: unknown) => finish(String(error)));
        return;
      }
      if (event.type === 'audience_questions_requested') {
        orchestrator.submitAudienceQuestions(options.audienceQuestions ?? DEFAULT_AUDIENCE_QUESTIONS);
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
        ...(spec?.cxRole ? { cxRole: spec.cxRole } : {}),
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
