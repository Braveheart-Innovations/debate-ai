import {
  MODEL_ALIASES,
  getDefaultModel,
  getFreeDefaultModel,
  migrateAIConfig,
  resolveModelAlias,
} from '@/config/providers/modelRegistry';

describe('Model registry helpers', () => {
  it('resolves known aliases and returns passthrough for unknown identifiers', () => {
    expect(resolveModelAlias('gpt-latest')).toBe(MODEL_ALIASES['gpt-latest']);
    expect(resolveModelAlias('this-does-not-exist')).toBe('this-does-not-exist');
  });

  it('provides defaults for providers and falls back when missing', () => {
    expect(getDefaultModel('claude')).toBeTruthy();
    expect(getDefaultModel('unknown-provider')).toBe('');

    expect(getFreeDefaultModel('perplexity')).toBeDefined();
    expect(getFreeDefaultModel('unknown-provider')).toBe('');
  });

  it('migrates configs by injecting default model when missing', () => {
    const config = migrateAIConfig({ provider: 'claude' });
    expect(config.model).toBe(getDefaultModel('claude'));

    const untouched = migrateAIConfig({ provider: 'claude', model: 'custom-model' });
    expect(untouched.model).toBe('custom-model');
  });
});
