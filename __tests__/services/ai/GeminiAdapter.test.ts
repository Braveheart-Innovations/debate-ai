import { GeminiAdapter } from '@/services/ai/adapters/google/GeminiAdapter';
import { AIAdapterConfig } from '@/services/ai/types/adapter.types';
import { MessageAttachment } from '@/types';

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  mockEventSourceInstances.length = 0;
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  consoleErrorSpy.mockRestore();
});

const baseConfig: AIAdapterConfig = {
  provider: 'google',
  apiKey: 'test-key',
  model: 'gemini-2.5-flash',
  parameters: {
    temperature: 0.2,
    topP: 0.8,
    topK: 32,
    maxTokens: 1024,
  },
};

type Listener = (event: unknown) => void;

interface MockEventSourceInstance {
  url: string;
  options: Record<string, unknown>;
  listeners: Record<string, Listener[]>;
  closed: boolean;
  emit: (type: string, event: unknown) => void;
  close: () => void;
}

const mockEventSourceInstances: MockEventSourceInstance[] = [];

jest.mock('react-native-sse', () => ({
  __esModule: true,
  default: class {
    public listeners: Record<string, Listener[]> = {};
    public closed = false;
    public url: string;
    public options: Record<string, unknown>;

    constructor(url: string, options: Record<string, unknown>) {
      this.url = url;
      this.options = options;
      mockEventSourceInstances.push(this as unknown as MockEventSourceInstance);
    }

    addEventListener(type: string, handler: Listener) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    }

    emit(type: string, event: unknown) {
      (this.listeners[type] || []).forEach((handler) => handler(event));
    }

    close() {
      this.closed = true;
    }
  },
}));

describe('GeminiAdapter sendMessage', () => {
  it('formats history, attachments, and generation config before calling the Gemini endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: 'Gemini reply' }] },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      }),
    });

    const adapter = new GeminiAdapter(baseConfig);
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'data:image/png;base64,aW1hZ2U=',
        mimeType: 'image/png',
      },
      {
        type: 'document',
        uri: 'file://doc.pdf',
        mimeType: 'application/pdf',
        base64: 'cGRmZGF0YQ==',
      },
    ];

    const response = await adapter.sendMessage('Explain the debate', [], undefined, attachments);

    expect(response).toEqual({
      response: 'Gemini reply',
      modelUsed: 'gemini-2.5-flash',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('gemini-2.5-flash:generateContent');
    const parsedBody = JSON.parse((options?.body as string) ?? '{}');
    expect(parsedBody.contents.at(-1)?.parts).toHaveLength(3);
    expect(parsedBody.generationConfig).toEqual({
      temperature: 0.2,
      topP: 0.8,
      topK: 32,
      maxOutputTokens: 1024,
    });
  });

  it('delegates to handleApiError when Gemini responds with failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Unavailable' } }),
    });

    const adapter = new GeminiAdapter(baseConfig);

    await expect(adapter.sendMessage('fail please')).rejects.toThrow('Gemini error (503): Unavailable');
  });
});

describe('GeminiAdapter streamMessage', () => {
  const getLastEventSource = () => {
    const instance = mockEventSourceInstances[mockEventSourceInstances.length - 1];
    if (!instance) {
      throw new Error('EventSource instance not initialized');
    }
    return instance;
  };

  const emitChunk = (data: unknown) => {
    const instance = getLastEventSource();
    instance.emit('message', { data: JSON.stringify(data) });
    return instance;
  };

  it('yields streamed chunks and completes when finishReason is received', async () => {
    const adapter = new GeminiAdapter(baseConfig);
    const iterator = adapter.streamMessage('Stream it');

    const firstChunkPromise = iterator.next();
    const eventSource = getLastEventSource();
    expect(eventSource.url).toContain(':streamGenerateContent');

    emitChunk({
      candidates: [{ content: { parts: [{ text: 'first chunk' }] } }],
    });
    const firstChunk = await firstChunkPromise;
    expect(firstChunk.value).toBe('first chunk');

    const completionPromise = iterator.next();
    emitChunk({
      candidates: [{ finishReason: 'STOP' }],
    });
    const completion = await completionPromise;
    expect(completion.done).toBe(true);
    expect(eventSource?.closed).toBe(true);
  });

  it('rejects when the SSE stream reports an error', async () => {
    const adapter = new GeminiAdapter(baseConfig);
    const iterator = adapter.streamMessage('error stream');

    const nextPromise = iterator.next();
    const eventSource = getLastEventSource();
    eventSource.emit('error', {
      data: JSON.stringify({ error: { message: 'SSE failure' } }),
    });

    await expect(nextPromise).rejects.toThrow('SSE failure');
  });
});
