import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';

describe('Universal personalities catalog', () => {
  it('contains unique, well-formed personality entries', () => {
    const ids = UNIVERSAL_PERSONALITIES.map(personality => personality.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const personality of UNIVERSAL_PERSONALITIES) {
      expect(personality.name).toBeTruthy();
      expect(personality.emoji).toBeTruthy();
      expect(personality.systemPrompt.length).toBeGreaterThan(0);
      expect(Array.isArray(personality.signatureMoves)).toBe(true);

      if (personality.sampleOpeners) {
        const openers = Object.values(personality.sampleOpeners).filter(Boolean) as string[];
        expect(openers.every(opener => opener.length > 0)).toBe(true);
      }
    }
  });

  it('keeps tone attributes within expected bounds', () => {
    for (const personality of UNIVERSAL_PERSONALITIES) {
      if (personality.tone) {
        const { formality, humor, energy, empathy, technicality } = personality.tone;
        for (const value of [formality, humor, energy, empathy, technicality]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('validates debate profile configuration when present', () => {
    const validStyles = new Set(['logical', 'emotional', 'balanced']);
    for (const personality of UNIVERSAL_PERSONALITIES) {
      const profile = personality.debateProfile;
      if (profile) {
        expect(validStyles.has(profile.argumentStyle)).toBe(true);
        for (const value of [profile.aggression, profile.concession, profile.interruption ?? 0]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
