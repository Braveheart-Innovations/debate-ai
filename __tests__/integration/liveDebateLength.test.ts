import fs from 'fs';
import os from 'os';
import path from 'path';

import { getPresetForFormat } from '@/config/debate/formats';
import type { AIService } from '@/services/aiAdapter';
import { sanitizeDebateSpeechForTTS } from '@/services/debate/debateAudioSanitizer';
import { getDebateSpeechLengthGuidance } from '@/services/debate/debateSpeechLength';
import { DEBATE_AUDIO_TTS_PROMPT_LIMIT } from '@/services/debate/DebateVoiceService';
import { isDemoModeEnabled } from '@/services/demo/demoMode';
import { store } from '@/store';
import { setGlobalStreaming } from '@/store/streamingSlice';
import type { AIProvider } from '@/types';
import {
  LIVE_DEBATERS,
  findPersona,
  isGeneratedSpeech,
  isRecord,
  loadEnvFile,
  mapWithConcurrency,
  recordUsage,
  requireKey,
  runLiveDebate,
  usageFetch,
  wordCount,
  type GeneratedDebate,
  type LiveDebater,
  type ProviderUsage,
} from '@test-utils/liveDebateEval';
import { RUBRIC_VERSION, judgeBlindAttribution, loadJudge, type Attribution } from '@test-utils/debatePersonaJudge';

/**
 * Live debate length experiment: how closely does each way of stating speech length hold, at each
 * brevity level, across providers and personas? Per debate it swaps the turn prompt's
 * "Length guidance" line and neutralises the system prompt's "compact" line (except for the
 * `current` control), then measures each speech against its level's word target. Prompt only: the
 * token safety cap is untouched. Every debate runs both openings and the Affirmative floor speech.
 * Each speech is also checked for being cut off (a token-limit or failed turn, or text that ends
 * mid-sentence) and for fitting one audio clip.
 *
 *   npm run test:debate-length:live
 *   npm run test:debate-length:report   (re-renders length-report.md from a stored length.json; no calls)
 *   npm run test:debate-length:judge    (blind persona attribution of the stored run's Affirmative
 *                                        speeches: one call each to the persona eval's judge)
 *
 * DEBATE_LENGTH_MECHANISMS (default current,words,time,structure), DEBATE_LENGTH_LEVELS
 * (default concise,verbose) and DEBATE_LENGTH_PERSONAS (default default,brody,kai) set the matrix;
 * DEBATE_LENGTH_PAIRINGS (default claude-google,google-openai,openai-claude: Affirmative-Negative)
 * picks the providers; DEBATE_LENGTH_VOICE=1 runs every debate in voice mode (the voice token cap;
 * no audio is made).
 * The run prints its call count before the first call. Output: DEBATE_EVAL_OUT
 * (default <tmpdir>/debate-length-eval), which is also where the report step reads length.json.
 */

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn<boolean, []>(() => false),
}));

const liveEnabled = process.env.LIVE_DEBATE_LENGTH_TEST === '1';
const reportEnabled = process.env.DEBATE_LENGTH_REPORT === '1';
const judgeEnabled = process.env.LIVE_DEBATE_LENGTH_JUDGE === '1';
const voiceMode = process.env.DEBATE_LENGTH_VOICE === '1';
const outDir = process.env.DEBATE_EVAL_OUT || path.join(os.tmpdir(), 'debate-length-eval');

const MOTION = 'This house would ban private cars from city centres';
const SPEECHES_PER_DEBATE = 3;
const DEBATE_CONCURRENCY = 6;
const JUDGE_CONCURRENCY = 6;
const HIT_TOLERANCE = 0.2;

const MECHANISMS = ['current', 'words', 'time', 'structure'] as const;
const LEVELS = ['concise', 'default', 'verbose'] as const;
type Mechanism = (typeof MECHANISMS)[number];
type Level = (typeof LEVELS)[number];
type LengthPhase = 'opening' | 'rebuttal';

/** Default matches the app's intended ranges (opening 154-220, floor 126-180 words). */
const TARGET_WORDS: Record<LengthPhase, Record<Level, number>> = {
  opening: { concise: 100, default: 190, verbose: 350 },
  rebuttal: { concise: 80, default: 150, verbose: 260 },
};

