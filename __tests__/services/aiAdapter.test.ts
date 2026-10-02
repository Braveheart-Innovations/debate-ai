import { AIFactory, AIService, PERSONALITIES } from '@/services/aiAdapter';
import { AdapterFactory, MockAdapter } from '@/services/ai';
import type { ResumptionContext } from '@/services/ai';
import { createMockAttachment, createMockMessage } from '@test-utils/fixtures';

const mockCreate = jest.spyOn(AdapterFactory, 'create');

/** A real adapter instance whose network-facing methods are spied. */
const buildAdapter = () => {
  const adapter = new MockAdapter({
    provider: 'openai',
    apiKey: 'key',
    model: 'gpt-4o',
    isDebateMode: false,
  });
  const setTemporaryPersonality = jest.spyOn(adapter, 'setTemporaryPersonality');
  const sendMessage = jest
    .spyOn(adapter, 'sendMessage')
    .mockResolvedValue({ response: 'hi', modelUsed: 'gpt-4o' });
  return { adapter, setTemporaryPersonality, sendMessage };
};

const resumptionContext: ResumptionContext = {
  originalPrompt: createMockMessage({ content: 'Original prompt' }),
  isResuming: true,
};

describe('aiAdapter compatibility layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
  });

  it('delegates factory creation', () => {
    const { adapter } = buildAdapter();
    mockCreate.mockReturnValue(adapter);
    const created = AIFactory.create({ provider: 'openai', apiKey: 'key' });
    expect(created).toBe(adapter);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }));
  });

  it('initializes adapters synchronously with provided API keys', () => {
    const { adapter } = buildAdapter();
    mockCreate.mockReturnValue(adapter);
    const service = new AIService({ openai: 'key', google: undefined });
    expect(service.getAdapter('openai')).toBe(adapter);
    expect(service.getAdapter('google')).toBeUndefined();
  });

  it('initializes mock adapters when no API keys provided', async () => {
    mockCreate.mockReturnValue(buildAdapter().adapter);
    const service = new AIService();
    await service.initialize();
    expect(service.getAdapter('openai')).toBeDefined();
    expect(service.getAllAdapters().size).toBeGreaterThan(0);
  });

  it('sets personality and sends messages with overloaded arguments', async () => {
    const { adapter, setTemporaryPersonality, sendMessage } = buildAdapter();
    mockCreate.mockReturnValue(adapter);
    const service = new AIService({ openai: 'key' });

    const personality = { ...PERSONALITIES.neutral, id: 'custom' };
    service.setPersonality('openai', personality);
    expect(setTemporaryPersonality).toHaveBeenCalledWith(personality);

    await service.sendMessage(
      'openai',
      'Hello',
      [createMockMessage({ content: 'Hi' })],
      personality,
      resumptionContext,
      [createMockAttachment({ type: 'document', mimeType: 'application/pdf' })],
      'gpt-5'
    );

    expect(adapter.config.model).toBe('gpt-5');
    expect(adapter.config.isDebateMode).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith(
      'Hello',
      expect.any(Array),
      resumptionContext,
      expect.any(Array),
      'gpt-5'
    );
  });

  it('throws when adapter is missing', async () => {
    const service = new AIService();
    await expect(service.sendMessage('missing', 'hi')).rejects.toThrow('No adapter found for provider: missing');
  });

  it('warns when adapter creation fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockCreate.mockImplementation(() => {
      throw new Error('boom');
    });

    const service = new AIService({ openai: 'key' });
    expect(service.getAdapter('openai')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('Failed to create adapter for openai:', expect.any(Error));

    await service.initialize({ claude: 'key' });
    expect(warnSpy).toHaveBeenCalledWith('Failed to create adapter for claude:', expect.any(Error));

    warnSpy.mockRestore();
  });

  it('parses overloaded arguments including debate mode and model switches', async () => {
    const { adapter, sendMessage } = buildAdapter();
    sendMessage.mockResolvedValue('ok');
    mockCreate.mockReturnValue(adapter);

    const service = new AIService({ openai: 'key' });

    const result = await service.sendMessage(
      'openai',
      'Ping',
      undefined,
      true,
      'gpt-4o-mini',
      { temperature: 0.2 },
      false
    );

    expect(adapter.config.model).toBe('gpt-4o-mini');
    expect(adapter.config.isDebateMode).toBe(false);
    expect(adapter.config.parameters).toEqual({ temperature: 0.2 });
    expect(sendMessage).toHaveBeenCalledWith('Ping', undefined, undefined, undefined, 'gpt-4o-mini');
    expect(result).toEqual({ response: 'ok', modelUsed: 'gpt-4o-mini' });
  });

  it('ignores non-image attachments in overloaded sendMessage path', async () => {
    const { adapter, sendMessage } = buildAdapter();
    mockCreate.mockReturnValue(adapter);
    const service = new AIService({ openai: 'key' });

    await service.sendMessage(
      'openai',
      'With attachment',
      undefined,
      undefined,
      resumptionContext,
      [createMockAttachment({ type: 'video', uri: 'file://clip.mp4', mimeType: 'video/mp4' })],
      undefined
    );

    expect(sendMessage).toHaveBeenCalledWith(
      'With attachment',
      undefined,
      resumptionContext,
      undefined,
      undefined
    );
  });
});
