import { DeepSeekAdapter } from '../deepseek/DeepSeekAdapter';
import { MoonshotAdapter } from '../moonshot/MoonshotAdapter';
import { ZaiAdapter } from '../zai/ZaiAdapter';
import { GrokAdapter } from '../grok/GrokAdapter';
import { MistralAdapter } from '../mistral/MistralAdapter';
import type { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import type { AIAdapterConfig, AdapterCapabilities } from '../../types/adapter.types';
import type { AIProvider, MessageAttachment } from '../../../../types';

type EventListener = (event: { data: string | null }) => void;

class TestEventSource {
  listeners: Record<string, EventListener[]> = {};
  close = jest.fn();

  constructor(public url: string, public options: unknown) {
    mockEventSourceInstances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  emit(type: string, data: string | null): void {
    for (const listener of this.listeners[type] || []) {
      listener({ data });
    }
  }
}

const mockEventSourceInstances: TestEventSource[] = [];
function mockEventSourceFactory(url: string, options: unknown): TestEventSource {
  return new TestEventSource(url, options);
}
jest.mock('react-native-sse', () => mockEventSourceFactory);

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const createFetchResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [
      {
        message: { content: 'adapter response' },
      },
    ],
    model: 'returned-model',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  }),
}) as unknown as Response;

type AdapterEntry = {
  name: string;
  provider: AIProvider;
  AdapterCtor: new (config: AIAdapterConfig) => OpenAICompatibleAdapter;
  baseUrl: string;
  defaultModel: string;
  capabilities: AdapterCapabilities;
};

const ADAPTER_MATRIX: AdapterEntry[] = [
  {
    name: 'DeepSeek',
    provider: 'deepseek',
    AdapterCtor: DeepSeekAdapter,
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    capabilities: {
      streaming: true,
      attachments: true,  // DeepSeek V4.1 Flash is natively multimodal
      supportsImages: true,
      supportsDocuments: false,
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 64000,
      contextWindow: 1048576,
    },
  },
  {
    name: 'Grok',
    provider: 'grok',
    AdapterCtor: GrokAdapter,
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.3',
    capabilities: {
      streaming: true,
      attachments: true,  // Supports vision
      supportsImages: true,
      supportsDocuments: false,  // PDFs require separate Files API
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 100000,
      contextWindow: 2000000,
    },
  },
  {
    name: 'Mistral',
    provider: 'mistral',
    AdapterCtor: MistralAdapter,
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-medium-2604',
    capabilities: {
      streaming: true,
      attachments: true,  // Supports images only
      supportsImages: true,
      supportsDocuments: false,  // PDFs require separate OCR API
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 32768,
      contextWindow: 262144,
    },
  },
  {
    name: 'Moonshot',
    provider: 'moonshot',
    AdapterCtor: MoonshotAdapter,
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3',
    capabilities: {
      streaming: true,
      attachments: true,  // Kimi K3 and K2.x are natively multimodal
      supportsImages: true,
      supportsDocuments: false,
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 16384,
      contextWindow: 1000000,
    },
  },
  {
    name: 'Zai',
    provider: 'zai',
    AdapterCtor: ZaiAdapter,
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-5.3',
    capabilities: {
      streaming: true,
      attachments: false,  // GLM-5.3 is text-only; only the Flash/FlashX variants take images
      supportsImages: false,
      supportsDocuments: false,
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 128000,
      contextWindow: 1000000,
    },
  },
];

const makeConfig = (provider: AIProvider, defaultModel: string, overrides: Partial<AIAdapterConfig> = {}): AIAdapterConfig => ({
  provider,
  apiKey: 'test-key',
  model: defaultModel,
  parameters: { temperature: 0.4, maxTokens: 2048 },
  ...overrides,
});

