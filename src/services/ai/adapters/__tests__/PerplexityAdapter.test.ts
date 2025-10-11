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
});
