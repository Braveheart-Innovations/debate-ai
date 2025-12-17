import { ConnectionTestService } from '@/services/ConnectionTestService';
import type { TestResult } from '@/services/ConnectionTestService';

describe('ConnectionTestService', () => {
  let service: ConnectionTestService;

  const resetSingleton = () => {
    (ConnectionTestService as unknown as { instance?: ConnectionTestService }).instance = undefined;
  };

  beforeEach(() => {
    resetSingleton();
    service = ConnectionTestService.getInstance();
    jest.spyOn(service as unknown as { delay(ms: number): Promise<void> }, 'delay').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns error when API key is missing', async () => {
    const result = await service.testProvider('openai', '');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_KEY');
  });

  it('validates provider specific format before testing', async () => {
    const apiKey = 'invalid-openai-key-with-length';

    const result = await service.testProvider('openai', apiKey);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FORMAT');
    expect(result.message).toContain('OpenAI API keys');
  });

  it('calls real test for valid key format', async () => {
    const apiKey = 'sk-valid-key-1234567890';
    const realTestSpy = jest
      .spyOn(service as unknown as { realTest(providerId: string, apiKey: string, timeout: number): Promise<TestResult> }, 'realTest')
      .mockResolvedValue({ success: true, message: 'Connection verified', model: 'gpt-5.2', responseTime: 100 });

    const result = await service.testProvider('openai', apiKey);

    expect(realTestSpy).toHaveBeenCalledWith('openai', apiKey, expect.any(Number));
    expect(result.success).toBe(true);
    expect(result.model).toBe('gpt-5.2');
  });

  it('stops retrying on auth errors', async () => {
    const realTestSpy = jest
      .spyOn(service as unknown as { realTest(providerId: string, apiKey: string, timeout: number): Promise<TestResult> }, 'realTest')
      .mockRejectedValue(Object.assign(new Error('Invalid API key'), { statusCode: 401 }));

    const apiKey = 'sk-ant-' + 'c'.repeat(40);
    const result = await service.testProvider('claude', apiKey, { retries: 3 });

    expect(result.success).toBe(false);
    // Should only call once - no retries for auth errors
    expect(realTestSpy).toHaveBeenCalledTimes(1);
  });

  it('aggregates results when testing multiple providers', async () => {
    jest.spyOn(service, 'testProvider').mockImplementation(async (providerId: string) => ({
      success: providerId === 'openai',
      message: providerId === 'openai' ? 'ok' : 'bad',
    }));

    const results = await service.testMultipleProviders([
      { providerId: 'openai', apiKey: 'sk-valid-key-1234567890' },
      { providerId: 'claude', apiKey: 'sk-ant-' + 'c'.repeat(40) },
    ]);

    expect(results.openai.success).toBe(true);
    expect(results.claude.success).toBe(false);
  });

  it('maps error codes to helpful recommendations', () => {
    const success = service.getTestRecommendation({ success: true, message: 'ok' });
    const invalid = service.getTestRecommendation({ success: false, message: 'bad', error: { code: 'INVALID_KEY', message: 'bad' } });
    const unknown = service.getTestRecommendation({ success: false, message: '', error: { code: 'OTHER', message: '' } });

    expect(success).toContain('Connection successful');
    expect(invalid).toContain('API key');
    // When message is empty and code is unknown, falls back to default message
    expect(unknown).toContain('Connection failed');
  });

  it('checks provider support list', () => {
    expect(service.isProviderSupported('openai')).toBe(true);
    expect(service.isProviderSupported('claude')).toBe(true);
    expect(service.isProviderSupported('google')).toBe(true);
    expect(service.isProviderSupported('grok')).toBe(true);
    expect(service.isProviderSupported('nonexistent')).toBe(false);
  });
});