// About 20 words a sentence, so each budget lands near the word target above.
const STRUCTURE_BUDGET: Record<LengthPhase, Record<Level, string>> = {
  opening: {
    concise: 'one paragraph of 5 sentences',
    default: 'two paragraphs of 4 to 5 sentences each',
    verbose: 'four paragraphs of 4 to 5 sentences each',
  },
  rebuttal: {
    concise: 'one paragraph of 4 sentences',
    default: 'two paragraphs of 4 sentences each',
    verbose: 'three paragraphs of 4 to 5 sentences each',
  },
};

// Read aloud at about 150 words a minute, rounded to 5 seconds.
const speakingSeconds = (target: number): number => Math.round((target / 150) * 12) * 5;

const PROSE = 'in natural prose with no headings or lists, then stop.';
const LENGTH_LINE = /^Length guidance: .*$/m;
const SYSTEM_COMPACT_LINE = 'Keep each scheduled speech compact and follow the turn-specific length guidance.';
const SYSTEM_NEUTRAL_LINE = 'Follow the turn-specific length guidance.';

const lengthDirective = (mechanism: Exclude<Mechanism, 'current'>, phase: LengthPhase, level: Level): string => {
  const target = TARGET_WORDS[phase][level];
  switch (mechanism) {
    case 'words':
      return `Length guidance: about ${target} words (between ${Math.round(target * 0.85)} and ${Math.round(target * 1.15)}), ${PROSE}`;
    case 'time':
      return `Length guidance: you have ${speakingSeconds(target)} seconds of speaking time, so write only what fits when read aloud at a natural pace, ${PROSE}`;
    case 'structure':
      return `Length guidance: ${STRUCTURE_BUDGET[phase][level]}, ${PROSE}`;
  }
};

// The output-token safety cap the orchestrator sets for these speeches in each mode.
const tokenCap = (voice: boolean): number =>
  getDebateSpeechLengthGuidance({ formatId: 'oxford', presetId: 'short', phase: 'opening', voiceMode: voice }).maxTokens;

const PHASE_BY_LABEL = new Map<string, LengthPhase>(
  getPresetForFormat('oxford', 'short').messages
    .filter(spec => spec.phase === 'opening' || spec.phase === 'rebuttal')
    .map(spec => [spec.label, spec.phase === 'opening' ? 'opening' : 'rebuttal']),
);

interface Condition {
  mechanism: Mechanism;
  level: Level;
}

interface AuditEntry {
  label: string;
  lengthLine: string;
  systemNeutralised: boolean;
  /** The output-token cap on the adapter when the request went out (absent in files before 2026-10-14). */
  maxTokens?: number;
  /** Token usage of each provider response for this request (absent before 2026-10-14). */
  usage?: ProviderUsage[];
}

/** Wraps every adapter in this debate's service so each request carries the condition's length line. */
const installCondition = (service: AIService, condition: Condition, audit: AuditEntry[]): void => {
  for (const adapter of service.getAllAdapters().values()) {
    const send = adapter.sendMessage.bind(adapter);
    adapter.sendMessage = async (message, ...rest) => {
      const label = message.match(/^Turn: (.+)$/m)?.[1] ?? '';
      const phase = PHASE_BY_LABEL.get(label);
      let sent = message;
      const personality = adapter.config.personality;
      if (condition.mechanism !== 'current' && phase) {
        sent = message.replace(LENGTH_LINE, lengthDirective(condition.mechanism, phase, condition.level));
        if (personality) {
          adapter.config.personality = {
            ...personality,
            systemPrompt: personality.systemPrompt.replace(SYSTEM_COMPACT_LINE, SYSTEM_NEUTRAL_LINE),
          };
        }
      }
      const usage: ProviderUsage[] = [];
      audit.push({
        label,
        lengthLine: sent.match(LENGTH_LINE)?.[0] ?? '(missing)',
        systemNeutralised: Boolean(adapter.config.personality?.systemPrompt.includes(SYSTEM_NEUTRAL_LINE)),
        maxTokens: adapter.config.parameters?.maxTokens,
        usage,
      });
      return recordUsage(usage, () => send(sent, ...rest));
    };
  }
};

