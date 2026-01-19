import { PerplexityAdapter } from '../perplexity/PerplexityAdapter';
import type { AIAdapterConfig } from '../../types/adapter.types';
import type { MessageAttachment } from '../../../../types';

const createResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: 'Perplexity answer [1]' } }],
    model: 'sonar',
    usage: {
      prompt_tokens: 80,
      completion_tokens: 40,
      total_tokens: 120,
    },
    citations: ['https://example.com/source'],
    search_results: [
      {
        url: 'https://example.com/source',
        title: 'Example Source',
        snippet: 'Excerpt from example source.',
      },
    ],
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
  provider: 'perplexity',
  apiKey: 'test-key',
  model: 'sonar',
  parameters: { temperature: 0.7, maxTokens: 2048 },
  ...overrides,
});

describe('PerplexityAdapter', () => {
  describe('capabilities', () => {
    it('exposes correct capabilities including document support', () => {
      const adapter = new PerplexityAdapter(makeConfig());
      const capabilities = adapter.getCapabilities();

      expect(capabilities).toEqual({
        streaming: true,
        attachments: true,
        supportsImages: true,
        supportsDocuments: true,
        functionCalling: false,
        systemPrompt: true,
        maxTokens: 4096,
        contextWindow: 200000,
      });
    });
  });

  describe('sendMessage', () => {
    it('requests citations and surfaces processed citation metadata', async () => {
      const adapter = new PerplexityAdapter(makeConfig());
      const attachments: MessageAttachment[] = [
        {
          type: 'image',
          uri: 'https://example.com/image.png',
          mimeType: 'image/png',
          base64: 'imgpayload',
        },
      ];

      const result = await adapter.sendMessage('Summarize with evidence', [], undefined, attachments);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.perplexity.ai/chat/completions');
      const rawBody = requestInit?.body as string;
      expect(typeof rawBody).toBe('string');
      const body = JSON.parse(rawBody);

      expect(body.return_citations).toBe(true);
      expect(body.search_recency_filter).toBe('month');
      const userMessage = body.messages[body.messages.length - 1];
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text', text: 'Summarize with evidence' }),
          expect.objectContaining({
            type: 'image_url',
            image_url: { url: expect.stringContaining('data:image/png;base64,imgpayload') },
          }),
        ])
      );

      expect(typeof result).toBe('object');
      const adapterResponse = result as { metadata?: { citations?: Array<{ index: number; url: string }> } };
      expect(adapterResponse.metadata?.citations).toEqual([
        {
          index: 1,
          url: 'https://example.com/source',
          title: 'Example Source',
          snippet: 'Excerpt from example source.',
        },
      ]);
    });

    it('formats document attachments using file_url with raw base64', async () => {
      const adapter = new PerplexityAdapter(makeConfig());
      const pdfBase64 = 'JVBERi0xLjQKJeLjz9M...'; // Sample PDF base64
      const attachments: MessageAttachment[] = [
        {
          type: 'document',
          uri: 'file:///document.pdf',
          mimeType: 'application/pdf',
          base64: pdfBase64,
          fileName: 'report.pdf',
        },
      ];

      await adapter.sendMessage('Summarize this document', [], undefined, attachments);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit?.body as string);

      const userMessage = body.messages[body.messages.length - 1];
      expect(Array.isArray(userMessage.content)).toBe(true);

      // Verify file_url format with raw base64 (no data: prefix)
      expect(userMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'file_url',
            file_url: { url: pdfBase64 }, // Raw base64, no data: prefix
            file_name: 'report.pdf',
          }),
          expect.objectContaining({ type: 'text', text: 'Summarize this document' }),
        ])
      );
    });

    it('handles mixed image and document attachments', async () => {
      const adapter = new PerplexityAdapter(makeConfig());
      const attachments: MessageAttachment[] = [
        {
          type: 'image',
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          base64: 'imagedata',
        },
        {
          type: 'document',
          uri: 'file:///doc.pdf',
          mimeType: 'application/pdf',
          base64: 'pdfdata',
          fileName: 'doc.pdf',
        },
      ];

      await adapter.sendMessage('Analyze both', [], undefined, attachments);

      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit?.body as string);
      const userMessage = body.messages[body.messages.length - 1];

      // Images come first, then documents, then text
      expect(userMessage.content).toHaveLength(3);
      expect(userMessage.content[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,imagedata' },
      });
      expect(userMessage.content[1]).toEqual({
        type: 'file_url',
        file_url: { url: 'pdfdata' },
        file_name: 'doc.pdf',
      });
      expect(userMessage.content[2]).toEqual({
        type: 'text',
        text: 'Analyze both',
      });
    });

    it('sends plain text when no attachments provided', async () => {
      const adapter = new PerplexityAdapter(makeConfig());

      await adapter.sendMessage('Simple question');

      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit?.body as string);
      const userMessage = body.messages[body.messages.length - 1];

      // Content should be plain string, not array
      expect(userMessage.content).toBe('Simple question');
    });

    it('merges consecutive user messages to satisfy Perplexity alternation requirement', async () => {
      const adapter = new PerplexityAdapter(makeConfig());

      // Simulate multi-AI chat history where another AI's response is mapped to user role
      // This can happen in debate mode when other AI responses become user messages
      const conversationHistory = [
        {
          id: '1',
          content: 'What is quantum computing?',
          sender: 'User',
          senderType: 'user' as const,
          timestamp: Date.now() - 3000,
        },
        {
          id: '2',
          content: 'Quantum computing uses qubits...',
          sender: 'Claude',
          senderType: 'ai' as const,
          timestamp: Date.now() - 2000,
          metadata: { providerId: 'claude' },
        },
        {
          id: '3',
          content: 'Can you explain more?',
          sender: 'User',
          senderType: 'user' as const,
          timestamp: Date.now() - 1000,
        },
      ];

      await adapter.sendMessage('And what about quantum supremacy?', conversationHistory);

      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit?.body as string);

      // Verify messages alternate properly: system -> user -> assistant -> user
      // The last two user messages should be merged
      const roles = body.messages.map((m: { role: string }) => m.role);

      // Check no consecutive user or assistant messages (except system at start)
      for (let i = 1; i < roles.length - 1; i++) {
        if (roles[i] !== 'system') {
          expect(roles[i]).not.toBe(roles[i + 1]);
        }
      }

      // The final user message should contain both the history user message and new message
      const lastMessage = body.messages[body.messages.length - 1];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.content).toContain('Can you explain more?');
      expect(lastMessage.content).toContain('And what about quantum supremacy?');
    });
  });

  describe('streamMessage', () => {
    it('formats document attachments correctly in streaming mode', async () => {
      // Mock EventSource by capturing the fetch call made internally
      // The streamMessage uses EventSource which internally makes a fetch-like request
      // For this test, we verify the adapter constructs the correct request body

      const adapter = new PerplexityAdapter(makeConfig());
      const pdfBase64 = 'documentbase64data';
      const attachments: MessageAttachment[] = [
        {
          type: 'document',
          uri: 'file:///test.pdf',
          mimeType: 'application/pdf',
          base64: pdfBase64,
          fileName: 'test.pdf',
        },
      ];

      // Access formatUserMessage directly to verify it returns correct format
      // This is the key function that both sendMessage and streamMessage use
      const formatUserMessage = (adapter as unknown as {
        formatUserMessage: (message: string, attachments?: MessageAttachment[]) => unknown;
      }).formatUserMessage.bind(adapter);

      const result = formatUserMessage('Summarize the PDF', attachments);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([
        {
          type: 'file_url',
          file_url: { url: pdfBase64 },
          file_name: 'test.pdf',
        },
        { type: 'text', text: 'Summarize the PDF' },
      ]);
    });

    it('formats image attachments correctly for streaming', async () => {
      const adapter = new PerplexityAdapter(makeConfig());
      const attachments: MessageAttachment[] = [
        {
          type: 'image',
          uri: 'file:///image.png',
          mimeType: 'image/png',
          base64: 'imgbase64',
        },
      ];

      const formatUserMessage = (adapter as unknown as {
        formatUserMessage: (message: string, attachments?: MessageAttachment[]) => unknown;
      }).formatUserMessage.bind(adapter);

      const result = formatUserMessage('Describe this', attachments);

      expect(result).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,imgbase64' },
        },
        { type: 'text', text: 'Describe this' },
      ]);
    });
  });
});
