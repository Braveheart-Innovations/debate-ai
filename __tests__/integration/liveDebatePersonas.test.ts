import fs from 'fs';
import os from 'os';
import path from 'path';

import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import { getDebateSpeechLengthGuidance } from '@/services/debate/debateSpeechLength';
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
  nativeFetch,
  requireKey,
  runLiveDebate,
  wordCount,
  type GeneratedDebate,
  type GeneratedSpeech,
} from '@test-utils/liveDebateEval';
import {
  RUBRIC_VERSION,
  callJudge,
  judgeBlindAttribution,
  loadJudge,
  type Attribution,
  type JudgeConfig,
} from '@test-utils/debatePersonaJudge';

/**
 * Live debate persona eval: the real DebateOrchestrator and adapters, driven the way the app
 * drives them (see runLiveDebate). Each persona (Default is the control) argues Affirmative on one
 * motion against a Default Negative, on Claude and on Gemini; a debate runs the two openings and the
 * persona's first floor speech, then stops.
 *
 *   npm run test:debate-personas:live    generate: 16 debates, 48 debater calls
 *   npm run test:debate-personas:judge   judge what generate wrote: 64 calls to the OpenAI default model
 *
 * Both steps read keys from .env/.env.local and write to DEBATE_EVAL_OUT
 * (default: <tmpdir>/debate-persona-eval). The judge prompts below are the rubric; bump
 * RUBRIC_VERSION when they change so runs stay comparable. Baseline: docs/evals/debate-personas/.
 */

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn<boolean, []>(() => false),
}));

const generateEnabled = process.env.LIVE_DEBATE_PERSONAS_TEST === '1';
const judgeEnabled = process.env.LIVE_DEBATE_PERSONAS_JUDGE === '1';
const outDir = process.env.DEBATE_EVAL_OUT || path.join(os.tmpdir(), 'debate-persona-eval');
const generationFile = path.join(outDir, 'generation.json');

const MOTION = 'This house would ban private cars from city centres';
// Speeches 0-2 of Oxford 1v1: Affirmative opening, Negative opening, Affirmative floor speech.
const SPEECHES_PER_DEBATE = 3;
const DEBATE_CONCURRENCY = 4;
const JUDGE_CONCURRENCY = 6;
const DEBATE_TIMEOUT_MS = 6 * 60_000;

const DEBATERS = [LIVE_DEBATERS.claude, LIVE_DEBATERS.google];

interface GenerationFile {
  rubricVersion: number;
  generatedAt: string;
  motion: string;
  debates: GeneratedDebate[];
}

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




const ADHERENCE_INSTRUCTIONS = [
  'You are checking one speech from an AI debate app against the persona and the debate rules its speaker was given.',
  'Answer every check from the speech text alone, and be strict: a move counts as present only if the speech clearly makes it.',
  'When the speaker had no persona (Default), answer guidance_followed and in_character with null and signature_moves with an empty list.',
].join('\n');

const PHASE_RULES: Record<string, string> = {
  opening: 'Opening speech: present the case for the audience without mentioning or answering the opponent or their claims.',
  rebuttal: 'Floor speech: directly answer at least one specific claim from the previous speech, then rebuild the case.',
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


interface Adherence {
  stance_held: boolean;
  phase_rule_followed: boolean;
  guidance_followed: boolean | null;
  signature_moves: Array<{ move: number; present: boolean }>;
  in_character: number | null;
  note: string;
}


const isAdherence = (value: unknown): value is Adherence =>
  isRecord(value) && typeof value.stance_held === 'boolean' && typeof value.phase_rule_followed === 'boolean'
  && (typeof value.guidance_followed === 'boolean' || value.guidance_followed === null)
  && Array.isArray(value.signature_moves)
  && (typeof value.in_character === 'number' || value.in_character === null)
  && typeof value.note === 'string';



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
  judge: JudgeConfig,
): Promise<JudgedSpeech> => {
  const { redactions, attribution } = await judgeBlindAttribution(judge, speech);

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
  const adherence = await callJudge(judge.apiKey, judge.model, 'adherence', ADHERENCE_INSTRUCTIONS, adherenceInput, adherenceSchema, isAdherence);

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

    const debates = await mapWithConcurrency(plan, DEBATE_CONCURRENCY, entry => runLiveDebate({
      id: `${entry.personalityId}-on-${entry.debater.provider}`,
      motion: MOTION,
      personalityId: entry.personalityId,
      debater: entry.debater,
      opponent: entry.opponent,
      keys,
      speeches: SPEECHES_PER_DEBATE,
      timeoutMs: DEBATE_TIMEOUT_MS,
    }));
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
    const judge = loadJudge();
    const { model } = judge;
    const work = generation.debates.flatMap(debate => debate.speeches
      .filter(speech => speech.side === 'aff' && !speech.lifecycle)
      .map(speech => ({ debate, speech })));
    process.stdout.write(`\nJudging ${work.length} speeches with ${model}: ${work.length * 2} calls, ${JUDGE_CONCURRENCY} at a time.\n`);

    const judged = await mapWithConcurrency(work, JUDGE_CONCURRENCY, ({ debate, speech }) =>
      judgeSpeech(debate, speech, judge));
    fs.writeFileSync(path.join(outDir, 'judgments.json'), JSON.stringify({ rubricVersion: RUBRIC_VERSION, judgeModel: model, judged }, null, 2));
    fs.writeFileSync(path.join(outDir, 'report.md'), renderReport(generation, judged, model));
    process.stdout.write(`Debate persona report written to ${outDir}\n`);

    expect(judged).toHaveLength(work.length);
  });
});
