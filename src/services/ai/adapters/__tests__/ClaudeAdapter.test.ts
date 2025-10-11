import { ClaudeAdapter } from '../claude/ClaudeAdapter';
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

const createResponse = (model: string) => ({
  ok: true,
  json: async () => ({
    content: [{ text: 'Claude reply' }],
    model,
    usage: {
      input_tokens: 120,
      output_tokens: 80,
    },
  }),
}) as unknown as Response;

let fetchMock: jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  fetchMock = jest.fn().mockImplementation(async () => createResponse('claude-3-7-sonnet-20250219'));
  global.fetch = fetchMock;
  mockEventSourceInstances.splice(0, mockEventSourceInstances.length);
});

afterEach(() => {
  jest.resetAllMocks();
  jest.useRealTimers();
});

const makeConfig = (model: string): AIAdapterConfig => ({
  provider: 'claude',
  apiKey: 'test-key',
  model,
  parameters: { temperature: 0.7, maxTokens: 4096 },
});

describe('ClaudeAdapter', () => {
  it('toggles document support based on model', () => {
    const supportsDocs = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    const noDocs = new ClaudeAdapter(makeConfig('claude-3-haiku-20240307'));

    expect(supportsDocs.getCapabilities().supportsDocuments).toBe(true);
    expect(noDocs.getCapabilities().supportsDocuments).toBe(false);
  });

  it('includes image and document attachments when supported', async () => {
    const adapter = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'data:image/jpeg;base64,imagepayload',
        mimeType: 'image/jpeg',
        base64: 'imagepayload',
      },
      {
        type: 'document',
        uri: 'file:///brief.pdf',
        mimeType: 'application/pdf',
        base64: 'pdfpayload',
      },
    ];

    await adapter.sendMessage('Analyze attachments', [], undefined, attachments);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);
    const userMessage = body.messages[body.messages.length - 1];

    expect(userMessage).toMatchObject({ role: 'user' });
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          source: expect.objectContaining({ media_type: 'image/jpeg', data: 'imagepayload' }),
        }),
        expect.objectContaining({
          type: 'document',
          source: expect.objectContaining({ media_type: 'application/pdf', data: 'pdfpayload' }),
        }),
      ])
    );
  });

  it('omits document attachments when model lacks support', async () => {
    const adapter = new ClaudeAdapter(makeConfig('claude-3-haiku-20240307'));
    const attachments: MessageAttachment[] = [
      {
        type: 'document',
        uri: 'file:///brief.pdf',
        mimeType: 'application/pdf',
        base64: 'pdfpayload',
      },
    ];

    await adapter.sendMessage('Analyze attachments', [], undefined, attachments);

    const [, requestInit] = fetchMock.mock.calls[0];
    const rawBody = requestInit?.body as string;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody);
    const userMessage = body.messages[body.messages.length - 1];
    const content = userMessage.content as Array<Record<string, unknown>>;

    expect(content.some(part => part.type === 'document')).toBe(false);
  });

  it('extracts inline base64 when attachment lacks explicit payload', async () => {
    const adapter = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    await adapter.sendMessage('Inspect image', [], undefined, [
      {
        type: 'image',
        uri: 'data:image/png;base64,aGVsbG8=',
        mimeType: 'image/png',
      } as MessageAttachment,
    ]);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit?.body as string);
    const userMessage = body.messages[body.messages.length - 1];
    const imagePart = (userMessage.content as Array<Record<string, unknown>>).find((part) => part.type === 'image');
    expect(imagePart).toBeDefined();
    expect(imagePart?.source).toMatchObject({ data: 'aGVsbG8=' });
  });

  it('retries on overloaded responses before succeeding', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 529,
        json: async () => ({ error: { type: 'overloaded_error', message: 'busy' } }),
      } as unknown as Response)
      .mockResolvedValueOnce(createResponse('claude-3-7-sonnet-20250219'));

    const adapter = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    const sendPromise = adapter.sendMessage('Hello Claude');

    await jest.advanceTimersByTimeAsync(1000);
    const result = await sendPromise;
    if (typeof result === 'string') {
      fail('Expected structured response from ClaudeAdapter');
      return;
    }
    expect(result.response).toBe('Claude reply');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(adapter.getLastModelUsed()).toBe('claude-3-7-sonnet-20250219');
    jest.useRealTimers();
  });

  it('throws descriptive error when retries are exhausted', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad request' } }),
    } as unknown as Response);

    const adapter = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    await expect(adapter.sendMessage('fail')).rejects.toThrow('Claude API error: 400 - bad request');
  });

  it('streams SSE deltas with deduplication and completion handling', async () => {
    const adapter = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    const onEvent = jest.fn();
    const iterator = adapter.streamMessage('Hello', [], undefined, undefined, undefined, undefined, onEvent);

    const firstChunk = iterator.next();
    await flushMicrotasks();
    const eventSource = mockEventSourceInstances[0];
    if (!eventSource) throw new Error('EventSource not created');

    eventSource.emit('content_block_delta', JSON.stringify({ delta: { text: 'Hello' } }));
    await expect(firstChunk).resolves.toEqual({ value: 'Hello', done: false });

    const secondChunk = iterator.next();
    eventSource.emit('content_block_delta', JSON.stringify({ delta: { text: 'Hello there' } }));
    await expect(secondChunk).resolves.toEqual({ value: ' there', done: false });

    eventSource.emit('message_stop', null);
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'content_block_delta' }));
    expect(eventSource.close).toHaveBeenCalled();
  });

  it('translates SSE error payloads into user-friendly messages', async () => {
    const adapter = new ClaudeAdapter(makeConfig('claude-3-7-sonnet-20250219'));
    const iterator = adapter.streamMessage('Hello');

    const pending = iterator.next();
    await flushMicrotasks();
    const eventSource = mockEventSourceInstances[0];
    if (!eventSource) throw new Error('EventSource not created');

    eventSource.emit('error', JSON.stringify({ error: { type: 'overloaded_error', message: 'busy' } }));
    await expect(pending).rejects.toThrow('Claude is temporarily overloaded');
    expect(eventSource.close).toHaveBeenCalled();
  });
});
