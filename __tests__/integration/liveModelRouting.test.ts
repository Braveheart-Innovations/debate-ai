import fs from 'fs';
import path from 'path';

import {
  getModelById,
  getProviderDefaultModel,
  getProviderModels,
} from '@/config/modelConfigs';
import { AIService } from '@/services/aiAdapter';
import { isDemoModeEnabled } from '@/services/demo/demoMode';
import type { AIProvider, ModelParameters } from '@/types';

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn(),
}));

type LiveModelScope = 'default' | 'curated' | 'all';

type LiveCase = {
  provider: AIProvider;
  model: string;
  apiKey: string;
  keyEnv: string;
};

type LiveRuntime = {
  cases: LiveCase[];
  scope: LiveModelScope;
  timeoutMs: number;
};

type LiveSuccess = {
  provider: AIProvider;
  model: string;
  modelUsed: string;
  durationMs: number;
  keyEnv: string;
};

// Every provider with a live adapter. `chatgpt` is a legacy alias of `openai` in
// AIProvider and has no key of its own, so it is not a live smoke target.
const ALL_PROVIDERS = [
  'claude',
  'openai',
  'google',
  'perplexity',
  'mistral',
  'cohere',
  'deepseek',
  'grok',
  'moonshot',
  'zai',
] as const satisfies readonly AIProvider[];

type LiveProvider = (typeof ALL_PROVIDERS)[number];

const isLiveProvider = (provider: string): provider is LiveProvider =>
  ALL_PROVIDERS.some((candidate) => candidate === provider);

