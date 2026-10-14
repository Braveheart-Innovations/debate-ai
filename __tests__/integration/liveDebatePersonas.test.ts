import fs from 'fs';
import os from 'os';
import path from 'path';

import { getProviderDefaultModel } from '@/config/modelConfigs';
import { UNIVERSAL_PERSONALITIES, type PersonalityOption } from '@/config/personalities';
import { AIService } from '@/services/aiAdapter';
import { DebateOrchestrator } from '@/services/debate/DebateOrchestrator';
import { getDebateSpeechLengthGuidance } from '@/services/debate/debateSpeechLength';
import { isDemoModeEnabled } from '@/services/demo/demoMode';
import { store } from '@/store';
import { setGlobalStreaming } from '@/store/streamingSlice';
import type { AI, AIProvider, Message } from '@/types';
import { createMockAIConfig } from '@test-utils/fixtures';

/**
 * Live debate persona eval: the real DebateOrchestrator and adapters, driven the way the app
 * drives them. Each persona (Default is the control) argues Affirmative on one motion against a
 * Default Negative, on Claude and on Gemini; a debate runs the two openings and the persona's
 * first floor speech, then stops.
 *
 *   npm run test:debate-personas:live    generate: 16 debates, 48 debater calls
 *   npm run test:debate-personas:judge   judge what generate wrote: 64 calls to the OpenAI default model
 *
 * Both steps read keys from .env/.env.local and write to DEBATE_EVAL_OUT
 * (default: <tmpdir>/debate-persona-eval). The judge prompts below are the rubric; bump
 * RUBRIC_VERSION when they change so runs stay comparable.
 */

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn<boolean, []>(() => false),
}));

// See liveModelRouting.test.ts: jest-expo replaces fetch; use host-realm undici.
const hostRequire = process
  .getBuiltinModule('node:module')
  .createRequire(process.cwd() + '/package.json');
const nativeFetch: typeof fetch = hostRequire('undici').fetch;

const generateEnabled = process.env.LIVE_DEBATE_PERSONAS_TEST === '1';
const judgeEnabled = process.env.LIVE_DEBATE_PERSONAS_JUDGE === '1';
const outDir = process.env.DEBATE_EVAL_OUT || path.join(os.tmpdir(), 'debate-persona-eval');
const generationFile = path.join(outDir, 'generation.json');

const RUBRIC_VERSION = 1;
const MOTION = 'This house would ban private cars from city centres';
// Speeches 0-2 of Oxford 1v1: Affirmative opening, Negative opening, Affirmative floor speech.
const SPEECHES_PER_DEBATE = 3;
const DEBATE_CONCURRENCY = 4;
const JUDGE_CONCURRENCY = 6;
const DEBATE_TIMEOUT_MS = 6 * 60_000;

const DEBATERS: Array<{ provider: AIProvider; name: string; keyEnv: string }> = [
  { provider: 'claude', name: 'Claude', keyEnv: 'CLAUDE_API_KEY' },
  { provider: 'google', name: 'Gemini', keyEnv: 'GEMINI_API_KEY' },
];
const JUDGE: { provider: AIProvider; keyEnv: string } = { provider: 'openai', keyEnv: 'OPENAI_API_KEY' };

const loadEnvFile = (fileName: string): void => {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
};

const requireKey = (keyEnv: string): string => {
  const key = process.env[keyEnv]?.trim();
  if (!key) throw new Error(`Missing ${keyEnv}`);
  return key;
};

const mapWithConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
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

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && 'senderType' in value && 'content' in value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const findPersona = (id: string): PersonalityOption => {
  const persona = UNIVERSAL_PERSONALITIES.find(entry => entry.id === id);
  if (!persona) throw new Error(`Unknown persona ${id}`);
  return persona;
};

// ── Generate ────────────────────────────────────────────────────────────────

