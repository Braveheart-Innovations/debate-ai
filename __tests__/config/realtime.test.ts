const ORIGINAL_ENV = { ...process.env };

const loadRealtimeModule = () => {
  let realtimeModule: typeof import('@/config/realtime') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    realtimeModule = require('@/config/realtime');
  });
  return realtimeModule as typeof import('@/config/realtime');
};

const loadGeminiModule = () => {
  let geminiModule: typeof import('@/config/geminiRealtime') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    geminiModule = require('@/config/geminiRealtime');
  });
  return geminiModule as typeof import('@/config/geminiRealtime');
};

const resetRealtimeEnv = () => {
  delete process.env.OPENAI_REALTIME_RELAY_URL;
  delete process.env.EXPO_PUBLIC_OPENAI_REALTIME_RELAY_URL;
  delete process.env.OPENAI_REALTIME_MODEL;
  delete process.env.EXPO_PUBLIC_OPENAI_REALTIME_MODEL;
  delete process.env.EXPO_PUBLIC_GEMINI_LIVE_WS;
  delete process.env.GEMINI_LIVE_WS;
};

describe('Realtime configuration helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    resetRealtimeEnv();
  });

  afterEach(() => {
    resetRealtimeEnv();
  });

  afterAll(() => {
    jest.resetModules();
    resetRealtimeEnv();
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('prefers explicit realtime relay URL and trims whitespace', () => {
    process.env.OPENAI_REALTIME_RELAY_URL = ' wss://relay.example.com ';
    const { getRealtimeRelayUrl } = loadRealtimeModule();
    expect(getRealtimeRelayUrl()).toBe('wss://relay.example.com');
  });

  it('falls back to Expo realtime relay URL when explicit env missing', () => {
    process.env.EXPO_PUBLIC_OPENAI_REALTIME_RELAY_URL = 'wss://expo-relay.example.com';
    const { getRealtimeRelayUrl } = loadRealtimeModule();
    expect(getRealtimeRelayUrl()).toBe('wss://expo-relay.example.com');
  });

  it('returns undefined when no realtime relay URL configured', () => {
    const { getRealtimeRelayUrl } = loadRealtimeModule();
    expect(getRealtimeRelayUrl()).toBeUndefined();

    process.env.OPENAI_REALTIME_RELAY_URL = '   ';
    const { getRealtimeRelayUrl: getUrlWithWhitespace } = loadRealtimeModule();
    expect(getUrlWithWhitespace()).toBeUndefined();
  });

  it('selects realtime model using override precedence', () => {
    process.env.OPENAI_REALTIME_MODEL = 'override-model';
    process.env.EXPO_PUBLIC_OPENAI_REALTIME_MODEL = 'expo-model';
    const { getRealtimeModel } = loadRealtimeModule();
    expect(getRealtimeModel()).toBe('override-model');

    delete process.env.OPENAI_REALTIME_MODEL;
    const { getRealtimeModel: getModelAfterDeletion } = loadRealtimeModule();
    expect(getModelAfterDeletion()).toBe('expo-model');
  });

  it('provides default realtime model when no overrides set', () => {
    const { getRealtimeModel } = loadRealtimeModule();
    expect(getRealtimeModel()).toBe('gpt-4o-realtime-preview-2024-10-01');
  });

  it('reports realtime configuration availability correctly', () => {
    const { isRealtimeConfigured } = loadRealtimeModule();
    expect(isRealtimeConfigured()).toBe(false);

    process.env.OPENAI_REALTIME_RELAY_URL = 'wss://relay.enabled';
    const { isRealtimeConfigured: configuredWithRelay } = loadRealtimeModule();
    expect(configuredWithRelay()).toBe(true);
  });

  it('chooses Gemini Live endpoint from env when provided', () => {
    process.env.EXPO_PUBLIC_GEMINI_LIVE_WS = '  wss://gemini.example.com/feed ';
    const { getGeminiLiveWsEndpoint } = loadGeminiModule();
    expect(getGeminiLiveWsEndpoint()).toBe('wss://gemini.example.com/feed');
  });

  it('falls back to documented Gemini Live endpoint by default', () => {
    const { getGeminiLiveWsEndpoint } = loadGeminiModule();
    expect(getGeminiLiveWsEndpoint()).toBe(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
    );
  });
});
