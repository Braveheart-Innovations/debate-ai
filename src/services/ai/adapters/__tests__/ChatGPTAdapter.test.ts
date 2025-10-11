import { ChatGPTAdapter } from '../openai/ChatGPTAdapter';
import type { AIAdapterConfig } from '../../types/adapter.types';
import type { MessageAttachment } from '../../../../types';

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

const baseConfig: AIAdapterConfig = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-5',
  parameters: { temperature: 0.7, maxTokens: 2048 },
};

const createFetchResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: 'Mock response' } }],
    model: 'gpt-5',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  }),
}) as unknown as Response;

let fetchMock: jest.MockedFunction<typeof fetch>;
const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  fetchMock = jest.fn().mockImplementation(async () => createFetchResponse());
  global.fetch = fetchMock;
  mockEventSourceInstances.splice(0, mockEventSourceInstances.length);
});

afterEach(() => {
  jest.resetAllMocks();
  process.env.NODE_ENV = originalEnv;
});

describe('ChatGPTAdapter', () => {
  it('formats attachments using image parts and adds note for unsupported documents', async () => {
    const adapter = new ChatGPTAdapter(baseConfig);
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'data:image/png;base64,imagepayload',
        mimeType: 'image/png',
        base64: 'imagepayload',
      },
      {
        type: 'document',
        uri: 'file:///notes.pdf',
        mimeType: 'application/pdf',
        base64: 'pdfpayload',
      },
    ];

    await adapter.sendMessage('Summarize attachments', [], undefined, attachments);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);
    const userMessage = body.messages[body.messages.length - 1];

    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: 'Summarize attachments' }),
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({ url: expect.stringContaining('data:image/png;base64,imagepayload') }),
        }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('PDF documents cannot be processed'),
        }),
      ])
    );
  });

  it('forces temperature to 1 for GPT-5 family models', async () => {
    const adapter = new ChatGPTAdapter({
      ...baseConfig,
      parameters: { temperature: 0.2, maxTokens: 2048 },
    });

    await adapter.sendMessage('Hello world');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);
    expect(body.temperature).toBe(1);
  });

  it('returns plain text when the selected model lacks vision support', async () => {
    const adapter = new ChatGPTAdapter({
      ...baseConfig,
      model: 'gpt-3.5-turbo',
      parameters: { temperature: 0.4, maxTokens: 1024 },
    });

    await adapter.sendMessage('Summarize this', [], undefined, [
      { type: 'image', uri: 'file://image.png', mimeType: 'image/png', base64: 'abc' } as MessageAttachment,
    ]);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit?.body as string);
    const userMessage = body.messages[body.messages.length - 1];
    expect(typeof userMessage.content).toBe('string');
    expect(userMessage.content).toContain('Summarize this');
  });

  it('applies standard token parameters for non GPT-5 models', async () => {
    const adapter = new ChatGPTAdapter({
      ...baseConfig,
      model: 'gpt-4o-mini',
      parameters: { temperature: 0.55, maxTokens: 321, topP: 0.42 },
    });

    await adapter.sendMessage('Configure options');

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit?.body as string);
    expect(body.temperature).toBe(0.55);
    expect(body.max_tokens).toBe(321);
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body.top_p).toBe(0.42);
  });

  it('throws enriched errors when OpenAI responds with failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Too many requests' } }),
    } as unknown as Response);
    const adapter = new ChatGPTAdapter(baseConfig);

    await expect(adapter.sendMessage('Hello')).rejects.toThrow('OpenAI API error (429): Too many requests');
  });

  it('streams SSE deltas and completion events', async () => {
    process.env.NODE_ENV = 'development';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'gpt-5' }] }) } as unknown as Response);
    const adapter = new ChatGPTAdapter(baseConfig);
    const onEvent = jest.fn();

    const iterator = adapter.streamMessage('Hello there', [], undefined, undefined, undefined, undefined, onEvent);

    // Wait for the iterator to become ready to receive events
    const firstChunk = iterator.next();
    await flushMicrotasks();
    const eventSource = mockEventSourceInstances[0];
    if (!eventSource) throw new Error('EventSource not created');
    eventSource.emit('response.output_text.delta', JSON.stringify({ delta: 'Hi' }));
    await expect(firstChunk).resolves.toEqual({ value: 'Hi', done: false });

    const finalChunkPromise = iterator.next();
    eventSource.emit(
      'response.output_text.done',
      JSON.stringify({ response: { output: [{ type: 'output_text', text: ' there' }] } })
    );
    await expect(finalChunkPromise).resolves.toEqual({ value: ' there', done: false });

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'response.output_text.done' }));
    expect(eventSource.close).toHaveBeenCalled();
  });

  it('propagates SSE errors during streaming', async () => {
    process.env.NODE_ENV = 'development';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as unknown as Response);
    const adapter = new ChatGPTAdapter(baseConfig);

    const iterator = adapter.streamMessage('Hello');

    const pending = iterator.next();
    await flushMicrotasks();
    const eventSource = mockEventSourceInstances[0];
    if (!eventSource) throw new Error('EventSource not created');
    eventSource.emit('response.error', JSON.stringify({ error: { message: 'Upstream failure' } }));
    await expect(pending).rejects.toThrow('Upstream failure');
    expect(eventSource.close).toHaveBeenCalled();
  });
});