interface GeneratedSpeech {
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

interface GeneratedDebate {
  id: string;
  personalityId: string;
  provider: AIProvider;
  model: string;
  opponentProvider: AIProvider;
  opponentModel: string;
  webSearchEnabled: boolean;
  speeches: GeneratedSpeech[];
  error?: string;
}

interface GenerationFile {
  rubricVersion: number;
  generatedAt: string;
  motion: string;
  debates: GeneratedDebate[];
}

const runLiveDebate = async (
  personalityId: string,
  debater: (typeof DEBATERS)[number],
  opponent: (typeof DEBATERS)[number],
  keys: Record<string, string>,
): Promise<GeneratedDebate> => {
  // A fresh service per debate: the orchestrator sets each turn's persona on the adapter itself.
  const service = new AIService(keys);
  const participants: AI[] = [debater, opponent].map(entry => createMockAIConfig({
    id: entry.provider,
    provider: entry.provider,
    name: entry.name,
    model: getProviderDefaultModel(entry.provider)?.id ?? '',
  }));
  const orchestrator = new DebateOrchestrator(service);
  const debate: GeneratedDebate = {
    id: `${personalityId}-on-${debater.provider}`,
    personalityId,
    provider: debater.provider,
    model: participants[0].model,
    opponentProvider: opponent.provider,
    opponentModel: participants[1].model,
    webSearchEnabled: false,
    speeches: [],
  };

  const session = await orchestrator.initializeDebate(
    MOTION,
    participants,
    { [participants[0].id]: personalityId, [participants[1].id]: 'default' },
    { formatId: 'oxford', presetId: 'short' },
  );
  debate.webSearchEnabled = Boolean(session.webSearchEnabled);

  await new Promise<void>((resolve) => {
    const finish = (error?: string): void => {
      clearTimeout(timer);
      if (error) debate.error = error;
      orchestrator.reset();
      resolve();
    };
    const timer = setTimeout(() => finish(`timed out after ${DEBATE_TIMEOUT_MS / 1000}s`), DEBATE_TIMEOUT_MS);

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
      // A failed turn is recorded, not retried: retries would change the call count we announced.
      if (lifecycle) finish(`${spec?.label ?? index} ${lifecycle.status}: ${lifecycle.reason ?? ''}`);
      else if (index >= SPEECHES_PER_DEBATE - 1) finish();
    });

    // The app records the opening audience vote first; the eval starts at the first speech.
    orchestrator.executeDebateMessage(0, []).catch((error: unknown) => finish(String(error)));
  });
  return debate;
};

const isGeneratedSpeech = (value: unknown): value is GeneratedSpeech =>
  isRecord(value) && typeof value.index === 'number' && typeof value.label === 'string'
  && typeof value.phase === 'string' && (value.side === 'aff' || value.side === 'neg')
  && typeof value.speaker === 'string' && typeof value.personalityId === 'string'
  && typeof value.provider === 'string' && typeof value.content === 'string';

const isGenerationFile = (value: unknown): value is GenerationFile =>
  isRecord(value) && typeof value.rubricVersion === 'number' && typeof value.generatedAt === 'string'
  && typeof value.motion === 'string' && Array.isArray(value.debates)
  && value.debates.every(debate => isRecord(debate) && typeof debate.id === 'string'
    && typeof debate.personalityId === 'string' && typeof debate.provider === 'string'
    && typeof debate.model === 'string' && Array.isArray(debate.speeches)
    && debate.speeches.every(isGeneratedSpeech));

const renderTranscripts = (generation: GenerationFile): string => [
  '# Debate persona eval: transcripts',
  '',
  `Generated ${generation.generatedAt}. Motion: "${generation.motion}". Oxford 1v1, text mode; each persona is Affirmative against a Default Negative.`,
  '',
  ...generation.debates.flatMap(debate => [
    `## ${findPersona(debate.personalityId).name} on ${debate.model} (opponent ${debate.opponentModel}, web search ${debate.webSearchEnabled ? 'on' : 'off'})`,
    '',
    ...(debate.error ? [`**Stopped:** ${debate.error}`, ''] : []),
    ...debate.speeches.flatMap(speech => [
      `### ${speech.label}: ${speech.speaker} (${wordCount(speech.content)} words${speech.lifecycle ? `, ${speech.lifecycle}` : ''})`,
      '',
      speech.content,
      '',
    ]),
  ]),
].join('\n');

