import { PersonalityService } from '@/services/debate/PersonalityService';
import type { AIDebater, Personality } from '@/types/debate';

describe('PersonalityService', () => {
  const debater: AIDebater = {
    id: 'claude',
    name: 'Claude',
    provider: 'claude',
    model: 'claude-3',
    iconType: 'letter',
    icon: 'C',
  };

  it('returns default personality configuration', () => {
    const defaultPersona = PersonalityService.getDefaultPersonality();
    expect(defaultPersona.id).toBe('default');
    expect(defaultPersona.systemPrompt).toBeDefined();
  });

  it('validates personality selections and reports unknown ids', () => {
    const validPersonality = PersonalityService.getDefaultPersonality();
    const selections = new Map<string, Personality>([['claude', validPersonality]]);
    const valid = PersonalityService.validatePersonalitySelection(selections);
    expect(valid.isValid).toBe(true);

    const invalidSelections = new Map<string, Personality>([['claude', { ...validPersonality, id: 'unknown' }]]);
    const invalid = PersonalityService.validatePersonalitySelection(invalidSelections);
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors[0]).toContain('Unknown personality');
  });

  it('applies personality traits to debater profile', () => {
    const persona = PersonalityService.getDefaultPersonality();
    const configured = PersonalityService.applyPersonalityToDebater(debater, persona);

    expect(configured.personality).toBe(persona.id);
    expect(configured.debatingStyle?.aggression).toBeDefined();
  });

  it('penalizes identical personalities in compatibility score', () => {
    const persona = PersonalityService.getDefaultPersonality();
    const score = PersonalityService.getCompatibilityScore(persona, persona);
    expect(score).toBeLessThan(50);
  });
});
