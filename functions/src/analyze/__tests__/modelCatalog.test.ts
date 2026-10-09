import { DEFAULT_PROVIDER_MODELS, MODEL_ALIASES } from '../../modelRegistry';
import { isV2Supported } from '../../providers/registry';
import { getCatalogModel, getCatalogProviders, hasCatalogModel } from '../modelCatalog';

/**
 * Server alias targets deliberately absent from the generated catalog. Each
 * needs a reason; anything not listed must exist in the catalog.
 */
const ALIAS_TARGETS_OUTSIDE_CATALOG: Record<string, string> = {
  // Image model: the catalog covers text/chat models only.
  'grok-imagine-image': 'image generation',
  // Google's own moving aliases, resolved by the Gemini API itself.
  'gemini-pro-latest': 'provider-side alias',
  'gemini-flash-latest': 'provider-side alias',
  'gemini-flash-lite-latest': 'provider-side alias',
  // Stale server aliases to models the app no longer lists (found 2026-10-08).
  // Remove the aliases from modelRegistry.ts at the next model refresh.
  'grok-4-1-fast-reasoning': 'stale alias',
  'grok-4-1-fast-non-reasoning': 'stale alias',
};

describe('Analyze model catalog', () => {
  it('covers every provider the server streams through V2', () => {
    for (const providerId of Object.keys(DEFAULT_PROVIDER_MODELS).filter(isV2Supported)) {
      expect(getCatalogProviders()).toContain(providerId);
    }
  });

  // The model-refresh trap: a model the server knows about (default or alias
  // target) that the generated catalog lacks would run with no context or
  // output limits. Regenerate the catalog from the web app to fix.
  it('knows every model the server registry can resolve to', () => {
    const missing: string[] = [];
    for (const [providerId, modelId] of Object.entries(DEFAULT_PROVIDER_MODELS)) {
      if (!hasCatalogModel(providerId, modelId)) missing.push(`${providerId}/${modelId} (default)`);
    }
    const aliasTargets = new Set(Object.values(MODEL_ALIASES));
    for (const target of aliasTargets) {
      if (ALIAS_TARGETS_OUTSIDE_CATALOG[target]) continue;
      const known = getCatalogProviders().some((providerId) => hasCatalogModel(providerId, target));
      if (!known) missing.push(`${target} (alias target)`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps the exemption list honest: an exempted target that joins the catalog must be un-exempted', () => {
    const nowInCatalog = Object.keys(ALIAS_TARGETS_OUTSIDE_CATALOG)
      .filter((target) => getCatalogProviders().some((providerId) => hasCatalogModel(providerId, target)));
    expect(nowInCatalog).toEqual([]);
  });

  it('resolves aliases to the aliased model', () => {
    const [alias, target] = Object.entries(MODEL_ALIASES).find(([, t]) => t === 'gpt-6-astra') ?? [];
    expect(alias).toBeDefined();
    expect(getCatalogModel('openai', alias!)).toBe(getCatalogModel('openai', target!));
  });

  it('carries the limits pruning needs', () => {
    const opus = getCatalogModel('claude', 'claude-opus-5-5');
    expect(opus).toEqual(expect.objectContaining({ supportsFunctions: true }));
    expect(opus!.contextLength).toBeGreaterThan(opus!.maxOutputTokens);
  });
});
