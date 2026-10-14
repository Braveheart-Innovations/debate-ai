import { ConnectionTestService } from '@/services/ConnectionTestService';
import type { TestResult } from '@/services/ConnectionTestService';

describe('ConnectionTestService', () => {
  let service: ConnectionTestService;
  const originalFetch = global.fetch;
  const validRunwayKey = `key_${'a'.repeat(128)}`;
  const capitalizedRunwayKey = `Key_${'a'.repeat(128)}`;

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
    global.fetch = originalFetch;
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
      .mockResolvedValue({ success: true, message: 'Connection verified', model: 'gpt-5.5', responseTime: 100 });

    const result = await service.testProvider('openai', apiKey);

    expect(realTestSpy).toHaveBeenCalledWith('openai', apiKey, expect.any(Number));
    expect(result.success).toBe(true);
    expect(result.model).toBe('gpt-5.5');
  });

  it('rejects malformed Runway keys before making a network request', async () => {
    global.fetch = jest.fn();

    const result = await service.testProvider('runway', 'rw_abcdefghijklmnopqrstuvwxyz123456');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FORMAT');
    expect(result.message).toContain('key_');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('tests Runway keys against the non-generation organization endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ name: 'Test Org' }),
    } as unknown as Response);

    const result = await service.testProvider('runway', ` ${validRunwayKey} `, { retries: 0 });

    expect(result.success).toBe(true);
    expect(result.model).toBe('Runway organization');
    expect(result.message).toBe('Connected to Test Org');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/organization',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${validRunwayKey}`,
          'X-Runway-Version': '2024-11-06',
        }),
      })
    );
  });

  it('normalizes a capitalized Runway key prefix when testing the organization endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);

    const result = await service.testProvider('runway', capitalizedRunwayKey, { retries: 0 });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/organization',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${validRunwayKey}`,
        }),
      })
    );
  });

  it('tests ElevenLabs keys against voice listing and text-to-speech generation', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ voices: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as unknown as Response);

    const apiKey = 'elevenlabs_valid_key_123';
    const result = await service.testProvider('elevenlabs', apiKey, { retries: 0 });
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const ttsRequest = fetchMock.mock.calls[1]?.[1];

    expect(result.success).toBe(true);
    expect(result.model).toBe('ElevenLabs text-to-speech');
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.elevenlabs.io/v2/voices?page_size=1',
      expect.objectContaining({
        headers: { 'xi-api-key': apiKey },
      })
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain('https://api.elevenlabs.io/v1/text-to-speech/');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('output_format=mp3_44100_128');
    expect(ttsRequest).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      }),
    });
    expect(JSON.parse(ttsRequest?.body as string)).toMatchObject({
      text: 'Hi.',
      model_id: 'eleven_flash_v2_5',
    });
  });

  it('fails ElevenLabs verification when a key can list voices but cannot synthesize speech', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ voices: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: jest.fn().mockResolvedValue({
          detail: {
            status: 'insufficient_permissions',
            message: 'API key is missing text_to_speech permission',
          },
        }),
      } as unknown as Response);

    const result = await service.testProvider('elevenlabs', 'elevenlabs_valid_key_123', { retries: 0 });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(result.message).toContain('text_to_speech permission');
  });

  it('tests Perplexity with the current sonar-pro minimum token budget', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ model: 'sonar-pro' }),
    } as unknown as Response);

    const result = await service.testProvider('perplexity', 'pplx-valid-key-1234567890', { retries: 0 });
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const requestInit = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(requestInit?.body as string);

    expect(result.success).toBe(true);
    expect(result.model).toBe('sonar-pro');
    expect(body).toMatchObject({
      model: 'sonar-pro',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('tests Claude keys with Haiku 5.5 at the smallest budget that returns text', async () => {
    // Haiku 4.5 is retiring; at max_tokens 1 Haiku 5.5 answers 200 with no text block.
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'H' }] }), { status: 200 })
    );

    const result = await service.testProvider('claude', 'sk-ant-' + 'c'.repeat(40), { retries: 0 });
    const [url, requestInit] = fetchSpy.mock.calls[0] ?? [];

    expect(result.success).toBe(true);
    expect(result.model).toBe('claude-haiku-5-5');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 2,
      messages: [{ role: 'user', content: 'Hi' }],
    });
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
