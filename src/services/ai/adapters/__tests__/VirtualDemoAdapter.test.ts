import { VirtualDemoAdapter } from '../demo/VirtualDemoAdapter';
import type { AIAdapterConfig } from '../../types/adapter.types';
import type { MessageAttachment } from '../../../../types';
import { nextProviderResponse, markProviderComplete } from '@/services/demo/DemoPlaybackRouter';

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  nextProviderResponse: jest.fn(),
  markProviderComplete: jest.fn(),
}));

const makeConfig = (overrides: Partial<AIAdapterConfig> = {}): AIAdapterConfig => ({
  provider: 'openai',
  apiKey: 'demo-key',
  model: 'demo-model',
  parameters: { temperature: 0.7, maxTokens: 1024 },
  ...overrides,
});

const nextProviderResponseMock = nextProviderResponse as jest.MockedFunction<typeof nextProviderResponse>;
const markProviderCompleteMock = markProviderComplete as jest.MockedFunction<typeof markProviderComplete>;

describe('VirtualDemoAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns pre-seeded demo content when available', async () => {
    nextProviderResponseMock.mockReturnValue('Preloaded demo answer');

    const adapter = new VirtualDemoAdapter(makeConfig());
    const result = await adapter.sendMessage('Hi there');
    if (typeof result === 'string') {
      throw new Error('Expected structured demo adapter response');
    }

    expect(result.response).toBe('Preloaded demo answer');
    expect(markProviderCompleteMock).toHaveBeenCalledWith('openai');
  });

  it('falls back to composed content and notes attachments', async () => {
    nextProviderResponseMock.mockReturnValue(undefined);

    const adapter = new VirtualDemoAdapter(makeConfig());
    const attachments: MessageAttachment[] = [
      {
        type: 'image',
        uri: 'file:///mock.png',
        mimeType: 'image/png',
      },
    ];

    const result = await adapter.sendMessage('Draft a summary', [], undefined, attachments);
    if (typeof result === 'string') {
      throw new Error('Expected structured demo adapter response');
    }

    expect(result.response).toContain('[Simulated content. No live API calls performed.]');
    expect(result.response).toContain('[Simulated: noticed 1 attachment]');
    expect(markProviderCompleteMock).toHaveBeenCalledWith('openai');
  });
});
