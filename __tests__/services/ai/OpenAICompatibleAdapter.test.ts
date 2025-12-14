import { Message, MessageAttachment } from '@/types';
import { AIAdapterConfig, AdapterCapabilities, ProviderConfig } from '@/services/ai/types/adapter.types';
import { OpenAICompatibleAdapter } from '@/services/ai/base/OpenAICompatibleAdapter';

const baseCapabilities: AdapterCapabilities = {
  streaming: true,
  attachments: true,
  supportsImages: true,
  supportsDocuments: true,
  functionCalling: true,
  systemPrompt: true,
  maxTokens: 4096,
  contextWindow: 128000,
};

class TestOpenAIAdapter extends OpenAICompatibleAdapter {
  private readonly providerConfig: ProviderConfig;

  constructor(config: AIAdapterConfig, capabilities: AdapterCapabilities = baseCapabilities) {
    super(config);
    this.providerConfig = {
      baseUrl: 'https://test.openai',
      headers: (apiKey: string) => ({
        Authorization: `Bearer ${apiKey}`,
      }),
      defaultModel: 'test-default',
      capabilities,
    };
  }

  protected getProviderConfig(): ProviderConfig {
    return this.providerConfig;
  }

  public formatUserMessagePublic(
    message: string,
    attachments?: MessageAttachment[]
  ): Promise<string | unknown[]> | string | unknown[] {
    return this.formatUserMessage(message, attachments);
  }
}

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();

const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  consoleErrorSpy.mockRestore();
});

const baseConfig: AIAdapterConfig = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-latest',
  parameters: {
    temperature: 0.4,
    maxTokens: 256,
    topP: 0.9,
  },
};

const makeHistory = (): Message[] => [
  {
    id: 'assistant-1',
    sender: 'Assistant A',
    senderType: 'ai',
    content: 'Previous response',
    timestamp: Date.now() - 2000,
  },
  {
    id: 'user-1',
    sender: 'User',
    senderType: 'user',
    content: 'Earlier user input',
    timestamp: Date.now() - 1000,
  },
];

describe('OpenAICompatibleAdapter', () => {
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarnSpy.mockClear();
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('merges history, attachments, and optional params when sending messages', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Final reply' } }],
        model: 'gpt-5',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });

    const adapter = new TestOpenAIAdapter(baseConfig);
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'file://image.png',
        mimeType: 'image/png',
        base64: 'aW1hZ2U=',
      },
      {
        type: 'document',
        uri: 'file://doc.pdf',
        mimeType: 'application/pdf',
      },
    ];

    const response = await adapter.sendMessage('Send new info', makeHistory(), undefined, attachments);

    expect(response).toEqual({
      response: 'Final reply',
      modelUsed: 'gpt-5',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const parsedBody = JSON.parse((request?.body as string) ?? '{}');

    expect(parsedBody.model).toBe('gpt-5'); // alias resolved via resolveModelAlias
    expect(parsedBody.temperature).toBe(0.4);
    expect(parsedBody.max_tokens).toBe(256);
    expect(parsedBody.top_p).toBe(0.9);

    const messages = parsedBody.messages;
    expect(messages[1]).toMatchObject({
      role: 'user',
      content: '[Previous assistant] Previous response',
    });

    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(Array.isArray(lastMessage.content)).toBe(true);
    const parts = lastMessage.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(parts[0]).toEqual({ type: 'text', text: 'Earlier user input' });
    expect(parts[1]).toEqual({ type: 'text', text: 'Send new info' });
    expect(parts[2]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,aW1hZ2U=' },
    });
    expect(parts[3]).toEqual({
      type: 'text',
      text: '[Document attachments not supported for openai]',
    });
    expect(consoleWarnSpy).toHaveBeenCalledWith('[openai] Document support not implemented in base adapter');
  });

  it('passes through message text when attachments unsupported', async () => {
    const adapter = new TestOpenAIAdapter(
      baseConfig,
      {
        ...baseCapabilities,
        attachments: false,
        supportsImages: false,
        supportsDocuments: false,
      }
    );

    const result = await adapter.formatUserMessagePublic('Plain text', [
      { type: 'image', uri: 'x', mimeType: 'image/png' },
    ]);

    expect(result).toBe('Plain text');
  });

  it('throws via handleApiError when the OpenAI API responds with an error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Rate limit' } }),
    });

    const adapter = new TestOpenAIAdapter(baseConfig);

    await expect(adapter.sendMessage('broken')).rejects.toThrow('openai API error (500): Rate limit');
  });
});
