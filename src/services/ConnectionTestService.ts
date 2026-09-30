/**
 * ConnectionTestService - Real API connection testing
 * Tests actual API endpoints to verify keys are valid and working
 */

import { getDefaultModel } from '../config/providers/modelRegistry';
import {
  ELEVENLABS_DEFAULT_OUTPUT_FORMAT,
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_DEFAULT_VOICE_ID,
} from '@/config/mediaProviders';

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';
const RUNWAY_API_KEY_PATTERN = /^key_[0-9a-f]{128}$/;
const PERPLEXITY_CONNECTION_TEST_MAX_TOKENS = 16;

function normalizeProviderApiKey(providerId: string, apiKey: string): string {
  const normalized = apiKey.trim();
  if (providerId === 'runway' && normalized.startsWith('Key_')) {
    return `key_${normalized.slice(4)}`;
  }
  return normalized;
}

export interface TestResult {
  success: boolean;
  message: string;
  model?: string;
  responseTime?: number;
  error?: TestError;
}

export interface TestError {
  code: string;
  message: string;
  statusCode?: number;
}

export interface TestOptions {
  timeout?: number;
  retries?: number;
}

export class ConnectionTestService {
  private static instance: ConnectionTestService;
  private readonly DEFAULT_TIMEOUT = 15000; // 15 seconds
  private readonly DEFAULT_RETRIES = 1;

  static getInstance(): ConnectionTestService {
    if (!ConnectionTestService.instance) {
      ConnectionTestService.instance = new ConnectionTestService();
    }
    return ConnectionTestService.instance;
  }

  /**
   * Test API connection for a specific provider
   * Makes real API calls to verify the key works
   */
  async testProvider(
    providerId: string,
    apiKey: string,
    options: TestOptions = {}
  ): Promise<TestResult> {
    console.warn(`[ConnectionTestService] testProvider called for ${providerId} - REAL MODE (no mock)`);

    const {
      timeout = this.DEFAULT_TIMEOUT,
      retries = this.DEFAULT_RETRIES
    } = options;

    const normalizedApiKey = normalizeProviderApiKey(providerId, apiKey);

    if (!normalizedApiKey) {
      return this.createErrorResult('INVALID_KEY', 'No API key provided');
    }

    // Basic format validation
    const validationResult = this.validateApiKey(providerId, normalizedApiKey);
    if (!validationResult.success) {
      return validationResult;
    }

    let lastError: TestError | undefined;

    // Retry logic
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.realTest(providerId, normalizedApiKey, timeout);
      } catch (error) {
        lastError = this.parseError(error);

        // Don't retry on auth errors
        if (this.shouldNotRetry(lastError)) {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return this.createErrorResult(
      lastError?.code || 'CONNECTION_FAILED',
      lastError?.message || 'Connection failed after retries'
    );
  }

  /**
   * Real API test - makes actual HTTP requests to provider endpoints
   */
  private async realTest(
    providerId: string,
    apiKey: string,
    timeout: number
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const result = await this.performProviderSpecificTest(providerId, apiKey, controller.signal);
        const responseTime = Date.now() - startTime;

        console.warn(`[ConnectionTestService] ${providerId} test SUCCESS, model:`, result.model);

        return {
          success: true,
          message: result.message || 'Connection verified',
          model: result.model,
          responseTime
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const testError = this.parseError(error);

      console.warn(`[ConnectionTestService] ${providerId} test FAILED:`, testError.message);

      return {
        success: false,
        message: testError.message,
        responseTime,
        error: testError
      };
    }
  }

  /**
   * Perform provider-specific API tests
   */
  private async performProviderSpecificTest(
    providerId: string,
    apiKey: string,
    signal: AbortSignal
  ): Promise<{ model: string; message?: string }> {
    switch (providerId) {
      case 'openai':
        return await this.testOpenAI(apiKey, signal);

      case 'claude':
        return await this.testClaude(apiKey, signal);

      case 'google':
        return await this.testGoogle(apiKey, signal);

      case 'grok':
        return await this.testGrok(apiKey, signal);

      case 'perplexity':
        return await this.testPerplexity(apiKey, signal);

      case 'mistral':
        return await this.testMistral(apiKey, signal);

      case 'cohere':
        return await this.testCohere(apiKey, signal);

      case 'deepseek':
        return await this.testDeepSeek(apiKey, signal);

      case 'moonshot':
        return await this.testMoonshot(apiKey, signal);

      case 'zai':
        return await this.testZai(apiKey, signal);

      case 'runway':
        return await this.testRunway(apiKey, signal);

      case 'elevenlabs':
        return await this.testElevenLabs(apiKey, signal);

      default:
        // For unknown providers, try a generic OpenAI-compatible test
        return await this.testGenericOpenAICompatible(providerId, apiKey, signal);
    }
  }

  /**
   * Test OpenAI API - uses /v1/models endpoint
   */
  private async testOpenAI(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw await this.createApiError(response, 'OpenAI');
    }

    const data = await response.json();
    // Prefer current documented production models when present.
    const models = data.data || [];
    const preferredIds = ['gpt-5.5', 'gpt-5.4', 'gpt-5.2', 'gpt-5', 'gpt-4.1', 'gpt-4o'];
    const preferredModel = preferredIds
      .map((id) => models.find((m: { id: string }) => m.id === id))
      .find(Boolean)
      || models[0];

    return { model: preferredModel?.id || getDefaultModel('openai') };
  }

