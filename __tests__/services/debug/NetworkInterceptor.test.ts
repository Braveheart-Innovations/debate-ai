import { NetworkInterceptor, type NetworkRequest } from '@/services/debug/NetworkInterceptor';

// `__DEV__` is declared as a read-only global; tests flip it via Reflect.
const setDev = (value: boolean): void => {
  Reflect.set(globalThis, '__DEV__', value);
};

/** A typed stand-in for the underlying fetch that resolves with a real Response. */
const mockFetchResolving = (body: string, headers: HeadersInit = {}) =>
  jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => (
    new Response(body, { status: 200, statusText: 'OK', headers })
  ));

describe('NetworkInterceptor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset interceptor state
    NetworkInterceptor.uninstall();
    NetworkInterceptor.clearRequests();
    // Restore original fetch
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('install/uninstall', () => {
    it('installs the interceptor in dev mode', () => {
      const originalDev = __DEV__;
      setDev(true);

      NetworkInterceptor.install();
      expect(global.fetch).not.toBe(originalFetch);

      NetworkInterceptor.uninstall();
      setDev(originalDev);
    });

    it('restores original fetch on uninstall', () => {
      const originalDev = __DEV__;
      setDev(true);

      NetworkInterceptor.install();
      NetworkInterceptor.uninstall();

      expect(global.fetch).toBe(originalFetch);
      setDev(originalDev);
    });
  });

  describe('request capture', () => {
    beforeEach(() => {
      const originalDev = __DEV__;
      setDev(true);

      // Mock the original fetch
      global.fetch = mockFetchResolving('{"result": "success"}', {
        'content-type': 'application/json',
      });

      NetworkInterceptor.install();

      return () => {
        setDev(originalDev);
      };
    });

    it('captures request details', async () => {
      await global.fetch('https://api.example.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      const requests = NetworkInterceptor.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe('https://api.example.com/data');
      expect(requests[0].method).toBe('POST');
    });

    it('captures response details', async () => {
      await global.fetch('https://api.example.com/data');

      const requests = NetworkInterceptor.getRequests();
      expect(requests[0].response).toBeDefined();
      expect(requests[0].response?.status).toBe(200);
      expect(requests[0].response?.duration).toBeGreaterThanOrEqual(0);
    });

    it('masks sensitive headers', async () => {
      await global.fetch('https://api.example.com/data', {
        headers: {
          Authorization: 'Bearer sk-1234567890abcdef',
          'x-api-key': 'api-key-12345678',
        },
      });

      const requests = NetworkInterceptor.getRequests();
      const headers = requests[0].headers;

      // Sensitive values should be masked - check both cases since Headers may normalize
      const authHeader = headers['Authorization'] || headers['authorization'];
      const apiKeyHeader = headers['x-api-key'] || headers['X-Api-Key'];

      expect(authHeader).toBeDefined();
      expect(authHeader).not.toContain('sk-1234567890abcdef');
      expect(apiKeyHeader).toBeDefined();
      expect(apiKeyHeader).not.toContain('api-key-12345678');
    });
  });

  describe('listeners', () => {
    beforeEach(() => {
      const originalDev = __DEV__;
      setDev(true);

      global.fetch = mockFetchResolving('{}');

      NetworkInterceptor.install();

      return () => {
        setDev(originalDev);
      };
    });

    it('notifies listeners on new requests', async () => {
      const listener = jest.fn((_requests: NetworkRequest[]) => {});
      NetworkInterceptor.addListener(listener);

      await global.fetch('https://api.example.com/test');

      // Listener is called at least twice: once for request, once for response
      expect(listener).toHaveBeenCalled();
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall).toHaveLength(1);
      expect(lastCall[0].url).toBe('https://api.example.com/test');
    });

    it('allows removing listeners', async () => {
      const listener = jest.fn((_requests: NetworkRequest[]) => {});
      const unsubscribe = NetworkInterceptor.addListener(listener);

      unsubscribe();
      await global.fetch('https://api.example.com/test');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clearRequests', () => {
    it('clears all captured requests', async () => {
      const originalDev = __DEV__;
      setDev(true);

      global.fetch = mockFetchResolving('{}');

      NetworkInterceptor.install();
      await global.fetch('https://api.example.com/test');

      expect(NetworkInterceptor.getRequests()).toHaveLength(1);

      NetworkInterceptor.clearRequests();

      expect(NetworkInterceptor.getRequests()).toHaveLength(0);

      setDev(originalDev);
    });
  });

  describe('error handling', () => {
    it('captures network errors', async () => {
      const originalDev = __DEV__;
      setDev(true);

      // Set up a failing fetch before installing interceptor
      const failingFetch = jest.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
          throw new Error('Network failure');
        }
      );
      global.fetch = failingFetch;

      NetworkInterceptor.install();

      try {
        await global.fetch('https://api.example.com/fail');
      } catch {
        // Expected error
      }

      const requests = NetworkInterceptor.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].error).toBe('Network failure');
      expect(requests[0].response?.status).toBe(0);

      NetworkInterceptor.uninstall();
      setDev(originalDev);
    });
  });
});
