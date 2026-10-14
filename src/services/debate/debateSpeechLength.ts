import type { DebateFormatId, PhaseId } from '@/config/debate/formats';
import type { DebateSpeechLength, ModelParameters } from '@/types';

type CxRole = 'questioner' | 'answerer';

interface DebateSpeechLengthInput {
  formatId?: DebateFormatId;
  phase: PhaseId;
  cxRole?: CxRole;
  voiceMode?: boolean;
  /** The debate's speech length setting. Exchanges set how many speeches there are, not their length. */
  level?: DebateSpeechLength;
}

export interface DebateSpeechLengthGuidance {
  /** The word count the turn prompt asks for. */
  targetWords: number;
  /** Low end of the prompt's range (0.85 x target); the too-short guard fires at 20% of it. */
  minWords: number;
  /** High end of the prompt's range (1.15 x target). */
  maxWords: number;
  /** Output-token safety net: fixed per mode and never follows the level. */
  maxTokens: number;
  directive: string;
}

export const DEBATE_SPEECH_LENGTHS: readonly DebateSpeechLength[] = ['concise', 'default', 'verbose'];
export const DEFAULT_DEBATE_SPEECH_LENGTH: DebateSpeechLength = 'default';

export const isDebateSpeechLength = (value: unknown): value is DebateSpeechLength =>
  DEBATE_SPEECH_LENGTHS.some((level) => level === value);

const DEBATE_OUTPUT_SAFETY_TOKENS = 6144;
// Generous voice ceiling: a runaway safety net, NOT a length control. Deliberately set well above
// the 3000-char TTS budget (~750 tokens) so a token-limit finish is rare. Per-phase length is
// controlled by the prompt's word target, and audio length is bounded at the TTS boundary on
// completed text (see DebateVoiceService).
const DEBATE_VOICE_OUTPUT_SAFETY_TOKENS = 1536;

// Measured on Claude, ChatGPT and Gemini in text and voice mode (docs/evals/debate-length/): every
// level lands within 20% of these targets.
const OPENING_WORDS: Record<DebateSpeechLength, number> = { concise: 100, default: 190, verbose: 350 };
const FLOOR_SPEECH_WORDS: Record<DebateSpeechLength, number> = { concise: 80, default: 150, verbose: 260 };

// Every other phase scales its default target by these factors, rounded to 5 words.
const LEVEL_SCALE: Record<DebateSpeechLength, number> = { concise: 0.55, default: 1, verbose: 1.8 };

// The longest measured 350-word speech used 2,784 of the 3,000 characters one audio clip holds.
const MAX_TARGET_WORDS = 350;

function getDefaultTargetWords({ formatId, phase, cxRole }: DebateSpeechLengthInput): number {
  if (phase === 'cross_examination') {
    return cxRole === 'answerer' ? 95 : 75;
  }

  if (formatId === 'socratic') {
    if (phase === 'opening' || phase === 'question') return 75;
    if (phase === 'synthesis' || phase === 'closing') return 95;
    return 100;
  }

  switch (phase) {
    case 'opening':
    case 'constructive':
      return OPENING_WORDS.default;
    case 'rebuttal':
    case 'final_rebuttal':
      return FLOOR_SPEECH_WORDS.default;
    case 'closing':
      return 130;
    case 'question':
      // An Oxford audience-question answer.
      return 70;
    case 'synthesis':
      return 95;
  }
}

function getTargetWords(input: DebateSpeechLengthInput): number {
  const level = input.level ?? DEFAULT_DEBATE_SPEECH_LENGTH;
  if (input.formatId !== 'socratic') {
    if (input.phase === 'opening' || input.phase === 'constructive') return OPENING_WORDS[level];
    if (input.phase === 'rebuttal' || input.phase === 'final_rebuttal') return FLOOR_SPEECH_WORDS[level];
  }
  const scaled = Math.round((getDefaultTargetWords(input) * LEVEL_SCALE[level]) / 5) * 5;
  return Math.min(MAX_TARGET_WORDS, scaled);
}

export function getDebateSpeechLengthGuidance(input: DebateSpeechLengthInput): DebateSpeechLengthGuidance {
  const targetWords = getTargetWords(input);
  const minWords = Math.round(targetWords * 0.85);
  const maxWords = Math.round(targetWords * 1.15);

  return {
    targetWords,
    minWords,
    maxWords,
    maxTokens: input.voiceMode ? DEBATE_VOICE_OUTPUT_SAFETY_TOKENS : DEBATE_OUTPUT_SAFETY_TOKENS,
    directive: `Length guidance: about ${targetWords} words (between ${minWords} and ${maxWords}), in natural prose with no headings or lists, then stop.`,
  };
}

/**
 * Applies the debate output-token SAFETY NET to model parameters.
 *
 * `safetyFloorTokens` is a runaway guard, not a length control. The effective ceiling is the GREATER
 * of any caller-supplied maxTokens (Expert Mode, personality params) and the safety floor — so a user
 * can raise the ceiling but a low Expert/personality cap can never lower it below the floor and
 * silently reintroduce mid-sentence truncation in debate.
 */
export function applyDebateOutputTokenCap(
  parameters: Partial<ModelParameters> | undefined,
  safetyFloorTokens: number
): Partial<ModelParameters> | undefined {
  const existing = parameters?.maxTokens;
  const effective = Math.max(typeof existing === 'number' ? existing : 0, safetyFloorTokens);

  return {
    ...(parameters || {}),
    maxTokens: effective,
  };
}
