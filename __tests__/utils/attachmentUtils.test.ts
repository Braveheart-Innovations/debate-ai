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

const buildAI = (overrides: Partial<{ provider: string; model: string }> = {}) => ({
  provider: 'openai',
  model: 'gpt-4o',
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

  it('disables attachments when zero or multiple AIs are selected', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    expect(getAttachmentSupport([])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([])).toBe('Select an AI to enable attachments');
    expect(getAttachmentSupport([buildAI(), buildAI({ model: 'other' })])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([buildAI(), buildAI({ model: 'other' })])).toContain('single AI');
  });

  it('returns false when model is missing or unsupported', () => {
    const { getAttachmentSupport, getAttachmentSupportMessage } = loadUtils();
    mockGetModelById.mockReturnValueOnce(null);
    expect(getAttachmentSupport([buildAI()])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([buildAI()])).toBe('No model selected');

    mockGetModelById.mockReturnValueOnce({ name: 'GPT-3', supportsVision: false, supportsDocuments: false });
    expect(getAttachmentSupportMessage([buildAI()])).toBe("GPT-3 doesn't support image attachments");
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
    expect(getAttachmentSupport([buildAI({ provider: 'anthropic' })])).toEqual({ images: false, documents: false });
    expect(getAttachmentSupportMessage([buildAI({ provider: 'anthropic' })])).toBe('Could not verify attachment support for anthropic');
  });

  it('handles adapters without attachment support', () => {
    const { getAttachmentSupportMessage } = loadUtils();
    mockGetModelById.mockReturnValue({ name: 'GPT', supportsVision: true, supportsDocuments: false });
    mockCreateAdapter.mockReturnValue({ getCapabilities: () => ({ attachments: false }) });
    expect(getAttachmentSupportMessage([buildAI()])).toBe("openai adapter doesn't support attachments yet");
  });
});
