import { act, renderHook } from '@testing-library/react-native';
import { useConnectionTest } from '@/hooks/useConnectionTest';
import ConnectionTestService from '@/services/ConnectionTestService';

jest.mock('@/services/ConnectionTestService', () => ({
  __esModule: true,
  default: {
    testProvider: jest.fn(),
    testMultipleProviders: jest.fn(),
    getTestRecommendation: jest.fn().mockReturnValue('Reset your API key and try again.'),
    isProviderSupported: jest.fn().mockReturnValue(true),
  },
}));

const mockedService = ConnectionTestService as jest.Mocked<typeof ConnectionTestService>;

const successResult = { success: true, message: 'ok', model: 'gpt', responseTime: 1234 };
const failureResult = { success: false, message: 'invalid', error: { code: 'INVALID', message: 'invalid' } };

const createDeferred = <T,>() => {
  let resolveFn: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolve => {
    resolveFn = resolve;
  });
  return { promise, resolve: resolveFn! };
};

describe('useConnectionTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns failure immediately when key missing', async () => {
    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      const response = await result.current.testConnection('openai', '');
      expect(response).toEqual({ success: false, message: 'No API key provided' });
    });

    expect(mockedService.testProvider).not.toHaveBeenCalled();
    expect(result.current.testStatuses.openai.status).toBe('failed');
  });

  it('records successful provider results', async () => {
    mockedService.testProvider.mockResolvedValueOnce(successResult);

    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      const outcome = await result.current.testConnection('openai', 'sk-valid');
      expect(outcome).toEqual(successResult);
    });

    expect(mockedService.testProvider).toHaveBeenCalledWith('openai', 'sk-valid', {});
    expect(result.current.testStatuses.openai).toMatchObject({ status: 'success', message: 'ok', model: 'gpt' });
    expect(result.current.isTestingAny).toBe(false);
  });

  it('handles pending requests and resets testing state', async () => {
    const deferred = createDeferred<typeof successResult>();
    mockedService.testProvider.mockImplementationOnce(() => deferred.promise);

    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      const pending = result.current.testConnection('openai', 'sk-late');
      deferred.resolve(successResult);
      await pending;
    });

    expect(result.current.testStatuses.openai.status).toBe('success');
    expect(result.current.isTestingAny).toBe(false);
  });

  it('handles provider test errors gracefully', async () => {
    mockedService.testProvider.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      const outcome = await result.current.testConnection('claude', 'some-key');
      expect(outcome).toEqual({ success: false, message: 'network down' });
    });

    expect(result.current.testStatuses.claude).toMatchObject({ status: 'failed', message: 'network down' });
  });

  it('tests multiple providers and updates statuses', async () => {
    mockedService.testMultipleProviders.mockResolvedValueOnce({
      openai: successResult,
      claude: failureResult,
    });

    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      const summary = await result.current.testMultipleProviders([
        { providerId: 'openai', apiKey: 'key-1' },
        { providerId: 'claude', apiKey: 'key-2' },
      ]);
      expect(summary).toEqual({ openai: successResult, claude: failureResult });
    });

    expect(result.current.testStatuses.openai.status).toBe('success');
    expect(result.current.testStatuses.claude.status).toBe('failed');
  });

  it('marks batch tests as failed when service throws', async () => {
    mockedService.testMultipleProviders.mockRejectedValueOnce(new Error('batch fail'));

    const { result } = renderHook(() => useConnectionTest());

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.testMultipleProviders([
          { providerId: 'openai', apiKey: 'key-1' },
        ]);
      } catch (err) {
        caught = err as Error;
      }
    });

    expect(caught?.message).toBe('batch fail');
    expect(result.current.testStatuses.openai).toMatchObject({ status: 'failed', message: 'batch fail' });
  });

  it('provides reset helpers', async () => {
    mockedService.testProvider.mockResolvedValue(successResult);

    const { result } = renderHook(() => useConnectionTest());

    await act(async () => {
      await result.current.testConnection('openai', 'sk');
    });

    expect(Object.keys(result.current.testStatuses)).toContain('openai');

    act(() => {
      result.current.resetTestStatus('openai');
    });

    expect(result.current.testStatuses.openai).toBeUndefined();

    act(() => {
      result.current.resetAllTestStatuses();
    });

    expect(result.current.testStatuses).toEqual({});
  });

  it('generates contextual recommendations', async () => {
    mockedService.testProvider.mockResolvedValueOnce({ success: true, message: 'ok' });

    const { result } = renderHook(() => useConnectionTest());

    expect(result.current.getTestRecommendation('openai')).toBe('Click test to verify your API key.');

    await act(async () => {
      await result.current.testConnection('openai', 'valid-key');
    });

    expect(result.current.getTestRecommendation('openai')).toBe('Connection successful! Your API key is working correctly.');

    mockedService.testProvider.mockResolvedValueOnce(failureResult);

    await act(async () => {
      await result.current.testConnection('claude', 'short');
    });

    expect(result.current.getTestRecommendation('claude')).toBe('Reset your API key and try again.');
  });

  it('exposes provider support lookup', () => {
    const { result } = renderHook(() => useConnectionTest());
    expect(result.current.isProviderSupported('openai')).toBe(true);
    expect(mockedService.isProviderSupported).toHaveBeenCalledWith('openai');
  });
});
