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
    jest.spyOn(Math, 'random').mockReturnValue(0.25);
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

  it('returns success in mock mode for valid key', async () => {
    const apiKey = 'sk-valid-key-1234567890';
    const result = await service.testProvider('openai', apiKey, { mockMode: true });

    expect(result.success).toBe(true);
    expect(result.model).toBe('gpt-5');
    expect(result.message).toBe('Verified just now');
    expect(result.responseTime).toBeGreaterThan(0);
  });

  it('delegates to real test when mock mode disabled', async () => {
    const realTestSpy = jest
      .spyOn(service as unknown as { realTest(providerId: string, apiKey: string, timeout: number): Promise<TestResult> }, 'realTest')
      .mockResolvedValue({ success: true, message: 'ok', model: 'model', responseTime: 10 });

    const result = await service.testProvider('openai', 'sk-real-key-1234567890', { mockMode: false });

    expect(realTestSpy).toHaveBeenCalledWith('openai', 'sk-real-key-1234567890', expect.any(Number));
    expect(result.success).toBe(true);
    expect(result.model).toBe('model');
  });

  it('stops retrying when error should not retry', async () => {
    const mockTestSpy = jest
      .spyOn(service as unknown as { mockTest(providerId: string, apiKey: string, timeout: number): Promise<TestResult> }, 'mockTest')
      .mockImplementation(() => {
        throw new Error('invalid');
      });
    jest
      .spyOn(service as unknown as { parseError(error: unknown): { code: string; message: string } }, 'parseError')
      .mockReturnValue({ code: 'INVALID_KEY', message: 'Invalid key' });

    const apiKey = 'c'.repeat(45);
    const result = await service.testProvider('claude', apiKey, { retries: 3 });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_KEY');
    expect(mockTestSpy).toHaveBeenCalledTimes(1);
  });

  it('aggregates results when testing multiple providers', async () => {
    jest.spyOn(service, 'testProvider').mockImplementation(async (providerId: string) => ({
      success: providerId === 'openai',
      message: providerId === 'openai' ? 'ok' : 'bad',
    }));

    const results = await service.testMultipleProviders([
      { providerId: 'openai', apiKey: 'sk-valid-key-1234567890' },
      { providerId: 'claude', apiKey: 'c'.repeat(45) },
    ]);

    expect(results.openai.success).toBe(true);
    expect(results.claude.success).toBe(false);
  });

  it('maps error codes to helpful recommendations', () => {
    const success = service.getTestRecommendation({ success: true, message: 'ok' });
    const invalid = service.getTestRecommendation({ success: false, message: 'bad', error: { code: 'INVALID_KEY', message: 'bad' } });
    const unknown = service.getTestRecommendation({ success: false, message: 'bad', error: { code: 'OTHER', message: 'x' } });

    expect(success).toContain('Connection successful');
    expect(invalid).toContain('API key');
    expect(unknown).toContain('Connection failed');
  });

  it('checks provider support list', () => {
    expect(service.isProviderSupported('openai')).toBe(true);
    expect(service.isProviderSupported('nonexistent')).toBe(false);
  });
});