const PAIRING_IDS = ['claude-google', 'google-openai', 'openai-claude', 'google-google'] as const;
type PairingId = (typeof PAIRING_IDS)[number];
const PAIRINGS: Record<PairingId, [LiveDebater, LiveDebater]> = {
  'claude-google': [LIVE_DEBATERS.claude, LIVE_DEBATERS.google],
  'google-openai': [LIVE_DEBATERS.google, LIVE_DEBATERS.openai],
  'openai-claude': [LIVE_DEBATERS.openai, LIVE_DEBATERS.claude],
  'google-google': [LIVE_DEBATERS.google, LIVE_DEBATERS.google],
};

const readList = <T extends string>(envName: string, allowed: readonly T[], fallback: T[]): T[] => {
  const raw: string | undefined = process.env[envName];
  if (!raw) return fallback;
  return raw.split(',').map(value => value.trim()).map(value => {
    const match = allowed.find(entry => entry === value);
    if (!match) throw new Error(`${envName}: unknown value "${value}" (allowed: ${allowed.join(', ')})`);
    return match;
  });
};

interface LengthRun {
  condition: Condition;
  debate: GeneratedDebate;
  audit: AuditEntry[];
}

interface LengthFile {
  runAt: string;
  motion: string;
  voiceMode?: boolean;
  runs: LengthRun[];
}

const isCondition = (value: unknown): value is Condition =>
  isRecord(value) && MECHANISMS.some(mechanism => mechanism === value.mechanism) && LEVELS.some(level => level === value.level);

const isLengthFile = (value: unknown): value is LengthFile =>
  isRecord(value) && typeof value.runAt === 'string' && typeof value.motion === 'string' && Array.isArray(value.runs)
  && value.runs.every(run => isRecord(run) && isCondition(run.condition) && Array.isArray(run.audit)
    && isRecord(run.debate) && typeof run.debate.id === 'string' && typeof run.debate.personalityId === 'string'
    && typeof run.debate.provider === 'string' && typeof run.debate.model === 'string'
    && Array.isArray(run.debate.speeches) && run.debate.speeches.every(isGeneratedSpeech));

interface MeasuredSpeech {
  mechanism: Mechanism;
  level: Level;
  phase: LengthPhase;
  provider: AIProvider;
  personalityId: string;
  side: 'aff' | 'neg';
  words: number;
  target: number;
  ratio: number;
  paragraphs: number;
  sentences: number;
  debateId: string;
  label: string;
  /** Lifecycle of a turn that did not complete (token limit, failure); its text is not measured. */
  stopped?: string;
  endsMidSentence: boolean;
  /** Characters the app would send to text to speech. */
  spokenChars: number;
  ending: string;
}

