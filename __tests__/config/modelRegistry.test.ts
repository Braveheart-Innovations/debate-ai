import { AI_MODELS } from '@/config/modelConfigs';
import {
  MODEL_ALIASES,
  getDefaultModel,
  migrateAIConfig,
  resolveModelAlias,
} from '@/config/providers/modelRegistry';

describe('Model registry helpers', () => {
  it('resolves known aliases and returns passthrough for unknown identifiers', () => {
    expect(resolveModelAlias('gpt-latest')).toBe(MODEL_ALIASES['gpt-latest']);
    expect(resolveModelAlias('this-does-not-exist')).toBe('this-does-not-exist');
  });

  it('points every alias at a cataloged model', () => {
    const catalogIds = new Set(Object.values(AI_MODELS).flat().map((model) => model.id));
    const danglingAliases = Object.entries(MODEL_ALIASES)
      .filter(([, target]) => !catalogIds.has(target))
      .map(([alias]) => alias);
    expect(danglingAliases).toEqual([]);
  });

  it('resolves the October 2026 aliases', () => {
    expect(resolveModelAlias('claude-haiku-latest')).toBe('claude-haiku-5-5');
    expect(resolveModelAlias('gemini-4-latest')).toBe('gemini-4-argon');
    // The Mistral API lists Large 4 under both IDs, each aliasing the other.
    expect(resolveModelAlias('mistral-large-4-0')).toBe('mistral-large-4');
  });

  it('provides defaults for providers and falls back when missing', () => {
    expect(getDefaultModel('claude')).toBeTruthy();
    expect(getDefaultModel('unknown-provider')).toBe('');
  });

  it('migrates configs by injecting default model when missing', () => {
    const config = migrateAIConfig({ provider: 'claude' });
    expect(config.model).toBe(getDefaultModel('claude'));

    const untouched = migrateAIConfig({ provider: 'claude', model: 'custom-model' });
    expect(untouched.model).toBe('custom-model');
  });
});