describe.each(ADAPTER_MATRIX)('$name adapter', ({
  AdapterCtor,
  baseUrl,
  defaultModel,
  provider,
  capabilities,
}) => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(createFetchResponse());
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('exposes provider capabilities', () => {
    const adapter = new AdapterCtor(makeConfig(provider, defaultModel));

    expect(adapter.getCapabilities()).toEqual(capabilities);
  });

  it('sends chat completion requests using provider configuration', async () => {
    const adapter = new AdapterCtor(makeConfig(provider, defaultModel));

    const result = await adapter.sendMessage('Draft a launch plan');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/chat/completions`);
    expect(requestInit?.method).toBe('POST');

    const headers = requestInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse((requestInit?.body as string) || '{}');
    expect(body.model).toBe(defaultModel);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful AI assistant.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Draft a launch plan' });

    expect(result).toEqual({
      response: 'adapter response',
      modelUsed: 'returned-model',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });
  });

  it('preserves explicit zero temperature values', async () => {
    const adapter = new AdapterCtor(
      makeConfig(provider, defaultModel, {
        parameters: { temperature: 0, maxTokens: 128 },
      })
    );

    await adapter.sendMessage('Be deterministic');

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit?.body as string) || '{}');

    // Moonshot rejects every temperature except 1 (requiresTemperature1 on
    // all Kimi models), so even an explicit 0 must be clamped to 1 there.
    expect(body.temperature).toBe(provider === 'moonshot' ? 1 : 0);
  });

  it('handles image attachments based on adapter capabilities', async () => {
    const adapter = new AdapterCtor(makeConfig(provider, defaultModel));

    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'file:///photo.png',
        base64: 'abc123',
        mimeType: 'image/png',
        fileName: 'photo.png',
      },
    ];

    await adapter.sendMessage('Describe the image', [], undefined, attachments);

    expect(fetchMock).toHaveBeenCalled();
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit?.body as string) || '{}');

    const userMessage = body.messages.find((msg: { role: string }) => msg.role === 'user');
    expect(userMessage).toBeDefined();

    if (capabilities.attachments && capabilities.supportsImages) {
      // Adapters that support images should embed them in the message
      expect(userMessage.content).toEqual([
        { type: 'text', text: 'Describe the image' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ]);
    } else {
      // Adapters without image support should pass through as plain text
      expect(userMessage.content).toBe('Describe the image');
    }
  });
});

describe('GrokAdapter web search (xAI Responses API)', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  const createResponsesPayload = (overrides: Record<string, unknown> = {}) => ({
    ok: true,
    json: async () => ({
      model: 'grok-4.5',
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Fresh answer',
              annotations: [
                { type: 'url_citation', url: 'https://example.com/x', title: 'Source X' },
              ],
            },
          ],
        },
      ],
      usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
      ...overrides,
    }),
  }) as unknown as Response;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(createResponsesPayload());
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const makeSearchConfig = (): AIAdapterConfig => ({
    provider: 'grok',
    apiKey: 'test-key',
    model: 'grok-4.5',
    parameters: { temperature: 0.4, maxTokens: 2048 },
    webSearchEnabled: true,
  });

  it('posts to /responses with the web_search tool and typed input', async () => {
    const adapter = new GrokAdapter(makeSearchConfig());

    const result = await adapter.sendMessage('What is happening today?');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.x.ai/v1/responses');
    const body = JSON.parse((requestInit?.body as string) || '{}');
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.stream).toBe(false);
    expect(typeof body.instructions).toBe('string');
    expect(body.input[body.input.length - 1]).toEqual({
      role: 'user',
      content: [{ type: 'input_text', text: 'What is happening today?' }],
    });
    expect(result).toEqual(expect.objectContaining({
      response: 'Fresh answer',
      metadata: {
        citations: [{ index: 1, url: 'https://example.com/x', title: 'Source X' }],
      },
    }));
  });

  it('falls back to top-level xAI citations when no url_citation annotations exist', async () => {
    fetchMock.mockResolvedValueOnce(createResponsesPayload({
      output: [
        { type: 'message', content: [{ type: 'output_text', text: 'Plain answer' }] },
      ],
      citations: ['https://example.com/one', 'https://example.com/two'],
    }));
    const adapter = new GrokAdapter(makeSearchConfig());

    const result = await adapter.sendMessage('Search this');

    expect(result).toEqual(expect.objectContaining({
      response: 'Plain answer',
      metadata: {
        citations: [
          { index: 1, url: 'https://example.com/one' },
          { index: 2, url: 'https://example.com/two' },
        ],
      },
    }));
  });

  it('rewrites Grok inline [[n]](url) markdown to sequential bare [n] refs with metadata', async () => {
    fetchMock.mockResolvedValueOnce(createResponsesPayload({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              // Grok inlines double-bracketed links with its own (gapped) numbering.
              text: 'Over 850 wildfires burning in Canada.[[1]](https://www.democracynow.org/2026/7/17/headlines)[[4]](https://www.cnn.com/2026/07/14/weather/canada)',
            },
          ],
        },
      ],
    }));
    const adapter = new GrokAdapter(makeSearchConfig());

    const result = await adapter.sendMessage('What is happening today?');

    // The adapter returns Grok's raw inline text plus the extracted citations
    // (renumbered, deduped by URL); the shared renderer rewrites the inline
    // links to numbered chips so every provider looks the same.
    expect(result).toEqual(expect.objectContaining({
      response: 'Over 850 wildfires burning in Canada.[[1]](https://www.democracynow.org/2026/7/17/headlines)[[4]](https://www.cnn.com/2026/07/14/weather/canada)',
      metadata: {
        citations: [
          { index: 1, url: 'https://www.democracynow.org/2026/7/17/headlines' },
          { index: 2, url: 'https://www.cnn.com/2026/07/14/weather/canada' },
        ],
      },
    }));
  });

  it('streams web search results live over the Responses SSE and emits citations', async () => {
    mockEventSourceInstances.splice(0, mockEventSourceInstances.length);
    const adapter = new GrokAdapter(makeSearchConfig());
    const onEvent = jest.fn();

    const iterator = adapter.streamMessage('Latest news', [], undefined, undefined, undefined, undefined, onEvent);
    const firstChunk = iterator.next();
    await flushMicrotasks();
    const es = mockEventSourceInstances[0];
    if (!es) throw new Error('EventSource not created');

    // Real SSE against /responses with the web_search tool, not chat/completions.
    expect(String(es.url)).toBe('https://api.x.ai/v1/responses');
    const body = JSON.parse((es.options as { body: string }).body);
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.stream).toBe(true);

    es.emit('response.output_text.delta', JSON.stringify({ delta: 'Wildfires ' }));
    await expect(firstChunk).resolves.toEqual({ value: 'Wildfires ', done: false });

    const secondChunk = iterator.next();
    es.emit('response.output_text.delta', JSON.stringify({ delta: 'burn.[[1]](https://example.com/x)' }));
    await expect(secondChunk).resolves.toEqual({ value: 'burn.[[1]](https://example.com/x)', done: false });

    const finalChunk = iterator.next();
    es.emit('response.completed', JSON.stringify({ response: { status: 'completed' } }));
    await expect(finalChunk).resolves.toEqual({ value: undefined, done: true });

    // Citations extracted from the accumulated inline links.
    expect(onEvent).toHaveBeenCalledWith({
      type: 'citations',
      citations: [{ index: 1, url: 'https://example.com/x' }],
    });
    expect(es.close).toHaveBeenCalled();
  });

  it('keeps the plain chat path on chat/completions when web search is disabled', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse());
    const adapter = new GrokAdapter({ ...makeSearchConfig(), webSearchEnabled: false });

    await adapter.sendMessage('Just chat');

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.x.ai/v1/chat/completions');
  });
});

describe('per-model image input for DeepSeek and Z.ai', () => {
  it.each([
    ['deepseek', DeepSeekAdapter, 'deepseek-flash', true],
    ['deepseek', DeepSeekAdapter, 'deepseek-v4-pro', false],
    ['zai', ZaiAdapter, 'glm-5.3-flash', true],
    ['zai', ZaiAdapter, 'glm-5.3-flashx', true],
    ['zai', ZaiAdapter, 'glm-5.3', false],
    ['zai', ZaiAdapter, 'glm-5.2', false],
  ] as const)('%s / %s supportsImages=%s', (provider, AdapterCtor, model, expected) => {
    const adapter = new AdapterCtor(makeConfig(provider, model));
    expect(adapter.getCapabilities().supportsImages).toBe(expected);
    expect(adapter.getCapabilities().attachments).toBe(expected);
  });
});