// Spoken text (citations, links and markdown removed) must end on sentence punctuation, allowing for
// closing quotes and brackets.
const endsAtSentence = (spoken: string): boolean => /[.!?\u2026]$/.test(spoken.replace(/["'\u201d\u2019()[\]*_\s]+$/, ''));

const measure = (runs: LengthRun[]): MeasuredSpeech[] => runs.flatMap(({ condition, debate }) =>
  debate.speeches.flatMap(speech => {
    const phase = PHASE_BY_LABEL.get(speech.label);
    if (!phase) return [];
    const words = wordCount(speech.content);
    const target = TARGET_WORDS[phase][condition.level];
    const spoken = sanitizeDebateSpeechForTTS(speech.content);
    return [{
      mechanism: condition.mechanism,
      level: condition.level,
      phase,
      provider: speech.provider,
      personalityId: speech.personalityId,
      side: speech.side,
      words,
      target,
      ratio: words / target,
      paragraphs: speech.content.split(/\n\s*\n/).filter(part => part.trim()).length,
      sentences: speech.content.match(/[.!?]+(?=\s|$)/g)?.length ?? 0,
      debateId: debate.id,
      label: speech.label,
      stopped: speech.lifecycle ? `${speech.lifecycle}${speech.lifecycleReason ? ` (${speech.lifecycleReason})` : ''}` : undefined,
      endsMidSentence: !endsAtSentence(spoken),
      spokenChars: spoken.length,
      ending: spoken.slice(-80),
    }];
  }));

const isCutOff = (speech: MeasuredSpeech): boolean => Boolean(speech.stopped) || speech.endsMidSentence;

const median = (values: number[]): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const wordsCell = (speeches: MeasuredSpeech[]): string => {
  if (speeches.length === 0) return 'n/a';
  const words = speeches.map(speech => speech.words);
  return `${median(words)} (${Math.min(...words)}-${Math.max(...words)})`;
};

const ratioCell = (speeches: MeasuredSpeech[]): string =>
  speeches.length ? `${median(speeches.map(speech => speech.ratio)).toFixed(2)}` : 'n/a';

const hitCell = (speeches: MeasuredSpeech[]): string => {
  const hits = speeches.filter(speech => Math.abs(speech.ratio - 1) <= HIT_TOLERANCE).length;
  return `${hits}/${speeches.length}`;
};

const cutOffCell = (speeches: MeasuredSpeech[]): string => `${speeches.filter(isCutOff).length}/${speeches.length}`;

const audioCell = (speeches: MeasuredSpeech[]): string => {
  if (speeches.length === 0) return 'n/a';
  const over = speeches.filter(speech => speech.spokenChars > DEBATE_AUDIO_TTS_PROMPT_LIMIT).length;
  return `${over}/${speeches.length} (longest ${Math.max(...speeches.map(speech => speech.spokenChars))})`;
};

const conditionKey = ({ mechanism, level }: Condition): string => `${mechanism}/${level}`;

interface ReportMeta {
  runAt: string;
  voiceMode: boolean;
}

const renderReport = (runs: LengthRun[], conditions: Condition[], debaters: LiveDebater[], personas: string[], meta: ReportMeta): string => {
  const everySpeech = measure(runs);
  const measured = everySpeech.filter(speech => !speech.stopped);
  const providers = debaters.map(debater => debater.provider);
  const matches = (condition: Condition) => (speech: MeasuredSpeech): boolean =>
    speech.mechanism === condition.mechanism && speech.level === condition.level;
  const of = (condition: Condition): MeasuredSpeech[] => measured.filter(matches(condition));

  const summaryRows = conditions.map(condition => {
    const speeches = of(condition);
    const openings = speeches.filter(speech => speech.phase === 'opening');
    const floors = speeches.filter(speech => speech.phase === 'rebuttal');
    return `| ${condition.mechanism} | ${condition.level} | ${TARGET_WORDS.opening[condition.level]} | ${wordsCell(openings)} | ${TARGET_WORDS.rebuttal[condition.level]} | ${wordsCell(floors)} | ${ratioCell(speeches)} | ${hitCell(speeches)} | ${cutOffCell(everySpeech.filter(matches(condition)))} | ${audioCell(speeches)} |`;
  });

  const cutOffNotes = everySpeech.filter(isCutOff).map(speech =>
    `- ${speech.debateId}, ${speech.label}: ${speech.stopped ?? `ends mid-sentence: "...${speech.ending}"`}`);

  const providerRows = conditions.map(condition => {
    const cells = providers.map(provider => ratioCell(of(condition).filter(speech => speech.provider === provider)));
    return `| ${conditionKey(condition)} | ${cells.join(' | ')} |`;
  });

  const personaRows = conditions.map(condition => {
    const cells = personas.map(persona => ratioCell(of(condition).filter(speech => speech.side === 'aff' && speech.personalityId === persona)));
    return `| ${conditionKey(condition)} | ${cells.join(' | ')} | ${ratioCell(of(condition).filter(speech => speech.side === 'neg'))} |`;
  });

  const mechanismsWithLevels = [...new Set(conditions.map(condition => condition.mechanism))]
    .filter(mechanism => conditions.filter(condition => condition.mechanism === mechanism).length > 1);
  const spreadRows = mechanismsWithLevels.map(mechanism => {
    const levels = conditions.filter(condition => condition.mechanism === mechanism);
    const lowest = levels[0];
    const highest = levels[levels.length - 1];
    const cells = (['opening', 'rebuttal'] as const).map(phase => {
      const low = median(of(lowest).filter(speech => speech.phase === phase).map(speech => speech.words));
      const high = median(of(highest).filter(speech => speech.phase === phase).map(speech => speech.words));
      const intended = TARGET_WORDS[phase][highest.level] / TARGET_WORDS[phase][lowest.level];
      return `${(high / low).toFixed(1)}x (target ${intended.toFixed(1)}x)`;
    });
    return `| ${mechanism} | ${lowest.level} to ${highest.level} | ${cells.join(' | ')} |`;
  });

  // Every provider response, per condition: how much of the cap hidden reasoning used.
  const usageOf = (condition: Condition, provider: AIProvider): ProviderUsage[] => runs
    .filter(run => run.condition.mechanism === condition.mechanism && run.condition.level === condition.level)
    .flatMap(run => run.audit.flatMap(entry => entry.usage ?? []))
    .filter(usage => usage.provider === provider);
  const usageCell = (usages: ProviderUsage[]): string => {
    const reasoning = usages.map(usage => usage.reasoningTokens).filter((value): value is number => typeof value === 'number');
    const totals = usages.map(usage => (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0));
    if (usages.length === 0) return 'n/a';
    const reasoningPart = reasoning.length ? `${median(reasoning)} (max ${Math.max(...reasoning)})` : 'not reported';
    return `${reasoningPart}; peak ${Math.max(...totals)}`;
  };
  const hasUsage = runs.some(run => run.audit.some(entry => entry.usage?.length));
  const usageRows = conditions.map(condition =>
    `| ${conditionKey(condition)} | ${providers.map(provider => usageCell(usageOf(condition, provider))).join(' | ')} |`);
  const providerFinishes = runs.flatMap(run => run.audit.flatMap(entry => (entry.usage ?? [])
    .filter(usage => usage.rawFinish && !['STOP', 'completed', 'end_turn'].includes(usage.rawFinish))
    .map(usage => `- ${run.debate.id}, ${entry.label}: ${usage.provider} finished "${usage.rawFinish}" after ${usage.reasoningTokens ?? 0} reasoning and ${usage.outputTokens ?? 0} visible tokens`)));

  const failures = runs.filter(run => run.debate.error);
  const callCount = runs.reduce((sum, run) => sum + run.audit.length, 0);

  return [
    '# Debate length experiment',
    '',
    `Run ${meta.runAt}. Motion: "${MOTION}". Oxford 1v1, ${meta.voiceMode ? 'voice' : 'text'} mode (output-token safety cap ${tokenCap(meta.voiceMode)}), web search as in the app. Each debate ran both openings and the Affirmative floor speech; the Negative is always Default. ${runs.length} debates, ${callCount} calls, ${measured.length} speeches measured. "Ratio" is words divided by the level's target (1.00 = on target); "within" counts speeches within ${HIT_TOLERANCE * 100}% of target. "Cut off" counts turns that stopped on the token limit or failed, plus speeches whose spoken text ends mid-sentence. "Over audio limit" counts speeches whose spoken text exceeds the ${DEBATE_AUDIO_TTS_PROMPT_LIMIT}-character text-to-speech budget, which the app trims to the last full sentence. \`current\` is today's prompt, measured against the default targets.`,
    '',
    '## By condition',
    '',
    '| Mechanism | Level | Opening target | Opening words: median (range) | Floor target | Floor words: median (range) | Median ratio | Within | Cut off | Over audio limit |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaryRows,
    '',
    ...(cutOffNotes.length ? ['Cut-off speeches:', '', ...cutOffNotes, ''] : []),
    '## Does the level move the length?',
    '',
    '| Mechanism | Levels | Opening | Floor speech |',
    '| --- | --- | --- | --- |',
    ...spreadRows,
    '',
    ...(hasUsage ? [
      `## Output tokens against the ${tokenCap(meta.voiceMode)}-token cap`,
      '',
      'Per provider response: median hidden reasoning tokens (max), and the largest reasoning plus visible output. Claude runs without extended thinking, so it reports no reasoning.',
      '',
      `| Condition | ${debaters.map(debater => debater.name).join(' | ')} |`,
      `| --- | ${providers.map(() => '---').join(' | ')} |`,
      ...usageRows,
      '',
      ...(providerFinishes.length ? ['Responses that did not finish normally:', '', ...providerFinishes, ''] : []),
    ] : []),
    '## Median ratio by provider',
    '',
    `| Condition | ${debaters.map(debater => debater.name).join(' | ')} |`,
    `| --- | ${providers.map(() => '---').join(' | ')} |`,
    ...providerRows,
    '',
    '## Median ratio by persona (Affirmative speeches; Negative is Default)',
    '',
    `| Condition | ${personas.map(persona => findPersona(persona).name).join(' | ')} | Negative (Default) |`,
    `| --- | ${personas.map(() => '---').join(' | ')} | --- |`,
    ...personaRows,
    '',
    failures.length ? `Stopped debates: ${failures.map(run => `${run.debate.id} (${run.debate.error})`).join('; ')}.` : 'All debates completed.',
    '',
  ].join('\n');
};

const renderTranscripts = (runs: LengthRun[]): string => [
  '# Debate length experiment: transcripts',
  '',
  ...runs.flatMap(({ condition, debate, audit }) => [
    `## ${conditionKey(condition)}: ${findPersona(debate.personalityId).name} on ${debate.model} vs ${debate.opponentModel}`,
    '',
    ...(debate.error ? [`**Stopped:** ${debate.error}`, ''] : []),
    ...debate.speeches.flatMap(speech => [
      `### ${speech.label}: ${speech.speaker} (${wordCount(speech.content)} words)`,
      '',
      `> ${audit.filter(entry => entry.label === speech.label).pop()?.lengthLine ?? '(no request recorded)'}`,
      '',
      speech.content,
      '',
    ]),
  ]),
].join('\n');

const describeLive = liveEnabled ? describe : describe.skip;

describeLive('Live debate length experiment', () => {
  jest.setTimeout(60 * 60_000);

  beforeAll(() => {
    loadEnvFile('.env.local');
    loadEnvFile('.env');
    jest.mocked(isDemoModeEnabled).mockReturnValue(false);
    global.fetch = usageFetch;
    store.dispatch(setGlobalStreaming(false));
  });

  it('measures speech length for each condition, provider and persona', async () => {
    const mechanisms = readList('DEBATE_LENGTH_MECHANISMS', MECHANISMS, [...MECHANISMS]);
    const levels = readList('DEBATE_LENGTH_LEVELS', LEVELS, ['concise', 'verbose']);
    const personas = readList('DEBATE_LENGTH_PERSONAS', ['default', 'bestie', 'brody', 'devlin', 'george', 'kai', 'prof_sage', 'scout'], ['default', 'brody', 'kai']);
    // `current` has no levels; it is today's prompt, so it is measured against the default targets.
    const conditions = mechanisms.flatMap((mechanism): Condition[] => (mechanism === 'current'
      ? [{ mechanism, level: 'default' }]
      : [...levels].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b)).map(level => ({ mechanism, level }))));

    // By default every provider debates once on each side.
    const pairingIds = readList('DEBATE_LENGTH_PAIRINGS', PAIRING_IDS, ['claude-google', 'google-openai', 'openai-claude']);
    const pairings = pairingIds.map(id => PAIRINGS[id]);
    const keys = Object.fromEntries(Object.values(LIVE_DEBATERS).map(({ provider, keyEnv }) => [provider, requireKey(keyEnv)]));
    const plan = conditions.flatMap(condition => personas.flatMap(personalityId =>
      pairings.map(([debater, opponent]) => ({ condition, personalityId, debater, opponent }))));
    process.stdout.write(`\nLength experiment: ${conditions.length} conditions x ${personas.length} personas x ${pairings.length} pairings = ${plan.length} debates, ${plan.length * SPEECHES_PER_DEBATE} calls, ${DEBATE_CONCURRENCY} at a time.\n`);

    const runAt = new Date().toISOString();
    const runs = await mapWithConcurrency(plan, DEBATE_CONCURRENCY, async ({ condition, personalityId, debater, opponent }): Promise<LengthRun> => {
      const audit: AuditEntry[] = [];
      const debate = await runLiveDebate({
        id: `${conditionKey(condition)}/${personalityId}-on-${debater.provider}`,
        motion: MOTION,
        personalityId,
        debater,
        opponent,
        keys,
        speeches: SPEECHES_PER_DEBATE,
        voice: voiceMode,
        prepareService: service => installCondition(service, condition, audit),
      });
      return { condition, debate, audit };
    });

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'length.json'), JSON.stringify({
      runAt,
      motion: MOTION,
      voiceMode,
      targets: TARGET_WORDS,
      directives: Object.fromEntries((['words', 'time', 'structure'] as const).map(mechanism => [mechanism,
        Object.fromEntries((['opening', 'rebuttal'] as const).map(phase => [phase,
          Object.fromEntries(LEVELS.map(level => [level, lengthDirective(mechanism, phase, level)]))]))])),
      runs,
    }, null, 2));
    fs.writeFileSync(path.join(outDir, 'length-report.md'), renderReport(runs, conditions, pairings.map(([debater]) => debater), personas, { runAt, voiceMode }));
    fs.writeFileSync(path.join(outDir, 'length-transcripts.md'), renderTranscripts(runs));
    process.stdout.write(`Length experiment written to ${outDir}\n`);

    // The experiment is only valid if every request carried its mode's token cap and its condition's length line.
    for (const { condition, audit } of runs) {
      for (const entry of audit) {
        expect(entry.maxTokens).toBe(tokenCap(voiceMode));
        const phase = PHASE_BY_LABEL.get(entry.label);
        if (condition.mechanism === 'current' || !phase) continue;
        expect(entry.lengthLine).toBe(lengthDirective(condition.mechanism, phase, condition.level));
        expect(entry.systemNeutralised).toBe(true);
      }
    }
    expect(runs.filter(run => run.debate.error).map(run => `${run.debate.id}: ${run.debate.error}`)).toEqual([]);
  });
});

