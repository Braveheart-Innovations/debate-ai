import { StreamingService, isStreamInterruptedError, resetStreamingService } from '@/services/streaming/StreamingService';
import { AdapterFactory } from '@/services/ai/factory/AdapterFactory';
import { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import type { AdapterCapabilities, ResumptionContext } from '@/services/ai/types/adapter.types';
import type { Message, MessageAttachment } from '@/types';

describe('StreamingService', () => {
  const capabilities: AdapterCapabilities = {
    streaming: true,
    attachments: false,
    functionCalling: false,
    systemPrompt: true,
    maxTokens: 4096,
    contextWindow: 200000,
  };

  class MockStreamingAdapter extends BaseAdapter {
    sendMessage = jest.fn(async () => ({ response: 'fallback' }));

    getCapabilities(): AdapterCapabilities {
      return capabilities;
    }

    async *streamMessage(
      message: string,
      _conversationHistory: Message[],
      _attachments?: MessageAttachment[],
      _resumption?: ResumptionContext,
      _modelOverride?: string,
      abortSignal?: AbortSignal
    ): AsyncGenerator<string, void, unknown> {
      yield `${message} `;
      if (abortSignal?.aborted) {
        return;
      }
      yield 'completed.';
    }
  }

  class MockNonStreamingAdapter extends BaseAdapter {
    sendMessage = jest.fn(async () => ({ response: 'no-stream' }));

    getCapabilities(): AdapterCapabilities {
      return { ...capabilities, streaming: false };
    }
  }

  class RetryBeforeChunkAdapter extends BaseAdapter {
    calls = 0;
    sendMessage = jest.fn(async () => ({ response: 'fallback' }));

    getCapabilities(): AdapterCapabilities {
      return capabilities;
    }

    async *streamMessage(): AsyncGenerator<string, void, unknown> {
      this.calls++;
      if (this.calls === 1) {
        throw new Error('Gemini error (400): invalid model name');
      }
      yield 'retried';
    }
  }

  class FailAfterChunkAdapter extends BaseAdapter {
    calls = 0;
    sendMessage = jest.fn(async () => ({ response: 'fallback' }));

    getCapabilities(): AdapterCapabilities {
      return capabilities;
    }

    async *streamMessage(): AsyncGenerator<string, void, unknown> {
      this.calls++;
      yield 'partial';
      throw new Error('Gemini error (503): service unavailable');
    }
  }

  class FailAfterSeveralChunksAdapter extends BaseAdapter {
    sendMessage = jest.fn(async () => ({ response: 'fallback' }));

    getCapabilities(): AdapterCapabilities {
      return capabilities;
    }

    async *streamMessage(): AsyncGenerator<string, void, unknown> {
      yield 'The tide ';
      yield 'rises ';
      yield 'and';
      throw new Error('Connection failed');
    }
  }

  class PausedStreamingAdapter extends BaseAdapter {
    sendMessage = jest.fn(async () => ({ response: 'fallback' }));
    resume: (() => void) | null = null;

    getCapabilities(): AdapterCapabilities {
      return capabilities;
    }

    async *streamMessage(): AsyncGenerator<string, void, unknown> {
      yield 'A';
      yield 'B';
      await new Promise<void>(resolve => {
        this.resume = resolve;
      });
      yield 'C';
    }
  }

  let streamingService: StreamingService;
  let adapterSpy: jest.SpiedFunction<typeof AdapterFactory.createWithModel>;

  beforeEach(() => {
    resetStreamingService();
    streamingService = new StreamingService();
    adapterSpy = jest.spyOn(AdapterFactory, 'createWithModel');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('streams chunks through buffer and completes with aggregated content', async () => {
    const adapter = new MockStreamingAdapter({ provider: 'claude', apiKey: 'key', model: 'claude-3' });
    adapterSpy.mockReturnValue(adapter);

    const chunks: string[] = [];
    let completed = '';

    await streamingService.streamResponse(
      {
        messageId: 'msg-1',
        adapterConfig: { provider: 'claude', apiKey: 'key', model: 'claude-3' },
        message: 'Hello',
        conversationHistory: [],
      },
      (chunk) => {
        chunks.push(chunk);
      },
      (finalContent) => {
        completed = finalContent;
      },
      () => {
        throw new Error('Should not error');
      },
    );

    expect(chunks).toEqual(['Hello ', 'completed.']);
    expect(completed).toBe('Hello completed.');
    expect(streamingService.getActiveStreamCount()).toBe(0);
    expect(adapter.sendMessage).not.toHaveBeenCalled();
  });

  it('passes identityId when recreating an adapter from streaming config', async () => {
    const adapter = new MockStreamingAdapter({
      provider: 'claude',
      identityId: 'claude-slot-1',
      apiKey: 'key',
      model: 'claude-3',
    });
    adapterSpy.mockReturnValue(adapter);

    await streamingService.streamResponse(
      {
        messageId: 'msg-identity',
        adapterConfig: {
          provider: 'claude',
          identityId: 'claude-slot-1',
          apiKey: 'key',
          model: 'claude-3',
        },
        message: 'Hello',
        conversationHistory: [],
      },
      () => {},
      () => {},
      () => {
        throw new Error('Should not error');
      },
    );

    expect(adapterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'claude',
        identityId: 'claude-slot-1',
      }),
      expect.any(String),
    );
  });

  it('buffers display updates without blocking stream ingestion', async () => {
    jest.useFakeTimers();
    const adapter = new PausedStreamingAdapter({ provider: 'claude', apiKey: 'key', model: 'claude-3' });
    adapterSpy.mockReturnValue(adapter);

    const chunks: string[] = [];
    const streamPromise = streamingService.streamResponse(
      {
        messageId: 'msg-smooth',
        adapterConfig: { provider: 'claude', apiKey: 'key', model: 'claude-3' },
        message: 'ignored',
        conversationHistory: [],
      },
      chunk => {
        chunks.push(chunk);
      },
      () => undefined,
      () => {
        throw new Error('Should not error');
      },
    );

    await jest.advanceTimersByTimeAsync(0);
    expect(chunks).toEqual(['A']);

    await jest.advanceTimersByTimeAsync(48);
    expect(chunks).toEqual(['A', 'B']);

    adapter.resume?.();
    await streamPromise;
    expect(chunks).toEqual(['A', 'B', 'C']);
  });

  it('falls back to error callback when adapter lacks streaming', async () => {
    const adapter = new MockNonStreamingAdapter({ provider: 'claude', apiKey: 'key', model: 'claude-3' });
    adapterSpy.mockReturnValue(adapter as unknown as BaseAdapter);

    const errorSpy = jest.fn();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await streamingService.streamResponse(
      {
        messageId: 'msg-2',
        adapterConfig: { provider: 'claude', apiKey: 'key', model: 'claude-3' },
        message: 'Hello',
        conversationHistory: [],
      },
      () => {},
      () => {},
      errorSpy,
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(errorSpy.mock.calls[0][0].message).toMatch('Adapter does not support streaming');
    consoleSpy.mockRestore();
  });

  it('cancels active stream and prevents further chunks', async () => {
    const adapter = new MockStreamingAdapter({ provider: 'claude', apiKey: 'key', model: 'claude-3' });
    adapterSpy.mockReturnValue(adapter);

    const chunks: string[] = [];
    const errors: Error[] = [];

    await streamingService.streamResponse(
      {
        messageId: 'msg-3',
        adapterConfig: { provider: 'claude', apiKey: 'key', model: 'claude-3' },
        message: 'Checking',
        conversationHistory: [],
      },
      (chunk) => {
        chunks.push(chunk);
        streamingService.cancelStream('msg-3');
      },
      () => {},
      (error) => {
        errors.push(error);
      },
    );

    expect(chunks).toEqual(['Checking ']);
    expect(errors[0]).toEqual(expect.objectContaining({ reason: 'cancelled' }));
    expect(streamingService.isStreamActive('msg-3')).toBe(false);
  });

  it('marks lifecycle interruptions distinctly from user cancellation', async () => {
    const adapter = new MockStreamingAdapter({ provider: 'claude', apiKey: 'key', model: 'claude-3' });
    adapterSpy.mockReturnValue(adapter);

    const errors: Error[] = [];

    await streamingService.streamResponse(
      {
        messageId: 'msg-interrupt',
        adapterConfig: { provider: 'claude', apiKey: 'key', model: 'claude-3' },
        message: 'Pause',
        conversationHistory: [],
      },
      () => {
        streamingService.interruptAllStreams();
      },
      () => {
        throw new Error('Should not complete interrupted streams');
      },
      (error) => {
        errors.push(error);
      },
    );

    expect(isStreamInterruptedError(errors[0])).toBe(true);
    expect(errors[0]).toEqual(expect.objectContaining({ reason: 'interrupted' }));
  });

  it('retries a retryable provider stream when no content has been emitted', async () => {
    const adapter = new RetryBeforeChunkAdapter({
      provider: 'google',
      apiKey: 'key',
      model: 'gemini-3.5-flash',
    });

    const chunks: string[] = [];
    const errors: Error[] = [];
    let completed = '';

    await streamingService.streamResponse(
      {
        messageId: 'msg-retry-before-chunk',
        adapter,
        modelOverride: 'gemini-3.5-flash',
        message: 'Retry safely',
        conversationHistory: [],
      },
      (chunk) => {
        chunks.push(chunk);
      },
      (finalContent) => {
        completed = finalContent;
      },
      (error) => {
        errors.push(error);
      },
    );

    expect(adapter.calls).toBe(2);
    expect(chunks).toEqual(['retried']);
    expect(completed).toBe('retried');
    expect(errors).toEqual([]);
  });

  it('does not retry provider stream failures after content has been emitted', async () => {
    const adapter = new FailAfterChunkAdapter({
      provider: 'google',
      apiKey: 'key',
      model: 'gemini-3.5-flash',
    });

    const chunks: string[] = [];
    const errors: Error[] = [];

    await streamingService.streamResponse(
      {
        messageId: 'msg-no-retry-after-chunk',
        adapter,
        modelOverride: 'gemini-3.5-flash',
        message: 'Do not duplicate',
        conversationHistory: [],
      },
      (chunk) => {
        chunks.push(chunk);
      },
      () => {
        throw new Error('Should not complete failed streams');
      },
      (error) => {
        errors.push(error);
      },
    );

    expect(adapter.calls).toBe(1);
    expect(chunks).toEqual(['partial']);
    expect(errors[0]).toEqual(expect.any(Error));
  });

  it('delivers buffered text before reporting a stream failure', async () => {
    const adapter = new FailAfterSeveralChunksAdapter({ provider: 'deepseek', apiKey: 'key', model: 'deepseek-chat' });
    const received: string[] = [];

    await streamingService.streamResponse(
      {
        messageId: 'msg-flush-on-error',
        adapter,
        message: 'Explain tides',
        conversationHistory: [],
      },
      chunk => {
        received.push(chunk);
      },
      () => {
        throw new Error('Should not complete failed streams');
      },
      error => {
        received.push(`error:${error.message}`);
      },
    );

    expect(received.join('')).toBe('The tide rises anderror:Connection failed');
  });
});
