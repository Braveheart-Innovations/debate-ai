import { MistralAdapter } from '../mistral/MistralAdapter';
import { DeepSeekAdapter } from '../deepseek/DeepSeekAdapter';
import { GrokAdapter } from '../grok/GrokAdapter';
import { TogetherAdapter } from '../together/TogetherAdapter';
import type {
  AIAdapterConfig,
  AdapterCapabilities,
  ResumptionContext,
  SendMessageResponse,
} from '../../types/adapter.types';
import type { Message, MessageAttachment } from '../../../../types';

const createResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: 'Base adapter output' } }],
    model: 'mock-model',
    usage: {
      prompt_tokens: 60,
      completion_tokens: 40,
      total_tokens: 100,
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

type AdapterInstance = {
  sendMessage: (
    message: string,
    conversationHistory?: Message[],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ) => Promise<SendMessageResponse>;
  getCapabilities: () => AdapterCapabilities;
};

type AdapterCase = {
  name: string;
  Adapter: new (config: AIAdapterConfig) => AdapterInstance;
  config: AIAdapterConfig;
  expectedUrl: string;
};

const cases: AdapterCase[] = [
  {
    name: 'MistralAdapter',
    Adapter: MistralAdapter,
    config: { provider: 'mistral', apiKey: 'test-key', model: 'mistral-medium-latest', parameters: { temperature: 0.7, maxTokens: 2048 } },
    expectedUrl: 'https://api.mistral.ai/v1/chat/completions',
  },
  {
    name: 'DeepSeekAdapter',
    Adapter: DeepSeekAdapter,
    config: { provider: 'deepseek', apiKey: 'test-key', model: 'deepseek-chat', parameters: { temperature: 0.7, maxTokens: 2048 } },
    expectedUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  {
    name: 'GrokAdapter',
    Adapter: GrokAdapter,
    config: { provider: 'grok', apiKey: 'test-key', model: 'grok-2-1212', parameters: { temperature: 0.7, maxTokens: 2048 } },
    expectedUrl: 'https://api.x.ai/v1/chat/completions',
  },
  {
    name: 'TogetherAdapter',
    Adapter: TogetherAdapter,
    config: {
      provider: 'together',
      apiKey: 'test-key',
      model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      parameters: { temperature: 0.7, maxTokens: 2048 },
    },
    expectedUrl: 'https://api.together.xyz/v1/chat/completions',
  },
];

describe('OpenAI-compatible adapters', () => {
  it.each(cases)('%s delegates to base OpenAI flow', async ({ Adapter, config, expectedUrl }) => {
    const adapter = new Adapter(config);
    await adapter.sendMessage('Summarize the findings');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe(expectedUrl);
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);
    expect(body.model).toBe(config.model);
    expect(adapter.getCapabilities().streaming).toBe(true);
  });
});