const describeReport = reportEnabled ? describe : describe.skip;

describeReport('Debate length report from stored results', () => {
  it('re-renders length-report.md from length.json without calling any model', () => {
    const stored = readLengthFile();
    const unique = <T,>(values: T[]): T[] => [...new Set(values)];
    const conditionKeys = unique(stored.runs.map(run => conditionKey(run.condition)));
    const conditions = conditionKeys.map(key => {
      const match = stored.runs.find(run => conditionKey(run.condition) === key);
      if (!match) throw new Error(`No run for ${key}`);
      return match.condition;
    });
    const personas = unique(stored.runs.map(run => run.debate.personalityId));
    const debaters = unique(stored.runs.map(run => run.debate.provider)).map(provider => {
      const debater = Object.values(LIVE_DEBATERS).find(entry => entry.provider === provider);
      if (!debater) throw new Error(`Unknown provider ${provider}`);
      return debater;
    });
    fs.writeFileSync(path.join(outDir, 'length-report.md'),
      renderReport(stored.runs, conditions, debaters, personas, { runAt: stored.runAt, voiceMode: Boolean(stored.voiceMode) }));
    process.stdout.write(`\nLength report re-rendered in ${outDir}\n`);
  });
});

const readLengthFile = (): LengthFile => {
  const file = path.join(outDir, 'length.json');
  const stored: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isLengthFile(stored)) throw new Error(`${file} is not a length experiment file`);
  if (stored.motion !== MOTION) throw new Error(`${file} used a different motion: ${stored.motion}`);
  return stored;
};

