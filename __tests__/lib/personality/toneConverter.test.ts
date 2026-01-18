import {
  toneToModifiers,
  debateProfileToGuidance,
  generateStyleNudge,
  shouldApplyToneModifiers,
  getToneDescription,
  getDebateProfileDescription,
} from '@/lib/personality/toneConverter';
import { PersonalityTone, PersonalityDebateProfile } from '@/types/personality';

describe('toneToModifiers', () => {
  it('returns empty string for neutral tone values', () => {
    const neutralTone: PersonalityTone = {
      formality: 0.5,
      humor: 0.5,
      energy: 0.5,
      empathy: 0.5,
      technicality: 0.5,
    };
    expect(toneToModifiers(neutralTone)).toBe('');
  });

  it('returns empty string for empty tone object', () => {
    expect(toneToModifiers({})).toBe('');
  });

  describe('formality', () => {
    it('adds casual modifier for low formality (<0.45)', () => {
      const result = toneToModifiers({ formality: 0.3 });
      expect(result).toContain('casual, conversational language');
    });

    it('adds formal modifier for high formality (>0.55)', () => {
      const result = toneToModifiers({ formality: 0.7 });
      expect(result).toContain('formal, professional tone');
    });

    it('adds no modifier for neutral formality (0.45-0.55)', () => {
      expect(toneToModifiers({ formality: 0.5 })).toBe('');
      expect(toneToModifiers({ formality: 0.45 })).toBe('');
      expect(toneToModifiers({ formality: 0.55 })).toBe('');
    });
  });

  describe('humor', () => {
    it('adds serious modifier for low humor (<0.4)', () => {
      const result = toneToModifiers({ humor: 0.2 });
      expect(result).toContain('serious, focused responses');
    });

    it('adds witty modifier for high humor (>0.6)', () => {
      const result = toneToModifiers({ humor: 0.8 });
      expect(result).toContain('include wit and humor');
    });

    it('adds no modifier for neutral humor (0.4-0.6)', () => {
      expect(toneToModifiers({ humor: 0.5 })).toBe('');
      expect(toneToModifiers({ humor: 0.4 })).toBe('');
      expect(toneToModifiers({ humor: 0.6 })).toBe('');
    });
  });

  describe('energy', () => {
    it('adds calm modifier for low energy (<0.45)', () => {
      const result = toneToModifiers({ energy: 0.3 });
      expect(result).toContain('calm, measured pace');
    });

    it('adds energetic modifier for high energy (>0.55)', () => {
      const result = toneToModifiers({ energy: 0.7 });
      expect(result).toContain('enthusiastic, energetic');
    });

    it('adds no modifier for neutral energy (0.45-0.55)', () => {
      expect(toneToModifiers({ energy: 0.5 })).toBe('');
    });
  });

  describe('empathy', () => {
    it('adds empathy modifier for high empathy (>0.55)', () => {
      const result = toneToModifiers({ empathy: 0.7 });
      expect(result).toContain('prioritize emotional acknowledgment');
    });

    it('adds no modifier for low empathy', () => {
      expect(toneToModifiers({ empathy: 0.3 })).toBe('');
    });

    it('adds no modifier for neutral empathy', () => {
      expect(toneToModifiers({ empathy: 0.5 })).toBe('');
    });
  });

  describe('technicality', () => {
    it('adds accessible modifier for low technicality (<0.45)', () => {
      const result = toneToModifiers({ technicality: 0.3 });
      expect(result).toContain('keep explanations accessible');
    });

    it('adds technical modifier for high technicality (>0.55)', () => {
      const result = toneToModifiers({ technicality: 0.7 });
      expect(result).toContain('use technical depth');
    });

    it('adds no modifier for neutral technicality', () => {
      expect(toneToModifiers({ technicality: 0.5 })).toBe('');
    });
  });

  it('combines multiple modifiers with semicolons', () => {
    const tone: PersonalityTone = {
      formality: 0.8, // formal
      humor: 0.2, // serious
      energy: 0.5, // neutral
      empathy: 0.5, // neutral
      technicality: 0.8, // technical
    };
    const result = toneToModifiers(tone);
    expect(result).toContain('[Style:');
    expect(result).toContain('formal, professional tone');
    expect(result).toContain('serious, focused responses');
    expect(result).toContain('use technical depth');
    expect(result).toContain(';');
  });

  it('wraps modifiers in [Style: ...] format', () => {
    const result = toneToModifiers({ formality: 0.8 });
    expect(result).toMatch(/^\[Style: .+\]$/);
  });
});

