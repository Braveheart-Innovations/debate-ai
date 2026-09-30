import { CohereAdapter } from '../cohere/CohereAdapter';
import type { AIAdapterConfig, AdapterResponse } from '../../types/adapter.types';
import type { Message, MessageAttachment } from '../../../../types';

// Mock v2 API response format
const createResponse = () => ({
  ok: true,
  json: async () => ({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Cohere output' }],
    },
    usage: {
      tokens: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    },
  }),
}) as unknown as Response;

let fetchMock: jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  fetchMock = jest.fn().mockImplementation(async () => createResponse());
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.resetAllMocks();
});

const makeConfig = (overrides: Partial<AIAdapterConfig> = {}): AIAdapterConfig => ({
  provider: 'cohere',
  apiKey: 'test-key',
  model: 'command-a-plus-05-2026',
  parameters: { temperature: 0.7, maxTokens: 2048 },
  ...overrides,
});

describe('CohereAdapter', () => {
  describe('getCapabilities', () => {
    it('returns correct capabilities', () => {
      const adapter = new CohereAdapter(makeConfig());
      const capabilities = adapter.getCapabilities();

      expect(capabilities.streaming).toBe(true);
      expect(capabilities.systemPrompt).toBe(true);
      expect(capabilities.functionCalling).toBe(true);
      expect(capabilities.attachments).toBe(true);
      expect(capabilities.supportsImages).toBe(true);
      expect(capabilities.supportsDocuments).toBe(false);
      expect(capabilities.maxTokens).toBe(64000);
      expect(capabilities.contextWindow).toBe(436000);
    });
  });

  describe('sendMessage', () => {
    it('formats messages in v2 API format with system prompt', async () => {
      const adapter = new CohereAdapter(makeConfig());
      const history: Message[] = [
        { id: '1', sender: 'You', senderType: 'user', content: 'Outline milestones', timestamp: 1 },
        { id: '2', sender: 'Cohere', senderType: 'ai', content: 'Milestones ready', timestamp: 2, metadata: { providerId: 'cohere' } },
      ];

      await adapter.sendMessage('Provide next actions', history);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.cohere.com/v2/chat');

      const rawBody = requestInit?.body as string;
      expect(typeof rawBody).toBe('string');
      const body = JSON.parse(rawBody);

      // Check v2 messages format
      expect(body.messages).toBeDefined();
      expect(Array.isArray(body.messages)).toBe(true);

      // First message should be system prompt
      expect(body.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful AI assistant.',
      });

      // History should be mapped correctly
      expect(body.messages).toContainEqual({
        role: 'user',
        content: 'Outline milestones',
      });
      expect(body.messages).toContainEqual({
        role: 'assistant',
        content: 'Milestones ready',
      });

      // Current message should be last
      const lastMessage = body.messages[body.messages.length - 1];
      expect(lastMessage).toEqual({
        role: 'user',
        content: 'Provide next actions',
      });

      // Check other parameters
      expect(body.model).toBe('command-a-plus-05-2026');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(2048);
    });

    it('extracts response text from v2 format', async () => {
      const adapter = new CohereAdapter(makeConfig());
      const result = await adapter.sendMessage('Hello') as AdapterResponse;

      expect(result.response).toBe('Cohere output');
      expect(result.modelUsed).toBe('command-a-plus-05-2026');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('extracts text content when reasoning appears before it', async () => {
      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Internal reasoning' },
              { type: 'text', text: 'O' },
              { type: 'text', text: 'K' },
            ],
          },
        }),
      }) as unknown as Response);

      const adapter = new CohereAdapter(makeConfig());
      const result = await adapter.sendMessage('Hello') as AdapterResponse;

      expect(result.response).toBe('OK');
    });

    it('formats image attachments with the Cohere v2 image_url shape', async () => {
      const adapter = new CohereAdapter(makeConfig());
      const attachments: MessageAttachment[] = [
        {
          type: 'image',
          uri: 'file://image.png',
          mimeType: 'image/png',
          base64: 'imagepayload',
        },
      ];

      await adapter.sendMessage('Describe this image', [], undefined, attachments);

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const lastMessage = body.messages[body.messages.length - 1];
      expect(lastMessage).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,imagepayload' },
          },
        ],
      });
    });

    it('preserves explicit zero temperature values', async () => {
      const adapter = new CohereAdapter(
        makeConfig({
          parameters: { temperature: 0, maxTokens: 2048 },
        })
      );

      await adapter.sendMessage('Hello');

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.temperature).toBe(0);
    });

    it('uses model override when provided', async () => {
      const adapter = new CohereAdapter(makeConfig());
      await adapter.sendMessage('Hello', [], undefined, undefined, 'command-r-08-2024');

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.model).toBe('command-r-08-2024');
    });

    it('includes correct authorization header', async () => {
      const adapter = new CohereAdapter(makeConfig({ apiKey: 'my-secret-key' }));
      await adapter.sendMessage('Hello');

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-secret-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('handles API errors gracefully', async () => {
      fetchMock.mockImplementationOnce(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      }) as unknown as Response);

      const adapter = new CohereAdapter(makeConfig());

      await expect(adapter.sendMessage('Hello')).rejects.toThrow();
    });
  });

  describe('streamMessage', () => {
    it('is implemented as an async generator', () => {
      const adapter = new CohereAdapter(makeConfig());
      expect(typeof adapter.streamMessage).toBe('function');

      // Verify it returns an async generator
      const generator = adapter.streamMessage('test');
      expect(generator[Symbol.asyncIterator]).toBeDefined();
    });
  });
});