const PROVIDER_KEY_ENV_VARS: Record<LiveProvider, string[]> = {
  claude: ['CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  cohere: ['COHERE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  grok: ['GROK_API_KEY', 'XAI_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  zai: ['ZAI_API_KEY'],
};

const LIVE_PROMPT = 'Reply with OK and nothing else.';
const DEFAULT_TIMEOUT_MS = 180000;
// Models that research for minutes before answering get their own per-test
// timeout instead of stretching every case. Sonar Deep Research took 115-180s
// per call when live-verified on 2026-09-30.
const LONG_RUNNING_MODELS = new Set(['sonar-deep-research']);
const LONG_RUNNING_TIMEOUT_MS = 600000;

const demoModeMock = jest.mocked(isDemoModeEnabled);
// jest-expo 57's setup installs expo/src/winter, which replaces globalThis.fetch
// with expo/fetch over a stubbed native module — unusable for real network
// calls. Requiring undici inside the jest sandbox does not help either: it
// binds to sandbox timer/microtask globals and stalls on multi-chunk response
// bodies. Load undici in the HOST realm via createRequire so live smokes run
// on real Node networking.
const hostRequire = process
  .getBuiltinModule('node:module')
  .createRequire(process.cwd() + '/package.json');
const nativeFetch = (hostRequire('undici') as { fetch: typeof fetch }).fetch;
const liveEnabled = process.env.LIVE_MODEL_TEST === '1';

const trimQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const loadEnvFile = (fileName: string): void => {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (!process.env[key]) {
      process.env[key] = trimQuotes(rawValue);
    }
  }
};

const loadLiveEnv = (): void => {
  loadEnvFile('.env.local');
  loadEnvFile('.env');
};

const parseScope = (): LiveModelScope => {
  const rawScope = process.env.LIVE_MODEL_SCOPE?.trim().toLowerCase() || 'default';
  if (rawScope === 'default' || rawScope === 'curated' || rawScope === 'all') {
    return rawScope;
  }
  throw new Error(
    `Unsupported LIVE_MODEL_SCOPE "${rawScope}". Use one of: default, curated, all.`
  );
};

const parseProviders = (): LiveProvider[] => {
  const rawProviders: string | undefined = process.env.LIVE_MODEL_PROVIDERS?.trim();
  if (!rawProviders) {
    return [...ALL_PROVIDERS];
  }

  const requested = rawProviders
    .split(',')
    .map((provider) => provider.trim())
    .filter(Boolean);

  const invalid = requested.filter((provider) => !isLiveProvider(provider));
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported LIVE_MODEL_PROVIDERS value(s): ${invalid.join(', ')}.`
    );
  }

  return requested.filter(isLiveProvider);
};

const resolveTimeoutMs = (caseCount: number): number => {
  const rawTimeout = Number(process.env.LIVE_MODEL_TIMEOUT_MS);
  if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
    return rawTimeout;
  }
  return Math.max(DEFAULT_TIMEOUT_MS, caseCount * 30000);
};

const buildLiveParameters = (
  provider: AIProvider,
  model: string
): ModelParameters => {
  const modelConfig = getModelById(provider, model);
  let maxTokens = 16;

  if (provider === 'openai' && modelConfig?.useMaxCompletionTokens) {
    maxTokens = model === 'gpt-5-mini' ? 512 : 128;
  } else if (provider === 'google' && modelConfig?.supportsThinking) {
    maxTokens = model === 'gemini-2.5-pro' ? 1024 : 256;
  } else if (provider === 'perplexity' && modelConfig?.supportsThinking) {
    maxTokens = 512;
  } else if (provider === 'cohere' && modelConfig?.supportsThinking) {
    maxTokens = 512;
  } else if (provider === 'zai' && modelConfig?.supportsThinking) {
    // GLM reasoners can spend >128 tokens thinking before any visible text.
    maxTokens = 512;
  } else if (provider === 'deepseek' && modelConfig?.supportsThinking) {
    // DeepSeek V4.1 Flash thinks by default before any visible text.
    maxTokens = 384;
  } else if (modelConfig?.supportsThinking) {
    maxTokens = 128;
  }

  return {
    temperature: 0,
    maxTokens,
  };
};

const selectModelsForProvider = (
  provider: AIProvider,
  scope: LiveModelScope
): string[] => {
  const visibleModels = getProviderModels(provider).map((model) => model.id);
  if (visibleModels.length === 0) {
    throw new Error(`No selectable models found for provider ${provider}.`);
  }

  const defaultModel = getProviderDefaultModel(provider)?.id;
  if (!defaultModel) {
    throw new Error(`No default model configured for provider ${provider}.`);
  }

  if (scope === 'all') {
    return visibleModels;
  }

  if (scope === 'curated') {
    const alternateModel = visibleModels.find((model) => model !== defaultModel);
    return alternateModel ? [defaultModel, alternateModel] : [defaultModel];
  }

  return [defaultModel];
};

const resolveApiKey = (
  provider: LiveProvider
): { apiKey: string; keyEnv: string } | null => {
  const candidateEnvVars = PROVIDER_KEY_ENV_VARS[provider];
  for (const keyEnv of candidateEnvVars) {
    const apiKey = process.env[keyEnv]?.trim();
    if (apiKey) {
      return { apiKey, keyEnv };
    }
  }
  return null;
};

const buildRuntime = (): LiveRuntime => {
  loadLiveEnv();

  const scope = parseScope();
  const providers = parseProviders();
  const requireAllKeys = process.env.LIVE_MODEL_REQUIRE_ALL_KEYS === '1';
  const missingProviders: AIProvider[] = [];
  const cases: LiveCase[] = [];

  for (const provider of providers) {
    const keyInfo = resolveApiKey(provider);
    if (!keyInfo) {
      missingProviders.push(provider);
      continue;
    }

    for (const model of selectModelsForProvider(provider, scope)) {
      cases.push({
        provider,
        model,
        apiKey: keyInfo.apiKey,
        keyEnv: keyInfo.keyEnv,
      });
    }
  }

  if (requireAllKeys && missingProviders.length > 0) {
    throw new Error(
      `Missing API keys for selected providers: ${missingProviders.join(', ')}.`
    );
  }

  if (cases.length === 0) {
    throw new Error(
      'No live model smoke cases resolved. Set LIVE_MODEL_TEST=1 and provide provider keys in env or .env.local.'
    );
  }

  return {
    cases,
    scope,
    timeoutMs: resolveTimeoutMs(cases.length),
  };
};

const formatError = (error: unknown): string => {
  const sanitize = (message: string): string =>
    message.replace(/Your api key:\s+\*+[A-Za-z0-9_-]+/gi, 'Your api key: [redacted]');

  if (error instanceof Error) {
    return sanitize(error.message);
  }
  if (typeof error === 'string') {
    return sanitize(error);
  }
  return sanitize(JSON.stringify(error));
};

let runtime: LiveRuntime | undefined;
let runtimeError: string | undefined;

if (liveEnabled) {
  try {
    runtime = buildRuntime();
  } catch (error) {
    runtimeError = formatError(error);
  }
}

const describeLive = liveEnabled ? describe : describe.skip;

describeLive('Live model routing smoke', () => {
  if (!liveEnabled) {
    it('requires LIVE_MODEL_TEST=1', () => {
      expect(process.env.LIVE_MODEL_TEST).not.toBe('1');
    });
    return;
  }

  jest.setTimeout(runtime?.timeoutMs || DEFAULT_TIMEOUT_MS);

  beforeAll(() => {
    demoModeMock.mockReturnValue(false);
    global.fetch = nativeFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
    demoModeMock.mockReturnValue(false);
    global.fetch = nativeFetch;
  });

  if (runtimeError) {
    it('has a valid live smoke configuration', () => {
      throw new Error(runtimeError);
    });
    return;
  }

  const successfulRuns: LiveSuccess[] = [];

  afterAll(() => {
    if (successfulRuns.length > 0) {
      // Live runs print per-model latency for human review.
      const report = successfulRuns
        .map(({ provider, model, modelUsed, durationMs, keyEnv }) => (
          `${provider}/${model} -> ${modelUsed}: ${durationMs}ms (${keyEnv})`
        ))
        .join('\n');
      process.stdout.write(`\nLive model smoke results:\n${report}\n`);
    }
  });

  const runLiveCase = async ({ provider, model, apiKey, keyEnv }: LiveCase) => {
    const service = new AIService({ [provider]: apiKey });
    const startedAt = Date.now();

    try {
      const result = await service.sendMessage(
        provider,
        LIVE_PROMPT,
        [],
        false,
        model,
        buildLiveParameters(provider, model)
      );
      const durationMs = Date.now() - startedAt;
      const responseText = result.response.trim();

      expect(responseText.length).toBeGreaterThan(0);
      expect(service.getAdapter(provider)?.config.model).toBe(model);

      successfulRuns.push({
        provider,
        model,
        modelUsed: result.modelUsed || model,
        durationMs,
        keyEnv,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      throw new Error(
        `Live smoke failed for ${provider}/${model} after ${durationMs}ms: ${formatError(error)}`
      );
    }
  };

  const cases = runtime?.cases || [];
  const standardCases = cases.filter((liveCase) => !LONG_RUNNING_MODELS.has(liveCase.model));
  const longRunningCases = cases.filter((liveCase) => LONG_RUNNING_MODELS.has(liveCase.model));

  if (standardCases.length > 0) {
    it.each(standardCases)('validates $provider / $model via live adapter request', runLiveCase);
  }
  if (longRunningCases.length > 0) {
    it.each(longRunningCases)(
      'validates $provider / $model via live adapter request',
      runLiveCase,
      LONG_RUNNING_TIMEOUT_MS
    );
  }
});