// ── Judge ───────────────────────────────────────────────────────────────────

const PERSONA_IDS = UNIVERSAL_PERSONALITIES.map(persona => persona.id);
const PERSONA_NAME_PATTERN = new RegExp(
  `\\b(?:${UNIVERSAL_PERSONALITIES.filter(persona => persona.id !== 'default')
    .flatMap(persona => [persona.name, persona.name.replace(/^Prof\.\s*/, '')])
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'g',
);

const personaCard = (persona: PersonalityOption): string =>
  `- ${persona.id}: ${persona.id === 'default' ? 'Default' : '[name]'}. ${persona.tagline}. ${persona.description}. ${persona.bio.replace(PERSONA_NAME_PATTERN, '[name]')}`;

const ATTRIBUTION_INSTRUCTIONS = [
  'You are judging speeches from an AI debate app. Each debater was assigned one of the personas below and argued a motion in an Oxford-style debate. Persona names in the speech and the list are replaced with [name].',
  'Decide which persona gave the speech from its voice: word choice, humour, rhetorical moves and structure. Ignore which side it argues and how good the argument is.',
  'Default means no persona was applied: a plain, capable debater. Choose Default when no persona voice is recognisable.',
  '',
  'Personas:',
  ...UNIVERSAL_PERSONALITIES.map(personaCard),
].join('\n');

const ADHERENCE_INSTRUCTIONS = [
  'You are checking one speech from an AI debate app against the persona and the debate rules its speaker was given.',
  'Answer every check from the speech text alone, and be strict: a move counts as present only if the speech clearly makes it.',
  'When the speaker had no persona (Default), answer guidance_followed and in_character with null and signature_moves with an empty list.',
].join('\n');

const PHASE_RULES: Record<string, string> = {
  opening: 'Opening speech: present the case for the audience without mentioning or answering the opponent or their claims.',
  rebuttal: 'Floor speech: directly answer at least one specific claim from the previous speech, then rebuild the case.',
};

const attributionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['persona', 'runner_up', 'confidence', 'evidence'],
  properties: {
    persona: { type: 'string', enum: PERSONA_IDS },
    runner_up: { type: 'string', enum: PERSONA_IDS },
    confidence: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    evidence: { type: 'string', description: 'One sentence naming what in the speech decided it.' },
  },
};

const adherenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stance_held', 'phase_rule_followed', 'guidance_followed', 'signature_moves', 'in_character', 'note'],
  properties: {
    stance_held: { type: 'boolean' },
    phase_rule_followed: { type: 'boolean' },
    guidance_followed: { type: ['boolean', 'null'] },
    signature_moves: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['move', 'present'],
        properties: { move: { type: 'integer' }, present: { type: 'boolean' } },
      },
    },
    in_character: { type: ['integer', 'null'], description: '1 = could be any debater, 5 = unmistakably this persona.' },
    note: { type: 'string', description: 'One sentence on the biggest gap, or "none".' },
  },
};

interface Attribution {
  persona: string;
  runner_up: string;
  confidence: number;
  evidence: string;
}

interface Adherence {
  stance_held: boolean;
  phase_rule_followed: boolean;
  guidance_followed: boolean | null;
  signature_moves: Array<{ move: number; present: boolean }>;
  in_character: number | null;
  note: string;
}

const isAttribution = (value: unknown): value is Attribution =>
  isRecord(value) && typeof value.persona === 'string' && typeof value.runner_up === 'string'
  && typeof value.confidence === 'number' && typeof value.evidence === 'string';

const isAdherence = (value: unknown): value is Adherence =>
  isRecord(value) && typeof value.stance_held === 'boolean' && typeof value.phase_rule_followed === 'boolean'
  && (typeof value.guidance_followed === 'boolean' || value.guidance_followed === null)
  && Array.isArray(value.signature_moves)
  && (typeof value.in_character === 'number' || value.in_character === null)
  && typeof value.note === 'string';

const extractOutputText = (body: unknown): string => {
  if (!isRecord(body)) return '';
  if (typeof body.output_text === 'string') return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  return output.flatMap(item => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map(part => (isRecord(part) && part.type === 'output_text' && typeof part.text === 'string' ? part.text : ''))
    .join('');
};

const callJudge = async <T>(
  apiKey: string,
  model: string,
  name: string,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  guard: (value: unknown) => value is T,
): Promise<T> => {
  const response = await nativeFetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions,
      input,
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(body) && isRecord(body.error) ? String(body.error.message) : response.statusText;
    throw new Error(`Judge ${name} failed (${response.status}): ${message}`);
  }
  const parsed: unknown = JSON.parse(extractOutputText(body));
  if (!guard(parsed)) throw new Error(`Judge ${name} returned an unexpected shape: ${JSON.stringify(parsed)}`);
  return parsed;
};

interface FormatCheck {
  words: number;
  minWords: number;
  maxWords: number;
  hasList: boolean;
  hasHeading: boolean;
}

const checkFormat = (speech: GeneratedSpeech): FormatCheck => {
  const phase = speech.phase === 'rebuttal' ? 'rebuttal' : 'opening';
  const { minWords, maxWords } = getDebateSpeechLengthGuidance({ formatId: 'oxford', presetId: 'short', phase });
  return {
    words: wordCount(speech.content),
    minWords,
    maxWords,
    hasList: /^\s*(?:[-*•]|\d+[.)])\s+\S/m.test(speech.content),
    hasHeading: /^\s*(?:#{1,6}\s|\*\*[^*\n]+\*\*\s*$)/m.test(speech.content),
  };
};

interface JudgedSpeech {
  debateId: string;
  personalityId: string;
  provider: AIProvider;
  label: string;
  phase: string;
  redactions: number;
  format: FormatCheck;
  attribution: Attribution;
  adherence: Adherence;
}

const judgeSpeech = async (
  debate: GeneratedDebate,
  speech: GeneratedSpeech,
  apiKey: string,
  model: string,
): Promise<JudgedSpeech> => {
  const redactions = speech.content.match(PERSONA_NAME_PATTERN)?.length ?? 0;
  const blind = speech.content.replace(PERSONA_NAME_PATTERN, '[name]');
  const attribution = await callJudge(apiKey, model, 'attribution', ATTRIBUTION_INSTRUCTIONS, `Speech (${speech.label}):\n\n${blind}`, attributionSchema, isAttribution);

  const persona = findPersona(speech.personalityId);
  const previous = debate.speeches.filter(entry => entry.index < speech.index).pop();
  const personaLines = persona.id === 'default'
    ? ['Persona: Default (no persona).']
    : [
        `Persona: ${persona.name}.`,
        `Debate guidance: ${persona.debateGuidance || persona.debatePrompt || 'none'}`,
        'Signature moves:',
        ...persona.signatureMoves.slice(0, 3).map((move, index) => `${index + 1}. ${move}`),
      ];
  const adherenceInput = [
    `Motion: "${MOTION}". The speaker is the Affirmative and must support the motion.`,
    `Speech: ${speech.label}. Rule: ${PHASE_RULES[speech.phase] ?? 'none'}`,
    ...personaLines,
    ...(speech.phase === 'rebuttal' && previous ? ['', `Previous speech (${previous.label}):`, previous.content] : []),
    '',
    'Speech to check:',
    speech.content,
  ].join('\n');
  const adherence = await callJudge(apiKey, model, 'adherence', ADHERENCE_INSTRUCTIONS, adherenceInput, adherenceSchema, isAdherence);

  return {
    debateId: debate.id,
    personalityId: speech.personalityId,
    provider: speech.provider,
    label: speech.label,
    phase: speech.phase,
    redactions,
    format: checkFormat(speech),
    attribution,
    adherence,
  };
};

const percent = (count: number, total: number): string => (total ? `${Math.round((count / total) * 100)}%` : 'n/a');

const renderReport = (generation: GenerationFile, judged: JudgedSpeech[], judgeModel: string): string => {
  const correct = (entries: JudgedSpeech[]): number => entries.filter(entry => entry.attribution.persona === entry.personalityId).length;
  const names = UNIVERSAL_PERSONALITIES.map(persona => persona.name);

  const confusionRows = UNIVERSAL_PERSONALITIES.map(actual => {
    const row = judged.filter(entry => entry.personalityId === actual.id);
    const cells = UNIVERSAL_PERSONALITIES.map(predicted => {
      const count = row.filter(entry => entry.attribution.persona === predicted.id).length;
      return count ? String(count) : '·';
    });
    return `| ${actual.name} | ${cells.join(' | ')} |`;
  });

  const personaRows = UNIVERSAL_PERSONALITIES.map(persona => {
    const entries = judged.filter(entry => entry.personalityId === persona.id);
    const moves = entries.flatMap(entry => entry.adherence.signature_moves);
    const inCharacter = entries.map(entry => entry.adherence.in_character).filter((score): score is number => score !== null);
    const meanInCharacter = inCharacter.length ? (inCharacter.reduce((sum, score) => sum + score, 0) / inCharacter.length).toFixed(1) : 'n/a';
    const guidance = entries.filter(entry => entry.adherence.guidance_followed === true).length;
    const formatOk = entries.filter(entry => !entry.format.hasList && !entry.format.hasHeading).length;
    const words = entries.map(entry => entry.format.words).join(', ');
    return `| ${persona.name} | ${correct(entries)}/${entries.length} | ${meanInCharacter} | ${persona.id === 'default' ? 'n/a' : `${moves.filter(move => move.present).length}/${moves.length}`} | ${persona.id === 'default' ? 'n/a' : `${guidance}/${entries.length}`} | ${entries.filter(entry => entry.adherence.stance_held).length}/${entries.length} | ${entries.filter(entry => entry.adherence.phase_rule_followed).length}/${entries.length} | ${formatOk}/${entries.length} | ${words} |`;
  });

  const providerLines = DEBATERS.map(({ provider }) => {
    const entries = judged.filter(entry => entry.provider === provider);
    const model = generation.debates.find(debate => debate.provider === provider)?.model ?? provider;
    return `- ${model}: ${correct(entries)} of ${entries.length} attributed correctly (${percent(correct(entries), entries.length)}).`;
  });

  const failures = generation.debates.filter(debate => debate.error);
  const lengthRange = (phase: string): string => {
    const sample = judged.find(entry => entry.phase === phase)?.format;
    return sample ? `${sample.minWords}-${sample.maxWords}` : 'n/a';
  };

  return [
    '# Debate persona eval: report',
    '',
    `Rubric v${generation.rubricVersion}; generated ${generation.generatedAt}; judged by ${judgeModel}. Motion: "${generation.motion}". Each persona has ${DEBATERS.length * 2} judged speeches (opening and floor speech on each provider), so treat single-persona numbers as small samples.`,
    '',
    `Blind attribution: ${correct(judged)} of ${judged.length} speeches attributed to the right persona (${percent(correct(judged), judged.length)}; chance is ${percent(1, names.length)}).`,
    ...providerLines,
    '',
    '## Attribution (rows: actual persona, columns: judge\'s pick)',
    '',
    `| Actual | ${names.join(' | ')} |`,
    `| --- | ${names.map(() => '---').join(' | ')} |`,
    ...confusionRows,
    '',
    '## Per persona',
    '',
    `Length guidance: opening ${lengthRange('opening')} words, floor speech ${lengthRange('rebuttal')} words. "Format ok" means no list and no heading.`,
    '',
    '| Persona | Attributed | In character (1-5) | Signature moves present | Guidance followed | Stance held | Phase rule followed | Format ok | Words |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...personaRows,
    '',
    `Persona names redacted before blind attribution: ${judged.reduce((sum, entry) => sum + entry.redactions, 0)} occurrences in ${judged.filter(entry => entry.redactions > 0).length} speeches.`,
    failures.length ? `Stopped debates: ${failures.map(debate => `${debate.id} (${debate.error})`).join('; ')}.` : 'All debates completed.',
    '',
    '## Judge notes',
    '',
    ...judged.map(entry => `- **${findPersona(entry.personalityId).name}, ${entry.provider}, ${entry.label}:** picked ${entry.attribution.persona} (${entry.attribution.confidence}/5): ${entry.attribution.evidence} Gap: ${entry.adherence.note}`),
    '',
  ].join('\n');
};

// ── Tests ───────────────────────────────────────────────────────────────────

const describeGenerate = generateEnabled ? describe : describe.skip;
const describeJudge = judgeEnabled ? describe : describe.skip;

describeGenerate('Live debate persona eval: generate', () => {
  jest.setTimeout(45 * 60_000);

  beforeAll(() => {
    loadEnvFile('.env.local');
    loadEnvFile('.env');
    jest.mocked(isDemoModeEnabled).mockReturnValue(false);
    global.fetch = nativeFetch;
    // Non-streaming generation: one request per speech, the same text the stream would deliver.
    store.dispatch(setGlobalStreaming(false));
  });

  it('runs every persona against a Default opponent on each provider', async () => {
    const keys = Object.fromEntries(DEBATERS.map(({ provider, keyEnv }) => [provider, requireKey(keyEnv)]));
    const plan = DEBATERS.flatMap((debater, index) => UNIVERSAL_PERSONALITIES.map(persona => ({
      personalityId: persona.id,
      debater,
      opponent: DEBATERS[(index + 1) % DEBATERS.length],
    })));
    process.stdout.write(`\nGenerating ${plan.length} debates, ${plan.length * SPEECHES_PER_DEBATE} debater calls, ${DEBATE_CONCURRENCY} at a time.\n`);

    const debates = await mapWithConcurrency(plan, DEBATE_CONCURRENCY, entry =>
      runLiveDebate(entry.personalityId, entry.debater, entry.opponent, keys));
    const generation: GenerationFile = {
      rubricVersion: RUBRIC_VERSION,
      generatedAt: new Date().toISOString(),
      motion: MOTION,
      debates,
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(generationFile, JSON.stringify(generation, null, 2));
    fs.writeFileSync(path.join(outDir, 'transcripts.md'), renderTranscripts(generation));
    process.stdout.write(`Debate persona transcripts written to ${outDir}\n`);

    expect(debates.filter(debate => debate.error).map(debate => `${debate.id}: ${debate.error}`)).toEqual([]);
    debates.forEach(debate => expect(debate.speeches).toHaveLength(SPEECHES_PER_DEBATE));
  });
});

describeJudge('Live debate persona eval: judge', () => {
  jest.setTimeout(45 * 60_000);

  beforeAll(() => {
    loadEnvFile('.env.local');
    loadEnvFile('.env');
  });

  it('judges every persona speech the generate step wrote', async () => {
    const generation: unknown = JSON.parse(fs.readFileSync(generationFile, 'utf8'));
    if (!isGenerationFile(generation)) {
      throw new Error(`${generationFile} is not a generation file`);
    }
    const apiKey = requireKey(JUDGE.keyEnv);
    const model = getProviderDefaultModel(JUDGE.provider)?.id ?? '';
    const work = generation.debates.flatMap(debate => debate.speeches
      .filter(speech => speech.side === 'aff' && !speech.lifecycle)
      .map(speech => ({ debate, speech })));
    process.stdout.write(`\nJudging ${work.length} speeches with ${model}: ${work.length * 2} calls, ${JUDGE_CONCURRENCY} at a time.\n`);

    const judged = await mapWithConcurrency(work, JUDGE_CONCURRENCY, ({ debate, speech }) =>
      judgeSpeech(debate, speech, apiKey, model));
    fs.writeFileSync(path.join(outDir, 'judgments.json'), JSON.stringify({ rubricVersion: RUBRIC_VERSION, judgeModel: model, judged }, null, 2));
    fs.writeFileSync(path.join(outDir, 'report.md'), renderReport(generation, judged, model));
    process.stdout.write(`Debate persona report written to ${outDir}\n`);

    expect(judged).toHaveLength(work.length);
  });
});
