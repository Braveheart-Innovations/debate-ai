const mockGetModelById = jest.fn();
const mockCreateAdapter = jest.fn();

jest.mock('@/config/modelConfigs', () => ({
  getModelById: (...args: unknown[]) => mockGetModelById(...args),
}));

jest.mock('@/services/ai', () => ({
  AdapterFactory: {
    create: (...args: unknown[]) => mockCreateAdapter(...args),
  },
}));

const loadUtils = () => {
  let utils: typeof import('@/utils/attachmentUtils');
  jest.isolateModules(() => {
    utils = require('@/utils/attachmentUtils');
  });
  return utils!;
};

const buildAI = (overrides: Partial<{ provider: string; model: string; name: string }> = {}) => ({
  provider: 'openai',
  model: 'gpt-4o',
  name: overrides.name || overrides.provider || 'OpenAI',
  ...overrides,
});

describe('attachmentUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore();
  });

  it('disables attachments when no AIs are selected', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    expect(getAttachmentSupport([])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([])).toBe('Select an AI to enable attachments');
  });

  it('enables attachments when multiple AIs ALL support them (AND logic)', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    const capabilities = {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
    } as const;
    mockGetModelById.mockReturnValue({ name: 'GPT-4o', supportsVision: true, supportsDocuments: true });
    mockCreateAdapter.mockReturnValue({ getCapabilities: () => capabilities });

    // Multiple AIs, all support - should enable
    expect(getAttachmentSupport([buildAI(), buildAI({ model: 'gpt-4o-mini' })])).toEqual({ images: true, documents: true });
    expect(getAttachmentSupportMessage([buildAI(), buildAI({ model: 'gpt-4o-mini' })])).toBe('You can attach images or documents');
  });

  it('disables attachments when ANY AI does not support them (AND logic)', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();

    // First AI supports, second doesn't - use implementation to return based on model
    mockGetModelById.mockImplementation((_provider: string, model: string) => {
      if (model === 'gpt-4o') {
        return { name: 'GPT-4o', supportsVision: true, supportsDocuments: true };
      }
      return { name: 'GPT-3', supportsVision: false, supportsDocuments: false };
    });
    mockCreateAdapter.mockReturnValue({ getCapabilities: () => ({ attachments: true, supportsImages: true, supportsDocuments: true }) });

    expect(getAttachmentSupport([buildAI(), buildAI({ model: 'gpt-3', name: 'GPT-3' })])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([buildAI(), buildAI({ model: 'gpt-3', name: 'GPT-3' })])).toContain("doesn't support attachments");
  });

  it('returns false when model is missing', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    mockGetModelById.mockReturnValue(null);
    expect(getAttachmentSupport([buildAI()])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([buildAI()])).toContain("doesn't support attachments");
  });

  it('returns false when model does not support vision', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    mockGetModelById.mockReturnValue({ name: 'GPT-3', supportsVision: false, supportsDocuments: false });
    mockCreateAdapter.mockReturnValue({ getCapabilities: () => ({ attachments: true }) });
    expect(getAttachmentSupport([buildAI()])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([buildAI()])).toContain("doesn't support attachments");
  });

  it('checks adapter capabilities with caching', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    const capabilities = {
      streaming: true,
      attachments: true,
      supportsImages: true,
      supportsDocuments: true,
    } as const;
    mockGetModelById.mockReturnValue({ name: 'GPT-4o', supportsVision: true, supportsDocuments: true });
    mockCreateAdapter.mockReturnValue({ getCapabilities: () => capabilities });

    expect(getAttachmentSupport([buildAI()])).toEqual({ images: true, documents: true });
    expect(getAttachmentSupportMessage([buildAI()])).toBe('You can attach images or documents');

    // Second call should use cache (no adapter creation invoked)
    mockCreateAdapter.mockClear();
    expect(getAttachmentSupport([buildAI()])).toEqual({ images: true, documents: true });
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it('handles adapter creation errors gracefully', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    mockGetModelById.mockReturnValue({ name: 'Claude', supportsVision: true, supportsDocuments: false });
    mockCreateAdapter.mockImplementation(() => { throw new Error('adapter error'); });
    expect(getAttachmentSupport([buildAI({ provider: 'anthropic', name: 'Claude' })])).toEqual({ images: false, documents: false });
    // When adapter creation fails, the AI is added to unsupportedAIs list
    expect(getAttachmentSupportMessage([buildAI({ provider: 'anthropic', name: 'Claude' })])).toContain("doesn't support attachments");
  });

  it('handles adapters without attachment support', () => {
    const { getAttachmentSupportMessage } = loadUtils();
    mockGetModelById.mockReturnValue({ name: 'GPT', supportsVision: true, supportsDocuments: false });
    mockCreateAdapter.mockReturnValue({ getCapabilities: () => ({ attachments: false }) });
    // When adapter doesn't support attachments, the AI is added to unsupportedAIs list
    expect(getAttachmentSupportMessage([buildAI({ name: 'GPT' })])).toContain("doesn't support attachments");
  });
});
