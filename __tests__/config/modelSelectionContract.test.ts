import {
  AI_MODELS,
  getModelById,
  getModelContextLabel,
  getProviderDefaultModel,
  getProviderModels,
  resolveProviderModelId,
} from '@/config/modelConfigs';
import { getDefaultModel } from '@/config/providers/modelRegistry';

describe('Model selection contract', () => {
  const providerIds = Object.keys(AI_MODELS);
  const removedProvider = ['to', 'gether'].join('');

  it('keeps removed providers out of selectable model registries', () => {
    expect(providerIds).not.toContain(removedProvider);
    expect(getProviderModels(removedProvider)).toEqual([]);
    expect(getProviderDefaultModel(removedProvider)).toBeUndefined();
    expect(getDefaultModel(removedProvider)).toBe('');
  });

  it.each(providerIds)('only exposes non-deprecated selectable models for %s', (providerId) => {
    const models = getProviderModels(providerId);

    expect(models.length).toBeGreaterThan(0);
    expect(models.length).toBeLessThanOrEqual(7);
    expect(models.every((model) => model.isDeprecated !== true)).toBe(true);
    expect(models.every((model) => model.supportsImageGeneration !== true)).toBe(true);
  });

  it.each(providerIds)('keeps provider defaults aligned for %s', (providerId) => {
    expect(getProviderDefaultModel(providerId)?.id).toBe(getDefaultModel(providerId));
    expect(resolveProviderModelId(providerId, getDefaultModel(providerId))).toBe(getDefaultModel(providerId));
  });

  it('resolves aliases before validating provider ownership', () => {
    expect(resolveProviderModelId('claude', 'claude-latest')).toBe('claude-sonnet-5-5');
    expect(resolveProviderModelId('claude', 'claude-opus-latest')).toBe('claude-opus-5-5');
    expect(resolveProviderModelId('claude', 'claude-fable-latest')).toBe('claude-fable-5-1');
    expect(resolveProviderModelId('openai', 'gpt-latest')).toBe('gpt-6.1-sol');
    expect(resolveProviderModelId('openai', 'gpt-6-latest')).toBe('gpt-6-astra');
    expect(resolveProviderModelId('google', 'gemini-latest')).toBe('gemini-3.8-flash');
    expect(resolveProviderModelId('google', 'gemini-pro-latest')).toBe('gemini-3.1-pro-preview');
    expect(resolveProviderModelId('cohere', 'command-a-latest')).toBe('command-a-03-2025');
    expect(resolveProviderModelId('grok', 'grok-latest')).toBe('grok-4.3');
    expect(resolveProviderModelId('mistral', 'mistral-medium-latest')).toBe('mistral-medium-2604');
    expect(resolveProviderModelId('mistral', 'mistral-medium-3-5')).toBe('mistral-medium-2604');
    expect(resolveProviderModelId('mistral', 'magistral-medium-latest')).toBe('mistral-medium-2604');
    expect(resolveProviderModelId('cohere', 'north-small-translate-latest')).toBe('north-small-translate-09-2026');
  });

  it('routes retired provider IDs the way the provider now serves them', () => {
    // DeepSeek serves every V4 Flash name (and the legacy chat/reasoner names)
    // as V4.1 Flash since 2026-09-10.
    for (const retired of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-chat', 'deepseek-reasoner']) {
      expect(resolveProviderModelId('deepseek', retired)).toBe('deepseek-flash');
    }
    expect(resolveProviderModelId('deepseek', 'deepseek-v4-pro')).toBe('deepseek-flash');
    // Mistral serves Medium 3.5 for the retired Devstral 2 / Medium 3.1 IDs.
    expect(resolveProviderModelId('mistral', 'devstral-2512')).toBe('mistral-medium-2604');
    expect(resolveProviderModelId('mistral', 'mistral-medium-2508')).toBe('mistral-medium-2604');
  });

  it('moves persisted Mistral Large 3 selections to the default (403 tier_not_allowed for standard keys)', () => {
    expect(getModelById('mistral', 'mistral-large-2512')?.isDeprecated).toBe(true);
    expect(resolveProviderModelId('mistral', 'mistral-large-2512')).toBe('mistral-medium-2604');
  });

  it('looks up persisted alias IDs with the resolved model capabilities', () => {
    expect(getModelById('openai', 'gpt-latest')?.id).toBe('gpt-6.1-sol');
    expect(getModelById('claude', 'claude-latest')?.id).toBe('claude-sonnet-5-5');
    expect(getModelById('claude', 'claude-opus-latest')?.id).toBe('claude-opus-5-5');
    expect(getModelById('google', 'gemini-pro-latest')?.supportsThinking).toBe(true);
    expect(getModelById('openai', 'gpt-5-mini')?.id).toBe('gpt-5.4-mini');
    expect(getModelById('openai', 'gpt-5-nano')?.id).toBe('gpt-5.4-nano');
  });

  it('keeps OpenAI live-search support model-driven', () => {
    expect(getModelById('openai', 'gpt-5.5')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5.4')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5.4-mini')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5.4-nano')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5-mini')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5-nano')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-4.1')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-4.1-mini')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5.2')?.supportsWebSearch).toBe(true);
    expect(getModelById('openai', 'gpt-5.6-sol')?.supportsWebSearch).toBe(true);
    for (const gpt6 of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']) {
      expect(getModelById('openai', gpt6)?.supportsWebSearch).toBe(true);
    }

    expect(getModelById('openai', 'o4-mini')?.supportsWebSearch).not.toBe(true);
    expect(getModelById('openai', 'gpt-4o')?.supportsWebSearch).not.toBe(true);
    expect(getModelById('openai', 'gpt-4o-mini')?.supportsWebSearch).not.toBe(true);
  });

  it('falls back to provider default for deprecated, invalid, or cross-provider models', () => {
    expect(resolveProviderModelId('claude', 'claude-3-7-sonnet-20250219')).toBe('claude-sonnet-5-5');
    expect(resolveProviderModelId('claude', 'gpt-5')).toBe('claude-sonnet-5-5');
    expect(resolveProviderModelId('openai', 'not-a-real-model')).toBe('gpt-6.1-sol');
    expect(resolveProviderModelId('grok', 'grok-4-1-fast-non-reasoning')).toBe('grok-4.3');
  });

  it('keeps gpt-5.5-pro resolvable now that non-streaming routing is model-driven', () => {
    expect(resolveProviderModelId('openai', 'gpt-5.5-pro')).toBe('gpt-5.5-pro');
    expect(getModelById('openai', 'gpt-5.5-pro')?.supportsStreaming).toBe(false);
  });

  it('removes deprecated Gemini 2.0 Flash from the visible Google picker', () => {
    expect(getProviderModels('google').map((model) => model.id)).not.toContain('gemini-2.0-flash');
  });

  it('formats audited context labels for provider picker display', () => {
    expect(getModelContextLabel(getModelById('openai', 'gpt-5.5')!)).toBe('1.05M context');
    expect(getModelContextLabel(getModelById('google', 'gemini-2.5-pro')!)).toBe('1M context');
    expect(getModelContextLabel(getModelById('cohere', 'command-a-plus-05-2026')!)).toBe('436K context');
    expect(getModelContextLabel(getModelById('perplexity', 'sonar-pro')!)).toBe('Context unpublished');
  });

  it('rejects image-generation models in text-mode resolution', () => {
    expect(resolveProviderModelId('openai', 'gpt-image-2')).toBe('gpt-6.1-sol');
    expect(resolveProviderModelId('openai', 'gpt-image-2.5-flare')).toBe('gpt-6.1-sol');
    expect(resolveProviderModelId('openai', 'gpt-image-1')).toBe('gpt-6.1-sol');
    expect(resolveProviderModelId('grok', 'grok-imagine-image')).toBe('grok-4.3');
  });
});
