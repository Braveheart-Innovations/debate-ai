import type { DebateFormatId, PhaseId } from '@/config/debate/formats';
import {
  applyDebateOutputTokenCap,
  DEBATE_SPEECH_LENGTHS,
  getDebateSpeechLengthGuidance,
  isDebateSpeechLength,
} from '@/services/debate/debateSpeechLength';
import type { DebateSpeechLength } from '@/types';

interface PhaseCase {
  name: string;
  formatId: DebateFormatId;
  phase: PhaseId;
  cxRole?: 'questioner' | 'answerer';
  targets: Record<DebateSpeechLength, number>;
}

// Openings and floor speeches are the measured tables; every other phase scales its default
// target by 0.55 (concise) and 1.8 (verbose), rounded to 5 words.
const PHASES: PhaseCase[] = [
  { name: 'Oxford opening', formatId: 'oxford', phase: 'opening', targets: { concise: 100, default: 190, verbose: 350 } },
  { name: 'Lincoln-Douglas constructive', formatId: 'lincoln_douglas', phase: 'constructive', targets: { concise: 100, default: 190, verbose: 350 } },
  { name: 'Policy constructive', formatId: 'policy', phase: 'constructive', targets: { concise: 100, default: 190, verbose: 350 } },
  { name: 'Oxford floor speech', formatId: 'oxford', phase: 'rebuttal', targets: { concise: 80, default: 150, verbose: 260 } },
  { name: 'Lincoln-Douglas final rebuttal', formatId: 'lincoln_douglas', phase: 'final_rebuttal', targets: { concise: 80, default: 150, verbose: 260 } },
  { name: 'Oxford closing', formatId: 'oxford', phase: 'closing', targets: { concise: 70, default: 130, verbose: 235 } },
  { name: 'Oxford audience-question answer', formatId: 'oxford', phase: 'question', targets: { concise: 40, default: 70, verbose: 125 } },
  { name: 'synthesis', formatId: 'oxford', phase: 'synthesis', targets: { concise: 50, default: 95, verbose: 170 } },
  { name: 'cross-examination questioner', formatId: 'lincoln_douglas', phase: 'cross_examination', cxRole: 'questioner', targets: { concise: 40, default: 75, verbose: 135 } },
  { name: 'cross-examination answerer', formatId: 'policy', phase: 'cross_examination', cxRole: 'answerer', targets: { concise: 50, default: 95, verbose: 170 } },
  { name: 'Socratic opening', formatId: 'socratic', phase: 'opening', targets: { concise: 40, default: 75, verbose: 135 } },
  { name: 'Socratic question', formatId: 'socratic', phase: 'question', targets: { concise: 40, default: 75, verbose: 135 } },
  { name: 'Socratic synthesis', formatId: 'socratic', phase: 'synthesis', targets: { concise: 50, default: 95, verbose: 170 } },
  { name: 'Socratic closing', formatId: 'socratic', phase: 'closing', targets: { concise: 50, default: 95, verbose: 170 } },
  { name: 'Socratic probe', formatId: 'socratic', phase: 'rebuttal', targets: { concise: 55, default: 100, verbose: 180 } },
];

const CASES = PHASES.flatMap(entry => DEBATE_SPEECH_LENGTHS.map(level => ({ ...entry, level, target: entry.targets[level] })));