  /**
   * Test Claude API - uses /v1/messages with minimal request
   * Uses the lowest-cost currently verified Claude model for a cheap real request.
   */
  private async testClaude(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    console.warn('[ConnectionTestService] Testing Claude API...');
    const model = 'claude-haiku-4-5-20251001'; // Use cheapest model for test

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      }),
      signal,
    });

    console.warn('[ConnectionTestService] Claude response status:', response.status);

    if (!response.ok) {
      throw await this.createApiError(response, 'Claude');
    }

    const data = await response.json();
    return { model: data.model || model };
  }

  /**
   * Test Google Gemini API - uses /v1/models endpoint
   */
  private async testGoogle(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1/models',
      { signal, headers: { 'x-goog-api-key': apiKey } }
    );

    if (!response.ok) {
      throw await this.createApiError(response, 'Google');
    }

    const data = await response.json();
    const models = data.models || [];
    const preferredGeminiIds = [
      'models/gemini-3.8-flash',
      'models/gemini-3.7-flash',
      'models/gemini-3.6-flash',
      'models/gemini-3.5-flash',
      'models/gemini-3.5-flash-lite',
      'models/gemini-3.1-flash-lite',
      'models/gemini-3.1-pro-preview',
      'models/gemini-2.5-flash',
      'models/gemini-2.5-pro',
      'models/gemini-2.0-flash',
    ];
    const geminiModel = preferredGeminiIds
      .map((name) => models.find((m: { name: string }) => m.name === name))
      .find(Boolean)
      || models.find((m: { name: string }) => m.name.includes('gemini'));
    const modelName = geminiModel?.name?.replace('models/', '') || getDefaultModel('google');

    return { model: modelName };
  }

  /**
   * Test Grok (xAI) API - uses /v1/models endpoint (OpenAI-compatible)
   */
  private async testGrok(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    console.warn('[ConnectionTestService] Testing Grok API with real request...');

    const response = await fetch('https://api.x.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    console.warn('[ConnectionTestService] Grok API response status:', response.status);

    if (!response.ok) {
      throw await this.createApiError(response, 'Grok');
    }

    const data = await response.json();
    const models = data.data || [];
    // Find a grok model to report
    const grokModel = models.find((m: { id: string }) => m.id === 'grok-4.3')
      || models.find((m: { id: string }) => m.id === 'grok-4.20-0309-non-reasoning')
      || models.find((m: { id: string }) => m.id === 'grok-4.20-0309-reasoning')
      || models.find((m: { id: string }) => m.id === 'grok-4-1-fast-non-reasoning')
      || models.find((m: { id: string }) => m.id === 'grok-4-1-fast-reasoning')
      || models.find((m: { id: string }) => m.id.includes('grok-4'))
      || models.find((m: { id: string }) => m.id.includes('grok'))
      || models[0];

    return { model: grokModel?.id || getDefaultModel('grok') };
  }

  /**
   * Test Perplexity API - uses /chat/completions with minimal request
   * sonar-reasoning is deprecated, so tests use sonar-pro.
   */
  private async testPerplexity(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    console.warn('[ConnectionTestService] Testing Perplexity API...');
    const model = 'sonar-pro'; // Default model per modelRegistry

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: PERPLEXITY_CONNECTION_TEST_MAX_TOKENS,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        signal,
      });

      console.warn('[ConnectionTestService] Perplexity response status:', response.status);

      if (!response.ok) {
        throw await this.createApiError(response, 'Perplexity');
      }

      const data = await response.json();
      return { model: data.model || model };
    } catch (error) {
      console.warn('[ConnectionTestService] Perplexity error:', error);
      throw error;
    }
  }

  /**
   * Test Mistral API - uses /v1/models endpoint
   */
  private async testMistral(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw await this.createApiError(response, 'Mistral');
    }

    const data = await response.json();
    const models = data.data || [];
    const mistralModel = models.find((m: { id: string }) => m.id.includes('mistral'))
      || models[0];

    return { model: mistralModel?.id || getDefaultModel('mistral') };
  }

  /**
   * Test Cohere API - uses /v1/models endpoint
   */
  private async testCohere(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const response = await fetch('https://api.cohere.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw await this.createApiError(response, 'Cohere');
    }

    const data = await response.json();
    const models = data.models || [];
    const cohereModel = models.find((m: { name: string }) => m.name === 'command-a-plus-05-2026')
      || models.find((m: { name: string }) => m.name?.includes('command'))
      || models[0];

    return { model: cohereModel?.name || getDefaultModel('cohere') };
  }

  /**
   * Test DeepSeek API - uses /v1/models endpoint (OpenAI-compatible)
   */
  private async testDeepSeek(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const response = await fetch('https://api.deepseek.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw await this.createApiError(response, 'DeepSeek');
    }

    const data = await response.json();
    const models = data.data || [];
    const deepseekModel = models.find((m: { id: string }) => m.id.includes('deepseek'))
      || models[0];

    return { model: deepseekModel?.id || getDefaultModel('deepseek') };
  }

  private async testMoonshot(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const response = await fetch('https://api.moonshot.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw await this.createApiError(response, 'Kimi');
    }

    const data = await response.json();
    const models = data.data || [];
    const kimiModel = models.find((m: { id: string }) => m.id.includes('kimi'))
      || models[0];

    return { model: kimiModel?.id || getDefaultModel('moonshot') };
  }

  /**
   * Z.ai's OpenAI-compatible surface has no reliable models-list endpoint;
   * probe with a 1-token completion. A 400 still proves the key is valid
   * (401/403 mean it is not), matching the server-side testApiKey probe.
   */
  private async testZai(apiKey: string, signal: AbortSignal): Promise<{ model: string }> {
    const model = getDefaultModel('zai');
    const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal,
    });

    if (!response.ok && response.status !== 400) {
      throw await this.createApiError(response, 'GLM');
    }

    return { model };
  }

  /**
   * Test ElevenLabs API with both voice-list access and a tiny TTS request.
   */
  private async testElevenLabs(apiKey: string, signal: AbortSignal): Promise<{ model: string; message: string }> {
    const voiceResponse = await fetch('https://api.elevenlabs.io/v2/voices?page_size=1', {
      headers: {
        'xi-api-key': apiKey,
      },
      signal,
    });

    if (!voiceResponse.ok) {
      throw await this.createApiError(voiceResponse, 'ElevenLabs');
    }

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_DEFAULT_VOICE_ID)}?output_format=${encodeURIComponent(ELEVENLABS_DEFAULT_OUTPUT_FORMAT)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: 'Hi.',
          model_id: ELEVENLABS_DEFAULT_TTS_MODEL,
        }),
        signal,
      }
    );

    if (!ttsResponse.ok) {
      throw await this.createApiError(ttsResponse, 'ElevenLabs');
    }

    return {
      model: 'ElevenLabs text-to-speech',
      message: 'Voice list and text-to-speech verified',
    };
  }

  /**
   * Test Runway API with a non-generation organization metadata request.
   */
  private async testRunway(apiKey: string, signal: AbortSignal): Promise<{ model: string; message?: string }> {
    const response = await fetch(`${RUNWAY_API_BASE}/organization`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
      signal,
    });

    if (!response.ok) {
      throw await this.createApiError(response, 'Runway');
    }

    let organizationName: string | undefined;
    try {
      const data = await response.json() as { name?: unknown; organizationName?: unknown };
      organizationName = typeof data.name === 'string'
        ? data.name
        : typeof data.organizationName === 'string'
          ? data.organizationName
          : undefined;
    } catch {
      // A 2xx response is enough to prove the key was accepted.
    }

    return {
      model: 'Runway organization',
      message: organizationName ? `Connected to ${organizationName}` : 'Runway API key verified',
    };
  }

  /**
   * Generic test for OpenAI-compatible APIs
   */
  private async testGenericOpenAICompatible(
    providerId: string,
    apiKey: string,
    signal: AbortSignal
  ): Promise<{ model: string }> {
    // Try common endpoints - this is a fallback for unknown providers
    const endpoints = [
      `https://api.${providerId}.com/v1/models`,
      `https://api.${providerId}.ai/v1/models`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal,
        });

        if (response.ok) {
          const data = await response.json();
          const models = data.data || [];
          return { model: models[0]?.id || getDefaultModel(providerId) };
        }
      } catch {
        // Try next endpoint
        continue;
      }
    }

    throw new Error(`Provider ${providerId} testing not implemented`);
  }

  /**
   * Create an error from an API response
   */
  private async createApiError(response: Response, provider: string): Promise<Error> {
    let errorMessage = `${provider} API error (${response.status})`;

    try {
      const errorData = await response.json();
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      } else if (errorData.detail && typeof errorData.detail === 'object') {
        const detail = errorData.detail as Record<string, unknown>;
        const detailMessage = typeof detail.message === 'string' ? detail.message : undefined;
        const detailStatus = typeof detail.status === 'string' ? detail.status : undefined;
        errorMessage = detailMessage || detailStatus || errorMessage;
      } else if (typeof errorData.detail === 'string') {
        errorMessage = errorData.detail;
      }
    } catch {
      // If we can't parse JSON, try text
      try {
        const text = await response.text();
        if (text) errorMessage = text.slice(0, 200);
      } catch {
        // Use default message
      }
    }

    const error = new Error(errorMessage);
    (error as Error & { statusCode: number }).statusCode = response.status;
    return error;
  }

  /**
   * Validate API key format before making requests
   */
  private validateApiKey(providerId: string, apiKey: string): TestResult {
    if (!apiKey || apiKey.trim().length === 0) {
      return this.createErrorResult('EMPTY_KEY', 'API key is empty');
    }

    if (apiKey.length < 10) {
      return this.createErrorResult('INVALID_KEY', 'API key too short');
    }

    // Provider-specific format validation
    switch (providerId) {
      case 'openai':
        if (!apiKey.startsWith('sk-')) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'OpenAI API keys should start with "sk-"'
          );
        }
        break;

      case 'claude':
        if (!apiKey.startsWith('sk-ant-')) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'Claude API keys should start with "sk-ant-"'
          );
        }
        break;

      case 'grok':
        if (!apiKey.startsWith('xai-')) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'Grok API keys should start with "xai-"'
          );
        }
        break;

      case 'moonshot':
        if (!apiKey.startsWith('sk-')) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'Kimi (Moonshot) API keys should start with "sk-"'
          );
        }
        break;

      case 'zai':
        if (!/^[A-Za-z0-9]{16,}\.[A-Za-z0-9]{8,}$/.test(apiKey)) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'Z.ai keys are two dot-separated token segments from the API keys page'
          );
        }
        break;

      case 'runway':
        if (!RUNWAY_API_KEY_PATTERN.test(apiKey)) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'Runway API keys should start with "key_" or "Key_" followed by 128 lowercase hex characters'
          );
        }
        break;

      case 'elevenlabs':
        if (!/^[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
          return this.createErrorResult(
            'INVALID_FORMAT',
            'ElevenLabs API keys should be long token strings'
          );
        }
        break;
    }

    return { success: true, message: 'Key format valid' };
  }

  /**
   * Create error result object
   */
  private createErrorResult(code: string, message: string): TestResult {
    return {
      success: false,
      message,
      error: { code, message }
    };
  }

  /**
   * Parse error from caught exception
   */
  private parseError(error: unknown): TestError {
    if (error instanceof Error) {
      const statusCode = (error as Error & { statusCode?: number }).statusCode;

      if (error.name === 'AbortError' || error.message.includes('abort')) {
        return { code: 'TIMEOUT', message: 'Request timed out', statusCode };
      }

      if (error.message.includes('network') || error.message.includes('fetch')) {
        return { code: 'NETWORK_ERROR', message: 'Network connection failed', statusCode };
      }

      // Check for auth errors
      if (statusCode === 401 || statusCode === 403) {
        if (statusCode === 403 && /permission|scope|text_to_speech|synthesi[sz]e|speech/i.test(error.message)) {
          return {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: error.message || 'API key does not have permission for this request',
            statusCode
          };
        }
        if (statusCode === 403) {
          return {
            code: 'ACCESS_DENIED',
            message: error.message || 'API key is not allowed to access this request',
            statusCode
          };
        }

        return {
          code: 'UNAUTHORIZED',
          message: error.message || 'Invalid or expired API key',
          statusCode
        };
      }

      if (statusCode === 429) {
        return {
          code: 'RATE_LIMITED',
          message: 'Rate limited - please try again later',
          statusCode
        };
      }

      return { code: 'API_ERROR', message: error.message, statusCode };
    }

    return { code: 'UNKNOWN_ERROR', message: 'An unknown error occurred' };
  }

  /**
   * Check if error should not be retried
   */
  private shouldNotRetry(error: TestError): boolean {
    const noRetryErrors = ['INVALID_KEY', 'INVALID_FORMAT', 'UNAUTHORIZED', 'EMPTY_KEY'];
    const noRetryCodes = [401, 403, 404];
    return noRetryErrors.includes(error.code) ||
           (error.statusCode !== undefined && noRetryCodes.includes(error.statusCode));
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test multiple providers concurrently
   */
  async testMultipleProviders(
    tests: Array<{ providerId: string; apiKey: string }>,
    options: TestOptions = {}
  ): Promise<Record<string, TestResult>> {
    const results: Record<string, TestResult> = {};

    const promises = tests.map(async ({ providerId, apiKey }) => {
      const result = await this.testProvider(providerId, apiKey, options);
      results[providerId] = result;
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get test recommendations based on error
   */
  getTestRecommendation(result: TestResult): string {
    if (result.success) {
      return 'Connection successful! Your API key is working correctly.';
    }

    switch (result.error?.code) {
      case 'INVALID_KEY':
      case 'EMPTY_KEY':
        return 'Please enter a valid API key.';

      case 'INVALID_FORMAT':
        return result.message || 'API key format is incorrect.';

      case 'UNAUTHORIZED':
        return 'API key is invalid or expired. Please check your provider dashboard.';

      case 'INSUFFICIENT_PERMISSIONS':
        return 'API key is valid but missing required permissions. Enable the provider feature in your key settings.';

      case 'ACCESS_DENIED':
        return result.message || 'API key is not allowed to access this request.';

      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment and try again.';

      case 'TIMEOUT':
        return 'Request timed out. Please check your internet connection.';

      case 'NETWORK_ERROR':
        return 'Network connection failed. Please check your internet.';

      default:
        return result.message || 'Connection failed. Please verify your API key.';
    }
  }

  /**
   * Check if provider supports testing - now all providers are supported
   */
  isProviderSupported(providerId: string): boolean {
    const supportedProviders = [
      'openai', 'claude', 'google', 'grok',
      'perplexity', 'mistral', 'cohere', 'deepseek',
      'moonshot', 'zai', 'runway', 'elevenlabs'
    ];
    return supportedProviders.includes(providerId);
  }
}

export default ConnectionTestService.getInstance();
