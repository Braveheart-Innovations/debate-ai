jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'claude', name: 'Claude', enabled: true, color: '#123' },
    { id: 'openai', name: 'OpenAI', enabled: true, color: '#456' },
    { id: 'perplexity', name: 'Perplexity', enabled: true, color: '#789' },
  ],
}));

jest.mock('@/config/modelConfigs', () => ({
  AI_MODELS: {
    claude: [
      { id: 'claude-3', isDefault: false },
      { id: 'claude-4', isDefault: true },
    ],
    openai: [],
    perplexity: [{ id: 'sonar-small', isDefault: false }],
  },
}));

jest.mock('@/utils/aiProviderAssets', () => ({
  getAIProviderIcon: jest.fn((providerId: string) => ({
    icon: `${providerId}-icon`,
    iconType: providerId === 'openai' ? 'image' : 'letter',
  })),
}));

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn(() => false),
}));

import { AIConfigurationService } from '@/services/home/AIConfigurationService';
import { AI_MODELS } from '@/config/modelConfigs';
import { AI_PROVIDERS } from '@/config/aiProviders';
import { getAIProviderIcon } from '@/utils/aiProviderAssets';
import { isDemoModeEnabled } from '@/services/demo/demoMode';

describe('AIConfigurationService', () => {
  const demoModeMock = isDemoModeEnabled as jest.Mock;

  beforeEach(() => {
    demoModeMock.mockReturnValue(false);
    jest.clearAllMocks();
  });

  it('returns configured AIs based on available keys when not in demo mode', () => {
    const configs = AIConfigurationService.getConfiguredAIs({ claude: 'key', openai: undefined });
    expect(configs.map(c => c.id)).toEqual(['claude']);
    expect(configs[0].model).toBe('claude-4');
  });

  it('limits configured AIs in demo mode to whitelisted providers', () => {
    demoModeMock.mockReturnValue(true);

    const configs = AIConfigurationService.getConfiguredAIs({});
    expect(configs.map(c => c.id)).toEqual(['claude', 'openai']);
    expect(configs.find(c => c.id === 'claude')?.model).toBe('opus-4.1');
  });

  it('evaluates provider availability with and without demo mode', () => {
    const provider = AI_PROVIDERS[1]; // openai
    expect(AIConfigurationService.isProviderAvailable(provider, { openai: 'key' })).toBe(true);
    expect(AIConfigurationService.isProviderAvailable(provider, {})).toBe(false);

    demoModeMock.mockReturnValue(true);
    expect(AIConfigurationService.isProviderAvailable(provider, {})).toBe(true);
  });

  it('transforms providers into AI configs with icon metadata', () => {
    const config = AIConfigurationService.transformProviderToConfig(AI_PROVIDERS[0]);
    expect(config).toMatchObject({
      id: 'claude',
      provider: 'claude',
      name: 'Claude',
      model: 'claude-4',
      icon: 'claude-icon',
      iconType: 'letter',
    });
    expect(getAIProviderIcon).toHaveBeenCalledWith('claude');
  });

  it('validates configs and supports API key helpers', () => {
    const valid = AIConfigurationService.validateAIConfiguration({
      id: 'claude',
      provider: 'claude',
      name: 'Claude',
      model: 'claude-4',
      personality: 'default',
      avatar: 'x',
      icon: 'x',
      iconType: 'letter',
      color: '#fff',
    });
    expect(valid).toBe(true);

    const invalid = AIConfigurationService.validateAIConfiguration({
      id: 'claude',
      provider: 'claude',
      name: '',
      model: '',
      personality: 'default',
      avatar: 'x',
      icon: 'x',
      iconType: 'letter',
      color: '#fff',
    });
    expect(invalid).toBe(false);

    expect(AIConfigurationService.hasAPIKey('claude', { claude: 'key' })).toBe(true);
    expect(AIConfigurationService.hasAPIKey('claude', {})).toBe(false);
    expect(AIConfigurationService.getProviderIconData('openai')).toEqual({ icon: 'openai-icon', iconType: 'image' });
  });

  it('maps colors, filters providers, and counts availability', () => {
    const colorMap = AIConfigurationService.mapProviderColors(AI_PROVIDERS);
    expect(colorMap).toMatchObject({ claude: '#123', openai: '#456' });

    const available = AIConfigurationService.getAvailableProviders(AI_PROVIDERS, { claude: 'key' });
    expect(available.map(p => p.id)).toEqual(['claude']);

    const count = AIConfigurationService.getAvailableAICount({ claude: 'key', openai: 'key' });
    expect(count).toBe(2);
  });
});
