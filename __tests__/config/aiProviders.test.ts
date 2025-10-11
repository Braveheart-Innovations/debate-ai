import {
  AI_PROVIDERS,
  getEnabledProviders,
  getProviderById,
} from '@/config/aiProviders';

describe('AI provider directory', () => {
  it('exposes unique provider identifiers', () => {
    const ids = AI_PROVIDERS.map(provider => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('retrieves providers by identifier', () => {
    const claude = getProviderById('claude');
    expect(claude).toMatchObject({
      id: 'claude',
      company: 'Anthropic',
      enabled: true,
    });
    expect(getProviderById('unknown-provider')).toBeUndefined();
  });

  it('filters to enabled providers only', () => {
    const enabled = getEnabledProviders();
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every(provider => provider.enabled)).toBe(true);
    for (const provider of enabled) {
      expect(provider.gradient).toHaveLength(2);
      expect(provider.apiKeyPlaceholder).toBeTruthy();
    }
  });
});