describe('debateProfileToGuidance', () => {
  it('returns empty string for empty profile', () => {
    expect(debateProfileToGuidance({})).toBe('');
  });

  describe('argumentStyle', () => {
    it('adds logical guidance for logical style', () => {
      const result = debateProfileToGuidance({ argumentStyle: 'logical' });
      expect(result).toContain('focus on logical arguments and evidence');
    });

    it('adds emotional guidance for emotional style', () => {
      const result = debateProfileToGuidance({ argumentStyle: 'emotional' });
      expect(result).toContain('use emotional appeals and narrative');
    });

    it('adds balanced guidance for balanced style', () => {
      const result = debateProfileToGuidance({ argumentStyle: 'balanced' });
      expect(result).toContain('balance logic with emotional resonance');
    });
  });

  describe('aggression', () => {
    it('adds gentle guidance for low aggression (<0.3)', () => {
      const result = debateProfileToGuidance({ aggression: 0.2 });
      expect(result).toContain('gentle, collaborative approach');
    });

    it('adds assertive guidance for high aggression (>0.7)', () => {
      const result = debateProfileToGuidance({ aggression: 0.9 });
      expect(result).toContain('assertive, direct challenges');
    });

    it('adds no guidance for neutral aggression', () => {
      expect(debateProfileToGuidance({ aggression: 0.5 })).toBe('');
    });
  });

  describe('concession', () => {
    it('adds firm guidance for low concession (<0.3)', () => {
      const result = debateProfileToGuidance({ concession: 0.1 });
      expect(result).toContain('stand firm on positions');
    });

    it('adds yielding guidance for high concession (>0.7)', () => {
      const result = debateProfileToGuidance({ concession: 0.9 });
      expect(result).toContain('acknowledge valid opposing points');
    });

    it('adds no guidance for neutral concession', () => {
      expect(debateProfileToGuidance({ concession: 0.5 })).toBe('');
    });
  });

  it('wraps guidance in [Debate style: ...] format', () => {
    const result = debateProfileToGuidance({ argumentStyle: 'logical' });
    expect(result).toMatch(/^\[Debate style: .+\]$/);
  });

  it('combines multiple guidance elements with semicolons', () => {
    const profile: PersonalityDebateProfile = {
      argumentStyle: 'logical',
      aggression: 0.9,
      concession: 0.1,
    };
    const result = debateProfileToGuidance(profile);
    expect(result).toContain('focus on logical arguments');
    expect(result).toContain('assertive, direct challenges');
    expect(result).toContain('stand firm on positions');
  });
});

describe('generateStyleNudge', () => {
  it('returns empty string when no inputs provided', () => {
    expect(generateStyleNudge()).toBe('');
    expect(generateStyleNudge(undefined, undefined)).toBe('');
  });

  it('returns tone modifiers only when tone provided', () => {
    const tone: Partial<PersonalityTone> = { formality: 0.8 };
    const result = generateStyleNudge(tone);
    expect(result).toContain('[Style:');
    expect(result).not.toContain('[Debate style:');
  });

  it('returns debate guidance only when profile provided', () => {
    const profile: Partial<PersonalityDebateProfile> = { argumentStyle: 'logical' };
    const result = generateStyleNudge(undefined, profile);
    expect(result).toContain('[Debate style:');
    expect(result).not.toContain('[Style:');
  });

  it('combines tone and debate profile with space separator', () => {
    const tone: Partial<PersonalityTone> = { formality: 0.8 };
    const profile: Partial<PersonalityDebateProfile> = { argumentStyle: 'logical' };
    const result = generateStyleNudge(tone, profile);
    expect(result).toContain('[Style:');
    expect(result).toContain('[Debate style:');
    expect(result).toContain(' ');
  });
});

