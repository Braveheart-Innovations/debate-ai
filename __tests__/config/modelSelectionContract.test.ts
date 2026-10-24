import {
  AI_MODELS,
  getModelById,
  getModelContextLabel,
  getProviderDefaultModel,
  getProviderModels,
  getSupportedParams,
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
    // Mistral serves Medium 3.5 for the retired Devstral 2 / Medium 3.1 IDs.
    expect(resolveProviderModelId('mistral', 'devstral-2512')).toBe('mistral-medium-2604');
    expect(resolveProviderModelId('mistral', 'mistral-medium-2508')).toBe('mistral-medium-2604');
    // Google routes Gemini 3.5 Flash requests to Gemini 3.6 Flash.
    expect(resolveProviderModelId('google', 'gemini-3.5-flash')).toBe('gemini-3.6-flash');
    expect(resolveProviderModelId('google', 'gemini-3.5-latest')).toBe('gemini-3.6-flash');
  });

  it('keeps DeepSeek V4 Pro as its own selectable model', () => {
    // DeepSeek kept serving V4 Pro after 2026-09-14 instead of routing it to V4.1 Flash.
    expect(resolveProviderModelId('deepseek', 'deepseek-v4-pro')).toBe('deepseek-v4-pro');
    expect(getProviderModels('deepseek').map((model) => model.id)).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
    expect(getDefaultModel('deepseek')).toBe('deepseek-flash');
  });

  it('offers Gemini 3.6 Flash in the picker instead of the routed 3.5 Flash ID', () => {
    const googlePicker = getProviderModels('google').map((model) => model.id);
    expect(googlePicker).toContain('gemini-3.6-flash');
    expect(googlePicker).not.toContain('gemini-3.5-flash');
  });

  it('keeps paid-tier Mistral Large 3 selectable while Medium 3.5 is the default', () => {
    expect(resolveProviderModelId('mistral', 'mistral-large-2512')).toBe('mistral-large-2512');
    expect(getProviderModels('mistral').map((model) => model.id)).toContain('mistral-large-2512');
    expect(getDefaultModel('mistral')).toBe('mistral-medium-2604');
  });

  it('puts Claude Haiku 5.5 in the picker and moves retiring Haiku 4.5 selections to it', () => {
    const claudePicker = getProviderModels('claude').map((model) => model.id);
    expect(claudePicker).toContain('claude-haiku-5-5');
    expect(claudePicker).not.toContain('claude-haiku-4-5-20251001');
    expect(resolveProviderModelId('claude', 'claude-haiku-latest')).toBe('claude-haiku-5-5');
    // Like-for-like successor, not the Sonnet default.
    expect(resolveProviderModelId('claude', 'claude-haiku-4-5-20251001')).toBe('claude-haiku-5-5');
    expect(resolveProviderModelId('claude', 'claude-haiku-4-5')).toBe('claude-haiku-5-5');
    // Non-default temperature/top_p return a 400 on Claude 4.7+ models.
    expect(getSupportedParams('claude', 'claude-haiku-5-5')).toEqual(['maxTokens', 'stopSequences']);
  });

  it('offers Kimi K3.1 Pro, its High-Speed version and K3, and moves retiring K2 selections to K3.1', () => {
    expect(getProviderModels('moonshot').map((model) => model.id)).toEqual([
      'kimi-k3.1-pro',
      'kimi-k3.1-pro-highspeed',
      'kimi-k3',
    ]);
    expect(resolveProviderModelId('moonshot', 'kimi-k2.6')).toBe('kimi-k3.1-pro');
    expect(resolveProviderModelId('moonshot', 'kimi-k2.7-code')).toBe('kimi-k3.1-pro');
    // Like-for-like: the High-Speed selection keeps its speed.
    expect(resolveProviderModelId('moonshot', 'kimi-k2.7-code-highspeed')).toBe('kimi-k3.1-pro-highspeed');
  });

  it('routes deprecated Claude Sonnet 4.5 to the default with its 200K window', () => {
    expect(getModelById('claude', 'claude-sonnet-4-5-20250929')).toMatchObject({
      contextLength: 200000,
      isDeprecated: true,
    });
    expect(resolveProviderModelId('claude', 'claude-sonnet-4-5')).toBe('claude-sonnet-5-5');
  });

  it('puts Gemini 4 Argon in the picker in place of 3.7 Flash, which Google serves as 3.8 Flash', () => {
    const googlePicker = getProviderModels('google').map((model) => model.id);
    expect(googlePicker).toContain('gemini-4-argon');
    expect(googlePicker).not.toContain('gemini-3.7-flash');
    expect(resolveProviderModelId('google', 'gemini-3.7-flash')).toBe('gemini-3.7-flash');
    expect(resolveProviderModelId('google', 'gemini-4-latest')).toBe('gemini-4-argon');
    expect(getModelById('google', 'gemini-4-argon')).toMatchObject({
      contextLength: 1048576,
      maxOutputTokens: 65536,
      supportsThinking: true,
      supportsWebSearch: true,
    });
    // Google ignores sampling parameters on Gemini 4 Argon.
    expect(getSupportedParams('google', 'gemini-4-argon')).toEqual(['maxTokens', 'stopSequences']);
  });

  it('catalogs Mistral Large 4 without offering it in the picker', () => {
    expect(getProviderModels('mistral').map((model) => model.id)).not.toContain('mistral-large-4');
    expect(resolveProviderModelId('mistral', 'mistral-large-4')).toBe('mistral-large-4');
    expect(resolveProviderModelId('mistral', 'mistral-large-4-0')).toBe('mistral-large-4');
    expect(resolveProviderModelId('mistral', 'mistral-large-latest')).toBe('mistral-large-2512');
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
