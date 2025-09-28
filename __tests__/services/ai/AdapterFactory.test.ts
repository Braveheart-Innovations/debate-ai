import { AdapterFactory } from '@/services/ai/factory/AdapterFactory';
import { isDemoModeEnabled } from '@/services/demo/demoMode';
import { ChatGPTAdapter } from '@/services/ai/adapters/openai/ChatGPTAdapter';
import { VirtualDemoAdapter } from '@/services/ai/adapters/demo/VirtualDemoAdapter';

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn(),
}));

jest.mock('@/services/ai/adapters/openai/ChatGPTAdapter', () => ({
  ChatGPTAdapter: jest.fn().mockImplementation((config) => ({
    config,
    getCapabilities: jest.fn().mockReturnValue({ streaming: true, attachments: false, functionCalling: false, systemPrompt: true, maxTokens: 1, contextWindow: 1 }),
  })),
}));

jest.mock('@/services/ai/adapters/demo/VirtualDemoAdapter', () => ({
  VirtualDemoAdapter: jest.fn().mockImplementation((config) => ({
    config,
    getCapabilities: jest.fn(),
  })),
}));

describe('AdapterFactory', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (isDemoModeEnabled as jest.Mock).mockReturnValue(false);
  });

  it('creates virtual adapter when demo mode enabled', () => {
    (isDemoModeEnabled as jest.Mock).mockReturnValue(true);

    AdapterFactory.create({ provider: 'claude', apiKey: 'demo-key', model: 'demo' });
    expect(VirtualDemoAdapter).toHaveBeenCalledWith({ provider: 'claude', apiKey: 'demo-key', model: 'demo' });
  });

  it('creates ChatGPT adapter with explicit model routing', () => {
    AdapterFactory.createWithModel({ provider: 'openai', apiKey: 'key' }, 'gpt-4o');
    expect(ChatGPTAdapter).toHaveBeenCalledWith({ provider: 'openai', apiKey: 'key', model: 'gpt-4o' });
  });

  it('lists supported providers and rejects unknown ones', () => {
    const providers = AdapterFactory.getAvailableProviders();
    expect(providers).toContain('claude');
    expect(AdapterFactory.isProviderSupported('openai')).toBe(true);
    expect(() => AdapterFactory.create({ provider: 'unknown' as never, apiKey: 'key' })).toThrow('Unknown AI provider: unknown');
  });
});