describe('debateSpeechLength', () => {
  it.each(CASES)('$name at $level asks for about $target words', ({ formatId, phase, cxRole, level, target }) => {
    const guidance = getDebateSpeechLengthGuidance({ formatId, phase, cxRole, level });
    const minWords = Math.round(target * 0.85);
    const maxWords = Math.round(target * 1.15);

    expect(guidance.targetWords).toBe(target);
    expect(guidance.minWords).toBe(minWords);
    expect(guidance.maxWords).toBe(maxWords);
    expect(guidance.directive).toBe(
      `Length guidance: about ${target} words (between ${minWords} and ${maxWords}), in natural prose with no headings or lists, then stop.`,
    );
  });

  it('uses the exact directives the length runs measured for openings and floor speeches', () => {
    const directive = (phase: PhaseId, level: DebateSpeechLength): string =>
      getDebateSpeechLengthGuidance({ formatId: 'oxford', phase, level }).directive;

    expect(directive('opening', 'concise')).toBe('Length guidance: about 100 words (between 85 and 115), in natural prose with no headings or lists, then stop.');
    expect(directive('opening', 'default')).toBe('Length guidance: about 190 words (between 162 and 218), in natural prose with no headings or lists, then stop.');
    expect(directive('opening', 'verbose')).toBe('Length guidance: about 350 words (between 298 and 402), in natural prose with no headings or lists, then stop.');
    expect(directive('rebuttal', 'concise')).toBe('Length guidance: about 80 words (between 68 and 92), in natural prose with no headings or lists, then stop.');
    expect(directive('rebuttal', 'default')).toBe('Length guidance: about 150 words (between 128 and 173), in natural prose with no headings or lists, then stop.');
    expect(directive('rebuttal', 'verbose')).toBe('Length guidance: about 260 words (between 221 and 299), in natural prose with no headings or lists, then stop.');
  });

  it('defaults to the default level', () => {
    const unset = getDebateSpeechLengthGuidance({ formatId: 'oxford', phase: 'opening' });

    expect(unset).toEqual(getDebateSpeechLengthGuidance({ formatId: 'oxford', phase: 'opening', level: 'default' }));
    expect(unset.targetWords).toBe(190);
  });

  it('never asks for more than one audio clip holds', () => {
    const verboseTargets = CASES.filter(entry => entry.level === 'verbose')
      .map(({ formatId, phase, cxRole }) => getDebateSpeechLengthGuidance({ formatId, phase, cxRole, level: 'verbose' }).targetWords);

    expect(Math.max(...verboseTargets)).toBe(350);
  });

  it('keeps the token safety caps fixed whatever the level or phase', () => {
    for (const { formatId, phase, cxRole, level } of CASES) {
      expect(getDebateSpeechLengthGuidance({ formatId, phase, cxRole, level }).maxTokens).toBe(6144);
      // Voice is a generous runaway safety net (well above the TTS budget), not a length control.
      expect(getDebateSpeechLengthGuidance({ formatId, phase, cxRole, level, voiceMode: true }).maxTokens).toBe(1536);
    }
  });

  it('gives voice mode the same words as text mode', () => {
    const text = getDebateSpeechLengthGuidance({ formatId: 'oxford', phase: 'opening', level: 'verbose' });
    const voice = getDebateSpeechLengthGuidance({ formatId: 'oxford', phase: 'opening', level: 'verbose', voiceMode: true });

    expect(voice.directive).toBe(text.directive);
    expect(voice.minWords).toBe(text.minWords);
  });

  it('recognises only the three level ids', () => {
    expect(DEBATE_SPEECH_LENGTHS.filter(isDebateSpeechLength)).toEqual(['concise', 'default', 'verbose']);
    expect(isDebateSpeechLength('brief')).toBe(false);
    expect(isDebateSpeechLength(undefined)).toBe(false);
  });

  it('applies the safety ceiling as a floor that a low expert/personality cap cannot lower', () => {
    // No caller params -> the floor.
    expect(applyDebateOutputTokenCap(undefined, 6144)).toEqual({ maxTokens: 6144 });
    // A lower caller maxTokens is raised to the floor; other params pass through untouched.
    expect(applyDebateOutputTokenCap({ temperature: 0.8, maxTokens: 1200 }, 6144)).toEqual({
      temperature: 0.8,
      maxTokens: 6144,
    });
    // A higher caller maxTokens (e.g. expert raising the ceiling) is preserved.
    expect(applyDebateOutputTokenCap({ temperature: 0.2, maxTokens: 9000 }, 6144)).toEqual({
      temperature: 0.2,
      maxTokens: 9000,
    });
  });
});
