import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useAIProviderInfo } from '@/hooks/stats/useAIProviderInfo';
import { AI_PROVIDERS } from '@/config/aiProviders';
import { AI_BRAND_COLORS } from '@/constants/aiColors';

describe('useAIProviderInfo', () => {
  it('resolves provider info with brand colors and fallbacks', () => {
    const { result } = renderHookWithProviders(() => useAIProviderInfo());

    const {
      getAIInfo,
      getAIColor,
      getAIName,
      getMultipleAIInfo,
      isValidAI,
      availableProviders,
      providersWithColors,
      fallbackColor,
      totalProviders,
    } = result.current;

    const claudeInfo = getAIInfo('claude');
    expect(claudeInfo.name).toBe('Claude');
    expect(claudeInfo.color).toBe(AI_BRAND_COLORS.claude);

    const unknownInfo = getAIInfo('unknown-provider');
    expect(unknownInfo.name).toBe('unknown-provider');
    expect(unknownInfo.color).toBe(fallbackColor);

    expect(getAIColor('claude')).toBe(AI_BRAND_COLORS.claude);
    expect(getAIName('claude')).toBe('Claude');

    const batchInfo = getMultipleAIInfo(['claude', 'openai']);
    expect(batchInfo).toHaveLength(2);

    expect(isValidAI('claude')).toBe(true);
    expect(isValidAI('nonexistent')).toBe(false);

    expect(availableProviders).toHaveLength(AI_PROVIDERS.length);
    expect(totalProviders).toBe(AI_PROVIDERS.length);

    const expectedProvidersWithColors = AI_PROVIDERS.filter(provider => {
      const colorKey = provider.id === 'openai' || provider.id === 'chatgpt' ? 'openai' : provider.id;
      return Boolean(AI_BRAND_COLORS[colorKey as keyof typeof AI_BRAND_COLORS]);
    }).map(provider => provider.id);

    expect(providersWithColors.map(provider => provider.id)).toEqual(expectedProvidersWithColors);
  });
});
