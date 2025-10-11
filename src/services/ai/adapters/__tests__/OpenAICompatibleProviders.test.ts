import { DeepSeekAdapter } from '../deepseek/DeepSeekAdapter';
import { GrokAdapter } from '../grok/GrokAdapter';
import { MistralAdapter } from '../mistral/MistralAdapter';
import { TogetherAdapter } from '../together/TogetherAdapter';
import type { OpenAICompatibleAdapter } from '../../base/OpenAICompatibleAdapter';
import type { AIAdapterConfig, AdapterCapabilities } from '../../types/adapter.types';
import type { AIProvider, MessageAttachment } from '../../../../types';

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
    defaultModel: 'deepseek-chat',
    capabilities: {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 4096,
      contextWindow: 128000,
    },
  },
  {
    name: 'Grok',
    provider: 'grok',
    AdapterCtor: GrokAdapter,
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-1212',
    capabilities: {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
      functionCalling: false,
      systemPrompt: true,
      maxTokens: 4096,
      contextWindow: 131072,
    },
  },
  {
    name: 'Mistral',
    provider: 'mistral',
    AdapterCtor: MistralAdapter,
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-medium-latest',
    capabilities: {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
      functionCalling: true,
      systemPrompt: true,
      maxTokens: 32768,
      contextWindow: 128000,
    },
  },
  {
    name: 'Together',
    provider: 'together',
    AdapterCtor: TogetherAdapter,
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    capabilities: {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
      functionCalling: false,
      systemPrompt: true,
      maxTokens: 4096,
      contextWindow: 128000,
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

  it('embeds image attachments into the user message payload when supported', async () => {
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
    expect(userMessage.content).toEqual([
      { type: 'text', text: 'Describe the image' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
    ]);
  });
});