interface JudgedLengthSpeech {
  debateId: string;
  condition: Condition;
  personalityId: string;
  provider: AIProvider;
  label: string;
  phase: LengthPhase;
  words: number;
  redactions: number;
  attribution: Attribution;
}

const percent = (count: number, total: number): string => (total ? `${Math.round((count / total) * 100)}%` : 'n/a');

const renderPersonaReport = (stored: LengthFile, judged: JudgedLengthSpeech[], model: string): string => {
  const unique = <T,>(values: T[]): T[] => [...new Set(values)];
  const keys = unique(judged.map(entry => conditionKey(entry.condition)));
  const isCorrect = (entry: JudgedLengthSpeech): boolean => entry.attribution.persona === entry.personalityId;
  const tally = (entries: JudgedLengthSpeech[]): string =>
    `${entries.filter(isCorrect).length} of ${entries.length} (${percent(entries.filter(isCorrect).length, entries.length)})`;
  const at = (key: string): JudgedLengthSpeech[] => judged.filter(entry => conditionKey(entry.condition) === key);
  const nameOf = (id: string): string => findPersona(id).name;
  const providerName = (provider: AIProvider): string =>
    Object.values(LIVE_DEBATERS).find(entry => entry.provider === provider)?.name ?? provider;

  const levelRows = keys.map(key => {
    const entries = at(key);
    const confidence = entries.reduce((sum, entry) => sum + entry.attribution.confidence, 0) / (entries.length || 1);
    return `| ${key} | ${tally(entries)} | ${tally(entries.filter(entry => entry.phase === 'opening'))} | ${tally(entries.filter(entry => entry.phase === 'rebuttal'))} | ${median(entries.map(entry => entry.words))} | ${confidence.toFixed(1)} |`;
  });
  const cell = (entries: JudgedLengthSpeech[]): string => `${entries.filter(isCorrect).length}/${entries.length}`;
  const personaRows = unique(judged.map(entry => entry.personalityId)).map(id =>
    `| ${nameOf(id)} | ${keys.map(key => cell(at(key).filter(entry => entry.personalityId === id))).join(' | ')} |`);
  const providerRows = unique(judged.map(entry => entry.provider)).map(provider =>
    `| ${providerName(provider)} | ${keys.map(key => cell(at(key).filter(entry => entry.provider === provider))).join(' | ')} |`);
  const misreads = judged.filter(entry => !isCorrect(entry)).map(entry =>
    `- ${conditionKey(entry.condition)}: ${nameOf(entry.personalityId)} read as ${nameOf(entry.attribution.persona)} (${providerName(entry.provider)}, ${entry.label}, ${entry.words} words, confidence ${entry.attribution.confidence}): ${entry.attribution.evidence}`);

  return [
    '# Debate length experiment: persona attribution',
    '',
    `Judged by ${model} with rubric v${RUBRIC_VERSION}: the persona eval's blind attribution prompt, persona names redacted, one call per speech. Speeches are the Affirmative openings and floor speeches of the length run of ${stored.runAt} (${stored.voiceMode ? 'voice' : 'text'} mode). Chance is 1 in 8 (13%).`,
    '',
    '## By level',
    '',
    '| Condition | Correct | Openings | Floor speeches | Median words | Mean confidence (1-5) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...levelRows,
    '',
    '## Correct by persona',
    '',
    `| Persona | ${keys.join(' | ')} |`,
    `| --- | ${keys.map(() => '---').join(' | ')} |`,
    ...personaRows,
    '',
    '## Correct by provider',
    '',
    `| Provider | ${keys.join(' | ')} |`,
    `| --- | ${keys.map(() => '---').join(' | ')} |`,
    ...providerRows,
    '',
    '## Misreads',
    '',
    ...(misreads.length ? misreads : ['None.']),
    '',
  ].join('\n');
};