describe('shouldApplyToneModifiers', () => {
  it('returns true for first message (count 0)', () => {
    expect(shouldApplyToneModifiers(0)).toBe(true);
  });

  it('returns true for every 5th message', () => {
    expect(shouldApplyToneModifiers(5)).toBe(true);
    expect(shouldApplyToneModifiers(10)).toBe(true);
    expect(shouldApplyToneModifiers(15)).toBe(true);
  });

  it('returns false for other message counts', () => {
    expect(shouldApplyToneModifiers(1)).toBe(false);
    expect(shouldApplyToneModifiers(2)).toBe(false);
    expect(shouldApplyToneModifiers(3)).toBe(false);
    expect(shouldApplyToneModifiers(4)).toBe(false);
    expect(shouldApplyToneModifiers(6)).toBe(false);
  });
});

describe('getToneDescription', () => {
  it('returns correct labels for formality', () => {
    const result = getToneDescription('formality', 0.5);
    expect(result.low).toBe('Casual');
    expect(result.high).toBe('Formal');
  });

  it('returns correct labels for humor', () => {
    const result = getToneDescription('humor', 0.5);
    expect(result.low).toBe('Serious');
    expect(result.high).toBe('Witty');
  });

  it('returns correct labels for energy', () => {
    const result = getToneDescription('energy', 0.5);
    expect(result.low).toBe('Calm');
    expect(result.high).toBe('Enthusiastic');
  });

  it('returns correct labels for empathy', () => {
    const result = getToneDescription('empathy', 0.5);
    expect(result.low).toBe('Detached');
    expect(result.high).toBe('Empathetic');
  });

  it('returns correct labels for technicality', () => {
    const result = getToneDescription('technicality', 0.5);
    expect(result.low).toBe('Accessible');
    expect(result.high).toBe('Technical');
  });

  it('returns low label for values < 0.35', () => {
    expect(getToneDescription('formality', 0.2).current).toBe('Casual');
    expect(getToneDescription('humor', 0.1).current).toBe('Serious');
  });

  it('returns high label for values > 0.65', () => {
    expect(getToneDescription('formality', 0.8).current).toBe('Formal');
    expect(getToneDescription('humor', 0.9).current).toBe('Witty');
  });

  it('returns Balanced for neutral values (0.35-0.65)', () => {
    expect(getToneDescription('formality', 0.5).current).toBe('Balanced');
    expect(getToneDescription('humor', 0.4).current).toBe('Balanced');
  });
});

describe('getDebateProfileDescription', () => {
  it('returns correct labels for aggression', () => {
    const result = getDebateProfileDescription('aggression', 0.5);
    expect(result.low).toBe('Gentle');
    expect(result.high).toBe('Aggressive');
  });

  it('returns correct labels for concession', () => {
    const result = getDebateProfileDescription('concession', 0.5);
    expect(result.low).toBe('Firm');
    expect(result.high).toBe('Yielding');
  });

  it('returns correct labels for interruption', () => {
    const result = getDebateProfileDescription('interruption', 0.5);
    expect(result.low).toBe('Patient');
    expect(result.high).toBe('Interruptive');
  });

  it('returns low label for values < 0.35', () => {
    expect(getDebateProfileDescription('aggression', 0.2).current).toBe('Gentle');
  });

  it('returns high label for values > 0.65', () => {
    expect(getDebateProfileDescription('aggression', 0.8).current).toBe('Aggressive');
  });

  it('returns Balanced for neutral values', () => {
    expect(getDebateProfileDescription('aggression', 0.5).current).toBe('Balanced');
  });
});
