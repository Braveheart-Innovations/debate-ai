import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { encryptionKey, getDecryptedApiKey } from './apiKeys';

/**
 * testApiKey
 *
 * Validates a provider API key by making a minimal, authenticated probe to the
 * provider — WITHOUT ever returning or logging the key. Tests either a key
 * passed by the client (before saving) or, when `apiKey` is omitted, the user's
 * stored encrypted key.
 *
 * Strategy: prefer each provider's model-list GET endpoint (no model-id
 * coupling, no token cost). Interpretation is uniform: 401/403 => invalid key,
 * 2xx/429 => valid. Perplexity has no models endpoint, so it uses a tiny
 * completion and additionally treats 400 (bad request, auth passed) as valid.
 */

interface ProbeResult {
  ok: boolean;
  message?: string;
  detail?: string;
}

interface ProviderProbe {
  request: (key: string) => { url: string; init: RequestInit };
  /** Completion-style probes can return 400 with a valid key (e.g. model drift). */
  treat400AsValid?: boolean;
}

const ANTHROPIC_VERSION = '2023-06-01';

const PROBES: Record<string, ProviderProbe> = {
  claude: {
    request: (key) => ({
      url: 'https://api.anthropic.com/v1/models',
      init: { method: 'GET', headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION } },
    }),
  },
  openai: {
    request: (key) => ({
      url: 'https://api.openai.com/v1/models',
      init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    }),
  },
  google: {
    request: (key) => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      init: { method: 'GET', headers: { 'x-goog-api-key': key } },
    }),
  },
  mistral: {
    request: (key) => ({
      url: 'https://api.mistral.ai/v1/models',
      init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    }),
  },
  deepseek: {
    request: (key) => ({
      url: 'https://api.deepseek.com/models',
      init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    }),
  },
  grok: {
    request: (key) => ({
      url: 'https://api.x.ai/v1/models',
      init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    }),
  },
  cohere: {
    request: (key) => ({
      url: 'https://api.cohere.ai/v1/models',
      init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    }),
  },
  perplexity: {
    request: (key) => ({
      url: 'https://api.perplexity.ai/chat/completions',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      },
    }),
    treat400AsValid: true,
  },
  moonshot: {
    request: (key) => ({
      url: 'https://api.moonshot.ai/v1/models',
      init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    }),
  },
  zai: {
    // Z.ai's OpenAI-compatible surface has no reliable models-list endpoint;
    // probe with a 1-token completion like Perplexity.
    request: (key) => ({
      url: 'https://api.z.ai/api/paas/v4/chat/completions',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-5.2',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      },
    }),
    treat400AsValid: true,
  },
  brave: {
    request: (key) => ({
      url: 'https://api.search.brave.com/res/v1/web/search?q=ping&count=1',
      init: { method: 'GET', headers: { 'X-Subscription-Token': key, Accept: 'application/json' } },
    }),
  },
  elevenlabs: {
    request: (key) => ({
      url: 'https://api.elevenlabs.io/v1/user',
      init: { method: 'GET', headers: { 'xi-api-key': key } },
    }),
  },
};

const PROBE_TIMEOUT_MS = 10000;

async function probeProvider(providerId: string, key: string): Promise<ProbeResult> {
  const probe = PROBES[providerId];
  if (!probe) {
    return { ok: false, message: 'Connection testing is not available for this provider.' };
  }

  const { url, init } = probe.request(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'The provider did not respond in time. Please try again.'
      : 'Could not reach the provider. Check your connection and try again.';
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }

  const status = response.status;

  if (status === 401 || status === 403) {
    return { ok: false, message: 'Invalid API key.', detail: await snippet(response) };
  }
  if ((status >= 200 && status < 300) || status === 429) {
    return { ok: true, message: status === 429 ? 'Key verified (rate limited).' : 'Key verified.' };
  }
  if (status === 400 && probe.treat400AsValid) {
    return { ok: true, message: 'Key verified.' };
  }

  return {
    ok: false,
    message: `Unexpected response from provider (HTTP ${status}).`,
    detail: await snippet(response),
  };
}

/** Short, key-free excerpt of a provider error body for diagnostics. */
async function snippet(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    return text.replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    return undefined;
  }
}

export const testApiKey = onCall(
  { secrets: [encryptionKey] },
  async (request): Promise<ProbeResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to test API keys');
    }

    const { providerId, apiKey } = request.data ?? {};

    if (!providerId || typeof providerId !== 'string') {
      throw new HttpsError('invalid-argument', 'Provider ID is required');
    }
    if (!PROBES[providerId]) {
      return { ok: false, message: 'Connection testing is not available for this provider.' };
    }

    // Determine which key to test: the supplied one, or the stored encrypted key.
    let keyToTest: string;
    if (apiKey !== undefined && apiKey !== null && apiKey !== '') {
      if (typeof apiKey !== 'string') {
        throw new HttpsError('invalid-argument', 'API key must be a string');
      }
      keyToTest = apiKey.trim();
      if (keyToTest.length < 10 || keyToTest.length > 500) {
        throw new HttpsError('invalid-argument', 'API key has invalid length');
      }
    } else {
      const keyValue = encryptionKey.value();
      if (!keyValue) {
        throw new HttpsError('internal', 'Encryption not configured');
      }
      const stored = await getDecryptedApiKey(request.auth.uid, providerId, keyValue);
      if (!stored) {
        return { ok: false, message: 'No API key is saved for this provider yet.' };
      }
      keyToTest = stored;
    }

    return probeProvider(providerId, keyToTest);
  }
);
