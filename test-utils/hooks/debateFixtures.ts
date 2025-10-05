import type { AIDebater, Personality } from '@/types/debate';

export const createMockDebater = (overrides: Partial<AIDebater> = {}): AIDebater => ({
  id: 'ai-1',
  name: 'Analyst AI',
  provider: 'anthropic',
  model: 'claude-3-sonnet',
  debatingStyle: {
    aggression: 0.3,
    formality: 0.8,
    evidenceBased: 0.9,
    emotional: 0.2,
  },
  strengthAreas: ['analysis', 'reasoning'],
  weaknessAreas: ['humor'],
  ...overrides,
});

export const createMockPersonality = (overrides: Partial<Personality> = {}): Personality => ({
  id: 'default-personality',
  name: 'Measured Analyst',
  description: 'Calm and methodical debater.',
  debateModifiers: {
    argumentStyle: 'logical',
    interruption: 0.1,
    concession: 0.6,
    aggression: 0.2,
  },
  ...overrides,
});

export const buildPersonalityMap = (
  entries: Array<[string, Personality]> = []
): Map<string, Personality> => new Map(entries);
