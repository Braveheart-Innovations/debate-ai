import { AIFactory, AIService, PERSONALITIES } from '@/services/aiAdapter';
import { AdapterFactory } from '@/services/ai';

const mockCreate = jest.spyOn(AdapterFactory, 'create');

const buildAdapter = () => ({
  config: { model: 'gpt-4o', isDebateMode: false },
  setTemporaryPersonality: jest.fn(),
  sendMessage: jest.fn().mockResolvedValue({ response: 'hi', modelUsed: 'gpt-4o' }),
});

describe('aiAdapter compatibility layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
  });

  it('delegates factory creation', () => {
    const adapter = buildAdapter();
    mockCreate.mockReturnValue(adapter as any);
    const created = AIFactory.create({ provider: 'openai', apiKey: 'key' } as any);
    expect(created).toBe(adapter);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }));
  });

  it('initializes adapters synchronously with provided API keys', () => {
    const adapter = buildAdapter();
    mockCreate.mockReturnValue(adapter as any);
    const service = new AIService({ openai: 'key', google: undefined });
    expect(service.getAdapter('openai')).toBe(adapter);
    expect(service.getAdapter('google')).toBeUndefined();
  });

  it('initializes mock adapters when no API keys provided', async () => {
    mockCreate.mockReturnValue(buildAdapter() as any);
    const service = new AIService();
    await service.initialize();
    expect(service.getAdapter('openai')).toBeDefined();
    expect(service.getAllAdapters().size).toBeGreaterThan(0);
  });

  it('sets personality and sends messages with overloaded arguments', async () => {
    const adapter = buildAdapter();
    mockCreate.mockReturnValue(adapter as any);
    const service = new AIService({ openai: 'key' });

    const personality = { ...PERSONALITIES.neutral, id: 'custom' };
    service.setPersonality('openai', personality);
    expect(adapter.setTemporaryPersonality).toHaveBeenCalledWith(personality);

    await service.sendMessage(
      'openai',
      'Hello',
      [{ role: 'user', content: 'Hi' } as any],
      personality,
      { resume: true } as any,
      [{ type: 'document', mimeType: 'application/pdf' } as any],
      'gpt-5'
    );

    expect(adapter.config.model).toBe('gpt-5');
    expect(adapter.config.isDebateMode).toBe(false);
    expect(adapter.sendMessage).toHaveBeenCalledWith(
      'Hello',
      expect.any(Array),
      { resume: true },
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

    await service.initialize({ claude: 'key' } as any);
    expect(warnSpy).toHaveBeenCalledWith('Failed to create adapter for claude:', expect.any(Error));

    warnSpy.mockRestore();
  });

  it('parses overloaded arguments including debate mode and model switches', async () => {
    const adapter = buildAdapter();
    adapter.sendMessage.mockResolvedValue('ok');
    mockCreate.mockReturnValue(adapter as any);

    const service = new AIService({ openai: 'key' });

    const result = await service.sendMessage(
      'openai',
      'Ping',
      undefined,
      true,
      'gpt-4o-mini',
      { temperature: 0.2 } as any,
      false
    );

    expect(adapter.config.model).toBe('gpt-4o-mini');
    expect(adapter.config.isDebateMode).toBe(false);
    expect(adapter.sendMessage).toHaveBeenCalledWith('Ping', undefined, undefined, undefined, 'gpt-4o-mini');
    expect(result).toEqual({ response: 'ok', modelUsed: 'gpt-4o-mini' });
  });

  it('ignores non-image attachments in overloaded sendMessage path', async () => {
    const adapter = buildAdapter();
    mockCreate.mockReturnValue(adapter as any);
    const service = new AIService({ openai: 'key' });

    await service.sendMessage(
      'openai',
      'With attachment',
      undefined,
      undefined,
      { resume: true } as any,
      [{ type: 'video', uri: 'file://clip.mp4', mimeType: 'video/mp4' } as any],
      undefined
    );

    expect(adapter.sendMessage).toHaveBeenCalledWith(
      'With attachment',
      undefined,
      { resume: true },
      undefined,
      undefined
    );
  });
});
