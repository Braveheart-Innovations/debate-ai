/**
 * Tone-to-Prompt Converter
 * Converts numeric tone values into natural language style modifiers
 * for use in AI prompts
 */

import { PersonalityTone, PersonalityDebateProfile } from '@/types/personality';

/**
 * Convert tone values to a style modifier string for prompts.
 * Uses narrowed neutral ranges (mostly 0.45-0.55) for stronger expression.
 * Matches web implementation thresholds.
 */
export function toneToModifiers(tone: Partial<PersonalityTone>): string {
  const modifiers: string[] = [];

  // Formality: affects language register (narrowed to 0.45/0.55)
  if (tone.formality !== undefined) {
    if (tone.formality < 0.45) {
      modifiers.push('casual, conversational language');
    } else if (tone.formality > 0.55) {
      modifiers.push('formal, professional tone');
    }
  }

  // Humor: affects wit and playfulness (0.40/0.60)
  if (tone.humor !== undefined) {
    if (tone.humor < 0.4) {
      modifiers.push('serious, focused responses');
    } else if (tone.humor > 0.6) {
      modifiers.push('include wit and humor');
    }
  }

  // Energy: affects pacing and enthusiasm (narrowed to 0.45/0.55)
  if (tone.energy !== undefined) {
    if (tone.energy < 0.45) {
      modifiers.push('calm, measured pace');
    } else if (tone.energy > 0.55) {
      modifiers.push('enthusiastic, energetic');
    }
  }

  // Empathy: affects emotional acknowledgment (only high trigger at 0.55)
  if (tone.empathy !== undefined) {
    if (tone.empathy > 0.55) {
      modifiers.push('prioritize emotional acknowledgment');
    }
  }

  // Technicality: affects depth of explanation (narrowed to 0.45/0.55)
  if (tone.technicality !== undefined) {
    if (tone.technicality < 0.45) {
      modifiers.push('keep explanations accessible');
    } else if (tone.technicality > 0.55) {
      modifiers.push('use technical depth');
    }
  }

  if (modifiers.length === 0) {
    return '';
  }

  return `[Style: ${modifiers.join('; ')}]`;
}

/**
 * Convert debate profile to style guidance for debate prompts
 */
export function debateProfileToGuidance(profile: Partial<PersonalityDebateProfile>): string {
  const guidance: string[] = [];

  // Argument style
  if (profile.argumentStyle) {
    switch (profile.argumentStyle) {
      case 'logical':
        guidance.push('focus on logical arguments and evidence');
        break;
      case 'emotional':
        guidance.push('use emotional appeals and narrative');
        break;
      case 'balanced':
        guidance.push('balance logic with emotional resonance');
        break;
    }
  }

  // Aggression (Gentle ↔ Aggressive)
  if (profile.aggression !== undefined) {
    if (profile.aggression < 0.3) {
      guidance.push('gentle, collaborative approach');
    } else if (profile.aggression > 0.7) {
      guidance.push('assertive, direct challenges');
    }
  }

  // Concession (Firm ↔ Yielding)
  if (profile.concession !== undefined) {
    if (profile.concession < 0.3) {
      guidance.push('stand firm on positions');
    } else if (profile.concession > 0.7) {
      guidance.push('acknowledge valid opposing points');
    }
  }

  if (guidance.length === 0) {
    return '';
  }

  return `[Debate style: ${guidance.join('; ')}]`;
}

/**
 * Generate a complete style nudge combining tone and debate profile
 * for use in debate prompts
 */
export function generateStyleNudge(
  tone?: Partial<PersonalityTone>,
  debateProfile?: Partial<PersonalityDebateProfile>
): string {
  const parts: string[] = [];

  if (tone) {
    const toneModifier = toneToModifiers(tone);
    if (toneModifier) {
      parts.push(toneModifier);
    }
  }

  if (debateProfile) {
    const debateGuidance = debateProfileToGuidance(debateProfile);
    if (debateGuidance) {
      parts.push(debateGuidance);
    }
  }

  return parts.join(' ');
}

/**
 * Determine if tone modifiers should be applied to this message
 * Based on message count - applies periodically (every 5th message)
 */
export function shouldApplyToneModifiers(messageCount: number): boolean {
  // Apply on first message and every 5th message after
  return messageCount === 0 || messageCount % 5 === 0;
}

/**
 * Get a human-readable description of a tone value
 */
export function getToneDescription(
  trait: keyof PersonalityTone,
  value: number
): { low: string; high: string; current: string } {
  const descriptions: Record<keyof PersonalityTone, { low: string; high: string }> = {
    formality: { low: 'Casual', high: 'Formal' },
    humor: { low: 'Serious', high: 'Witty' },
    energy: { low: 'Calm', high: 'Enthusiastic' },
    empathy: { low: 'Detached', high: 'Empathetic' },
    technicality: { low: 'Accessible', high: 'Technical' },
  };

  const { low, high } = descriptions[trait];

  // Determine current position description
  let current: string;
  if (value < 0.35) {
    current = low;
  } else if (value > 0.65) {
    current = high;
  } else {
    current = 'Balanced';
  }

  return { low, high, current };
}

/**
 * Get human-readable description for debate profile values
 */
export function getDebateProfileDescription(
  trait: 'aggression' | 'concession' | 'interruption',
  value: number
): { low: string; high: string; current: string } {
  const descriptions: Record<typeof trait, { low: string; high: string }> = {
    aggression: { low: 'Gentle', high: 'Aggressive' },
    concession: { low: 'Firm', high: 'Yielding' },
    interruption: { low: 'Patient', high: 'Interruptive' },
  };

  const { low, high } = descriptions[trait];

  let current: string;
  if (value < 0.35) {
    current = low;
  } else if (value > 0.65) {
    current = high;
  } else {
    current = 'Balanced';
  }

  return { low, high, current };
}
