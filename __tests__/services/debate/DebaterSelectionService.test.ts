import { DebaterSelectionService } from '@/services/debate/DebaterSelectionService';
import { DEBATE_SETUP_CONFIG } from '@/config/debate/debateSetupConfig';
import type { AIDebater } from '@/types/debate';

const buildDebater = (overrides: Partial<AIDebater> = {}): AIDebater => ({
  id: overrides.id ?? 'claude-1',
  provider: overrides.provider ?? 'claude',
  name: overrides.name ?? 'Claude',
  model: overrides.model ?? 'claude-3-opus',
  debatingStyle: overrides.debatingStyle ?? {
    aggression: 0.5,
    formality: 0.6,
    evidenceBased: 0.7,
    emotional: 0.4,
  },
  strengthAreas: overrides.strengthAreas ?? ['analysis'],
  weaknessAreas: overrides.weaknessAreas ?? ['humor'],
});

describe('DebaterSelectionService', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.1234);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flags invalid selections with too few debaters and duplicates', () => {
    const [first, second] = [buildDebater(), buildDebater({ id: 'claude-1-copy' })];
    const result = DebaterSelectionService.validateSelection([first]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        DEBATE_SETUP_CONFIG.VALIDATION_MESSAGES.MIN_DEBATERS,
        DEBATE_SETUP_CONFIG.VALIDATION_MESSAGES.DEBATERS_REQUIRED,
      ])
    );

    const duplicateResult = DebaterSelectionService.validateSelection([first, first]);
    expect(duplicateResult.errors).toContain('Duplicate AI selections are not allowed');
  });

  it('returns warnings for single-provider matchups and passes valid selections', () => {
    const claude = buildDebater();
    const claudeTwo = buildDebater({ id: 'claude-2' });
    const openai = buildDebater({ id: 'gpt-4', provider: 'openai', name: 'GPT-4' });

    const singleProvider = DebaterSelectionService.validateSelection([claude, claudeTwo]);
    expect(singleProvider.isValid).toBe(true);
    expect(singleProvider.warnings).toHaveLength(1);

    const mixedProviders = DebaterSelectionService.validateSelection([claude, openai]);
    expect(mixedProviders.isValid).toBe(true);
    expect(mixedProviders.warnings).toHaveLength(0);
  });

  it('scores optimal debaters deterministically and limits to required count', () => {
    const claude = buildDebater({ id: 'claude-1', provider: 'claude', strengthAreas: ['philosophy'] });
    const gpt = buildDebater({ id: 'gpt-4', provider: 'openai', strengthAreas: ['science'], name: 'GPT-4' });
    const gemini = buildDebater({ id: 'gemini-1', provider: 'google', strengthAreas: ['science'], name: 'Gemini' });

    const optimal = DebaterSelectionService.getOptimalDebaters('Philosophy of science', [claude, gpt, gemini]);
    expect(optimal).toHaveLength(DEBATE_SETUP_CONFIG.REQUIRED_DEBATERS);
    expect(optimal[0].id).toBe('claude-1');
  });

  it('enforces selection limits and toggles selections correctly', () => {
    const claude = buildDebater();
    const gpt = buildDebater({ id: 'gpt-4', provider: 'openai', name: 'GPT-4' });
    const mistral = buildDebater({ id: 'mistral-1', provider: 'mistral', name: 'Mistral' });

    const toggled = DebaterSelectionService.toggleAISelection([], claude);
    expect(toggled).toEqual([claude]);

    const trimmed = DebaterSelectionService.enforceSelectionLimits([claude, gpt, mistral], 1, 2);
    expect(trimmed).toHaveLength(2);
    expect(trimmed).toEqual([gpt, mistral]);

    const summary = DebaterSelectionService.getSelectionSummary([claude, gpt]);
    expect(summary.isValid).toBe(true);
    expect(summary.canProceed).toBe(true);
    expect(summary.providers).toEqual(expect.arrayContaining(['claude', 'openai']));
  });

  it('returns diverse recommended pairs first', () => {
    const claude = buildDebater();
    const claudeTwo = buildDebater({ id: 'claude-2' });
    const gpt = buildDebater({ id: 'gpt-4', provider: 'openai', name: 'GPT-4' });

    const pairs = DebaterSelectionService.getRecommendedPairs([claude, claudeTwo, gpt]);
    expect(pairs[0]).toEqual([claude, gpt]);
    expect(pairs[1]).toEqual([claudeTwo, gpt]);
  });
});