const describeJudge = judgeEnabled ? describe : describe.skip;

describeJudge('Live debate length experiment: persona attribution', () => {
  jest.setTimeout(60 * 60_000);

  beforeAll(() => {
    loadEnvFile('.env.local');
    loadEnvFile('.env');
  });

  it('judges which persona gave each Affirmative speech, blind, at each level', async () => {
    const stored = readLengthFile();
    const judge = loadJudge();
    const work = stored.runs.flatMap(run => run.debate.speeches
      .filter(speech => speech.side === 'aff' && !speech.lifecycle && PHASE_BY_LABEL.has(speech.label))
      .map(speech => ({ run, speech })));
    process.stdout.write(`\nJudging ${work.length} speeches with ${judge.model}: ${work.length} calls, ${JUDGE_CONCURRENCY} at a time.\n`);

    const judged = await mapWithConcurrency(work, JUDGE_CONCURRENCY, async ({ run, speech }): Promise<JudgedLengthSpeech> => {
      const phase = PHASE_BY_LABEL.get(speech.label);
      if (!phase) throw new Error(`No length phase for ${speech.label}`);
      const { redactions, attribution } = await judgeBlindAttribution(judge, speech);
      return {
        debateId: run.debate.id,
        condition: run.condition,
        personalityId: speech.personalityId,
        provider: speech.provider,
        label: speech.label,
        phase,
        words: wordCount(speech.content),
        redactions,
        attribution,
      };
    });
    fs.writeFileSync(path.join(outDir, 'length-judgments.json'), JSON.stringify({ rubricVersion: RUBRIC_VERSION, judgeModel: judge.model, lengthRunAt: stored.runAt, judged }, null, 2));
    fs.writeFileSync(path.join(outDir, 'length-persona-report.md'), renderPersonaReport(stored, judged, judge.model));
    process.stdout.write(`Persona attribution written to ${outDir}\n`);

    expect(judged).toHaveLength(work.length);
  });
});
