import {
  MODEL_VERSIONS,
  getAllModelsForProvider,
  getLatestModelInFamily,
  getModelInfo,
  isModelDeprecated,
} from '@/config/providers/modelVersions';

describe('Model version registry', () => {
  it('exposes at least one latest model per provider family', () => {
    for (const [, families] of Object.entries(MODEL_VERSIONS)) {
      for (const [, versions] of Object.entries(families)) {
        expect(versions.length).toBeGreaterThan(0);
        const latestCount = versions.filter(version => version.isLatest).length;
        expect(latestCount).toBeGreaterThanOrEqual(1);
        expect(versions.every(version => version.id && version.version && version.releaseDate)).toBe(true);
      }
    }
  });

  it('returns the latest model by provider family', () => {
    expect(getLatestModelInFamily('claude', 'premium')).toBe('claude-opus-5-5');
    expect(getLatestModelInFamily('openai', 'flagship')).toBe('gpt-6.1-sol');
    expect(getLatestModelInFamily('grok', 'main')).toBe('grok-4.3');
    expect(getLatestModelInFamily('mistral', 'medium')).toBe('mistral-medium-2604');
    expect(getLatestModelInFamily('cohere', 'command')).toBe('command-a-plus-05-2026');
    expect(getLatestModelInFamily('unknown', 'family')).toBeNull();
    expect(getLatestModelInFamily('claude', 'nonexistent')).toBeNull();
  });

  it('flattens models for a provider', () => {
    const claudeModels = getAllModelsForProvider('claude');
    expect(claudeModels.length).toBeGreaterThan(0);
    expect(claudeModels.some(model => model.id === 'claude-3-opus-20240229')).toBe(true);

    expect(getAllModelsForProvider('unknown')).toEqual([]);
  });

  it('finds model info and deprecated status by id', () => {
    expect(getModelInfo('gpt-5')).toMatchObject({
      id: 'gpt-5',
      isLatest: false,
    });
    expect(getModelInfo('does-not-exist')).toBeNull();

    expect(isModelDeprecated('claude-3-opus-20240229')).toBe(true);
    expect(isModelDeprecated('claude-3-7-sonnet-20250219')).toBe(true);
    expect(isModelDeprecated('gpt-5')).toBe(false);
    expect(isModelDeprecated('unknown-model')).toBe(false);
  });
});
