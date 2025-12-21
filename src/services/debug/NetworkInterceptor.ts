/**
 * NetworkInterceptor - Captures network requests for debugging
 *
 * Only active in __DEV__ mode. Monkey-patches global fetch to capture
 * request/response data for display in the debug menu.
 */

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string;
    duration: number;
  };
  error?: string;
}

const MAX_REQUESTS = 100;
const MAX_BODY_LENGTH = 10000;

class NetworkInterceptorClass {
  private requests: NetworkRequest[] = [];
  private originalFetch: typeof fetch | null = null;
  private installed = false;
  private listeners: ((requests: NetworkRequest[]) => void)[] = [];

  /**
   * Install the network interceptor (dev mode only)
   */
  install(): void {
    if (!__DEV__) {
      console.warn('[NetworkInterceptor] Not installing in production');
      return;
    }

    if (this.installed) {
      return;
    }

    this.originalFetch = global.fetch;
    global.fetch = this.interceptedFetch.bind(this);
    this.installed = true;
  }

  /**
   * Uninstall the network interceptor
   */
  uninstall(): void {
    if (this.originalFetch) {
      global.fetch = this.originalFetch;
      this.originalFetch = null;
      this.installed = false;
    }
  }

  /**
   * Get all captured requests
   */
  getRequests(): NetworkRequest[] {
    return [...this.requests];
  }

  /**
   * Clear all captured requests
   */
  clearRequests(): void {
    this.requests = [];
    this.notifyListeners();
  }

  /**
   * Add a listener for request updates
   */
  addListener(listener: (requests: NetworkRequest[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.getRequests()));
  }

  private async interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    if (!this.originalFetch) {
      throw new Error('NetworkInterceptor not properly installed');
    }

    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const startTime = Date.now();

    const request: NetworkRequest = {
      id: `${startTime}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      method,
      headers: this.extractHeaders(init?.headers),
      body: this.truncateBody(init?.body),
      timestamp: startTime,
    };

    // Add request immediately
    this.addRequest(request);

    try {
      const response = await this.originalFetch(input, init);
      const duration = Date.now() - startTime;

      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      let responseBody: string | undefined;

      try {
        const text = await clonedResponse.text();
        responseBody = this.truncateBody(text);
      } catch {
        responseBody = '[Unable to read response body]';
      }

      // Update request with response
      request.response = {
        status: response.status,
        statusText: response.statusText,
        headers: this.extractResponseHeaders(response.headers),
        body: responseBody,
        duration,
      };

      this.notifyListeners();

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      request.error =
        error instanceof Error ? error.message : String(error);
      request.response = {
        status: 0,
        statusText: 'Network Error',
        headers: {},
        duration,
      };

      this.notifyListeners();

      throw error;
    }
  }

  private addRequest(request: NetworkRequest): void {
    this.requests.unshift(request);

    // Keep only the last MAX_REQUESTS
    if (this.requests.length > MAX_REQUESTS) {
      this.requests = this.requests.slice(0, MAX_REQUESTS);
    }

    this.notifyListeners();
  }

  private extractHeaders(
    headers?: HeadersInit
  ): Record<string, string> {
    const result: Record<string, string> = {};

    if (!headers) {
      return result;
    }

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        // Mask sensitive headers
        result[key] = this.maskSensitiveValue(key, value);
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        result[key] = this.maskSensitiveValue(key, value);
      });
    } else {
      Object.entries(headers).forEach(([key, value]) => {
        result[key] = this.maskSensitiveValue(key, value);
      });
    }

    return result;
  }

  private extractResponseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  private maskSensitiveValue(key: string, value: string): string {
    const sensitiveKeys = [
      'authorization',
      'x-api-key',
      'api-key',
      'x-auth-token',
    ];

    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      if (value.length > 8) {
        return `${value.slice(0, 4)}...${value.slice(-4)}`;
      }
      return '***';
    }

    return value;
  }

  private truncateBody(body?: BodyInit | null | string): string | undefined {
    if (!body) {
      return undefined;
    }

    let text: string;

    if (typeof body === 'string') {
      text = body;
    } else if (body instanceof FormData) {
      return '[FormData]';
    } else if (body instanceof Blob) {
      return '[Blob]';
    } else if (body instanceof ArrayBuffer) {
      return '[ArrayBuffer]';
    } else {
      try {
        text = JSON.stringify(body);
      } catch {
        return '[Unable to serialize body]';
      }
    }

    if (text.length > MAX_BODY_LENGTH) {
      return `${text.slice(0, MAX_BODY_LENGTH)}... [truncated]`;
    }

    return text;
  }
}

export const NetworkInterceptor = new NetworkInterceptorClass();
