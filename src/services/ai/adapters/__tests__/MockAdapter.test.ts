import { MockAdapter } from '../mock/MockAdapter';
import type { AIAdapterConfig } from '../../types/adapter.types';
import type { MessageAttachment } from '../../../../types';

const config: AIAdapterConfig = {
  provider: 'openai',
  apiKey: 'mock-key',
  model: 'mock-model',
  parameters: { temperature: 0.7, maxTokens: 1024 },
};

describe('MockAdapter', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reports non-streaming capabilities', () => {
    const adapter = new MockAdapter(config);
    expect(adapter.getCapabilities()).toMatchObject({ streaming: false, attachments: false });
  });

  it('waits for simulated latency and annotates attachments in response', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const adapter = new MockAdapter(config);
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'file:///diagram.png',
        mimeType: 'image/png',
      },
    ];

    const promise = adapter.sendMessage('Hello there', [], undefined, attachments);
    jest.advanceTimersByTime(1000); // 500 + 0.5 * 1000
    const result = await promise;
    if (typeof result === 'string') {
      throw new Error('Expected structured mock adapter response');
    }

    expect(result.response).toContain('attached 1 file');
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 45,
      totalTokens: 145,
    });
  });
});
