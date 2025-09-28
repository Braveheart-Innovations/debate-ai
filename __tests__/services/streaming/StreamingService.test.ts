import { StreamingService, resetStreamingService } from '@/services/streaming/StreamingService';
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

  let streamingService: StreamingService;
  let adapterSpy: jest.SpiedFunction<typeof AdapterFactory.createWithModel>;

  beforeEach(() => {
    resetStreamingService();
    streamingService = new StreamingService();
    adapterSpy = jest.spyOn(AdapterFactory, 'createWithModel');
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        speed: 'instant',
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

    await streamingService.streamResponse(
      {
        messageId: 'msg-3',
        adapterConfig: { provider: 'claude', apiKey: 'key', model: 'claude-3' },
        message: 'Checking',
        conversationHistory: [],
        speed: 'instant',
      },
      (chunk) => {
        chunks.push(chunk);
        streamingService.cancelStream('msg-3');
      },
      () => {},
      () => {},
    );

    expect(chunks).toEqual(['Checking ']);
    expect(streamingService.isStreamActive('msg-3')).toBe(false);
  });
});
