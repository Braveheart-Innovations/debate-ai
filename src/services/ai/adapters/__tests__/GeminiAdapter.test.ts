import { GeminiAdapter } from '../google/GeminiAdapter';
import type { AIAdapterConfig } from '../../types/adapter.types';
import type { Message, MessageAttachment, PersonalityConfig } from '../../../../types';

const personality: PersonalityConfig = {
  id: 'persona-1',
  name: 'Factual Analyst',
  description: 'Keeps answers concise and accurate',
  systemPrompt: 'Stay factual and back claims with sources when possible.',
  traits: {
    formality: 0.6,
    humor: 0.2,
    technicality: 0.7,
    empathy: 0.5,
  },
  isPremium: false,
};

const createResponse = () => ({
  ok: true,
  json: async () => ({
    candidates: [
      {
        content: {
          parts: [{ text: 'Gemini output' }],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 60,
      totalTokenCount: 160,
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
  provider: 'google',
  apiKey: 'test-key',
  model: 'gemini-2.5-flash',
  parameters: { temperature: 0.7, maxTokens: 2048 },
  ...overrides,
});

describe('GeminiAdapter', () => {
  it('injects system prompt and formats history for Gemini API', async () => {
    const adapter = new GeminiAdapter(makeConfig({ personality }));
    const history: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Summarize the agenda', timestamp: 1 },
      { id: '2', sender: 'Gemini', senderType: 'ai', content: 'Agenda summary', timestamp: 2, metadata: { providerId: 'google' } },
    ];

    await adapter.sendMessage('Include next steps', history);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);

    expect(Array.isArray(body.contents)).toBe(true);
    expect(body.contents[0]).toEqual({
      role: 'user',
      parts: [{ text: `System: ${personality.systemPrompt}` }],
    });
    expect(body.contents[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Understood. I will follow these instructions.' }],
    });
    expect(body.contents[body.contents.length - 1]).toMatchObject({ role: 'user' });
  });

  it('serializes attachments as inline data parts', async () => {
    const adapter = new GeminiAdapter(makeConfig());
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'data:image/png;base64,abc123',
        mimeType: 'image/png',
        base64: 'abc123',
      },
      {
        type: 'document',
        uri: 'file:///whitepaper.pdf',
        mimeType: 'application/pdf',
        base64: 'pdfpayload',
      },
    ];

    await adapter.sendMessage('Review attachments', [], undefined, attachments);

    const [, requestInit] = fetchMock.mock.calls[0];
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);
    const finalParts = body.contents[body.contents.length - 1].parts;

    expect(finalParts).toEqual(
      expect.arrayContaining([
        { text: 'Review attachments' },
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'abc123',
          },
        },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: 'pdfpayload',
          },
        },
      ])
    );
  });
});
