import { CohereAdapter } from '../cohere/CohereAdapter';
import type { AIAdapterConfig } from '../../types/adapter.types';
import type { Message } from '../../../../types';

const createResponse = () => ({
  ok: true,
  json: async () => ({ text: 'Cohere output' }),
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
  model: 'command-r-plus',
  parameters: { temperature: 0.7, maxTokens: 2048 },
  ...overrides,
});

describe('CohereAdapter', () => {
  it('maps history into Cohere chat format and forwards system prompt', async () => {
    const adapter = new CohereAdapter(makeConfig());
    const history: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Outline milestones', timestamp: 1 },
      { id: '2', sender: 'Cohere', senderType: 'ai', content: 'Milestones ready', timestamp: 2 },
    ];

    await adapter.sendMessage('Provide next actions', history);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cohere.ai/v1/chat');
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);

    expect(body.chat_history).toEqual([
      { role: 'USER', message: 'Outline milestones' },
      { role: 'ASSISTANT', message: 'Milestones ready' },
    ]);
    expect(body.preamble).toBe('You are a helpful AI assistant.');
    expect(body.message).toBe('Provide next actions');
  });
});
