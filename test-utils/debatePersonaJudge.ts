import { getProviderDefaultModel } from '@/config/modelConfigs';
import { UNIVERSAL_PERSONALITIES, type PersonalityOption } from '@/config/personalities';
import type { AIProvider } from '@/types';
import { isRecord, nativeFetch, requireKey } from './liveDebateEval';

/**
 * The judge shared by the live debate evals (liveDebatePersonas, liveDebateLength), so their results
 * stay comparable. The prompts here and the adherence prompt in liveDebatePersonas.test.ts are the
 * rubric: bump RUBRIC_VERSION when any of them changes.
 */

export const RUBRIC_VERSION = 1;

const JUDGE: { provider: AIProvider; keyEnv: string } = { provider: 'openai', keyEnv: 'OPENAI_API_KEY' };

export interface JudgeConfig {
  apiKey: string;
  model: string;
}

export const loadJudge = (): JudgeConfig => ({
  apiKey: requireKey(JUDGE.keyEnv),
  model: getProviderDefaultModel(JUDGE.provider)?.id ?? '',
});

const PERSONA_IDS = UNIVERSAL_PERSONALITIES.map(persona => persona.id);
export const PERSONA_NAME_PATTERN = new RegExp(
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

export interface Attribution {
  persona: string;
  runner_up: string;
  confidence: number;
  evidence: string;
}

const isAttribution = (value: unknown): value is Attribution =>
  isRecord(value) && typeof value.persona === 'string' && typeof value.runner_up === 'string'
  && typeof value.confidence === 'number' && typeof value.evidence === 'string';

const extractOutputText = (body: unknown): string => {
  if (!isRecord(body)) return '';
  if (typeof body.output_text === 'string') return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  return output.flatMap(item => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map(part => (isRecord(part) && part.type === 'output_text' && typeof part.text === 'string' ? part.text : ''))
    .join('');
};

export const callJudge = async <T>(
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

export interface BlindAttribution {
  /** Persona names found in the speech and replaced with [name] before judging. */
  redactions: number;
  attribution: Attribution;
}

/** One judge call: which persona gave this speech, with persona names redacted. */
export const judgeBlindAttribution = async (
  judge: JudgeConfig,
  speech: { label: string; content: string },
): Promise<BlindAttribution> => {
  const redactions = speech.content.match(PERSONA_NAME_PATTERN)?.length ?? 0;
  const blind = speech.content.replace(PERSONA_NAME_PATTERN, '[name]');
  const attribution = await callJudge(judge.apiKey, judge.model, 'attribution', ATTRIBUTION_INSTRUCTIONS, `Speech (${speech.label}):\n\n${blind}`, attributionSchema, isAttribution);
  return { redactions, attribution };
};
